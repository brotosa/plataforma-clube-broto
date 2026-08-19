/**
 * Importador self-service de OFERTAS — camada de aplicação.
 *
 * Espelha o de soluções: upload → validação → staging → conferência (com
 * correção leve) → efetivação. A oferta aponta a solução por ID; a
 * efetivação reaproveita `criarOferta` (entra como **rascunho**) e
 * `atualizarOferta` — regras (RN02..RN12) e auditoria de graça.
 */

import { prisma } from "@/infra/prisma/cliente";
import { lerArquivoTabular } from "@/infra/planilhas/leitor-tabular";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  linhaOfertaPronta,
  validarLoteOfertas,
  type ContextoValidacaoOferta,
  type LinhaOfertaCrua,
  type ResultadoLinhaOferta,
} from "@/dominio/importacao-catalogo/ofertas";
import { criarOferta, atualizarOferta, type DadosOferta } from "./ofertas";
import { type Ator, ErroDeValidacao } from "./contexto";

async function montarContexto(): Promise<ContextoValidacaoOferta> {
  const [tipos, mecanicas, solucoes, ofertas] = await Promise.all([
    prisma.tipoBeneficio.findMany({ select: { id: true, nome: true, slug: true } }),
    prisma.mecanica.findMany({ select: { id: true, nome: true, slug: true } }),
    prisma.solucao.findMany({ select: { id: true } }),
    prisma.oferta.findMany({ select: { id: true } }),
  ]);
  return {
    tiposBeneficio: tipos,
    mecanicas,
    solucaoIds: new Set(solucoes.map((s) => s.id)),
    ofertaIds: new Set(ofertas.map((o) => o.id)),
  };
}

function snapshotDaLinha(r: ResultadoLinhaOferta) {
  return {
    linhaOrigem: r.linha,
    acao: r.acao,
    solucaoIdResolvida: r.solucaoId,
    ofertaIdResolvida: r.ofertaId,
    estado: linhaOfertaPronta(r) ? ("APROVADA" as const) : ("PENDENTE" as const),
    mensagemErro:
      r.pendencias.length > 0
        ? r.pendencias.map((p) => `${p.coluna}: ${p.motivo}`).join(" · ")
        : null,
  };
}

export interface ResultadoImportacaoOfertas {
  importacaoId: string;
  total: number;
  prontas: number;
  comPendencia: number;
}

export async function importarOfertas(
  ator: Ator,
  arquivo: { nomeArquivo: string; conteudo: Buffer },
): Promise<ResultadoImportacaoOfertas> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const lido = await lerArquivoTabular(arquivo.nomeArquivo, arquivo.conteudo);
  if (lido.linhas.length === 0) {
    throw new ErroDeValidacao(["A planilha não tem nenhuma linha de dados."]);
  }

  const cruas: LinhaOfertaCrua[] = lido.linhas.map((l) => ({ linha: l.numero, valores: l.valores }));
  const ctx = await montarContexto();
  const resultados = validarLoteOfertas(cruas, ctx);
  const prontas = resultados.filter(linhaOfertaPronta).length;

  const importacao = await prisma.importacao.create({
    data: {
      tipo: "IMPORTA_OFERTAS",
      nomeArquivo: arquivo.nomeArquivo,
      linhasOk: prontas,
      linhasErro: resultados.length - prontas,
      autorId: ator.id,
    },
  });

  await prisma.stagingOfertaImportada.createMany({
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

async function revalidarLote(importacaoId: string) {
  const linhasStaging = await prisma.stagingOfertaImportada.findMany({
    where: { importacaoId },
    orderBy: { linhaOrigem: "asc" },
  });
  const cruas: LinhaOfertaCrua[] = linhasStaging.map((s) => ({
    linha: s.linhaOrigem,
    valores: (s.dadosOriginais ?? {}) as Record<string, string>,
  }));
  const ctx = await montarContexto();
  const resultados = validarLoteOfertas(cruas, ctx);
  return { linhasStaging, resultados };
}

export interface LinhaDeConferenciaOferta {
  id: string;
  linha: number;
  valores: Record<string, string>;
  acao: "CRIAR" | "ENRIQUECER" | null;
  pendencias: { coluna: string; motivo: string }[];
}

export interface ConferenciaOfertas {
  importacaoId: string;
  nomeArquivo: string;
  linhas: LinhaDeConferenciaOferta[];
  prontas: number;
  comPendencia: number;
}

export async function conferenciaImportacaoOfertas(
  importacaoId: string,
): Promise<ConferenciaOfertas | null> {
  const importacao = await prisma.importacao.findUnique({ where: { id: importacaoId } });
  if (!importacao || importacao.tipo !== "IMPORTA_OFERTAS") {
    return null;
  }
  const { linhasStaging, resultados } = await revalidarLote(importacaoId);
  const linhas: LinhaDeConferenciaOferta[] = linhasStaging.map((s, i) => ({
    id: s.id,
    linha: s.linhaOrigem,
    valores: (s.dadosOriginais ?? {}) as Record<string, string>,
    acao: resultados[i]!.acao,
    pendencias: resultados[i]!.pendencias,
  }));
  const prontas = resultados.filter(linhaOfertaPronta).length;
  return {
    importacaoId,
    nomeArquivo: importacao.nomeArquivo,
    linhas,
    prontas,
    comPendencia: resultados.length - prontas,
  };
}

export async function corrigirCelulaOferta(
  ator: Ator,
  entrada: { stagingId: string; coluna: string; valor: string },
): Promise<void> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  const alvo = await prisma.stagingOfertaImportada.findUnique({ where: { id: entrada.stagingId } });
  if (!alvo) {
    throw new ErroDeValidacao(["Linha da importação não encontrada."]);
  }
  const valores = { ...((alvo.dadosOriginais ?? {}) as Record<string, string>) };
  valores[entrada.coluna] = entrada.valor;
  await prisma.stagingOfertaImportada.update({
    where: { id: entrada.stagingId },
    data: { dadosOriginais: valores },
  });

  const { linhasStaging, resultados } = await revalidarLote(alvo.importacaoId);
  await Promise.all(
    linhasStaging.map((s, i) =>
      prisma.stagingOfertaImportada.update({
        where: { id: s.id },
        data: snapshotDaLinha(resultados[i]!),
      }),
    ),
  );
}

export interface ResultadoEfetivacaoOfertas {
  criadas: number;
  enriquecidas: number;
}

export async function efetivarImportacaoOfertas(
  ator: Ator,
  importacaoId: string,
): Promise<ResultadoEfetivacaoOfertas> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const importacao = await prisma.importacao.findUnique({ where: { id: importacaoId } });
  if (!importacao || importacao.tipo !== "IMPORTA_OFERTAS") {
    throw new ErroDeValidacao(["Importação de ofertas não encontrada."]);
  }

  const { linhasStaging, resultados } = await revalidarLote(importacaoId);
  const comPendencia = resultados.filter((r) => !linhaOfertaPronta(r)).length;
  if (comPendencia > 0) {
    throw new ErroDeValidacao([
      `Ainda há ${comPendencia} linha(s) com pendência — corrija ou remova antes de efetivar.`,
    ]);
  }

  const resultado: ResultadoEfetivacaoOfertas = { criadas: 0, enriquecidas: 0 };
  for (let i = 0; i < resultados.length; i += 1) {
    const r = resultados[i]!;
    const dados: DadosOferta = {
      titulo: r.campos.titulo,
      natureza: r.campos.natureza,
      tipoBeneficioId: r.campos.tipoBeneficioId,
      mecanicaId: r.campos.mecanicaId,
      precoDe: r.campos.precoDe,
      precoPor: r.campos.precoPor,
      cupomCodigoRegras: r.campos.cupomCodigoRegras,
      modalidadePagamento: r.campos.modalidadePagamento,
      instrucoesResgate: r.campos.instrucoesResgate,
      vigenciaInicio: r.campos.vigenciaInicio,
      vigenciaFim: r.campos.vigenciaFim,
      limiteResgates: r.campos.limiteResgates,
    };
    let ofertaId: string;
    if (r.ofertaId) {
      await atualizarOferta(ator, r.ofertaId, dados);
      ofertaId = r.ofertaId;
      resultado.enriquecidas += 1;
    } else {
      const criada = await criarOferta(ator, r.solucaoId!, dados);
      ofertaId = criada.id;
      resultado.criadas += 1;
    }
    await prisma.stagingOfertaImportada.update({
      where: { id: linhasStaging[i]!.id },
      data: { estado: "EFETIVADA", ofertaIdEfetivada: ofertaId },
    });
  }
  return resultado;
}
