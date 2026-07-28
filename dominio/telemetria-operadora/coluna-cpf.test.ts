import { describe, expect, it } from "vitest";

import { validarCpf } from "@/dominio/assinantes/cpf";
import { detectarColunaCpf, normalizarValorDeCpf } from "./coluna-cpf";

/**
 * A coluna de chave da RN69 — detectada pelo cabeçalho, aceita com ou sem
 * máscara, com dígito verificador conferido antes de qualquer uso.
 *
 * O prompt §6 manda aceitar `CPF`, `CPF do Cliente` e `CPF Titular` e
 * registrar no PR qual foi encontrada. Como não há arquivo nominal real
 * no repositório (ficha §7), os casos abaixo são as grafias prováveis —
 * e a resposta de verdade vem da primeira importação real.
 */

describe("detecção da coluna de CPF pelo cabeçalho", () => {
  it("acha as três grafias que o prompt nomeia", () => {
    expect(detectarColunaCpf(["Nome", "CPF", "E-mail"])).toBe("CPF");
    expect(detectarColunaCpf(["Nome", "CPF do Cliente"])).toBe("CPF do Cliente");
    expect(detectarColunaCpf(["Nome", "CPF Titular"])).toBe("CPF Titular");
  });

  it("devolve o nome ORIGINAL da coluna, que é por onde se lê a linha", () => {
    expect(detectarColunaCpf(["  CPF do Titular  "])).toBe("  CPF do Titular  ");
  });

  it("tolera caixa e acento", () => {
    expect(detectarColunaCpf(["cpf do cliente"])).toBe("cpf do cliente");
    expect(detectarColunaCpf(["CPF DO USUÁRIO"])).toBe("CPF DO USUÁRIO");
  });

  it("prefere a coluna mais direta quando há mais de uma candidata", () => {
    expect(detectarColunaCpf(["CPF do Cliente", "CPF"])).toBe("CPF");
  });

  it("sem coluna de CPF devolve nulo — é estado, não exceção", () => {
    // Arquivo histórico, anterior à requisição de 27/07. A importação
    // dele precisa recusar linha a linha com causa nomeada, não quebrar.
    expect(detectarColunaCpf(["Nome", "E-mail", "Telefone", "Patrocinador"])).toBeNull();
    expect(detectarColunaCpf([])).toBeNull();
  });

  it("não casa com coluna que apenas contém a palavra", () => {
    // "CPF do Responsável Legal" não é o titular; casar por substring
    // ligaria o evento à pessoa errada, que é pior que não ligar.
    expect(detectarColunaCpf(["CPF do Responsável Legal"])).toBeNull();
    expect(detectarColunaCpf(["Situação CPF"])).toBeNull();
  });
});

describe("leitura do valor de CPF", () => {
  it("aceita com máscara e sem máscara, normalizando para dígitos", () => {
    expect(normalizarValorDeCpf("111.444.777-35")).toBe("11144477735");
    expect(normalizarValorDeCpf("11144477735")).toBe("11144477735");
    expect(normalizarValorDeCpf(" 111 444 777 35 ")).toBe("11144477735");
  });

  it("as duas formas produzem o MESMO valor — é o que sustenta a junção", () => {
    expect(normalizarValorDeCpf("111.444.777-35")).toBe(
      normalizarValorDeCpf("11144477735"),
    );
  });

  it("o dígito verificador é conferido depois, e reprova o que não fecha", () => {
    // CPF sintético válido (formado algoritmicamente, regra de PF do
    // CLAUDE.md) × um com o último dígito trocado.
    expect(validarCpf(normalizarValorDeCpf("111.444.777-35"))).toBe(true);
    expect(validarCpf(normalizarValorDeCpf("111.444.777-36"))).toBe(false);
    expect(validarCpf(normalizarValorDeCpf("000.000.000-00"))).toBe(false);
  });

  it("valor vazio ou traço não vira CPF", () => {
    expect(normalizarValorDeCpf("")).toBe("");
    expect(normalizarValorDeCpf("-")).toBe("");
    expect(validarCpf(normalizarValorDeCpf(""))).toBe(false);
  });
});
