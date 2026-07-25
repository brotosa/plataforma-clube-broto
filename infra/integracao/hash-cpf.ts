import { hashCpfBruto } from "@/infra/assinantes/protecao-cpf";

/**
 * Hash do CPF para a telemetria (LGPD, Onda 1): o CPF cru NUNCA é
 * persistido (o modelo TelemetriaEvento nem tem coluna para ele) — só
 * entra para virar este hash.
 *
 * DELEGA ao serviço canônico de proteção de CPF
 * (infra/assinantes/protecao-cpf.ts): chave única CPF_HASH_KEY, sem
 * fallback embutido — ambiente sem a chave falha alto com mensagem
 * clara. Chave e pipeline únicos garantem a junção telemetria ↔
 * assinante da RN36 (Onda 5); o antigo TELEMETRIA_PEPPER com valor
 * padrão foi aposentado por decisão registrada no PR da F11.
 */
export function hashCpf(cpf: string): string {
  return hashCpfBruto(cpf);
}
