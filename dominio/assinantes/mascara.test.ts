import { describe, expect, it } from "vitest";
import { mascararCpf, mascararEmail, mascararTelefone } from "./mascara";

describe("RN30 — máscaras padrão do servidor (formatos do protótipo v6.1)", () => {
  it("mascara CPF mantendo apenas os 2 últimos dígitos", () => {
    expect(mascararCpf("111.444.777-35")).toBe("***.___.***-35");
    expect(mascararCpf("11144477735")).toBe("***.___.***-35");
  });

  it("não vaza dígitos quando o CPF armazenado é anômalo", () => {
    expect(mascararCpf("123")).toBe("***.___.***-**");
  });

  it("mascara telefone mantendo DDD e os 2 últimos dígitos", () => {
    expect(mascararTelefone("(65) 90000-0034")).toBe("(65) ****-**34");
    expect(mascararTelefone("65900000034")).toBe("(65) ****-**34");
  });

  it("telefone curto demais vira máscara opaca; vazio permanece vazio", () => {
    expect(mascararTelefone("1234567")).toBe("****");
    expect(mascararTelefone(null)).toBeNull();
  });

  it("mascara e-mail com primeira letra + domínio", () => {
    expect(mascararEmail("marina.ca@exemplo.com.br")).toBe("m****@exemplo.com.br");
  });

  it("e-mail sem arroba (ou começando nele) vira máscara opaca; vazio permanece", () => {
    expect(mascararEmail("sem-arroba")).toBe("****");
    expect(mascararEmail("@dominio.com")).toBe("****");
    expect(mascararEmail(null)).toBeNull();
  });
});
