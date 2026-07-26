/**
 * Serviço CANÔNICO de proteção do CPF (RN30 / prompt da Onda 5) — único
 * ponto de hash de CPF da plataforma; a telemetria (Onda 1/F4) delega
 * para cá via infra/integracao/hash-cpf.ts.
 *
 * - Identidade: HMAC-SHA-256 com chave única (env CPF_HASH_KEY, SEM
 *   fallback — ausência falha alto). Determinístico — alvo do upsert
 *   idempotente do cadastro E do cpf_hash da telemetria: mesma chave e
 *   mesmo pipeline garantem a junção da RN36 (um CPF válido produz o
 *   MESMO hash nos dois lados). Girar a chave re-identifica a base
 *   inteira e desliga a junção: não trocar sem plano de recarga.
 * - Sigilo: AES-256-GCM (env APP_ENCRYPTION_KEY; a chave de 32 bytes é
 *   derivada por SHA-256 do valor da env, aceitando qualquer formato).
 *   Formato armazenado: "v1:<iv>:<tag>:<dados>" em base64 — o prefixo
 *   permite rotação de esquema no futuro.
 *
 * As chaves NUNCA entram no repositório; leitura é preguiçosa para o
 * build tolerar ambiente sem elas (falha clara só quando usadas).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

import { ErroDeConfiguracao } from "@/dominio/erros/falhas";

const FORMATO_CIFRA = "v1";

function valorDaEnv(nome: "CPF_HASH_KEY" | "APP_ENCRYPTION_KEY"): string {
  const valor = process.env[nome];
  if (!valor) {
    // F15 (RN55): o texto sempre esteve certo; o que faltava era a CLASSE
    // para ele atravessar até a tela em vez de virar "Tente novamente".
    // `ErroDeConfiguracao` recebe o NOME da variável — nunca o valor.
    throw new ErroDeConfiguracao(
      nome,
      "a proteção de CPF exige a chave. Configure-a no ambiente (ver .env.example) e repita a operação.",
    );
  }
  return valor;
}

function exigirCpfNormalizado(cpf: string): void {
  if (!/^\d{11}$/.test(cpf)) {
    throw new Error(
      "Proteção de CPF espera o valor normalizado (exatamente 11 dígitos).",
    );
  }
}

/**
 * HMAC-SHA-256 (hex) do CPF normalizado — caminho do CADASTRO (RN30):
 * exige exatamente 11 dígitos; a validação de dígito verificador
 * acontece antes, na importação.
 */
export function hashCpf(cpfNormalizado: string): string {
  exigirCpfNormalizado(cpfNormalizado);
  return createHmac("sha256", valorDaEnv("CPF_HASH_KEY"))
    .update(cpfNormalizado)
    .digest("hex");
}

/**
 * HMAC-SHA-256 (hex) de um CPF BRUTO — caminho dos FATOS DE TELEMETRIA
 * (RN07/RN36): normaliza para dígitos e hasheia o que veio no arquivo,
 * sem validar comprimento nem dígito verificador — o fato é imutável e
 * entra como recebido; a validação de CPF pertence ao cadastro. Mesma
 * chave e mesmo pipeline do caminho estrito: para um CPF válido, os dois
 * caminhos produzem o MESMO hash — é isso que sustenta a junção
 * telemetria ↔ assinante da RN36.
 */
export function hashCpfBruto(entrada: string): string {
  const digitos = entrada.replace(/\D/g, "");
  return createHmac("sha256", valorDaEnv("CPF_HASH_KEY"))
    .update(digitos)
    .digest("hex");
}

function chaveDeCifra(): Buffer {
  return createHash("sha256").update(valorDaEnv("APP_ENCRYPTION_KEY")).digest();
}

/** Cifra o CPF normalizado para repouso (IV aleatório por registro). */
export function cifrarCpf(cpfNormalizado: string): string {
  exigirCpfNormalizado(cpfNormalizado);
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", chaveDeCifra(), iv);
  const dados = Buffer.concat([
    cifrador.update(cpfNormalizado, "utf8"),
    cifrador.final(),
  ]);
  const tag = cifrador.getAuthTag();
  return [
    FORMATO_CIFRA,
    iv.toString("base64"),
    tag.toString("base64"),
    dados.toString("base64"),
  ].join(":");
}

/** Decifra o CPF armazenado; lança em formato desconhecido ou violação. */
export function decifrarCpf(cpfCifrado: string): string {
  const partes = cpfCifrado.split(":");
  if (partes.length !== 4 || partes[0] !== FORMATO_CIFRA) {
    throw new Error("Formato de CPF cifrado desconhecido.");
  }
  const [, ivBase64, tagBase64, dadosBase64] = partes;
  if (!ivBase64 || !tagBase64 || !dadosBase64) {
    throw new Error("Formato de CPF cifrado desconhecido.");
  }
  const decifrador = createDecipheriv(
    "aes-256-gcm",
    chaveDeCifra(),
    Buffer.from(ivBase64, "base64"),
  );
  decifrador.setAuthTag(Buffer.from(tagBase64, "base64"));
  return Buffer.concat([
    decifrador.update(Buffer.from(dadosBase64, "base64")),
    decifrador.final(),
  ]).toString("utf8");
}
