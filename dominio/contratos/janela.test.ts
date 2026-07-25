import { describe, expect, it } from "vitest";
import {
  diasParaAniversario,
  estaNaJanelaDeNaoRenovacao,
  proximoAniversario,
} from "./janela";

describe("janela de não-renovação contratual (alerta ≤30 dias do aniversário)", () => {
  const base = new Date("2025-09-01T00:00:00Z");

  it("calcula o próximo aniversário anual da data-base", () => {
    expect(proximoAniversario(base, new Date("2026-07-25T12:00:00Z")).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    // Depois do aniversário do ano corrente, vai para o ano seguinte
    expect(proximoAniversario(base, new Date("2026-09-02T12:00:00Z")).toISOString()).toBe(
      "2027-09-01T00:00:00.000Z",
    );
  });

  it("dias até o aniversário", () => {
    expect(diasParaAniversario(base, new Date("2026-08-02T10:00:00Z"))).toBe(30);
    expect(diasParaAniversario(base, new Date("2026-09-01T00:00:00Z"))).toBe(0);
  });

  it("entra na janela a exatamente 30 dias, fora dela a 31", () => {
    expect(estaNaJanelaDeNaoRenovacao(base, new Date("2026-08-02T00:00:00Z"))).toBe(true);
    expect(estaNaJanelaDeNaoRenovacao(base, new Date("2026-08-01T00:00:00Z"))).toBe(false);
  });

  it("no dia do aniversário ainda está na janela", () => {
    expect(estaNaJanelaDeNaoRenovacao(base, new Date("2026-09-01T10:00:00Z"))).toBe(true);
  });
});
