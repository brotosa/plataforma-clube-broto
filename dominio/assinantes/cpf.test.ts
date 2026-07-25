import { describe, expect, it } from "vitest";
import {
  completarDigitosCpf,
  formatarCpf,
  normalizarCpf,
  validarCpf,
} from "./cpf";

describe("RN30 — validação estrutural do CPF", () => {
  it("aceita CPF com dígitos verificadores corretos, com e sem máscara", () => {
    // Dígitos conferidos manualmente pelo módulo 11 sobre a base 111.444.777.
    expect(validarCpf("111.444.777-35")).toBe(true);
    expect(validarCpf("11144477735")).toBe(true);
  });

  it("rejeita CPF com dígito verificador errado", () => {
    expect(validarCpf("111.444.777-34")).toBe(false);
    expect(validarCpf("11144477736")).toBe(false);
  });

  it("rejeita sequências de um único dígito repetido", () => {
    expect(validarCpf("000.000.000-00")).toBe(false);
    expect(validarCpf("11111111111")).toBe(false);
  });

  it("rejeita tamanhos diferentes de 11 dígitos", () => {
    expect(validarCpf("1114447773")).toBe(false);
    expect(validarCpf("111444777350")).toBe(false);
    expect(validarCpf("")).toBe(false);
  });

  it("normaliza removendo tudo que não é dígito", () => {
    expect(normalizarCpf(" 111.444.777-35 ")).toBe("11144477735");
  });

  it("formata 11 dígitos para exibição plena", () => {
    expect(formatarCpf("11144477735")).toBe("111.444.777-35");
  });

  it("devolve a entrada intacta quando não há 11 dígitos para formatar", () => {
    expect(formatarCpf("123")).toBe("123");
  });
});

describe("completarDigitosCpf (uso exclusivo de fixtures sintéticas)", () => {
  it("gera dígitos verificadores que passam na própria validação", () => {
    expect(validarCpf(completarDigitosCpf("111444777"))).toBe(true);
    expect(completarDigitosCpf("111444777")).toBe("11144477735");
  });

  it("rejeita base que não tenha exatamente 9 dígitos", () => {
    expect(() => completarDigitosCpf("12345678")).toThrow(
      "exatamente 9 dígitos",
    );
    expect(() => completarDigitosCpf("12345678a")).toThrow(
      "exatamente 9 dígitos",
    );
  });
});
