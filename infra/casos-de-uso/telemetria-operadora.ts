import { createHash } from "node:crypto";

import { Prisma, type TipoLayoutTelemetria as TipoLayoutPrisma } from "@prisma/client";

import { validarCpf } from "@/dominio/assinantes/cpf";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { ErroDeArquivo } from "@/dominio/erros/falhas";
import {
  type CausaDeRecusa,
  contarRecusa,
  type RecusasPorCausa,
  totalDeRecusas,
} from "@/dominio/telemetria-operadora/causas";
import {
  detectarColunaCpf,
  normalizarValorDeCpf,
} from "@/dominio/telemetria-operadora/coluna-cpf";
import {
  higienizarCelula,
  removerEmoji,
} from "@/dominio/telemetria-operadora/higienes";
import {
  detectarLayout,
  normalizarNomeDeColuna,
  type TipoLayoutTelemetria,
} from "@/dominio/telemetria-operadora/layouts";
import {
  type Divergencia,
  divergenciaDeContagem,
  reconciliarCatalogo,
} from "@/dominio/telemetria-operadora/reconciliacao";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { hashCpf } from "@/infra/assinantes/protecao-cpf";
import { lerArquivoTabular } from "@/infra/planilhas/leitor-tabular";
import { prisma } from "@/infra/prisma/cliente";
import type { Ator } from "./contexto";

/**
 * Importação dos quatro relatórios da operadora (RN67–RN70).
 *
 * **Idempotência por conteúdo (RN67).** Os relatórios são ACUMULADOS, não
 * incrementais: reimportar o mesmo arquivo não pode duplicar nada nem
 * mexer em contagem. A identidade é o SHA-256 do conteúdo, e não o nome
 * do arquivo — o nome traz sufixo aleatório da operadora, então o mesmo
 * relatório volta como `_3`, `_4`, `_5`. Um arquivo já ingerido é
 * reconhecido e devolvido com `jaImportado: true`, sem escrever nada.
 *
 * **O que este módulo NUNCA faz (RN70).** Escrever em `empresa`,
 * `solucao` ou `oferta`. Nem "só o nome", nem "só o status". Divergência
 * vira linha em `divergencias_catalogo` e para por aí. Como os
 * contadores moram em tabela própria, a proibição é total — não há
 * sequer uma coluna de contador no cadastro a excetuar. A cerca de
 * `infra/arquitetura/reconciliacao-nao-corrige.test.ts` quebra o build se
 * alguém desfizer isso.
 *
 * **O que ele nunca deixa vazar (RN69).** O CPF entra pelo caminho de
 * HMAC da Onda 5 e não é gravado em claro, não vai a log, não entra em
 * mensagem de erro e não aparece no resultado da importação. O que sai
 * no resultado é o NOME da coluna encontrada — cabeçalho, não dado.
 */

const ENTIDADE_IMPORTACAO = "ImportacaoTelemetria";

export interface ResultadoDaImportacao {
  importacaoId: string;
  tipoLayout: TipoLayoutTelemetria;
  /** Verdadeiro quando o conteúdo já havia sido ingerido (RN67). */
  jaImportado: boolean;
  lidas: number;
  aplicadas: number;
  recusadas: number;
  recusasPorCausa: RecusasPorCausa;
  divergencias: number;
  dataGeracaoDeclarada: Date | null;
  /**
   * Nome da coluna de CPF encontrada no cabeçalho — `null` nos layouts de
   * catálogo (que não têm) e nos nominais sem a coluna. É cabeçalho, não
   * dado: nenhum CPF atravessa esta interface.
   */
  colunaDeCpfEncontrada: string | null;
}

interface LinhaLida {
  numero: number;
  valores: Record<string, string>;
}

/** Lê um valor pelo nome normalizado da coluna, já higienizado. */
function valorDe(linha: LinhaLida, ...nomesAceitos: string[]): string {
  for (const [coluna, valor] of Object.entries(linha.valores)) {
    if (nomesAceitos.includes(normalizarNomeDeColuna(coluna))) {
      return higienizarCelula(valor);
    }
  }
  return "";
}

function inteiroOuNulo(texto: string): number | null {
  if (!texto) return null;
  const numero = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? Math.trunc(numero) : null;
}

/**
 * Valor monetário no formato brasileiro ("149,90", "1.234,56") como
 * Decimal, ou `null` quando ausente/ilegível. Nunca zero por omissão —
 * valor ausente é ausência (RN53). "0" legítimo vira `0`.
 */
function valorMonetarioOuNulo(texto: string): Prisma.Decimal | null {
  if (!texto) return null;
  const numero = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) ? new Prisma.Decimal(numero) : null;
}

/**
 * Data do arquivo em ISO. O leitor XLSX já entrega data como ISO; o CSV
 * exportado de planilha traz o formato brasileiro `dd/mm/aaaa [hh:mm[:ss]]`
 * (observado no arquivo real de "Resgate e Compras" em CSV), e o parse
 * nativo do JS o lê errado — `new Date("21/08/2026")` é `Invalid Date`.
 */
function dataOuNula(texto: string): Date | null {
  if (!texto) return null;
  const br = texto.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  const [, dd, mm, aaaa, hh = "0", min = "0", ss = "0"] = br ?? [];
  if (dd && mm && aaaa) {
    const data = new Date(Date.UTC(+aaaa, +mm - 1, +dd, +hh, +min, +ss));
    // Rejeita rolagem silenciosa (dia 32, mês 13): o parser do JS "conserta"
    // datas fora de faixa, e uma data inventada é pior que uma recusada.
    const coerente =
      data.getUTCFullYear() === +aaaa &&
      data.getUTCMonth() === +mm - 1 &&
      data.getUTCDate() === +dd;
    return coerente ? data : null;
  }
  const data = new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T00:00:00Z` : texto);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * A data de geração DECLARADA pelo arquivo (ficha §3): a mais recente
 * entre as datas das linhas. Nula quando o arquivo não traz nenhuma —
 * nunca substituída pelo momento da importação, que é outro fato e mora
 * em `criadoEm`.
 */
function dataDeGeracaoDeclarada(linhas: LinhaLida[], ...colunas: string[]): Date | null {
  let maisRecente: Date | null = null;
  for (const linha of linhas) {
    const data = dataOuNula(valorDe(linha, ...colunas));
    if (data && (!maisRecente || data > maisRecente)) {
      maisRecente = data;
    }
  }
  return maisRecente;
}

export function hashDoConteudo(conteudo: Buffer): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Ponto de entrada único da T34.
 *
 * A ordem é deliberada: detectar o layout ANTES de qualquer escrita, e
 * conferir a idempotência antes de abrir transação. Um arquivo repetido
 * não deve nem começar a ser aplicado.
 */
export async function importarRelatorioDaOperadora(
  ator: Ator,
  arquivo: { nomeArquivo: string; conteudo: Buffer },
): Promise<ResultadoDaImportacao> {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");

  const lido = await lerArquivoTabular(arquivo.nomeArquivo, arquivo.conteudo);
  if (lido.colunas.length === 0 || lido.linhas.length === 0) {
    throw new ErroDeArquivo(
      "O arquivo não tem cabeçalho e linhas legíveis — confira se é o relatório exportado pela operadora, em CSV ou XLSX.",
    );
  }

  const deteccao = detectarLayout(lido.colunas);
  if (!deteccao.tipo) {
    throw new ErroDeArquivo(deteccao.motivo!);
  }
  const tipoLayout = deteccao.tipo;
  const hashConteudo = hashDoConteudo(arquivo.conteudo);

  // RN67 — idempotência: o mesmo conteúdo, sob o mesmo layout, já entrou.
  const jaExistente = await prisma.importacaoTelemetria.findUnique({
    where: {
      hashConteudo_tipoLayout: {
        hashConteudo,
        tipoLayout: tipoLayout as TipoLayoutPrisma,
      },
    },
    include: { _count: { select: { divergencias: true } } },
  });
  if (jaExistente) {
    return {
      importacaoId: jaExistente.id,
      tipoLayout,
      jaImportado: true,
      lidas: jaExistente.lidas,
      aplicadas: jaExistente.aplicadas,
      recusadas: jaExistente.recusadas,
      recusasPorCausa: (jaExistente.recusasPorCausa ?? {}) as RecusasPorCausa,
      divergencias: jaExistente._count.divergencias,
      dataGeracaoDeclarada: jaExistente.dataGeracaoDeclarada,
      colunaDeCpfEncontrada: null,
    };
  }

  switch (tipoLayout) {
    case "OFERTAS":
      return aplicarOfertas(ator, arquivo.nomeArquivo, hashConteudo, lido.linhas);
    case "SELLERS":
      return aplicarSellers(ator, arquivo.nomeArquivo, hashConteudo, lido.linhas);
    case "USUARIOS":
      return aplicarUsuarios(
        ator,
        arquivo.nomeArquivo,
        hashConteudo,
        lido.colunas,
        lido.linhas,
      );
    case "RESGATES":
      return aplicarResgates(
        ator,
        arquivo.nomeArquivo,
        hashConteudo,
        lido.colunas,
        lido.linhas,
      );
  }
}

/**
 * Grava a importação com procedência e resultado, e audita (RN49).
 *
 * A auditoria registra QUE a importação aconteceu, com o hash e o
 * resultado — nunca o conteúdo do arquivo, e em nenhuma hipótese um CPF.
 */
async function registrarImportacao(
  tx: Prisma.TransactionClient,
  dados: {
    ator: Ator;
    tipoLayout: TipoLayoutTelemetria;
    nomeArquivo: string;
    hashConteudo: string;
    dataGeracaoDeclarada: Date | null;
    lidas: number;
    aplicadas: number;
    recusasPorCausa: RecusasPorCausa;
  },
) {
  const recusadas = totalDeRecusas(dados.recusasPorCausa);
  const importacao = await tx.importacaoTelemetria.create({
    data: {
      tipoLayout: dados.tipoLayout as TipoLayoutPrisma,
      nomeArquivo: dados.nomeArquivo,
      dataGeracaoDeclarada: dados.dataGeracaoDeclarada,
      hashConteudo: dados.hashConteudo,
      autorId: dados.ator.id,
      lidas: dados.lidas,
      aplicadas: dados.aplicadas,
      recusadas,
      recusasPorCausa: dados.recusasPorCausa as Prisma.InputJsonValue,
    },
  });

  await criarGravadorPrisma(tx).gravar([
    {
      entidade: ENTIDADE_IMPORTACAO,
      entidadeId: importacao.id,
      campo: "importacao",
      valorAnterior: null,
      valorNovo: JSON.stringify({
        tipoLayout: dados.tipoLayout,
        nomeArquivo: dados.nomeArquivo,
        hashConteudo: dados.hashConteudo,
        lidas: dados.lidas,
        aplicadas: dados.aplicadas,
        recusadas,
      }),
      autorId: dados.ator.id,
    },
  ]);

  return importacao;
}

// ---------------------------------------------------------------------
// Catálogo — OFERTAS (contadores da RN68 + reconciliação da RN70)
// ---------------------------------------------------------------------

async function aplicarOfertas(
  ator: Ator,
  nomeArquivo: string,
  hashConteudo: string,
  linhas: LinhaLida[],
): Promise<ResultadoDaImportacao> {
  const recusas: RecusasPorCausa = {};
  const recusar = (causa: CausaDeRecusa) => contarRecusa(recusas, causa);

  const ofertasDaPlataforma = await prisma.oferta.findMany({
    where: { idExternoMinutrade: { not: null } },
    select: { id: true, idExternoMinutrade: true, titulo: true, status: true },
  });
  const porIdExterno = new Map(
    ofertasDaPlataforma.map((oferta) => [oferta.idExternoMinutrade!, oferta]),
  );

  const vistas = new Set<string>();
  const aplicaveis: Array<{
    ofertaId: string;
    resgates: number;
    compras: number;
    dataArquivo: Date | null;
  }> = [];
  const noArquivo: Array<{ idExterno: string; rotulo: string; ativo: boolean }> = [];

  for (const linha of linhas) {
    const idExterno = valorDe(linha, "id da oferta");
    if (!idExterno) {
      recusar("SEM_IDENTIFICADOR");
      continue;
    }
    if (vistas.has(idExterno)) {
      recusar("LINHA_DUPLICADA_NO_ARQUIVO");
      continue;
    }
    vistas.add(idExterno);

    const statusNaOperadora = removerEmoji(valorDe(linha, "status da oferta"));
    noArquivo.push({
      idExterno,
      rotulo: valorDe(linha, "produto") || idExterno,
      ativo: /ativa/i.test(statusNaOperadora) && !/inativa/i.test(statusNaOperadora),
    });

    const oferta = porIdExterno.get(idExterno);
    if (!oferta) {
      // Vira divergência (RN70) — e a linha não é aplicada.
      recusar("ITEM_DESCONHECIDO_NA_PLATAFORMA");
      continue;
    }

    const resgates = inteiroOuNulo(valorDe(linha, "resgates"));
    const compras = inteiroOuNulo(valorDe(linha, "compras"));
    if (resgates === null || compras === null) {
      recusar("VALOR_ILEGIVEL");
      continue;
    }

    aplicaveis.push({
      ofertaId: oferta.id,
      resgates,
      compras,
      dataArquivo: dataOuNula(valorDe(linha, "data da oferta")),
    });
  }

  const divergencias = reconciliarCatalogo({
    naPlataforma: ofertasDaPlataforma.map((oferta) => ({
      idExterno: oferta.idExternoMinutrade!,
      rotulo: oferta.titulo,
      ativo: oferta.status === "PUBLICADA",
    })),
    naOperadora: noArquivo,
    substantivo: "oferta",
  });

  const dataGeracaoDeclarada = dataDeGeracaoDeclarada(linhas, "data da oferta");

  const importacao = await prisma.$transaction(async (tx) => {
    const criada = await registrarImportacao(tx, {
      ator,
      tipoLayout: "OFERTAS",
      nomeArquivo,
      hashConteudo,
      dataGeracaoDeclarada,
      lidas: linhas.length,
      aplicadas: aplicaveis.length,
      recusasPorCausa: recusas,
    });

    for (const item of aplicaveis) {
      // Último retrato por oferta (RN68): atualiza, nunca empilha.
      await tx.contadorDeOfertaTelemetria.upsert({
        where: { ofertaId: item.ofertaId },
        create: {
          ofertaId: item.ofertaId,
          resgates: item.resgates,
          compras: item.compras,
          dataArquivo: item.dataArquivo,
          importacaoId: criada.id,
        },
        update: {
          resgates: item.resgates,
          compras: item.compras,
          dataArquivo: item.dataArquivo,
          importacaoId: criada.id,
        },
      });
    }

    await gravarDivergencias(tx, criada.id, divergencias);
    return criada;
  });

  return {
    importacaoId: importacao.id,
    tipoLayout: "OFERTAS",
    jaImportado: false,
    lidas: linhas.length,
    aplicadas: aplicaveis.length,
    recusadas: totalDeRecusas(recusas),
    recusasPorCausa: recusas,
    divergencias: divergencias.length,
    dataGeracaoDeclarada,
    colunaDeCpfEncontrada: null,
  };
}

// ---------------------------------------------------------------------
// Catálogo — SELLERS (só reconciliação: nenhum contador por seller)
// ---------------------------------------------------------------------

async function aplicarSellers(
  ator: Ator,
  nomeArquivo: string,
  hashConteudo: string,
  linhas: LinhaLida[],
): Promise<ResultadoDaImportacao> {
  const recusas: RecusasPorCausa = {};
  const recusar = (causa: CausaDeRecusa) => contarRecusa(recusas, causa);

  const empresas = await prisma.empresa.findMany({
    where: { idExternoMinutrade: { not: null } },
    select: {
      id: true,
      idExternoMinutrade: true,
      nomeFantasia: true,
      estagio: true,
      solucoes: { select: { ofertas: { select: { status: true } } } },
    },
  });
  const porIdExterno = new Map(empresas.map((empresa) => [empresa.idExternoMinutrade!, empresa]));

  const vistos = new Set<string>();
  const noArquivo: Array<{ idExterno: string; rotulo: string; ativo: boolean }> = [];
  const divergencias: Divergencia[] = [];
  let aplicadas = 0;

  for (const linha of linhas) {
    const idExterno = valorDe(linha, "id do seller");
    if (!idExterno) {
      recusar("SEM_IDENTIFICADOR");
      continue;
    }
    if (vistos.has(idExterno)) {
      recusar("LINHA_DUPLICADA_NO_ARQUIVO");
      continue;
    }
    vistos.add(idExterno);

    // Higiene 2: o status do seller vem decorado com emoji.
    const status = removerEmoji(valorDe(linha, "seller com ofertas ativas"));
    const nome = valorDe(linha, "seller") || idExterno;
    noArquivo.push({
      idExterno,
      rotulo: nome,
      ativo: /com oferta ativa/i.test(status),
    });

    const empresa = porIdExterno.get(idExterno);
    if (!empresa) {
      recusar("ITEM_DESCONHECIDO_NA_PLATAFORMA");
      continue;
    }

    const ativasNaOperadora = inteiroOuNulo(valorDe(linha, "ofertas ativas"));
    if (ativasNaOperadora === null) {
      recusar("VALOR_ILEGIVEL");
      continue;
    }
    const ativasNaPlataforma = empresa.solucoes.reduce(
      (total, solucao) =>
        total + solucao.ofertas.filter((oferta) => oferta.status === "PUBLICADA").length,
      0,
    );
    const divergencia = divergenciaDeContagem({
      identificador: idExterno,
      rotulo: empresa.nomeFantasia,
      naPlataforma: ativasNaPlataforma,
      naOperadora: ativasNaOperadora,
    });
    if (divergencia) {
      divergencias.push(divergencia);
    }
    aplicadas += 1;
  }

  divergencias.push(
    ...reconciliarCatalogo({
      naPlataforma: empresas.map((empresa) => ({
        idExterno: empresa.idExternoMinutrade!,
        rotulo: empresa.nomeFantasia,
        ativo: empresa.estagio === "ALIADA_ATIVA",
      })),
      naOperadora: noArquivo,
      substantivo: "seller",
    }),
  );

  const dataGeracaoDeclarada = dataDeGeracaoDeclarada(linhas, "data de entrada do seller");

  const importacao = await prisma.$transaction(async (tx) => {
    const criada = await registrarImportacao(tx, {
      ator,
      tipoLayout: "SELLERS",
      nomeArquivo,
      hashConteudo,
      dataGeracaoDeclarada,
      lidas: linhas.length,
      aplicadas,
      recusasPorCausa: recusas,
    });
    await gravarDivergencias(tx, criada.id, divergencias);
    return criada;
  });

  return {
    importacaoId: importacao.id,
    tipoLayout: "SELLERS",
    jaImportado: false,
    lidas: linhas.length,
    aplicadas,
    recusadas: totalDeRecusas(recusas),
    recusasPorCausa: recusas,
    divergencias: divergencias.length,
    dataGeracaoDeclarada,
    colunaDeCpfEncontrada: null,
  };
}

async function gravarDivergencias(
  tx: Prisma.TransactionClient,
  importacaoId: string,
  divergencias: readonly Divergencia[],
): Promise<void> {
  if (divergencias.length === 0) return;
  await tx.divergenciaDeCatalogo.createMany({
    data: divergencias.map((divergencia) => ({
      importacaoId,
      tipo: divergencia.tipo,
      identificador: divergencia.identificador,
      descricao: divergencia.descricao,
    })),
  });
}

// ---------------------------------------------------------------------
// Nominal — USUARIOS e RESGATES (RN69: junção só por CPF-HMAC)
// ---------------------------------------------------------------------

/**
 * Resolve os assinantes das linhas por CPF-HMAC, de uma vez.
 *
 * Devolve o mapa `linha → assinanteId` e já conta as três causas de
 * recusa da RN69 — separadas, porque respondem perguntas diferentes.
 * **Nenhum CPF sai daqui**: nem no retorno, nem em log, nem em exceção.
 */
async function resolverAssinantesPorCpf(
  colunas: readonly string[],
  linhas: LinhaLida[],
  recusas: RecusasPorCausa,
): Promise<{
  colunaDeCpf: string | null;
  assinantePorLinha: Map<number, string>;
}> {
  const colunaDeCpf = detectarColunaCpf(colunas);
  const assinantePorLinha = new Map<number, string>();

  if (!colunaDeCpf) {
    // Arquivo histórico, anterior à requisição de 27/07: TODA linha é
    // recusada com a causa nomeada — e nada é gravado. Não é exceção.
    for (let i = 0; i < linhas.length; i += 1) {
      contarRecusa(recusas, "SEM_COLUNA_DE_CPF");
    }
    return { colunaDeCpf: null, assinantePorLinha };
  }

  const hashPorLinha = new Map<number, string>();
  for (const linha of linhas) {
    let cpf = normalizarValorDeCpf(linha.valores[colunaDeCpf] ?? "");
    // Zero à esquerda perdido: quando a operadora exporta o CPF como
    // NÚMERO — inclusive disfarçado de data, o defeito que o leitor-tabular
    // recupera —, o zero inicial some e sobram 10 dígitos. Repô-lo restaura
    // o MESMO dado, não deduz outro; o dígito verificador logo abaixo é
    // quem confirma se o resultado é um CPF de verdade.
    if (cpf.length === 10) cpf = `0${cpf}`;
    if (!cpf || !validarCpf(cpf)) {
      contarRecusa(recusas, "CPF_INVALIDO");
      continue;
    }
    // Caminho de cifra e HMAC da Onda 5 (RN36): a partir daqui só existe
    // o hash — o CPF em claro morre nesta linha.
    hashPorLinha.set(linha.numero, hashCpf(cpf));
  }

  const hashes = [...new Set(hashPorLinha.values())];
  const assinantes = hashes.length
    ? await prisma.assinante.findMany({
        where: { cpfHash: { in: hashes } },
        select: { id: true, cpfHash: true },
      })
    : [];
  const idPorHash = new Map(assinantes.map((a) => [a.cpfHash, a.id]));

  for (const [numero, hash] of hashPorLinha) {
    const assinanteId = idPorHash.get(hash);
    if (!assinanteId) {
      contarRecusa(recusas, "CPF_SEM_ASSINANTE");
      continue;
    }
    assinantePorLinha.set(numero, assinanteId);
  }

  return { colunaDeCpf, assinantePorLinha };
}

/** De-para dos perfis (RN63) — a fonte é a ficha, não um palpite. */
function perfilDaFonte(valor: string): "PATROCINADA" | "AUTOASSINATURA" | null {
  const normalizado = normalizarNomeDeColuna(valor);
  if (normalizado.includes("patrocinada")) return "PATROCINADA";
  if (normalizado.includes("paga")) return "AUTOASSINATURA";
  return null;
}

/** Estado do usuário (RN63) — NÃO é perfil; alimenta o funil de ativação. */
function estadoDaFonte(valor: string): "CADASTRADO" | "FREEMIUM" | "ASSINANTE" | null {
  const normalizado = normalizarNomeDeColuna(valor);
  if (normalizado.includes("cadastrado")) return "CADASTRADO";
  if (normalizado.includes("freemium")) return "FREEMIUM";
  if (normalizado.includes("assinante")) return "ASSINANTE";
  return null;
}

async function aplicarUsuarios(
  ator: Ator,
  nomeArquivo: string,
  hashConteudo: string,
  colunas: readonly string[],
  linhas: LinhaLida[],
): Promise<ResultadoDaImportacao> {
  const recusas: RecusasPorCausa = {};
  const { colunaDeCpf, assinantePorLinha } = await resolverAssinantesPorCpf(
    colunas,
    linhas,
    recusas,
  );

  const patrocinadores = await prisma.patrocinador.findMany({
    select: { id: true, razaoSocial: true },
  });
  const patrocinadorPorNome = new Map(
    patrocinadores.map((p) => [normalizarNomeDeColuna(p.razaoSocial), p.id]),
  );

  const porLinha = new Map(linhas.map((linha) => [linha.numero, linha]));
  let aplicadas = 0;

  const importacao = await prisma.$transaction(async (tx) => {
    const criada = await registrarImportacao(tx, {
      ator,
      tipoLayout: "USUARIOS",
      nomeArquivo,
      hashConteudo,
      dataGeracaoDeclarada: null,
      lidas: linhas.length,
      aplicadas: assinantePorLinha.size,
      recusasPorCausa: recusas,
    });

    for (const [numero, assinanteId] of assinantePorLinha) {
      const linha = porLinha.get(numero)!;
      const perfilBruto = valorDe(
        linha,
        "perfil",
        "perfil de assinatura",
        "tipo de assinatura",
        "assinatura",
      );
      const patrocinadorBruto = valorDe(linha, "patrocinador");
      const estadoBruto = valorDe(linha, "status do usuario", "situacao do usuario", "estado");

      // RN63 — `Broto` na coluna nativa mapeia para Promocional Broto.
      const ehPromocionalBroto =
        normalizarNomeDeColuna(patrocinadorBruto) === "broto";
      const perfil = ehPromocionalBroto ? "PROMOCIONAL_BROTO" : perfilDaFonte(perfilBruto);
      const estado = estadoDaFonte(estadoBruto || perfilBruto);

      await tx.assinante.update({
        where: { id: assinanteId },
        data: {
          ...(perfil ? { perfilAssinatura: perfil } : {}),
          ...(estado ? { estadoUsuario: estado } : {}),
        },
      });

      const plano = valorDe(linha, "plano");
      const periodicidade = valorDe(linha, "periodicidade");
      const metodo = valorDe(linha, "metodo de pagamento", "metodo", "forma de pagamento");
      const preco = valorDe(linha, "preco", "valor");
      if (plano || periodicidade || metodo || preco) {
        const planoNormalizado = /anual/i.test(plano)
          ? "ANUAL"
          : /mensal/i.test(plano)
            ? "MENSAL"
            : null;
        const precoNumero = preco ? Number(preco.replace(/\./g, "").replace(",", ".")) : null;
        const dados = {
          ...(planoNormalizado ? { plano: planoNormalizado as "MENSAL" | "ANUAL" } : {}),
          ...(periodicidade ? { periodicidade } : {}),
          ...(metodo ? { metodoPagamento: metodo } : {}),
          ...(precoNumero !== null && Number.isFinite(precoNumero)
            ? { preco: new Prisma.Decimal(precoNumero) }
            : {}),
        };
        await tx.assinatura.upsert({
          where: { assinanteId },
          create: { assinanteId, ...dados },
          update: dados,
        });
      }

      // Vínculo de patrocínio (RN63): a coluna nativa alimenta o vínculo
      // da F19. Vínculo vigente já existente NÃO é duplicado.
      if (patrocinadorBruto && !ehPromocionalBroto) {
        const patrocinadorId = patrocinadorPorNome.get(
          normalizarNomeDeColuna(patrocinadorBruto),
        );
        if (patrocinadorId) {
          const jaVigente = await tx.vinculoPatrocinio.findFirst({
            where: { patrocinadorId, assinanteId, fim: null },
            select: { id: true },
          });
          if (!jaVigente) {
            await tx.vinculoPatrocinio.create({
              data: { patrocinadorId, assinanteId, inicio: new Date() },
            });
          }
        }
      }
      aplicadas += 1;
    }

    return criada;
  });

  return {
    importacaoId: importacao.id,
    tipoLayout: "USUARIOS",
    jaImportado: false,
    lidas: linhas.length,
    aplicadas,
    recusadas: totalDeRecusas(recusas),
    recusasPorCausa: recusas,
    divergencias: 0,
    dataGeracaoDeclarada: null,
    colunaDeCpfEncontrada: colunaDeCpf,
  };
}

/** SHA-256 da tupla que identifica o evento — ver o schema para o limite. */
export function chaveNaturalDoEvento(partes: {
  assinanteId: string;
  dataEvento: string;
  produto: string;
  seller: string;
}): string {
  return createHash("sha256")
    .update(
      [partes.assinanteId, partes.dataEvento, partes.produto, partes.seller]
        .map((parte) => parte.trim().toLowerCase())
        .join("|"),
    )
    .digest("hex");
}

/**
 * Grafias aceitas da coluna de data do evento — as hipotéticas anteriores e
 * o nome real observado no arquivo de "Resgate e Compras" (ago/2026).
 */
const COLUNAS_DATA_RESGATE = [
  "data do resgate",
  "data do evento",
  "data",
  "data de resgate",
  "data da compra ou resgate",
] as const;

async function aplicarResgates(
  ator: Ator,
  nomeArquivo: string,
  hashConteudo: string,
  colunas: readonly string[],
  linhas: LinhaLida[],
): Promise<ResultadoDaImportacao> {
  const recusas: RecusasPorCausa = {};
  const { colunaDeCpf, assinantePorLinha } = await resolverAssinantesPorCpf(
    colunas,
    linhas,
    recusas,
  );

  // Duas formas de casar o evento à oferta: pelo id da PLATAFORMA (o arquivo
  // real de "Resgate e Compras" manda o NOSSO próprio id na coluna Id_oferta —
  // item 2 da requisição de 27/07, agora atendido) ou pelo id externo da
  // Minutrade (formatos anteriores). Buscamos todas as ofertas para poder
  // resolver pelos dois caminhos.
  const ofertas = await prisma.oferta.findMany({
    select: { id: true, idExternoMinutrade: true },
  });
  const idsDaPlataforma = new Set(ofertas.map((oferta) => oferta.id));
  const ofertaPorIdExterno = new Map(
    ofertas
      .filter((oferta) => oferta.idExternoMinutrade)
      .map((oferta) => [oferta.idExternoMinutrade!, oferta.id]),
  );

  const porLinha = new Map(linhas.map((linha) => [linha.numero, linha]));
  const eventos: Array<{
    assinanteId: string;
    dataEvento: Date;
    produto: string;
    tipoOferta: string | null;
    seller: string | null;
    valor: Prisma.Decimal | null;
    ofertaId: string | null;
    chaveNatural: string;
  }> = [];
  const chavesNoArquivo = new Set<string>();

  for (const [numero, assinanteId] of assinantePorLinha) {
    const linha = porLinha.get(numero)!;
    const dataEvento = dataOuNula(valorDe(linha, ...COLUNAS_DATA_RESGATE));
    // Só a data é exigida. "Produto" deixou de ser obrigatório: o arquivo
    // real não o traz — traz o id do voucher e o id da oferta no lugar.
    if (!dataEvento) {
      contarRecusa(recusas, "VALOR_ILEGIVEL");
      continue;
    }
    const produto = valorDe(linha, "produto");
    const idVoucher = valorDe(linha, "id_voucher", "id voucher");
    const seller = valorDe(linha, "seller", "id_seller", "id do seller");
    // Deduplicação: o id do voucher é o identificador de evento que a
    // operadora passou a mandar — resolve a limitação declarada da chave por
    // (produto, seller). Quando ausente (formato antigo), cai no produto.
    const chaveNatural = chaveNaturalDoEvento({
      assinanteId,
      dataEvento: dataEvento.toISOString().slice(0, 10),
      produto: produto || idVoucher,
      seller,
    });
    if (chavesNoArquivo.has(chaveNatural)) {
      contarRecusa(recusas, "LINHA_DUPLICADA_NO_ARQUIVO");
      continue;
    }
    chavesNoArquivo.add(chaveNatural);

    // Casa a oferta pelo NOSSO id (arquivo real de "Resgate e Compras") ou
    // pelo id externo da Minutrade (legado). Nulo se não casar nenhum.
    const idOferta = valorDe(linha, "id_oferta", "id da oferta");
    const ofertaId = idOferta
      ? idsDaPlataforma.has(idOferta)
        ? idOferta
        : (ofertaPorIdExterno.get(idOferta) ?? null)
      : null;
    eventos.push({
      assinanteId,
      dataEvento,
      produto,
      tipoOferta: valorDe(linha, "tipo de oferta") || null,
      seller: seller || null,
      valor: valorMonetarioOuNulo(valorDe(linha, "valor")),
      ofertaId,
      chaveNatural,
    });
  }

  const dataGeracaoDeclarada = dataDeGeracaoDeclarada(linhas, ...COLUNAS_DATA_RESGATE);

  const resultado = await prisma.$transaction(async (tx) => {
    const criada = await registrarImportacao(tx, {
      ator,
      tipoLayout: "RESGATES",
      nomeArquivo,
      hashConteudo,
      dataGeracaoDeclarada,
      lidas: linhas.length,
      aplicadas: eventos.length,
      recusasPorCausa: recusas,
    });
    // `skipDuplicates`: a fonte é acumulada e o mesmo evento volta a cada
    // geração. Reimportar não duplica — e não altera o que já entrou,
    // porque fato de telemetria é imutável (RN07).
    const gravados = await tx.eventoDeResgateTelemetria.createMany({
      data: eventos.map((evento) => ({ ...evento, importacaoId: criada.id })),
      skipDuplicates: true,
    });
    return { criada, gravados: gravados.count };
  });

  return {
    importacaoId: resultado.criada.id,
    tipoLayout: "RESGATES",
    jaImportado: false,
    lidas: linhas.length,
    aplicadas: eventos.length,
    recusadas: totalDeRecusas(recusas),
    recusasPorCausa: recusas,
    divergencias: 0,
    dataGeracaoDeclarada,
    colunaDeCpfEncontrada: colunaDeCpf,
  };
}
