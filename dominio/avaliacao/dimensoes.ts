import type { GrupoIndicador } from "@prisma/client";

/**
 * As 14 dimensões de medição do ScoutCB (ficha da Onda 2 §3.3) com o grupo
 * a que pertencem — 9 de Empresa e 5 de Produto, conforme a nota de
 * consistência de docs/especificacao/indicadores-scoutcb-seed.md. A ordem
 * é a das tabelas do ScoutCB: o formulário T10 agrupa nesta sequência.
 * A lista vira editável no Parametrizador (Onda 3, T16).
 */
export const DIMENSOES_MEDICAO: ReadonlyArray<{
  nome: string;
  grupo: GrupoIndicador;
}> = [
  { nome: "Capilaridade", grupo: "EMPRESA" },
  { nome: "Fit de Negócio", grupo: "EMPRESA" },
  { nome: "Dimensão e Maturidade", grupo: "EMPRESA" },
  { nome: "Senioridade e Compliance", grupo: "EMPRESA" },
  { nome: "Escala da operação", grupo: "EMPRESA" },
  { nome: "Sucesso da operação", grupo: "EMPRESA" },
  { nome: "GAP de Portfólio", grupo: "EMPRESA" },
  { nome: "Saúde do caixa", grupo: "EMPRESA" },
  { nome: "Tração", grupo: "EMPRESA" },
  { nome: "Relevância de Mercado", grupo: "PRODUTO" },
  { nome: "Inovação", grupo: "PRODUTO" },
  { nome: "Proposta de Valor e Eficácia", grupo: "PRODUTO" },
  { nome: "Público-alvo", grupo: "PRODUTO" },
  { nome: "Concorrência", grupo: "PRODUTO" },
];

/** Rótulos institucionais das duas tabelas do ScoutCB. */
export const ROTULOS_GRUPO_INDICADOR: Readonly<Record<GrupoIndicador, string>> = {
  EMPRESA: "Empresa",
  PRODUTO: "Produto",
};

/** Grupo da dimensão, ou null quando o nome não é uma das 14 dimensões. */
export function grupoDaDimensao(nome: string): GrupoIndicador | null {
  return DIMENSOES_MEDICAO.find((dimensao) => dimensao.nome === nome)?.grupo ?? null;
}
