/**
 * Importador self-service de SOLUÇÕES — camada de aplicação.
 *
 * Fluxo: upload → validação → staging → conferência (com correção leve nas
 * células com pendência) → efetivação. A efetivação **reaproveita**
 * `criarSolucao`/`atualizarSolucao`, então RN01 e auditoria vêm de graça e
 * o comportamento é idêntico ao cadastro manual (sem regra duplicada).
 *
 * A validação é sempre **ao vivo** contra o catálogo (aliados, soluções e
 * listas do Parametrizador) — a conferência e a efetivação revalidam a
 * partir da linha crua guardada, para não confiar num retrato velho.
 */

import { prisma } from "@/infra/prisma/cliente";
import { normalizarCnpj } from "@/dominio/empresas/cnpj";
import { lerArquivoTabular } from "@/infra/planilhas/leitor-tabular";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  chaveSolucao,
  linhaPronta,
  validarLoteSolucoes,
  type ContextoValidacaoSolucao,
  type LinhaSolucaoCrua,
  type ResultadoLinhaSolucao,
} from "@/dominio/importacao-catalogo/solucoes";
import { criarSolucao, atualizarSolucao, type DadosSolucao } from "./solucoes";
import { type Ator, ErroDeValidacao } from "./contexto";

/** Lê o catálogo e monta o contexto puro que o domínio consome. */
async function montarContexto(): Promise<ContextoValidacaoSolucao> {
  const [categorias, culturas, ufs, empresas, solucoes] = await Promise.all([
    prisma.categoria.findMany({ where: { ativa: true }, select: { id: true, nome: true } }),
    prisma.cultura.findMany({ where: { ativa: true }, select: { id: true, nome: true } }),
    prisma.uf.findMany({ where: { ativa: true }, select: { id: true, sigla: true, nome: true } }),
    prisma.empresa.findMany({
      where: { cnpj: { not: null } },
      select: { id: true, cnpj: true, estagio: true },
    }),
    prisma.solucao.findMany({
      select: { id: true, nome: true, empresa: { select: { cnpj: true } } },
    }),
  ]);

  const aliadoPorCnpj = new Map<string, { id: string; ativo: boolean }>();
  for (const e of empresas) {
    if (e.cnpj) {
      aliadoPorCnpj.set(normalizarCnpj(e.cnpj), {
        id: e.id,
        ativo: e.estagio === "ALIADA_ATIVA",
      });
    }
  }

  const solucaoPorChave = new Map<string, string>();
  for (const s of solucoes) {
    if (s.empresa.cnpj) {
      solucaoPorChave.set(chaveSolucao(normalizarCnpj(s.empresa.cnpj), s.nome), s.id);
    }
  }

  return { categorias, culturas, ufs, aliadoPorCnpj, solucaoPorChave };
}

/** Converte o resultado do domínio no snapshot gravado no staging. */
function snapshotDaLinha(r: ResultadoLinhaSolucao) {
  return {
    linhaOrigem: r.linha,
    cnpj: r.cnpjNormalizado,
    nomeSolucao: r.campos.nome || null,
    descricaoCurta: r.campos.descricaoCurta,
    descricaoCompleta: r.campos.descricaoCompleta,
    categoriaTexto: null as string | null, // guardamos o cru em dadosOriginais
    linkExterno: r.campos.linkExterno,
    culturasTexto: null as string | null,
    coberturaTexto: null as string | null,
    acao: r.acao,
    empresaIdResolvida: r.empresaId,
    solucaoIdResolvida: r.solucaoId,
    estado: linhaPronta(r) ? ("APROVADA" as const) : ("PENDENTE" as const),
    mensagemErro:
      r.pendencias.length > 0
        ? r.pendencias.map((p) => `${p.coluna}: ${p.motivo}`).join(" · ")
        : null,
  };
}

export interface ResultadoImportacaoSolucoes {
  importacaoId: string;
  total: number;
  prontas: number;
  comPendencia: number;
}

/** Passo 1: lê o arquivo, valida o lote e grava o staging para conferência. */
export async function importarSolucoes(
  ator: Ator,
  arquivo: { nomeArquivo: string; conteudo: Buffer },
): Promise<ResultadoImportacaoSolucoes> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const lido = await lerArquivoTabular(arquivo.nomeArquivo, arquivo.conteudo);
  if (lido.linhas.length === 0) {
    throw new ErroDeValidacao(["A planilha não tem nenhuma linha de dados."]);
  }

  const cruas: LinhaSolucaoCrua[] = lido.linhas.map((l) => ({
    linha: l.numero,
    valores: l.valores,
  }));
  const ctx = await montarContexto();
  const resultados = validarLoteSolucoes(cruas, ctx);

  const prontas = resultados.filter(linhaPronta).length;

  const importacao = await prisma.importacao.create({
    data: {
      tipo: "IMPORTA_SOLUCOES",
      nomeArquivo: arquivo.nomeArquivo,
      linhasOk: prontas,
      linhasErro: resultados.length - prontas,
      autorId: ator.id,
    },
  });

  await prisma.stagingSolucaoImportada.createMany({
    data: resultados.map((r, i) => ({
      importacaoId: importacao.id,
      dadosOriginais: cruas[i]!.valores,
      ...snapshotDaLinha(r),
    })),
  });

  return {
    importacaoId: importacao.id,
    total: resultados.length,
    prontas,
    comPendencia: resultados.length - prontas,
  };
}

/** Revalida o lote inteiro ao vivo a partir das linhas cruas do staging. */
async function revalidarLote(importacaoId: string) {
  const linhasStaging = await prisma.stagingSolucaoImportada.findMany({
    where: { importacaoId },
    orderBy: { linhaOrigem: "asc" },
  });
  const cruas: LinhaSolucaoCrua[] = linhasStaging.map((s) => ({
    linha: s.linhaOrigem,
    valores: (s.dadosOriginais ?? {}) as Record<string, string>,
  }));
  const ctx = await montarContexto();
  const resultados = validarLoteSolucoes(cruas, ctx);
  return { linhasStaging, resultados };
}

export interface LinhaDeConferencia {
  id: string;
  linha: number;
  valores: Record<string, string>;
  acao: "CRIAR" | "ENRIQUECER" | null;
  pendencias: { coluna: string; motivo: string }[];
}

export interface ConferenciaSolucoes {
  importacaoId: string;
  nomeArquivo: string;
  linhas: LinhaDeConferencia[];
  prontas: number;
  comPendencia: number;
}

/** Passo 2: dados da tela de conferência (validação ao vivo). */
export async function conferenciaImportacaoSolucoes(
  importacaoId: string,
): Promise<ConferenciaSolucoes | null> {
  const importacao = await prisma.importacao.findUnique({ where: { id: importacaoId } });
  if (!importacao || importacao.tipo !== "IMPORTA_SOLUCOES") {
    return null;
  }
  const { linhasStaging, resultados } = await revalidarLote(importacaoId);

  const linhas: LinhaDeConferencia[] = linhasStaging.map((s, i) => ({
    id: s.id,
    linha: s.linhaOrigem,
    valores: (s.dadosOriginais ?? {}) as Record<string, string>,
    acao: resultados[i]!.acao,
    pendencias: resultados[i]!.pendencias,
  }));
  const prontas = resultados.filter(linhaPronta).length;

  return {
    importacaoId,
    nomeArquivo: importacao.nomeArquivo,
    linhas,
    prontas,
    comPendencia: resultados.length - prontas,
  };
}

/** Correção leve: reescreve uma célula e revalida a linha (e o lote). */
export async function corrigirCelulaSolucao(
  ator: Ator,
  entrada: { stagingId: string; coluna: string; valor: string },
): Promise<void> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  const alvo = await prisma.stagingSolucaoImportada.findUnique({
    where: { id: entrada.stagingId },
  });
  if (!alvo) {
    throw new ErroDeValidacao(["Linha da importação não encontrada."]);
  }
  const valores = { ...((alvo.dadosOriginais ?? {}) as Record<string, string>) };
  valores[entrada.coluna] = entrada.valor;
  await prisma.stagingSolucaoImportada.update({
    where: { id: entrada.stagingId },
    data: { dadosOriginais: valores },
  });

  // Revalida o lote (o dedup depende do conjunto) e atualiza os snapshots.
  const { linhasStaging, resultados } = await revalidarLote(alvo.importacaoId);
  await Promise.all(
    linhasStaging.map((s, i) =>
      prisma.stagingSolucaoImportada.update({
        where: { id: s.id },
        data: snapshotDaLinha(resultados[i]!),
      }),
    ),
  );
}

export interface ResultadoEfetivacaoSolucoes {
  criadas: number;
  enriquecidas: number;
}

/**
 * Passo 3: efetiva. Bloqueia se QUALQUER linha ainda tem pendência (decisão
 * "recusa o arquivo inteiro"). Cria/atualiza via os casos de uso, e mantém
 * um mapa vivo de chaves para não duplicar solução criada no mesmo lote.
 */
export async function efetivarImportacaoSolucoes(
  ator: Ator,
  importacaoId: string,
): Promise<ResultadoEfetivacaoSolucoes> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const importacao = await prisma.importacao.findUnique({ where: { id: importacaoId } });
  if (!importacao || importacao.tipo !== "IMPORTA_SOLUCOES") {
    throw new ErroDeValidacao(["Importação de soluções não encontrada."]);
  }

  const { linhasStaging, resultados } = await revalidarLote(importacaoId);
  const comPendencia = resultados.filter((r) => !linhaPronta(r)).length;
  if (comPendencia > 0) {
    throw new ErroDeValidacao([
      `Ainda há ${comPendencia} linha(s) com pendência — corrija ou remova antes de efetivar.`,
    ]);
  }

  // Mapa vivo: chave → id, semeado do banco e atualizado a cada criação.
  const ctxSolucoes = new Map<string, string>();
  const resultado: ResultadoEfetivacaoSolucoes = { criadas: 0, enriquecidas: 0 };

  for (let i = 0; i < resultados.length; i += 1) {
    const r = resultados[i]!;
    const dados: DadosSolucao = {
      nome: r.campos.nome,
      descricaoCurta: r.campos.descricaoCurta,
      descricaoCompleta: r.campos.descricaoCompleta,
      categoriaId: r.campos.categoriaId,
      linkExterno: r.campos.linkExterno,
      coberturaNacional: r.campos.coberturaNacional,
      culturaIds: r.campos.culturaIds,
      ufIds: r.campos.ufIds,
    };
    const chave = chaveSolucao(r.cnpjNormalizado!, r.campos.nome);
    const jaCriadaNoLote = ctxSolucoes.get(chave);

    let solucaoId: string;
    if (r.solucaoId ?? jaCriadaNoLote) {
      solucaoId = (r.solucaoId ?? jaCriadaNoLote)!;
      await atualizarSolucao(ator, solucaoId, dados);
      resultado.enriquecidas += 1;
    } else {
      const criada = await criarSolucao(ator, r.empresaId!, dados);
      solucaoId = criada.id;
      resultado.criadas += 1;
    }
    ctxSolucoes.set(chave, solucaoId);
    await prisma.stagingSolucaoImportada.update({
      where: { id: linhasStaging[i]!.id },
      data: { estado: "EFETIVADA", solucaoIdEfetivada: solucaoId },
    });
  }

  return resultado;
}
