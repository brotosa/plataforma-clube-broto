import type { EstagioEmpresa, StatusOferta } from "@prisma/client";

/**
 * Regras de Solução e cascatas (ficha §4).
 */

/** RN01 — soluções só podem ser criadas para empresas em Aliada ativa. */
export function podeCriarSolucao(estagioEmpresa: EstagioEmpresa): boolean {
  return estagioEmpresa === "ALIADA_ATIVA";
}

/**
 * Eventos que disparam a cascata da RN04: suspender/inativar aliado,
 * encerrar contrato ou inativar solução.
 */
export type EventoCascata =
  | "SUSPENSAO_ALIADO"
  | "ENCERRAMENTO_ALIADO"
  | "ENCERRAMENTO_CONTRATO"
  | "INATIVACAO_SOLUCAO";

export interface OfertaAfetavel {
  id: string;
  status: StatusOferta;
}

export interface AcaoCascata {
  ofertaId: string;
  novoStatus: Extract<StatusOferta, "PAUSADA">;
  /** RN04: marcada para despublicação no próximo export. */
  marcarParaDespublicacao: true;
}

/**
 * RN04 — a cascata pausa todas as ofertas PUBLICADAS afetadas e as marca
 * para despublicação no próximo export. Ofertas em outros status não são
 * tocadas (rascunhos seguem rascunhos; pausadas/encerradas/expiradas
 * ficam como estão).
 */
export function calcularCascata(
  ofertas: ReadonlyArray<OfertaAfetavel>,
): AcaoCascata[] {
  return ofertas
    .filter((oferta) => oferta.status === "PUBLICADA")
    .map((oferta) => ({
      ofertaId: oferta.id,
      novoStatus: "PAUSADA" as const,
      marcarParaDespublicacao: true as const,
    }));
}

/**
 * RN05 — nada é excluído fisicamente após a primeira publicação: apenas
 * inativado/encerrado, preservando a trilha de auditoria.
 */
export function podeExcluirFisicamente(jaFoiPublicada: boolean): boolean {
  return !jaFoiPublicada;
}
