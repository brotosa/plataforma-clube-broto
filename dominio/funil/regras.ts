import type { EstagioEmpresa, OrigemEmpresa } from "@prisma/client";
import { transicoesValidasDe } from "../empresas/estagio";

/**
 * Regras do funil de mercado (Onda 2, ficha §4) como serviços puros:
 * RN13 (entrada no radar), RN17 (descarte e reativação) e a régua de
 * envelhecimento da T8. RN14 (assumir = virar responsável de scout) e
 * RN16 (handoff exige comercial designado) dependem do ator e são
 * garantidas nos casos de uso de movimentação, apoiadas nas funções daqui.
 */

/** Lanes do kanban T8, na ordem do pipeline (protótipo v6.1). */
export const ESTAGIOS_FUNIL: ReadonlyArray<EstagioEmpresa> = [
  "MAPEADA",
  "EM_AVALIACAO",
  "PRIORIZADA",
  "EM_NEGOCIACAO",
  "EM_APROVACAO",
];

/** Rótulos institucionais dos estágios no vocabulário do funil (v6.1). */
export const ROTULOS_ESTAGIO_FUNIL: Readonly<Record<EstagioEmpresa, string>> = {
  MAPEADA: "Mapeada",
  EM_AVALIACAO: "Em avaliação",
  PRIORIZADA: "Priorizada",
  EM_NEGOCIACAO: "Em negociação",
  EM_APROVACAO: "Em aprovação",
  ALIADA_ATIVA: "Aliada ativa",
  SUSPENSA: "Suspensa",
  ENCERRADA: "Encerrada",
  DESCARTADA: "Descartada",
};

/** Rótulos institucionais das origens (RN13, ficha §3.1 — a ficha vence
 *  os exemplos ilustrativos do protótipo). */
export const ROTULOS_ORIGEM: Readonly<Record<OrigemEmpresa, string>> = {
  SCOUTING_ATIVO: "Scouting ativo",
  INDICACAO: "Indicação",
  PROCURA_ESPONTANEA: "Procura espontânea",
  LISTA_IMPORTADA: "Lista importada",
};

/**
 * Régua de envelhecimento por estágio (T8): alerta leve a partir de 14
 * dias e forte a partir de 30 — "régua 14/30 parametrizada em constante
 * nomeada" (prompt F6); a edição sem código chega com o Parametrizador
 * (Onda 3).
 */
export const REGUA_ENVELHECIMENTO = {
  leveDias: 14,
  forteDias: 30,
} as const;

/** Dados mínimos avaliados na entrada no radar (RN13 + T9). */
export interface DadosEntradaRadar {
  nomeFantasia: string | null;
  origem: OrigemEmpresa | null;
  quantidadeCategoriasAlvo: number;
}

/**
 * RN13 — Entrada no radar exige origem e ao menos uma categoria-alvo
 * (além do nome, sem o qual a empresa não é identificável).
 * Retorna a lista de erros — vazia quando a entrada é válida.
 */
export function validarEntradaNoRadar(dados: DadosEntradaRadar): string[] {
  const erros: string[] = [];
  if (!dados.nomeFantasia?.trim()) {
    erros.push("Nome da empresa é obrigatório.");
  }
  if (!dados.origem) {
    erros.push("Entrada no radar exige origem (RN13).");
  }
  if (dados.quantidadeCategoriasAlvo < 1) {
    erros.push("Entrada no radar exige ao menos uma categoria-alvo (RN13).");
  }
  return erros;
}

/**
 * RN17 — Descarte exige motivo tipificado; o motivo "OUTRO" exige
 * descrição. Retorna a lista de erros — vazia quando o descarte é válido.
 */
export function validarDescarte(parametros: {
  motivoSlug: string | null;
  descricao: string | null;
}): string[] {
  const erros: string[] = [];
  if (!parametros.motivoSlug) {
    erros.push("Descarte exige motivo tipificado (RN17).");
    return erros;
  }
  if (parametros.motivoSlug === "OUTRO" && !parametros.descricao?.trim()) {
    erros.push('O motivo "Outro" exige descrição (RN17).');
  }
  return erros;
}

/**
 * Destinos oferecidos no menu "Mover para {estágio}" do card (T8):
 * transições válidas do grafo restritas às lanes do funil. EM_APROVACAO
 * fica fora nas duas pontas — entra-se nela só pelo pedido de promoção ao
 * motor e sai-se dela só pela decisão do aprovador (RN06/RN20) — e
 * DESCARTADA tem ação própria com motivo tipificado (RN17).
 */
export function destinosDeMovimentoManual(de: EstagioEmpresa): EstagioEmpresa[] {
  if (de === "EM_APROVACAO") {
    return [];
  }
  const lanes = new Set<EstagioEmpresa>(ESTAGIOS_FUNIL);
  return transicoesValidasDe(de).filter(
    (para) => lanes.has(para) && para !== "EM_APROVACAO",
  );
}

/**
 * Dias completos no estágio atual. Empresas anteriores ao rastreamento da
 * F6 não têm data de início de estágio: retorna null (exibido como "—",
 * nunca estimado).
 */
export function diasNoEstagio(estagioDesde: Date | null, referencia: Date): number | null {
  if (!estagioDesde) {
    return null;
  }
  const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
  const decorrido = referencia.getTime() - estagioDesde.getTime();
  return Math.max(0, Math.floor(decorrido / MILISSEGUNDOS_POR_DIA));
}

/** Nível de alerta da régua: FORTE (≥30), LEVE (≥14) ou nenhum. */
export function nivelEnvelhecimento(dias: number | null): "LEVE" | "FORTE" | null {
  if (dias === null) {
    return null;
  }
  if (dias >= REGUA_ENVELHECIMENTO.forteDias) {
    return "FORTE";
  }
  if (dias >= REGUA_ENVELHECIMENTO.leveDias) {
    return "LEVE";
  }
  return null;
}

/** "há N dias" como texto (T8): "hoje", "há 1 dia", "há N dias" ou "—". */
export function rotuloTempoNoEstagio(dias: number | null): string {
  if (dias === null) {
    return "—";
  }
  if (dias === 0) {
    return "hoje";
  }
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}
