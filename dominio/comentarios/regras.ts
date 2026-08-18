/**
 * Regras do comentário da ficha do aliado (painel de atividades) como
 * serviços puros. Os casos de uso em infra/casos-de-uso/comentarios.ts
 * aplicam estas funções com RBAC, transação e auditoria.
 *
 * Um comentário é texto da equipe; pode ser marcado como **pendência**
 * (aberta/resolvida) e **mencionar** outros usuários. Apagar é sempre
 * soft-delete — a auditoria não se apaga (RN49).
 */

/** Teto de tamanho do texto — evita comentário-monólito e abuso de payload. */
export const TEXTO_COMENTARIO_MAX = 2000;

/** Texto válido = não vazio (após trim) e dentro do teto. */
export function validarTextoComentario(texto: string): string[] {
  const limpo = texto.trim();
  if (limpo.length === 0) {
    return ["O comentário não pode ficar vazio."];
  }
  if (limpo.length > TEXTO_COMENTARIO_MAX) {
    return [`O comentário excede o limite de ${TEXTO_COMENTARIO_MAX} caracteres.`];
  }
  return [];
}
