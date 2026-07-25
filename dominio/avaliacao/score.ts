import type { GrupoIndicador } from "@prisma/client";
import { DIMENSOES_MEDICAO, grupoDaDimensao } from "./dimensoes";

/**
 * Cálculo do score da avaliação de scout (ficha da Onda 2 §3.2; fórmula da
 * nota de consistência de docs/especificacao/indicadores-scoutcb-seed.md,
 * igual à exibida no protótipo v6.1):
 *
 * - subtotal da dimensão = média das notas 1–5 dos seus indicadores × 20;
 * - total 0–100 = média dos subtotais das dimensões AVALIADAS, ponderada
 *   pelo peso de cada dimensão. O peso da dimensão é a média dos pesos dos
 *   indicadores considerados — com os pesos v1 (todos 1) o total é a média
 *   simples dos subtotais, e a ponderação por dimensão fica pronta para a
 *   edição da F10/RN25.
 *
 * Dimensão sem nenhuma nota não entra no cálculo (avaliação parcial é
 * permitida; a T10 mostra o que falta). O resultado carrega valores sem
 * arredondamento; `totalInteiro` é o inteiro 0–100 persistido/exibido.
 */

export interface NotaParaCalculo {
  dimensao: string;
  /** Peso do indicador respondido (v1 = 1 uniforme). */
  peso: number;
  /** Nota 1–5 (validada em regras.ts / CHECK do banco). */
  nota: number;
}

export interface SubtotalDimensao {
  dimensao: string;
  grupo: GrupoIndicador | null;
  quantidadeNotas: number;
  /** Média 1–5 das notas da dimensão, sem arredondamento. */
  media: number;
  /** Peso da dimensão aplicado no total (média dos pesos dos indicadores). */
  peso: number;
  /** Média × 20 (escala 0–100), sem arredondamento. */
  subtotal: number;
}

export interface ScoreCalculado {
  /** Somente dimensões avaliadas, na ordem canônica das tabelas do ScoutCB. */
  subtotais: SubtotalDimensao[];
  /** Total 0–100 sem arredondamento; null quando não há nenhuma nota. */
  total: number | null;
  /** Total arredondado ao inteiro mais próximo — o valor persistido. */
  totalInteiro: number | null;
}

/** Índice da dimensão na ordem canônica; desconhecidas vão para o fim. */
function ordemCanonica(dimensao: string): number {
  const indice = DIMENSOES_MEDICAO.findIndex((d) => d.nome === dimensao);
  return indice === -1 ? DIMENSOES_MEDICAO.length : indice;
}

export function calcularScore(notas: ReadonlyArray<NotaParaCalculo>): ScoreCalculado {
  const porDimensao = new Map<string, NotaParaCalculo[]>();
  for (const nota of notas) {
    const grupo = porDimensao.get(nota.dimensao) ?? [];
    grupo.push(nota);
    porDimensao.set(nota.dimensao, grupo);
  }

  const subtotais: SubtotalDimensao[] = [...porDimensao.entries()]
    .map(([dimensao, notasDaDimensao]) => {
      const media =
        notasDaDimensao.reduce((soma, n) => soma + n.nota, 0) / notasDaDimensao.length;
      const peso =
        notasDaDimensao.reduce((soma, n) => soma + n.peso, 0) / notasDaDimensao.length;
      return {
        dimensao,
        grupo: grupoDaDimensao(dimensao),
        quantidadeNotas: notasDaDimensao.length,
        media,
        peso,
        subtotal: media * 20,
      };
    })
    .sort(
      (a, b) =>
        ordemCanonica(a.dimensao) - ordemCanonica(b.dimensao) ||
        a.dimensao.localeCompare(b.dimensao),
    );

  if (subtotais.length === 0) {
    return { subtotais, total: null, totalInteiro: null };
  }

  // Pesos não positivos não existem no seed (default 1) e serão vedados no
  // editor da F10; se a soma degenerar a zero, cai na média simples em vez
  // de dividir por zero.
  const somaPesos = subtotais.reduce((soma, s) => soma + Math.max(0, s.peso), 0);
  const total =
    somaPesos > 0
      ? subtotais.reduce((soma, s) => soma + s.subtotal * Math.max(0, s.peso), 0) / somaPesos
      : subtotais.reduce((soma, s) => soma + s.subtotal, 0) / subtotais.length;

  return { subtotais, total, totalInteiro: Math.round(total) };
}

/** Linha da comparação com a versão anterior (T10). */
export interface ComparacaoDimensao {
  dimensao: string;
  grupo: GrupoIndicador | null;
  subtotalAnterior: number | null;
  subtotalAtual: number | null;
  /** atual − anterior; null quando uma das versões não avaliou a dimensão. */
  delta: number | null;
}

/**
 * Comparação por dimensão entre a versão anterior (subtotais congelados no
 * fechamento) e a atual. Lista as dimensões presentes em qualquer uma das
 * duas, na ordem canônica.
 */
export function compararSubtotais(
  anteriores: ReadonlyArray<SubtotalDimensao> | null,
  atuais: ReadonlyArray<SubtotalDimensao>,
): ComparacaoDimensao[] {
  const dimensoes = new Map<string, ComparacaoDimensao>();
  for (const subtotal of anteriores ?? []) {
    dimensoes.set(subtotal.dimensao, {
      dimensao: subtotal.dimensao,
      grupo: subtotal.grupo,
      subtotalAnterior: subtotal.subtotal,
      subtotalAtual: null,
      delta: null,
    });
  }
  for (const subtotal of atuais) {
    const linha = dimensoes.get(subtotal.dimensao);
    if (linha) {
      linha.subtotalAtual = subtotal.subtotal;
      linha.delta = subtotal.subtotal - (linha.subtotalAnterior ?? 0);
      if (linha.subtotalAnterior === null) {
        linha.delta = null;
      }
    } else {
      dimensoes.set(subtotal.dimensao, {
        dimensao: subtotal.dimensao,
        grupo: subtotal.grupo,
        subtotalAnterior: null,
        subtotalAtual: subtotal.subtotal,
        delta: null,
      });
    }
  }
  return [...dimensoes.values()].sort(
    (a, b) =>
      ordemCanonica(a.dimensao) - ordemCanonica(b.dimensao) ||
      a.dimensao.localeCompare(b.dimensao),
  );
}

/**
 * Reidrata os subtotais congelados no fechamento (coluna JSON de
 * avaliacoes_scout) com validação estrutural — linhas fora do formato são
 * descartadas em vez de quebrar a tela.
 */
export function subtotaisDoJson(json: unknown): SubtotalDimensao[] {
  if (!Array.isArray(json)) {
    return [];
  }
  const subtotais: SubtotalDimensao[] = [];
  for (const item of json) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const linha = item as Record<string, unknown>;
    if (
      typeof linha.dimensao === "string" &&
      typeof linha.quantidadeNotas === "number" &&
      typeof linha.media === "number" &&
      typeof linha.peso === "number" &&
      typeof linha.subtotal === "number"
    ) {
      subtotais.push({
        dimensao: linha.dimensao,
        grupo: grupoDaDimensao(linha.dimensao),
        quantidadeNotas: linha.quantidadeNotas,
        media: linha.media,
        peso: linha.peso,
        subtotal: linha.subtotal,
      });
    }
  }
  return subtotais;
}
