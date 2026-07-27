import { Prisma, type PoliticaImportacao } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import type { EventoAuditoria } from "@/dominio/auditoria/servico-auditoria";
import { serializarValor } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { derivarLocalizacao } from "@/dominio/assinantes/derivacao";
import {
  type CampoNucleo,
  confirmacaoFotoCompletaValida,
  type DestinoMapeamento,
  type ItemQuarentena,
  type LinhaNucleo,
  montarResumoNucleo,
  NAO_IMPORTAR,
  normalizarLinhaNucleo,
  planejarUpsert,
  type ResumoCargaNucleo,
  sugerirMapeamento,
  validarLinhaNucleo,
} from "@/dominio/assinantes/importacao";
import {
  type LinhaEnriquecimento,
  type ResumoCargaEnriquecimento,
  separarAtributosDeDivergencias,
  slugificarAtributo,
  validarLinhaEnriquecimento,
} from "@/dominio/assinantes/enriquecimento";
import { normalizarCpf } from "@/dominio/assinantes/cpf";
import { mascararEmail, mascararTelefone } from "@/dominio/assinantes/mascara";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import { lerArquivoAssinantes } from "@/infra/assinantes/leitor-arquivo";
import { logger } from "@/infra/log/logger";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Importação de assinantes (T20) — cinco passos, duas famílias:
 *
 * 1. Família (núcleo × enriquecimento) e arquivo → staging BRUTO
 *    (nada interpretado além de colunas e linhas).
 * 2. Mapeamento de colunas + política → validação linha a linha
 *    (RN31, quarentena com motivo) e DRY-RUN com resumo — nenhuma
 *    mutação no cadastro-mestre.
 * 3. Confirmação → efetivação transacional (RN29, upsert idempotente
 *    por cpf_hash). Foto completa exige o texto de confirmação; o
 *    resumo definitivo é recalculado DENTRO da transação.
 *
 * Auditoria (regra transversal, com dado sensível mascarado — RN30 vale
 * também para a trilha): criação em massa grava um evento consolidado
 * por assinante (o arquivo-fonte + importacaoId dão o restante da
 * rastreabilidade); atualização grava evento por campo alterado.
 */

const TAMANHO_LOTE = 500;

/** Prévia exibida no passo de mapeamento (protótipo: 5 linhas). */
const LINHAS_DE_PREVIA = 5;

/** Limite de itens detalhados nos relatórios JSON (contagens são totais). */
const LIMITE_DETALHE_RELATORIO = 200;

type FamiliaImportacao = "ASSINANTES_NUCLEO" | "ASSINANTES_ENRIQUECIMENTO";

function estadoAuditavelAssinante(assinante: {
  nome: string;
  cpfHash: string;
  enderecoBruto: string | null;
  cep: string | null;
  uf: string | null;
  municipio: string | null;
  email: string | null;
  telefone: string | null;
  preferencia: string | null;
  statusBase: string;
}) {
  // CPF nunca aparece na trilha (nem mascarado — o hash já identifica);
  // e-mail/telefone entram mascarados: a auditoria é legível por todos
  // os papéis e não pode vazar o que a RN30 protege.
  return {
    nome: assinante.nome,
    enderecoBruto: assinante.enderecoBruto,
    cep: assinante.cep,
    uf: assinante.uf,
    municipio: assinante.municipio,
    email: mascararEmail(assinante.email),
    telefone: mascararTelefone(assinante.telefone),
    preferencia: assinante.preferencia,
    statusBase: assinante.statusBase,
  };
}

/**
 * Passo 1–2 da T20: recebe a família e o arquivo, povoa o staging bruto
 * e devolve colunas, sugestão de mapeamento e prévia de 5 linhas.
 * Uma nova carga da mesma família substitui staging não efetivado.
 */
export async function prepararImportacaoAssinantes(
  ator: Ator,
  parametros: {
    familia: FamiliaImportacao;
    nomeArquivo: string;
    conteudo: Buffer;
  },
) {
  exigirPermissao(ator.papel, "IMPORTAR_ASSINANTES");
  const lido = await lerArquivoAssinantes(parametros.nomeArquivo, parametros.conteudo);
  if (lido.colunas.length === 0 || lido.linhas.length === 0) {
    throw new ErroDeValidacao([
      "O arquivo não tem cabeçalho e linhas legíveis — confira o formato (CSV ou XLSX).",
    ]);
  }

  const importacao = await prisma.$transaction(
    async (tx) => {
      await tx.stagingAssinante.deleteMany({
        where: {
          estado: { not: "EFETIVADA" },
          importacao: { tipo: parametros.familia },
        },
      });
      const criada = await tx.importacao.create({
        data: {
          tipo: parametros.familia,
          nomeArquivo: parametros.nomeArquivo,
          autorId: ator.id,
        },
      });
      for (let inicio = 0; inicio < lido.linhas.length; inicio += TAMANHO_LOTE) {
        await tx.stagingAssinante.createMany({
          data: lido.linhas.slice(inicio, inicio + TAMANHO_LOTE).map((linha) => ({
            importacaoId: criada.id,
            linhaOrigem: linha.numero,
            dadosOriginais: linha.valores as Prisma.InputJsonValue,
          })),
        });
      }
      return criada;
    },
    { timeout: 60_000 },
  );

  logger.info(
    { importacaoId: importacao.id, familia: parametros.familia, linhas: lido.linhas.length },
    "importação de assinantes: staging bruto povoado",
  );
  return {
    importacaoId: importacao.id,
    colunas: lido.colunas,
    totalLinhas: lido.linhas.length,
    sugestaoMapeamento: sugerirMapeamento(lido.colunas),
    previa: lido.linhas.slice(0, LINHAS_DE_PREVIA),
  };
}

/**
 * Tolerância documentada de planilha: célula numérica de CPF perde zeros
 * à esquerda no Excel; um valor só-dígitos menor que 11 é completado à
 * esquerda. CPFs realmente errados continuam caindo na validação de
 * dígito verificador (RN30).
 */
function restaurarZerosDeCpf(valor: string): string {
  const digitos = normalizarCpf(valor);
  if (digitos.length >= 9 && digitos.length < 11 && digitos === valor.trim()) {
    return digitos.padStart(11, "0");
  }
  return valor;
}

function aplicarDeParaNucleo(
  dadosOriginais: Record<string, string>,
  linhaOrigem: number,
  mapeamento: Record<string, DestinoMapeamento | null>,
): LinhaNucleo {
  const valores: Partial<Record<CampoNucleo, string>> = {};
  for (const [coluna, destino] of Object.entries(mapeamento)) {
    if (!destino || destino === NAO_IMPORTAR) {
      continue;
    }
    valores[destino] = (dadosOriginais[coluna] ?? "").trim();
  }
  return {
    linha: linhaOrigem,
    cpf: restaurarZerosDeCpf(valores.cpf ?? ""),
    nome: valores.nome ?? "",
    endereco: valores.endereco ?? null,
    cep: valores.cep ?? null,
    email: valores.email ?? null,
    telefone: valores.telefone ?? null,
    preferencia: valores.preferencia ?? null,
    // Onda 12 (RN63): colunas novas do mapeador. Ausentes do arquivo =
    // null, que é o estado honesto — o perfil só existe quando a fonte o
    // traz.
    perfilAssinatura: valores.perfilAssinatura ?? null,
    patrocinador: valores.patrocinador ?? null,
  };
}

function validarMapeamentoNucleo(
  mapeamento: Record<string, DestinoMapeamento | null>,
): void {
  const destinos = Object.values(mapeamento).filter(
    (destino): destino is CampoNucleo => Boolean(destino) && destino !== NAO_IMPORTAR,
  );
  const erros: string[] = [];
  if (!destinos.includes("cpf")) {
    erros.push("O mapeamento precisa apontar a coluna do CPF.");
  }
  if (!destinos.includes("nome")) {
    erros.push("O mapeamento precisa apontar a coluna do nome.");
  }
  const vistos = new Set<string>();
  for (const destino of destinos) {
    if (vistos.has(destino)) {
      erros.push(`Duas colunas apontam para o mesmo campo: ${destino}.`);
    }
    vistos.add(destino);
  }
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
}

/**
 * Passos 3–4 da T20 (família núcleo): aplica o de/para, valida linha a
 * linha (RN31), grava mapeamento + política e devolve o resumo do
 * DRY-RUN — na foto completa, com quantos seriam marcados fora da base.
 * Nada muta em `assinantes` aqui (RN29).
 */
export async function aplicarMapeamentoNucleo(
  ator: Ator,
  importacaoId: string,
  parametros: {
    mapeamento: Record<string, DestinoMapeamento | null>;
    politica: PoliticaImportacao;
  },
): Promise<ResumoCargaNucleo> {
  exigirPermissao(ator.papel, "IMPORTAR_ASSINANTES");
  validarMapeamentoNucleo(parametros.mapeamento);
  const importacao = await prisma.importacao.findUniqueOrThrow({
    where: { id: importacaoId },
  });
  if (importacao.tipo !== "ASSINANTES_NUCLEO") {
    throw new ErroDeValidacao(["Esta importação não é da família núcleo."]);
  }

  const staging = await prisma.stagingAssinante.findMany({
    where: { importacaoId, estado: { not: "EFETIVADA" } },
    orderBy: { linhaOrigem: "asc" },
  });
  if (staging.length === 0) {
    throw new ErroDeValidacao(["Não há linhas em staging para esta importação."]);
  }

  const quarentena: ItemQuarentena[] = [];
  const validas: Array<{ id: string; linha: LinhaNucleo; cpfHash: string }> = [];
  const atualizacoes: Array<{
    id: string;
    camposMapeados: Prisma.InputJsonValue;
    cpfHash: string | null;
    cpfCifrado: string | null;
    estado: "APROVADA" | "REJEITADA";
    mensagemErro: string | null;
  }> = [];

  for (const registro of staging) {
    const linha = aplicarDeParaNucleo(
      registro.dadosOriginais as Record<string, string>,
      registro.linhaOrigem,
      parametros.mapeamento,
    );
    const motivos = validarLinhaNucleo(linha);
    if (motivos.length > 0) {
      quarentena.push({ linha: linha.linha, motivos });
      atualizacoes.push({
        id: registro.id,
        camposMapeados: linha as unknown as Prisma.InputJsonValue,
        cpfHash: null,
        cpfCifrado: null,
        estado: "REJEITADA",
        mensagemErro: motivos.join(" "),
      });
      continue;
    }
    const cpfNormalizado = normalizarCpf(linha.cpf);
    const cpfHash = hashCpf(cpfNormalizado);
    validas.push({ id: registro.id, linha, cpfHash });
    atualizacoes.push({
      id: registro.id,
      camposMapeados: linha as unknown as Prisma.InputJsonValue,
      cpfHash,
      cpfCifrado: cifrarCpf(cpfNormalizado),
      estado: "APROVADA",
      mensagemErro: null,
    });
  }

  const hashesDoArquivo = new Set(validas.map(({ cpfHash }) => cpfHash));
  const [existentes, ativosForaDoArquivo] = await Promise.all([
    prisma.assinante.findMany({
      where: { cpfHash: { in: [...hashesDoArquivo] } },
      select: { cpfHash: true },
    }),
    parametros.politica === "FOTO_COMPLETA"
      ? prisma.assinante.count({
          where: { statusBase: "ATIVO", cpfHash: { notIn: [...hashesDoArquivo] } },
        })
      : Promise.resolve(null),
  ]);

  const plano = planejarUpsert(
    validas.map(({ linha, cpfHash }) => ({ linha, cpfHash })),
    new Set(existentes.map(({ cpfHash }) => cpfHash)),
  );
  const resumo = montarResumoNucleo({
    linhasLidas: staging.length,
    plano,
    quarentena,
    foraDaBase: ativosForaDoArquivo,
  });

  await prisma.$transaction(
    async (tx) => {
      for (const atualizacao of atualizacoes) {
        await tx.stagingAssinante.update({
          where: { id: atualizacao.id },
          data: {
            camposMapeados: atualizacao.camposMapeados,
            cpfHash: atualizacao.cpfHash,
            cpfCifrado: atualizacao.cpfCifrado,
            estado: atualizacao.estado,
            mensagemErro: atualizacao.mensagemErro,
          },
        });
      }
      await tx.importacao.update({
        where: { id: importacaoId },
        data: {
          politica: parametros.politica,
          mapeamentoColunas: parametros.mapeamento as Prisma.InputJsonValue,
          resumo: { dryRun: resumo } as unknown as Prisma.InputJsonValue,
        },
      });
    },
    { timeout: 120_000 },
  );

  return resumo;
}

interface LinhaAprovadaNucleo {
  cpfHash: string;
  cpfCifrado: string;
  linha: LinhaNucleo;
}

async function efetivarLoteNucleo(
  tx: Prisma.TransactionClient,
  autorId: string,
  importacaoId: string,
  lote: LinhaAprovadaNucleo[],
): Promise<{ novos: number; atualizados: number }> {
  const eventos: EventoAuditoria[] = [];
  const existentes = await tx.assinante.findMany({
    where: { cpfHash: { in: lote.map(({ cpfHash }) => cpfHash) } },
  });
  const existentePorHash = new Map(existentes.map((a) => [a.cpfHash, a]));

  const paraCriar: Prisma.AssinanteCreateManyInput[] = [];
  for (const { cpfHash, cpfCifrado, linha } of lote) {
    const nucleo = normalizarLinhaNucleo(linha);
    const derivado = derivarLocalizacao({
      cep: nucleo.cep,
      enderecoBruto: nucleo.enderecoBruto,
    });
    const atual = existentePorHash.get(cpfHash);
    if (!atual) {
      paraCriar.push({
        cpfHash,
        cpfCifrado,
        nome: nucleo.nome,
        enderecoBruto: nucleo.enderecoBruto,
        cep: nucleo.cep,
        uf: derivado.uf,
        municipio: derivado.municipio,
        email: nucleo.email,
        telefone: nucleo.telefone,
        preferencia: nucleo.preferencia,
        perfilAssinatura: nucleo.perfilAssinatura,
        estadoUsuario: nucleo.estadoUsuario,
        statusBase: "ATIVO",
      });
      continue;
    }
    // RN29 — existente atualiza o núcleo; reaparecer no arquivo devolve
    // o assinante a ATIVO (ele está na base declarada pelo comprador).
    const novoEstado = {
      nome: nucleo.nome,
      enderecoBruto: nucleo.enderecoBruto,
      cep: nucleo.cep,
      uf: derivado.uf,
      municipio: derivado.municipio,
      email: nucleo.email,
      telefone: nucleo.telefone,
      preferencia: nucleo.preferencia,
      perfilAssinatura: nucleo.perfilAssinatura,
      estadoUsuario: nucleo.estadoUsuario,
      statusBase: "ATIVO" as const,
    };
    const anteriorAuditavel = estadoAuditavelAssinante(atual);
    const novoAuditavel = estadoAuditavelAssinante({ ...atual, ...novoEstado });
    const mudou = JSON.stringify(anteriorAuditavel) !== JSON.stringify(novoAuditavel);
    if (!mudou) {
      continue;
    }
    await tx.assinante.update({ where: { id: atual.id }, data: novoEstado });
    for (const campo of Object.keys(novoAuditavel) as Array<
      keyof ReturnType<typeof estadoAuditavelAssinante>
    >) {
      const valorAnterior = serializarValor(anteriorAuditavel[campo]);
      const valorNovo = serializarValor(novoAuditavel[campo]);
      if (valorAnterior !== valorNovo) {
        eventos.push({
          entidade: "assinante",
          entidadeId: atual.id,
          campo,
          valorAnterior,
          valorNovo,
          autorId,
        });
      }
    }
  }

  if (paraCriar.length > 0) {
    await tx.assinante.createMany({ data: paraCriar });
    const criados = await tx.assinante.findMany({
      where: { cpfHash: { in: paraCriar.map(({ cpfHash }) => cpfHash) } },
    });
    for (const criado of criados) {
      eventos.push({
        entidade: "assinante",
        entidadeId: criado.id,
        campo: "importacao_nucleo",
        valorAnterior: null,
        valorNovo: JSON.stringify({
          ...estadoAuditavelAssinante(criado),
          importacaoId,
        }),
        autorId,
      });
    }
  }
  if (eventos.length > 0) {
    await criarGravadorPrisma(tx).gravar(eventos);
  }
  return {
    novos: paraCriar.length,
    atualizados: lote.length - paraCriar.length,
  };
}

/**
 * Passo 5 da T20 (família núcleo): efetivação transacional do upsert
 * (RN29). FOTO_COMPLETA só executa com a confirmação textual válida — o
 * resumo (inclusive quantos saem) é recalculado DENTRO da transação; a
 * marcação "fora da base" acontece aqui e em nenhum outro lugar.
 */
export async function confirmarImportacaoNucleo(
  ator: Ator,
  importacaoId: string,
  parametros?: { confirmacaoFotoCompleta?: string },
) {
  exigirPermissao(ator.papel, "IMPORTAR_ASSINANTES");
  const importacao = await prisma.importacao.findUniqueOrThrow({
    where: { id: importacaoId },
  });
  if (importacao.tipo !== "ASSINANTES_NUCLEO") {
    throw new ErroDeValidacao(["Esta importação não é da família núcleo."]);
  }
  if (!importacao.politica) {
    throw new ErroDeValidacao([
      "Defina o mapeamento e a política (passos 3 e 4) antes de processar a carga.",
    ]);
  }
  if (
    importacao.politica === "FOTO_COMPLETA" &&
    !confirmacaoFotoCompletaValida(parametros?.confirmacaoFotoCompleta)
  ) {
    throw new ErroDeValidacao([
      'Foto completa exige a confirmação: digite "FOTO COMPLETA" para marcar os ausentes como fora da base (RN29).',
    ]);
  }

  const aprovadas = await prisma.stagingAssinante.findMany({
    where: { importacaoId, estado: "APROVADA" },
    orderBy: { linhaOrigem: "asc" },
  });
  if (aprovadas.length === 0) {
    throw new ErroDeValidacao([
      "Nenhuma linha válida para efetivar — revise o mapeamento e a quarentena.",
    ]);
  }
  const rejeitadas = await prisma.stagingAssinante.findMany({
    where: { importacaoId, estado: "REJEITADA" },
    select: { linhaOrigem: true, mensagemErro: true },
    orderBy: { linhaOrigem: "asc" },
  });

  // Última ocorrência do CPF vence (idempotência) — dedup antes dos lotes.
  const vencedoraPorHash = new Map<string, LinhaAprovadaNucleo>();
  for (const registro of aprovadas) {
    vencedoraPorHash.set(registro.cpfHash!, {
      cpfHash: registro.cpfHash!,
      cpfCifrado: registro.cpfCifrado!,
      linha: registro.camposMapeados as unknown as LinhaNucleo,
    });
  }
  const linhasVencedoras = [...vencedoraPorHash.values()];
  const hashesDoArquivo = new Set(vencedoraPorHash.keys());

  const resultado = await prisma.$transaction(
    async (tx) => {
      let novos = 0;
      let atualizados = 0;
      for (let inicio = 0; inicio < linhasVencedoras.length; inicio += TAMANHO_LOTE) {
        const parcial = await efetivarLoteNucleo(
          tx,
          ator.id,
          importacaoId,
          linhasVencedoras.slice(inicio, inicio + TAMANHO_LOTE),
        );
        novos += parcial.novos;
        atualizados += parcial.atualizados;
      }

      // RN29 — foto completa: marca ausentes como fora da base, com
      // auditoria por assinante. Recalculado aqui dentro: é o número real.
      let foraDaBase: number | null = null;
      if (importacao.politica === "FOTO_COMPLETA") {
        const ausentes = await tx.assinante.findMany({
          where: { statusBase: "ATIVO", cpfHash: { notIn: [...hashesDoArquivo] } },
          select: { id: true },
        });
        if (ausentes.length > 0) {
          await tx.assinante.updateMany({
            where: { id: { in: ausentes.map(({ id }) => id) } },
            data: { statusBase: "FORA_DA_BASE" },
          });
          await criarGravadorPrisma(tx).gravar(
            ausentes.map(({ id }) => ({
              entidade: "assinante",
              entidadeId: id,
              campo: "statusBase",
              valorAnterior: "ATIVO",
              valorNovo: "FORA_DA_BASE",
              autorId: ator.id,
            })),
          );
        }
        foraDaBase = ausentes.length;
      }

      await tx.stagingAssinante.updateMany({
        where: { importacaoId, estado: "APROVADA" },
        data: { estado: "EFETIVADA" },
      });

      const resumo: ResumoCargaNucleo = {
        linhasLidas: aprovadas.length + rejeitadas.length,
        novos,
        atualizados,
        quarentena: rejeitadas.length,
        repetidosNoArquivo: aprovadas.length - linhasVencedoras.length,
        foraDaBase,
      };
      await tx.importacao.update({
        where: { id: importacaoId },
        data: {
          linhasOk: aprovadas.length,
          linhasErro: rejeitadas.length,
          resumo: resumo as unknown as Prisma.InputJsonValue,
          relatorioQuarentena:
            rejeitadas.length > 0
              ? (rejeitadas.slice(0, LIMITE_DETALHE_RELATORIO).map((item) => ({
                  linha: item.linhaOrigem,
                  motivo: item.mensagemErro,
                })) as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
        },
      });
      return resumo;
    },
    { timeout: 300_000 },
  );

  logger.info({ importacaoId, ...resultado }, "importação de assinantes efetivada");
  return resultado;
}

/**
 * Passo 3 da T20 (família enriquecimento): de/para em que cada coluna
 * vira CPF, um atributo do catálogo (slug do cabeçalho) ou fica de fora.
 * Dry-run: valida linhas (RN31), casa por CPF e conta não encontrados —
 * sem gravar atributo algum.
 */
export async function aplicarMapeamentoEnriquecimento(
  ator: Ator,
  importacaoId: string,
  parametros: {
    /** coluna → "cpf" | slug do atributo | NAO_IMPORTAR. */
    mapeamento: Record<string, string | null>;
  },
): Promise<ResumoCargaEnriquecimento> {
  exigirPermissao(ator.papel, "IMPORTAR_ASSINANTES");
  const importacao = await prisma.importacao.findUniqueOrThrow({
    where: { id: importacaoId },
  });
  if (importacao.tipo !== "ASSINANTES_ENRIQUECIMENTO") {
    throw new ErroDeValidacao(["Esta importação não é da família de enriquecimento."]);
  }
  const colunaCpf = Object.entries(parametros.mapeamento).find(
    ([, destino]) => destino === "cpf",
  )?.[0];
  if (!colunaCpf) {
    throw new ErroDeValidacao(["O mapeamento precisa apontar a coluna do CPF."]);
  }

  const staging = await prisma.stagingAssinante.findMany({
    where: { importacaoId, estado: { not: "EFETIVADA" } },
    orderBy: { linhaOrigem: "asc" },
  });
  if (staging.length === 0) {
    throw new ErroDeValidacao(["Não há linhas em staging para esta importação."]);
  }

  const quarentena: ItemQuarentena[] = [];
  let casadas = 0;
  let naoEncontrados = 0;
  const hashesDaCarga = new Set<string>();

  for (const registro of staging) {
    const dados = registro.dadosOriginais as Record<string, string>;
    const atributos: Record<string, string> = {};
    for (const [coluna, destino] of Object.entries(parametros.mapeamento)) {
      if (!destino || destino === NAO_IMPORTAR || destino === "cpf") {
        continue;
      }
      atributos[slugificarAtributo(destino)] = (dados[coluna] ?? "").trim();
    }
    const linha: LinhaEnriquecimento = {
      linha: registro.linhaOrigem,
      cpf: restaurarZerosDeCpf((dados[colunaCpf] ?? "").trim()),
      atributos,
    };
    const motivos = validarLinhaEnriquecimento(linha);
    const cpfHash =
      motivos.length === 0 ? hashCpf(normalizarCpf(linha.cpf)) : null;

    await prisma.stagingAssinante.update({
      where: { id: registro.id },
      data: {
        camposMapeados: linha as unknown as Prisma.InputJsonValue,
        cpfHash,
        estado: motivos.length > 0 ? "REJEITADA" : "APROVADA",
        mensagemErro: motivos.length > 0 ? motivos.join(" ") : null,
      },
    });
    if (motivos.length > 0) {
      quarentena.push({ linha: registro.linhaOrigem, motivos });
    } else {
      hashesDaCarga.add(cpfHash!);
    }
  }

  const encontrados = await prisma.assinante.findMany({
    where: { cpfHash: { in: [...hashesDaCarga] } },
    select: { cpfHash: true },
  });
  const hashesEncontrados = new Set(encontrados.map(({ cpfHash }) => cpfHash));
  casadas = hashesEncontrados.size;
  naoEncontrados = hashesDaCarga.size - casadas;

  const resumo: ResumoCargaEnriquecimento = {
    linhasLidas: staging.length,
    assinantesEnriquecidos: casadas,
    atributosGravados: 0, // preenchido na confirmação
    naoEncontrados,
    divergencias: 0, // idem
    quarentena: quarentena.length,
  };
  await prisma.importacao.update({
    where: { id: importacaoId },
    data: {
      mapeamentoColunas: parametros.mapeamento as Prisma.InputJsonValue,
      resumo: { dryRun: resumo } as unknown as Prisma.InputJsonValue,
    },
  });
  return resumo;
}

/**
 * Confirmação da família de enriquecimento (RN35): casa por CPF, upsert
 * do catálogo, substitui os valores dos atributos da carga por
 * assinante e NUNCA toca o núcleo — colisões viram divergências no
 * resumo. CPF não localizado vira quarentena com motivo.
 */
export async function confirmarImportacaoEnriquecimento(ator: Ator, importacaoId: string) {
  exigirPermissao(ator.papel, "IMPORTAR_ASSINANTES");
  const importacao = await prisma.importacao.findUniqueOrThrow({
    where: { id: importacaoId },
  });
  if (importacao.tipo !== "ASSINANTES_ENRIQUECIMENTO") {
    throw new ErroDeValidacao(["Esta importação não é da família de enriquecimento."]);
  }
  const aprovadas = await prisma.stagingAssinante.findMany({
    where: { importacaoId, estado: "APROVADA" },
    orderBy: { linhaOrigem: "asc" },
  });
  if (aprovadas.length === 0) {
    throw new ErroDeValidacao([
      "Nenhuma linha válida para efetivar — revise o mapeamento e a quarentena.",
    ]);
  }

  const dataReferencia = new Date();
  dataReferencia.setUTCHours(0, 0, 0, 0);

  const resultado = await prisma.$transaction(
    async (tx) => {
      const linhas = aprovadas.map((registro) => ({
        id: registro.id,
        cpfHash: registro.cpfHash!,
        linha: registro.camposMapeados as unknown as LinhaEnriquecimento,
      }));

      // Catálogo: todo slug presente na carga existe (upsert por slug).
      const slugsDaCarga = [
        ...new Set(linhas.flatMap(({ linha }) => Object.keys(linha.atributos))),
      ];
      const catalogoPorSlug = new Map<string, string>();
      for (const slug of slugsDaCarga) {
        const item = await tx.catalogoAtributo.upsert({
          where: { slug },
          update: {},
          create: { slug, nome: slug.replace(/-/g, " ") },
        });
        catalogoPorSlug.set(slug, item.id);
      }

      const assinantes = await tx.assinante.findMany({
        where: { cpfHash: { in: linhas.map(({ cpfHash }) => cpfHash) } },
      });
      const assinantePorHash = new Map(assinantes.map((a) => [a.cpfHash, a]));

      const eventos: EventoAuditoria[] = [];
      const divergencias: Array<Record<string, unknown>> = [];
      let atributosGravados = 0;
      let enriquecidos = 0;
      let naoEncontrados = 0;

      for (const { id, cpfHash, linha } of linhas) {
        const assinante = assinantePorHash.get(cpfHash);
        if (!assinante) {
          naoEncontrados += 1;
          await tx.stagingAssinante.update({
            where: { id },
            data: {
              estado: "REJEITADA",
              mensagemErro:
                "CPF não localizado na base de assinantes (o enriquecimento casa por CPF, RN35).",
            },
          });
          continue;
        }
        const separado = separarAtributosDeDivergencias({
          linha,
          nucleoAtual: {
            nome: assinante.nome,
            endereco: assinante.enderecoBruto,
            cep: assinante.cep,
            email: assinante.email,
            telefone: assinante.telefone,
            preferencia: assinante.preferencia?.toLowerCase() ?? null,
          },
        });
        for (const divergencia of separado.divergencias) {
          if (divergencias.length < LIMITE_DETALHE_RELATORIO) {
            // Divergência de contato entra mascarada no relatório (RN30).
            const sensivel = divergencia.campo === "email" || divergencia.campo === "telefone";
            divergencias.push({
              linha: divergencia.linha,
              campo: divergencia.campo,
              valorNucleo: sensivel
                ? divergencia.campo === "email"
                  ? mascararEmail(divergencia.valorNucleo)
                  : mascararTelefone(divergencia.valorNucleo)
                : divergencia.valorNucleo,
              valorArquivo: sensivel ? "•••" : divergencia.valorArquivo,
            });
          }
        }

        if (separado.atributos.length > 0) {
          const idsCatalogo = separado.atributos.map(({ slug }) => catalogoPorSlug.get(slug)!);
          const anteriores = await tx.atributoEnriquecimento.findMany({
            where: { assinanteId: assinante.id, catalogoId: { in: idsCatalogo } },
            include: { catalogo: { select: { slug: true } } },
          });
          await tx.atributoEnriquecimento.deleteMany({
            where: { assinanteId: assinante.id, catalogoId: { in: idsCatalogo } },
          });
          await tx.atributoEnriquecimento.createMany({
            data: separado.atributos.map(({ slug, valor }) => ({
              assinanteId: assinante.id,
              catalogoId: catalogoPorSlug.get(slug)!,
              valor,
              fonte: importacao.nomeArquivo,
              dataReferencia,
              importacaoId,
            })),
          });
          const anteriorPorSlug = new Map<string, string[]>();
          for (const anterior of anteriores) {
            const lista = anteriorPorSlug.get(anterior.catalogo.slug) ?? [];
            lista.push(anterior.valor);
            anteriorPorSlug.set(anterior.catalogo.slug, lista);
          }
          for (const { slug, valor } of separado.atributos) {
            eventos.push({
              entidade: "assinante",
              entidadeId: assinante.id,
              campo: `atributo:${slug}`,
              valorAnterior: anteriorPorSlug.get(slug)?.join("; ") ?? null,
              valorNovo: valor,
              autorId: ator.id,
            });
          }
          atributosGravados += separado.atributos.length;
        }
        enriquecidos += 1;
        await tx.stagingAssinante.update({
          where: { id },
          data: { estado: "EFETIVADA" },
        });
      }

      if (eventos.length > 0) {
        await criarGravadorPrisma(tx).gravar(eventos);
      }

      const rejeitadas = await tx.stagingAssinante.count({
        where: { importacaoId, estado: "REJEITADA" },
      });
      const resumo: ResumoCargaEnriquecimento = {
        linhasLidas: aprovadas.length + rejeitadas - naoEncontrados,
        assinantesEnriquecidos: enriquecidos,
        atributosGravados,
        naoEncontrados,
        divergencias: divergencias.length,
        quarentena: rejeitadas,
      };
      await tx.importacao.update({
        where: { id: importacaoId },
        data: {
          linhasOk: enriquecidos,
          linhasErro: rejeitadas,
          resumo: {
            ...resumo,
            detalheDivergencias: divergencias,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return resumo;
    },
    { timeout: 300_000 },
  );

  logger.info({ importacaoId, ...resultado }, "enriquecimento de assinantes efetivado");
  return resultado;
}

/** Histórico de cargas da T20 (as duas famílias, mais recente primeiro). */
export async function historicoImportacoesAssinantes() {
  return prisma.importacao.findMany({
    where: { tipo: { in: ["ASSINANTES_NUCLEO", "ASSINANTES_ENRIQUECIMENTO"] } },
    orderBy: { criadoEm: "desc" },
    take: 50,
    include: { autor: { select: { nome: true } } },
  });
}
