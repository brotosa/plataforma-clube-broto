import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifrarCpf, decifrarCpf, hashCpf } from "./protecao-cpf";

const CPF = "11144477735";
let ambienteOriginal: { hash?: string; cifra?: string };

beforeEach(() => {
  ambienteOriginal = {
    hash: process.env.CPF_HASH_KEY,
    cifra: process.env.APP_ENCRYPTION_KEY,
  };
  process.env.CPF_HASH_KEY = "chave-de-teste-hmac";
  process.env.APP_ENCRYPTION_KEY = "chave-de-teste-cifra";
});

afterEach(() => {
  process.env.CPF_HASH_KEY = ambienteOriginal.hash;
  process.env.APP_ENCRYPTION_KEY = ambienteOriginal.cifra;
  if (ambienteOriginal.hash === undefined) delete process.env.CPF_HASH_KEY;
  if (ambienteOriginal.cifra === undefined) delete process.env.APP_ENCRYPTION_KEY;
});

describe("hashCpf — identidade determinística (HMAC com chave própria)", () => {
  it("é determinístico para o mesmo CPF e a mesma chave", () => {
    expect(hashCpf(CPF)).toBe(hashCpf(CPF));
    expect(hashCpf(CPF)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("muda com a chave — a chave é parte da identidade", () => {
    const comChaveA = hashCpf(CPF);
    process.env.CPF_HASH_KEY = "outra-chave";
    expect(hashCpf(CPF)).not.toBe(comChaveA);
  });

  it("exige CPF normalizado e chave presente no ambiente", () => {
    expect(() => hashCpf("111.444.777-35")).toThrow("11 dígitos");
    delete process.env.CPF_HASH_KEY;
    expect(() => hashCpf(CPF)).toThrow("CPF_HASH_KEY ausente");
  });
});

describe("cifrarCpf/decifrarCpf — sigilo em repouso (AES-256-GCM)", () => {
  it("ida e volta preserva o CPF; cada cifragem tem IV próprio", () => {
    const primeira = cifrarCpf(CPF);
    const segunda = cifrarCpf(CPF);
    expect(primeira).not.toBe(segunda);
    expect(primeira.startsWith("v1:")).toBe(true);
    expect(decifrarCpf(primeira)).toBe(CPF);
    expect(decifrarCpf(segunda)).toBe(CPF);
  });

  it("detecta violação do conteúdo (tag GCM)", () => {
    const cifrado = cifrarCpf(CPF);
    const partes = cifrado.split(":");
    const dados = Buffer.from(partes[3], "base64");
    dados[0] = dados[0] ^ 0xff;
    partes[3] = dados.toString("base64");
    expect(() => decifrarCpf(partes.join(":"))).toThrow();
  });

  it("recusa formato desconhecido e exige a chave no ambiente", () => {
    expect(() => decifrarCpf("v9:a:b:c")).toThrow("Formato de CPF cifrado");
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => cifrarCpf(CPF)).toThrow("APP_ENCRYPTION_KEY ausente");
  });

  it("decifrar com chave errada falha em vez de devolver lixo", () => {
    const cifrado = cifrarCpf(CPF);
    process.env.APP_ENCRYPTION_KEY = "chave-errada";
    expect(() => decifrarCpf(cifrado)).toThrow();
  });
});
