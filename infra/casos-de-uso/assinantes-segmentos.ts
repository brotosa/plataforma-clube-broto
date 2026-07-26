import { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao, podeExecutar } from "@/dominio/autorizacao/permissoes";
import {
  compilarSegmento,
  validarEstruturaRegras,
} from "@/dominio/segmentacao/compilador";
import { formatarCpf } from "@/dominio/assinantes/cpf";
import { decifrarCpf } from "@/infra/assinantes/protecao-cpf";
import {
  criarArmazenadorLocal,
  hashDeSnapshot,
} from "@/infra/exportacoes/armazenador";
import { slugsEnriquecimentoAtivos } from "@/infra/consultas/assinantes";
import { logger } from "@/infra/log/logger";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Segmentos (RN33) e exportação de listas (RN34).
 *
 * - Segmento guarda SEMPRE a estrutura declarativa — a regra, não a
 *   lista; a contagem é recalculada a cada consulta (T21).
 * - Exportar materializa snapshot auditável: autor, data, contagem,
 *   FINALIDADE obrigatória, a regra usada e o hash do arquivo; o CSV
 *   vai ao armazenamento de objetos.
 * - Acesso pleno (RN30): a decisão é da API — aqui — e SEMPRE gera
 *   evento de auditoria com o contexto da consulta.
 */

async function compilarValidando(regrasBrutas: unknown) {
  const regras = validarEstruturaRegras(regrasBrutas);
  const compilado = compilarSegmento(regras, {
    slugsEnriquecimentoAtivos: await slugsEnriquecimentoAtivos(),
  });
  return { regras, compilado };
}

/** Salva um segmento novo (T18 → "Salvar como segmento"). */
export async function salvarSegmento(
  ator: Ator,
  parametros: { nome: string; regras: unknown },
) {
  exigirPermissao(ator.papel, "GERIR_SEGMENTOS");
  const nome = parametros.nome.trim();
  if (!nome) {
    throw new ErroDeValidacao(["O nome do segmento é obrigatório."]);
  }
  // Valida estrutura e catálogo já na gravação: segmento salvo é regra
  // compilável (a contagem pode ficar indisponível por RN36, mas o campo
  // precisa existir no catálogo).
  const { regras } = await compilarValidando(parametros.regras);

  return prisma.$transaction(async (tx) => {
    const segmento = await tx.segmento.create({
      data: {
        nome,
        regras: regras as unknown as Prisma.InputJsonValue,
        autorId: ator.id,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "segmento",
      entidadeId: segmento.id,
      autorId: ator.id,
      anterior: null,
      novo: { nome, regras: JSON.stringify(regras) },
    });
    return segmento;
  });
}

/** Atualiza nome e/ou regras (T21 → editar/renomear). */
export async function atualizarSegmento(
  ator: Ator,
  segmentoId: string,
  parametros: { nome?: string; regras?: unknown },
) {
  exigirPermissao(ator.papel, "GERIR_SEGMENTOS");
  const dados: Prisma.SegmentoUpdateInput = {};
  if (parametros.nome !== undefined) {
    const nome = parametros.nome.trim();
    if (!nome) {
      throw new ErroDeValidacao(["O nome do segmento é obrigatório."]);
    }
    dados.nome = nome;
  }
  if (parametros.regras !== undefined) {
    const { regras } = await compilarValidando(parametros.regras);
    dados.regras = regras as unknown as Prisma.InputJsonValue;
  }

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.segmento.findUniqueOrThrow({ where: { id: segmentoId } });
    const segmento = await tx.segmento.update({ where: { id: segmentoId }, data: dados });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "segmento",
      entidadeId: segmentoId,
      autorId: ator.id,
      anterior: { nome: anterior.nome, regras: JSON.stringify(anterior.regras) },
      novo: { nome: segmento.nome, regras: JSON.stringify(segmento.regras) },
    });
    return segmento;
  });
}

/** Duplica um segmento (T21) — cópia nomeada da regra, não da lista. */
export async function duplicarSegmento(ator: Ator, segmentoId: string) {
  exigirPermissao(ator.papel, "GERIR_SEGMENTOS");
  const original = await prisma.segmento.findUniqueOrThrow({ where: { id: segmentoId } });
  return salvarSegmento(ator, {
    nome: `${original.nome} (cópia)`,
    regras: original.regras,
  });
}

/**
 * RN30 — decisão de exibição plena, na API: devolve se o ator pode ver
 * dados plenos e, quando ele SOLICITA a exibição plena, grava o evento
 * de auditoria com o contexto da consulta. Sem permissão, devolve
 * mascarado — silenciosamente, sem erro: a UI mostra o aviso da T18/T19.
 */
export async function decidirExibicaoPlena(
  ator: Ator,
  solicitacao: {
    exibirPlenos: boolean;
    contexto: "carteira" | "perfil";
    assinanteId?: string;
  },
): Promise<{ dadosPlenos: boolean }> {
  if (!solicitacao.exibirPlenos) {
    return { dadosPlenos: false };
  }
  if (!podeExecutar(ator.papel, "VISUALIZAR_DADOS_PESSOAIS_PLENOS")) {
    return { dadosPlenos: false };
  }
  await criarGravadorPrisma(prisma).gravar([
    {
      entidade: "assinante",
      entidadeId: solicitacao.assinanteId ?? "carteira",
      campo: "acesso_dados_plenos",
      valorAnterior: null,
      valorNovo: JSON.stringify({
        contexto: solicitacao.contexto,
        finalidade: `consulta na tela ${solicitacao.contexto === "carteira" ? "T18 — carteira" : "T19 — perfil"}`,
      }),
      autorId: ator.id,
    },
  ]);
  return { dadosPlenos: true };
}

/** Colunas do snapshot CSV (lista de CONTATO — plena por definição). */
const CABECALHO_SNAPSHOT = [
  "nome",
  "cpf",
  "email",
  "telefone",
  "uf",
  "municipio",
  "preferencia",
];

function linhaCsv(valores: Array<string | null>): string {
  return valores
    .map((valor) => {
      const texto = valor ?? "";
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    })
    .join(";");
}

/**
 * Materializa o CSV da lista a partir da regra declarativa. Separado do
 * caso de uso para a ativação de campanha (Onda 4, RN38) congelar o
 * público pelo MESMO caminho, sem duplicar o formato do snapshot.
 */
export async function montarSnapshotDoPublico(regrasBrutas: unknown) {
  const { regras, compilado } = await compilarValidando(regrasBrutas);
  if (compilado.status === "AGUARDANDO_TELEMETRIA") {
    throw new ErroDeValidacao([
      "A regra inclui uso em 90 dias — sem telemetria por assinante, a lista não é computável (RN36).",
    ]);
  }

  const assinantes = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT a.id FROM assinantes a WHERE a.status_base = 'ATIVO' AND (${compilado.sql}) ORDER BY a.nome ASC, a.id ASC`,
    ...compilado.parametros,
  );
  const registros = await prisma.assinante.findMany({
    where: { id: { in: assinantes.map(({ id }) => id) } },
    orderBy: [{ nome: "asc" }, { id: "asc" }],
  });

  const linhas = [linhaCsv(CABECALHO_SNAPSHOT)];
  for (const registro of registros) {
    linhas.push(
      linhaCsv([
        registro.nome,
        formatarCpf(decifrarCpf(registro.cpfCifrado)),
        registro.email,
        registro.telefone,
        registro.uf,
        registro.municipio,
        registro.preferencia?.toLowerCase() ?? null,
      ]),
    );
  }
  const conteudo = Buffer.from(linhas.join("\n") + "\n", "utf8");
  return {
    regras,
    conteudo,
    hash: hashDeSnapshot(conteudo),
    contagem: registros.length,
    cpfHashes: registros.map((registro) => registro.cpfHash),
  };
}

/**
 * Grava a linha auditável da exportação (RN34) dentro de uma transação
 * em curso. O arquivo é gravado pelo chamador DEPOIS do commit — a linha
 * auditável existe antes do arquivo, nunca o inverso.
 */
export async function registrarExportacaoDentroDaTransacao(
  tx: Prisma.TransactionClient,
  autorId: string,
  dados: {
    finalidade: string;
    contagem: number;
    regras: unknown;
    hash: string;
    segmentoId?: string | null;
  },
) {
  const criada = await tx.exportacaoLista.create({
    data: {
      autorId,
      finalidade: dados.finalidade,
      contagem: dados.contagem,
      regras: dados.regras as unknown as Prisma.InputJsonValue,
      segmentoId: dados.segmentoId ?? null,
      arquivoChave: "pendente",
      hashArquivo: dados.hash,
    },
  });
  const chave = `listas-contato/${criada.criadoEm.toISOString().slice(0, 10)}-${criada.id}.csv`;
  const atualizada = await tx.exportacaoLista.update({
    where: { id: criada.id },
    data: { arquivoChave: chave },
  });
  await registrarMutacao(criarGravadorPrisma(tx), {
    entidade: "exportacao_lista",
    entidadeId: criada.id,
    autorId,
    anterior: null,
    novo: {
      finalidade: dados.finalidade,
      contagem: dados.contagem,
      regras: JSON.stringify(dados.regras),
      hashArquivo: dados.hash,
      arquivoChave: chave,
      segmentoId: dados.segmentoId ?? null,
    },
  });
  return atualizada;
}

/**
 * RN34 — exportação de lista de contato: permissão específica,
 * finalidade OBRIGATÓRIA, snapshot CSV no armazenamento de objetos e
 * registro auditável com contagem, regra e hash. Regra com "uso em 90
 * dias" não exporta: a lista não é computável sem telemetria (RN36) e
 * nada aqui é estimado.
 */
export async function exportarLista(
  ator: Ator,
  parametros: {
    regras: unknown;
    finalidade: string;
    segmentoId?: string | null;
  },
) {
  exigirPermissao(ator.papel, "EXPORTAR_LISTAS_CONTATO");
  const finalidade = parametros.finalidade.trim();
  if (!finalidade) {
    throw new ErroDeValidacao([
      "A finalidade da exportação é obrigatória e fica gravada no snapshot (RN34).",
    ]);
  }
  const snapshot = await montarSnapshotDoPublico(parametros.regras);
  const { conteudo, hash, contagem, regras } = snapshot;

  const exportacao = await prisma.$transaction((tx) =>
    registrarExportacaoDentroDaTransacao(tx, ator.id, {
      finalidade,
      contagem,
      regras,
      hash,
      segmentoId: parametros.segmentoId ?? null,
    }),
  );

  // Snapshot gravado após a transação: a linha auditável existe antes do
  // arquivo; em falha de armazenamento o registro aponta hash sem objeto
  // e a operação pode ser refeita — nunca o inverso (arquivo órfão).
  await criarArmazenadorLocal().salvar(exportacao.arquivoChave, conteudo);
  logger.info(
    { exportacaoId: exportacao.id, contagem },
    "exportação de lista materializada",
  );
  return exportacao;
}

/** Snapshot para download (re-verificação de permissão na rota). */
export async function lerSnapshotExportacao(ator: Ator, exportacaoId: string) {
  exigirPermissao(ator.papel, "EXPORTAR_LISTAS_CONTATO");
  const exportacao = await prisma.exportacaoLista.findUniqueOrThrow({
    where: { id: exportacaoId },
  });
  const conteudo = await criarArmazenadorLocal().ler(exportacao.arquivoChave);
  return { exportacao, conteudo };
}
