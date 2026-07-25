import type { EstadoSolicitacao } from "@prisma/client";

/**
 * RN06 — Motor genérico de aprovação (Onda 1).
 * Regra por tipo de entidade, ligável/desligável sem código (T7), com
 * designação de aprovadores. Fluxo: Solicitada → Aprovada | Devolvida
 * (comentário obrigatório na devolução). Solicitante ≠ aprovador.
 */

export interface RegraAprovacao {
  exigida: boolean;
  /** Ids dos aprovadores designados; vazio = qualquer papel com permissão. */
  aprovadoresDesignados: ReadonlyArray<string>;
}

/**
 * Porta de aprovação: com a regra desligada o efeito é direto (sem fila);
 * ligada, cria-se uma solicitação pendente.
 */
export function exigeAprovacao(regra: RegraAprovacao): boolean {
  return regra.exigida;
}

export interface SolicitacaoPendente {
  estado: EstadoSolicitacao;
  solicitanteId: string;
}

export type Decisao = "APROVADA" | "DEVOLVIDA";

/**
 * Valida uma decisão sobre a solicitação. Retorna lista de erros — vazia
 * quando a decisão pode ser aplicada. O RBAC (papel com permissão
 * APROVAR_DEVOLVER) é verificado pela camada de serviço; aqui valem as
 * invariantes do motor.
 */
export function validarDecisao(parametros: {
  solicitacao: SolicitacaoPendente;
  regra: RegraAprovacao;
  decisorId: string;
  decisao: Decisao;
  comentario: string | null;
}): string[] {
  const { solicitacao, regra, decisorId, decisao, comentario } = parametros;
  const erros: string[] = [];

  if (solicitacao.estado !== "SOLICITADA") {
    erros.push("Somente solicitações pendentes (Solicitada) podem ser decididas.");
  }
  if (solicitacao.solicitanteId === decisorId) {
    erros.push("Quem solicita não aprova o próprio item (RN06 — segregação de funções).");
  }
  if (
    regra.aprovadoresDesignados.length > 0 &&
    !regra.aprovadoresDesignados.includes(decisorId)
  ) {
    erros.push("Decisor não está entre os aprovadores designados para esta regra.");
  }
  if (decisao === "DEVOLVIDA" && !comentario?.trim()) {
    erros.push("Devolução exige comentário (RN06).");
  }
  return erros;
}
