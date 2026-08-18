import type { EstagioEmpresa, RecomendacaoAvaliacao, StatusAvaliacao } from "@prisma/client";

/**
 * Regras da avaliação de scout (Onda 2, ficha §4) como serviços puros:
 * escala de nota, fechamento, imutabilidade (RN18), pré-condição de
 * priorização (RN15) e reavaliação anual (RN21). Os casos de uso em
 * infra/casos-de-uso/avaliacoes.ts aplicam estas funções com RBAC,
 * transação e auditoria.
 */

/** Escala universal v1 da ficha §3.3: nota inteira de 1 a 5. */
export const ESCALA_NOTA = { minima: 1, maxima: 5 } as const;

/**
 * "Não se aplica" (acréscimo pós-homologação): resposta para o indicador
 * que não faz sentido para o aliado. Conta como respondido, mas fica fora
 * da média do score — nunca vira 0 nem 5. Rótulo e sigla ficam aqui como
 * fonte única para o formulário e a leitura.
 */
export const ROTULO_NAO_SE_APLICA = "Não se aplica";
export const SIGLA_NAO_SE_APLICA = "N/A";

/**
 * Régua da reavaliação (RN21): aliada ativa completa o ciclo ao fim de N
 * meses desde a última avaliação fechada. Desde a F10 o N vem do Serviço
 * de Configuração (chave REAVALIACAO_MESES) e entra por parâmetro.
 */

/** Rótulos institucionais das três recomendações (ficha §3.2). */
export const ROTULOS_RECOMENDACAO: Readonly<Record<RecomendacaoAvaliacao, string>> = {
  AVANCAR: "Avançar",
  MONITORAR: "Monitorar",
  DESCARTAR: "Descartar",
};

/** Nota válida = inteiro dentro da escala 1–5. */
export function validarNota(nota: number): string[] {
  if (
    !Number.isInteger(nota) ||
    nota < ESCALA_NOTA.minima ||
    nota > ESCALA_NOTA.maxima
  ) {
    return [
      `Nota deve ser um inteiro entre ${ESCALA_NOTA.minima} e ${ESCALA_NOTA.maxima} (escala do ScoutCB).`,
    ];
  }
  return [];
}

/** Dados mínimos avaliados no fechamento de uma versão. */
export interface DadosFechamento {
  /** Quantidade de notas **reais** 1–5 (as N/A não contam — não geram score). */
  quantidadeNotas: number;
  recomendacao: RecomendacaoAvaliacao | null;
}

/**
 * Fechar uma avaliação exige ao menos uma nota real 1–5 (sem nota não há
 * score calculado — RN15 depende dele; "não se aplica" não pontua) e a
 * recomendação explícita do avaliador. Retorna a lista de erros — vazia
 * quando o fechamento é válido.
 */
export function validarFechamento(dados: DadosFechamento): string[] {
  const erros: string[] = [];
  if (dados.quantidadeNotas < 1) {
    erros.push("Fechar a avaliação exige ao menos uma nota registrada.");
  }
  if (!dados.recomendacao) {
    erros.push("Fechar a avaliação exige uma recomendação (avançar · monitorar · descartar).");
  }
  return erros;
}

/** RN18 — somente rascunho é editável; fechada é imutável. */
export function podeEditarAvaliacao(status: StatusAvaliacao): boolean {
  return status === "RASCUNHO";
}

export const MENSAGEM_RN18 =
  "Avaliação fechada é imutável (RN18) — para corrigir, abra uma nova versão.";

/**
 * RN15 — Priorizada exige avaliação com score calculado (fechada) além da
 * decisão humana explícita. O score recomenda; nunca promove sozinho —
 * nenhum caminho de código chama a priorização automaticamente.
 * Retorna a lista de erros — vazia quando a priorização é possível.
 */
export function validarPriorizacao(temAvaliacaoFechada: boolean): string[] {
  if (!temAvaliacaoFechada) {
    return [
      "Priorizada exige avaliação fechada com score calculado (RN15) — conclua a avaliação na T10 antes de priorizar.",
    ];
  }
  return [];
}

/**
 * Estágios em que se abre/edita avaliação: o funil a partir de Em avaliação
 * (RN14 — em Mapeada é preciso primeiro assumir, o que move a empresa) e
 * Aliada ativa (reavaliação anual, RN21). Em aprovação fica fora: o caso
 * parado no motor não muda embaixo do aprovador (coerência com RN06/RN20);
 * devolvido, volta a Em negociação e pode ser corrigido.
 */
export const ESTAGIOS_AVALIAVEIS: ReadonlyArray<EstagioEmpresa> = [
  "EM_AVALIACAO",
  "PRIORIZADA",
  "EM_NEGOCIACAO",
  "ALIADA_ATIVA",
];

export function podeAvaliarNoEstagio(estagio: EstagioEmpresa): boolean {
  return ESTAGIOS_AVALIAVEIS.includes(estagio);
}

/**
 * RN21 — precisa de reavaliação quando a última avaliação fechada completa
 * a régua em meses. Sem avaliação fechada não há aniversário: retorna
 * false (a régua conta a partir da última avaliação, nunca de data
 * estimada).
 */
export function precisaReavaliacao(
  ultimaFechadaEm: Date | null,
  referencia: Date,
  meses: number,
): boolean {
  if (!ultimaFechadaEm) {
    return false;
  }
  const marco = new Date(ultimaFechadaEm);
  marco.setMonth(marco.getMonth() + meses);
  return referencia.getTime() >= marco.getTime();
}
