/**
 * RN25 (efeito prospectivo e versão de configuração) e RN27 (família
 * sensível no motor de aprovação) como serviços puros. Os casos de uso em
 * infra/casos-de-uso/parametrizador.ts aplicam estas funções com RBAC,
 * transação e auditoria.
 */

/** Item do snapshot congelado em ConfiguracaoVersao. */
export interface IndicadorVersionado {
  indicadorId: string;
  slug: string;
  nome: string;
  grupo: string;
  dimensao: string;
  peso: number;
  ativo: boolean;
}

/** Campos de indicador que entram no cálculo do score (ficha §3.2). */
export interface CamposDeIndicador {
  nome: string;
  grupo: string;
  dimensao: string;
  peso: number;
  ativo: boolean;
}

/**
 * RN25 — Uma nova versão de configuração nasce quando a escrita muda algo
 * que o score usa: peso, grupo, dimensão ou a presença do indicador na
 * conta (ativo). Renomear NÃO gera versão: o nome é rótulo, o score
 * referencia o indicador por id, e versionar cada correção de digitação
 * encheria o histórico de ruído sem proteger nada.
 */
export function exigeNovaVersaoDeConfiguracao(
  antes: CamposDeIndicador,
  depois: CamposDeIndicador,
): boolean {
  return (
    antes.peso !== depois.peso ||
    antes.grupo !== depois.grupo ||
    antes.dimensao !== depois.dimensao ||
    antes.ativo !== depois.ativo
  );
}

/** Peso de indicador: positivo e com no máximo duas casas (Decimal(5,2)). */
export function validarPeso(peso: number): string[] {
  if (!Number.isFinite(peso) || peso <= 0) {
    return ["O peso do indicador é um número maior que zero."];
  }
  if (peso > 999.99) {
    return ["O peso do indicador vai até 999,99."];
  }
  if (Math.round(peso * 100) !== peso * 100) {
    return ["O peso do indicador aceita no máximo duas casas decimais."];
  }
  return [];
}

export const MENSAGEM_RN25 =
  "Alterações têm efeito prospectivo — avaliações e registros fechados não são recalculados; cada avaliação guarda a versão de configuração usada (RN25).";

/**
 * RN25 — O efeito prospectivo em uma linha: uma avaliação fechada nunca é
 * repontuada. A função existe para que a regra seja testável e para que
 * nenhum caso de uso precise repetir a condição na mão.
 */
export function podeRepontuar(statusDaAvaliacao: "RASCUNHO" | "FECHADA"): boolean {
  return statusDaAvaliacao === "RASCUNHO";
}

/**
 * Famílias sensíveis da RN27 (ficha §4): comissão-padrão, pesos de
 * indicadores, tetos do dossiê e metas. É a lista que o motor de aprovação
 * passa a exigir quando o tipo PARAMETRO_SENSIVEL é ligado na T7.
 */
export type FamiliaSensivel =
  | "COMISSAO_PADRAO"
  | "PESO_DE_INDICADOR"
  | "TETO_DO_DOSSIE"
  | "META";

export const ROTULOS_FAMILIA_SENSIVEL: Readonly<Record<FamiliaSensivel, string>> = {
  COMISSAO_PADRAO: "comissão-padrão",
  PESO_DE_INDICADOR: "peso de indicador",
  TETO_DO_DOSSIE: "teto do dossiê",
  META: "meta de novos aliados",
};

/**
 * RN27 — A exigência de aprovação é dado, não código: quando a regra
 * PARAMETRO_SENSIVEL está ligada na T7, escritas na família sensível
 * passam a abrir solicitação em vez de valer na hora. Nasce desligada, e
 * ligá-la não exige deploy — este é o único ponto de decisão.
 */
export function exigeAprovacao(
  regraLigada: boolean,
  familia: FamiliaSensivel | null,
): boolean {
  return regraLigada && familia !== null;
}

export function mensagemDeAprovacaoPendente(familia: FamiliaSensivel): string {
  return `Alteração de ${ROTULOS_FAMILIA_SENSIVEL[familia]} enviada para aprovação (RN27) — o valor vigente segue valendo até a decisão.`;
}
