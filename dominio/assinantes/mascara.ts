/**
 * RN30 — máscara por padrão. O SERVIDOR responde mascarado; a exibição
 * plena é decidida na API conforme a permissão "visualizar dados pessoais
 * plenos" e gera evento de auditoria — nunca é decisão só do front.
 * Formatos conforme o protótipo v6.1 (T18/T19).
 */

import { normalizarCpf } from "./cpf";

/** CPF mascarado: mantém apenas os 2 últimos dígitos (***.___.***-NN). */
export function mascararCpf(cpf: string): string {
  const digitos = normalizarCpf(cpf);
  if (digitos.length !== 11) {
    return "***.___.***-**";
  }
  return `***.___.***-${digitos.slice(-2)}`;
}

/** Telefone mascarado: mantém DDD e os 2 últimos dígitos ((DD) ****-**NN). */
export function mascararTelefone(telefone: string | null): string | null {
  if (!telefone) {
    return telefone;
  }
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 8) {
    return "****";
  }
  return `(${digitos.slice(0, 2)}) ****-**${digitos.slice(-2)}`;
}

/** E-mail mascarado: primeira letra + domínio (a****@dominio). */
export function mascararEmail(email: string | null): string | null {
  if (!email) {
    return email;
  }
  const posicaoArroba = email.indexOf("@");
  if (posicaoArroba <= 0) {
    return "****";
  }
  return `${email.charAt(0)}****@${email.slice(posicaoArroba + 1)}`;
}
