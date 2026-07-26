import type { EstagioEmpresa, OrigemEmpresa, Papel } from "@prisma/client";
import { transicoesValidasDe } from "../empresas/estagio";
import { type Acao, podeExecutar } from "../autorizacao/permissoes";

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
 * Régua de envelhecimento por estágio (T8). Desde a F10 os valores vêm do
 * Serviço de Configuração (chaves FUNIL_ENVELHECIMENTO_LEVE_DIAS e
 * FUNIL_ENVELHECIMENTO_FORTE_DIAS): a régua é dado, não constante, e quem
 * decide o nível recebe os dias vigentes em vez de consultá-los aqui.
 */
export interface ReguaEnvelhecimento {
  leveDias: number;
  forteDias: number;
}

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

// ---------------------------------------------------------------------
// RN57 — quem pode mover o quê, para onde
// ---------------------------------------------------------------------

/**
 * Ação de permissão exigida para mover um card ao destino (ficha §2).
 *
 * Existe para que a decisão more em UM lugar. O caso de uso a consulta
 * antes de escrever; a T8 a consulta para saber o que é arrastável e qual
 * coluna aceita o card durante o gesto. Sem isto, a regra do arrasto seria
 * uma cópia da regra do menu — e cópia é o que a RN57 proíbe.
 */
export function acaoParaMoverNoFunil(destino: EstagioEmpresa): Acao {
  if (destino === "PRIORIZADA") return "PRIORIZAR";
  if (destino === "EM_NEGOCIACAO") return "ASSUMIR_NEGOCIACAO";
  return "ASSUMIR_E_AVALIAR";
}

/**
 * O papel pode levar um card de `de` para `para`? Combina as duas metades:
 * o pipeline permite a transição E o papel tem a ação.
 *
 * O handoff para Em negociação aceita as duas permissões porque o ato tem
 * duas formas (assumir para si ou designar outro comercial, RN16); qual
 * delas vale é decidido no servidor, com o responsável já escolhido.
 */
export function podeMoverNoFunil(papel: Papel, de: EstagioEmpresa, para: EstagioEmpresa): boolean {
  if (!destinosDeMovimentoManual(de).includes(para)) {
    return false;
  }
  if (para === "EM_NEGOCIACAO") {
    return podeExecutar(papel, "ASSUMIR_NEGOCIACAO") || podeExecutar(papel, "DESIGNAR_RESPONSAVEIS");
  }
  return podeExecutar(papel, acaoParaMoverNoFunil(para));
}

/**
 * RN17 — quem pode descartar a partir deste estágio. O Comercial descarta
 * apenas o que está em negociação com ele; o time de scout descarta em
 * qualquer ponto do funil que ele governa.
 */
export function podeDescartarNoFunil(papel: Papel, de: EstagioEmpresa): boolean {
  if (de === "EM_APROVACAO" || de === "DESCARTADA") {
    return false;
  }
  return (
    podeExecutar(papel, "ASSUMIR_E_AVALIAR") ||
    (podeExecutar(papel, "ASSUMIR_NEGOCIACAO") && de === "EM_NEGOCIACAO")
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

/**
 * Nível de alerta da régua vigente: FORTE, LEVE ou nenhum. A régua entra
 * por parâmetro para que uma alteração na T17 valha na próxima leitura da
 * T8 — e para que nada aqui possa usar um número velho por engano.
 */
export function nivelEnvelhecimento(
  dias: number | null,
  regua: ReguaEnvelhecimento,
): "LEVE" | "FORTE" | null {
  if (dias === null) {
    return null;
  }
  if (dias >= regua.forteDias) {
    return "FORTE";
  }
  if (dias >= regua.leveDias) {
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
