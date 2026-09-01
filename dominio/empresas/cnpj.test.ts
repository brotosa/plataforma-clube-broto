import { describe, expect, it } from "vitest";
import { formatarCnpj, normalizarCnpj, validarCnpj } from "./cnpj";

/**
 * RN08 — CNPJ único e validado (a unicidade é da constraint do banco;
 * aqui, a validação de dígito). CNPJs válidos dos casos de teste são
 * estruturalmente corretos pelo algoritmo oficial, não empresas reais.
 *
 * **CNPJ alfanumérico (IN RFB nº 2.229/2024).** As 12 primeiras posições
 * aceitam letras A–Z e dígitos; os 2 verificadores continuam numéricos; o DV
 * usa o valor ASCII−48 de cada caractere. O numérico antigo é um caso
 * particular e segue válido — os dois formatos convivem.
 */
describe("RN08 — validação de dígito do CNPJ (numérico e alfanumérico)", () => {
  it("aceita CNPJ numérico válido sem máscara", () => {
    // 11.222.333/0001-81 é o exemplo clássico do algoritmo
    expect(validarCnpj("11222333000181")).toBe(true);
  });

  it("aceita CNPJ numérico válido com máscara", () => {
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("aceita CNPJ ALFANUMÉRICO válido (exemplo oficial da Receita)", () => {
    // 12.ABC.345/01DE-35 é o exemplo publicado do CNPJ alfanumérico.
    expect(validarCnpj("12ABC34501DE35")).toBe(true);
    expect(validarCnpj("12.ABC.345/01DE-35")).toBe(true);
    // Letras minúsculas na entrada são aceitas (normalizadas para maiúsculas).
    expect(validarCnpj("12.abc.345/01de-35")).toBe(true);
  });

  it("rejeita dígito verificador errado (numérico e alfanumérico)", () => {
    expect(validarCnpj("11222333000182")).toBe(false);
    expect(validarCnpj("11.222.333/0001-80")).toBe(false);
    expect(validarCnpj("12ABC34501DE34")).toBe(false);
  });

  it("exige que os DOIS últimos dígitos sejam numéricos", () => {
    // A raiz pode ter letras, mas o verificador não: 'DE' no fim é inválido.
    expect(validarCnpj("12ABC34501DEDE")).toBe(false);
    expect(validarCnpj("AAAAAAAAAAAAAA")).toBe(false);
  });

  it("rejeita comprimento diferente de 14 caracteres", () => {
    expect(validarCnpj("1122233300018")).toBe(false);
    expect(validarCnpj("112223330001811")).toBe(false);
    expect(validarCnpj("12ABC34501DE3")).toBe(false);
    expect(validarCnpj("")).toBe(false);
  });

  it("rejeita sequências de um único caractere repetido", () => {
    expect(validarCnpj("00000000000000")).toBe(false);
    expect(validarCnpj("11111111111111")).toBe(false);
  });

  it("rejeita caracteres fora de [0-9A-Z] na raiz", () => {
    // Máscara é removida; um caractere estranho (ex.: acento) não vira letra.
    expect(validarCnpj("12ÇBC34501DE35")).toBe(false);
  });
});

describe("normalização e formatação de CNPJ", () => {
  it("normaliza removendo máscara e mantém as letras em maiúsculas", () => {
    expect(normalizarCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizarCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });

  it("formata 14 caracteres com máscara (numérico e alfanumérico)", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
  });

  it("não formata entrada de tamanho errado (devolve como veio)", () => {
    expect(formatarCnpj("123")).toBe("123");
  });
});
