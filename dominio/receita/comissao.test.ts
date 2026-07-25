import { describe, expect, it } from "vitest";
import { COMISSAO_CUPOM, calcularReceitaBroto } from "./comissao";

describe("economia da oferta — receita de comissão (ficha §6)", () => {
  it("benefício pago comissiona sobre o valor efetivamente pago", () => {
    const resultado = calcularReceitaBroto({
      natureza: "BENEFICIO",
      valorPago: 200,
      comissaoPct: 5,
    });
    expect(resultado).toEqual({ aplicavel: true, valor: 10 });
  });

  it("recompensa nunca comissiona", () => {
    const resultado = calcularReceitaBroto({
      natureza: "RECOMPENSA",
      valorPago: 200,
      comissaoPct: 5,
    });
    expect(resultado.aplicavel).toBe(false);
  });

  it("cupom de desconto não calcula receita enquanto a regra estiver EM_CONFIRMACAO", () => {
    expect(COMISSAO_CUPOM).toBe("EM_CONFIRMACAO");
    const resultado = calcularReceitaBroto({
      natureza: "CUPOM_DESCONTO",
      valorPago: 200,
      comissaoPct: 5,
    });
    expect(resultado.aplicavel).toBe(false);
    if (!resultado.aplicavel) {
      expect(resultado.motivo).toContain("EM_CONFIRMACAO");
    }
  });

  it("benefício sem comissão definida no bloco comercial não calcula", () => {
    const resultado = calcularReceitaBroto({
      natureza: "BENEFICIO",
      valorPago: 200,
      comissaoPct: null,
    });
    expect(resultado.aplicavel).toBe(false);
  });
});
