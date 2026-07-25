import { describe, expect, it } from "vitest";
import { type EventoAgregavel, agregarTelemetria, temResgateNaJanela } from "./agregados";

function evento(over: Partial<EventoAgregavel> = {}): EventoAgregavel {
  return { tipo: "EMISSAO_VOUCHER", valor: null, dataEvento: new Date("2026-07-20T10:00:00Z"), ...over };
}

describe("agregarTelemetria (RN07 — só a partir de eventos importados)", () => {
  it("conta por tipo e soma receita apenas de compras confirmadas", () => {
    const agregado = agregarTelemetria({
      foraDaPlataforma: false,
      eventos: [
        evento({ tipo: "EMISSAO_VOUCHER" }),
        evento({ tipo: "EMISSAO_VOUCHER" }),
        evento({ tipo: "RESGATE_VOUCHER" }),
        evento({ tipo: "COMPRA_CONFIRMADA", valor: 149.9 }),
        evento({ tipo: "COMPRA_CONFIRMADA", valor: 50.1 }),
      ],
    });
    expect(agregado.emitidos).toBe(2);
    expect(agregado.resgatados).toBe(1);
    expect(agregado.comprasConfirmadas).toBe(2);
    expect(agregado.receitaConfirmada).toBe(200);
  });

  it("sem eventos, tudo é zero (nada inventado)", () => {
    const agregado = agregarTelemetria({ foraDaPlataforma: true, eventos: [] });
    expect(agregado).toMatchObject({
      emitidos: 0,
      resgatados: 0,
      comprasConfirmadas: 0,
      receitaConfirmada: 0,
      historicoResgates: null,
      historicoCompras: null,
    });
  });

  it("compra confirmada sem valor não quebra a soma", () => {
    const agregado = agregarTelemetria({
      foraDaPlataforma: false,
      eventos: [evento({ tipo: "COMPRA_CONFIRMADA", valor: null })],
    });
    expect(agregado.comprasConfirmadas).toBe(1);
    expect(agregado.receitaConfirmada).toBe(0);
  });

  it("expõe o acumulado histórico da carga quando presente", () => {
    const agregado = agregarTelemetria({
      foraDaPlataforma: false,
      eventos: [],
      acumuladoInicial: { resgates: 128, compras: 42 },
    });
    expect(agregado.historicoResgates).toBe(128);
    expect(agregado.historicoCompras).toBe(42);
  });

  it("propaga a marcação de fora da Plataforma (aguardando conciliação)", () => {
    expect(agregarTelemetria({ foraDaPlataforma: true, eventos: [] }).foraDaPlataforma).toBe(true);
  });
});

describe("temResgateNaJanela (ficha §8 — vitrine viva)", () => {
  const hoje = new Date("2026-07-25T00:00:00Z");

  it("resgate dentro de 90 dias conta como vivo", () => {
    expect(
      temResgateNaJanela([evento({ tipo: "RESGATE_VOUCHER", dataEvento: new Date("2026-06-01T00:00:00Z") })], hoje),
    ).toBe(true);
  });

  it("resgate fora de 90 dias não conta", () => {
    expect(
      temResgateNaJanela([evento({ tipo: "RESGATE_VOUCHER", dataEvento: new Date("2026-01-01T00:00:00Z") })], hoje),
    ).toBe(false);
  });

  it("emissão recente não é resgate (não conta como vitrine viva)", () => {
    expect(
      temResgateNaJanela([evento({ tipo: "EMISSAO_VOUCHER", dataEvento: hoje })], hoje),
    ).toBe(false);
  });
});
