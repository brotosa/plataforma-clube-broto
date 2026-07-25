import { createHmac } from "node:crypto";

/**
 * Hash do CPF para a telemetria (LGPD, Onda 1): o CPF cru NUNCA é persistido
 * (o modelo TelemetriaEvento nem tem coluna para ele) — só entra para virar
 * este hash. O dado pessoal pleno só chega na Onda 5, com RBAC de PF.
 *
 * Usa HMAC-SHA256 com um "pepper" de ambiente para evitar reversão trivial
 * (o espaço de CPFs é pequeno). O tratamento LGPD definitivo está sendo
 * definido em paralelo (ficha §6); o pepper é configurável por deploy.
 */
const PEPPER = process.env.TELEMETRIA_PEPPER ?? "broto-onda1-telemetria";

export function hashCpf(cpf: string): string {
  const digitos = cpf.replace(/\D/g, "");
  return createHmac("sha256", PEPPER).update(digitos).digest("hex");
}
