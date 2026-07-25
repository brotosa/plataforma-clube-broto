/**
 * Proteção do CPF em repouso (RN30 / prompt da Onda 5):
 *
 * - Identidade: HMAC-SHA-256 do CPF normalizado com chave própria
 *   (env CPF_HASH_KEY). Determinístico — é a chave de junção com a
 *   telemetria e o alvo do upsert idempotente. Girar a chave
 *   re-identifica a base: não trocar sem plano de recarga.
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

const FORMATO_CIFRA = "v1";

function valorDaEnv(nome: "CPF_HASH_KEY" | "APP_ENCRYPTION_KEY"): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `${nome} ausente no ambiente: a proteção de CPF exige a chave (ver .env.example).`,
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

/** HMAC-SHA-256 (hex) do CPF normalizado — identidade do assinante. */
export function hashCpf(cpfNormalizado: string): string {
  exigirCpfNormalizado(cpfNormalizado);
  return createHmac("sha256", valorDaEnv("CPF_HASH_KEY"))
    .update(cpfNormalizado)
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
