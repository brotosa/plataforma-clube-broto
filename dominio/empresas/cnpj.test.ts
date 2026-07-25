import { describe, expect, it } from "vitest";
import { formatarCnpj, normalizarCnpj, validarCnpj } from "./cnpj";

/**
 * RN08 — CNPJ único e validado (a unicidade é da constraint do banco;
 * aqui, a validação de dígito). CNPJs válidos dos casos de teste são
 * números estruturalmente corretos pelo algoritmo oficial, não empresas
 * reais.
 */
describe("RN08 — validação de dígito do CNPJ", () => {
  it("aceita CNPJ válido sem máscara", () => {
    // 11.222.333/0001-81 é o exemplo clássico do algoritmo
    expect(validarCnpj("11222333000181")).toBe(true);
  });

  it("aceita CNPJ válido com máscara", () => {
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(validarCnpj("11222333000182")).toBe(false);
    expect(validarCnpj("11.222.333/0001-80")).toBe(false);
  });

  it("rejeita comprimento diferente de 14 dígitos", () => {
    expect(validarCnpj("1122233300018")).toBe(false);
    expect(validarCnpj("112223330001811")).toBe(false);
    expect(validarCnpj("")).toBe(false);
  });

  it("rejeita sequências de um único dígito repetido", () => {
    expect(validarCnpj("00000000000000")).toBe(false);
    expect(validarCnpj("11111111111111")).toBe(false);
  });

  it("rejeita entrada não numérica disfarçada", () => {
    expect(validarCnpj("aa.bbb.ccc/dddd-ee")).toBe(false);
  });
});

describe("normalização e formatação de CNPJ", () => {
  it("normaliza removendo máscara", () => {
    expect(normalizarCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("formata 14 dígitos com máscara", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("não formata entrada de tamanho errado (devolve como veio)", () => {
    expect(formatarCnpj("123")).toBe("123");
  });
});
