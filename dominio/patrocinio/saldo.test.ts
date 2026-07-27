import { describe, expect, it } from "vitest";
import {
  avaliarVigencia,
  derivarSaldo,
  DIAS_DE_ALERTA_DE_VIGENCIA,
  encerrar,
  estaVigente,
  MOTIVO_SEM_ADQUIRIDAS,
  rotularVigencia,
} from "./saldo";

/**
 * RN62 — a derivação do saldo, caso positivo e negativo por regra.
 *
 * O que estes testes protegem, mais do que a aritmética: que ausência não
 * vire zero e que encerrar vínculo devolva a vaga.
 */

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("saldo = adquiridas − vínculos vigentes", () => {
  it("apura quando há adquiridas confirmadas", () => {
    const saldo = derivarSaldo({ assinaturasAdquiridas: 500, vinculosVigentes: 137 });
    expect(saldo).toEqual({
      estado: "APURADO",
      adquiridas: 500,
      ativadas: 137,
      saldo: 363,
      excedido: false,
    });
  });

  it("contrato inteiro ocupado dá saldo zero — e zero aqui é um fato", () => {
    const saldo = derivarSaldo({ assinaturasAdquiridas: 200, vinculosVigentes: 200 });
    expect(saldo).toMatchObject({ estado: "APURADO", saldo: 0, excedido: false });
  });

  it("nenhum vínculo ainda: saldo é o contrato inteiro", () => {
    expect(derivarSaldo({ assinaturasAdquiridas: 500, vinculosVigentes: 0 })).toMatchObject({
      saldo: 500,
      ativadas: 0,
    });
  });
});

describe("ausência é informação, não zero (RN62)", () => {
  it("sem adquiridas confirmadas não há saldo — há motivo", () => {
    const saldo = derivarSaldo({ assinaturasAdquiridas: null, vinculosVigentes: 12 });
    expect(saldo.estado).toBe("INDISPONIVEL");
    if (saldo.estado !== "INDISPONIVEL") throw new Error("estado inesperado");
    expect(saldo.motivo).toBe(MOTIVO_SEM_ADQUIRIDAS);
    // O que É conhecido continua sendo dito: 12 vagas estão ocupadas.
    expect(saldo.ativadas).toBe(12);
  });

  it("indisponível NUNCA carrega um número de saldo", () => {
    const saldo = derivarSaldo({ assinaturasAdquiridas: null, vinculosVigentes: 0 });
    expect(saldo).not.toHaveProperty("saldo");
    // Em particular: nem quando não há vínculo nenhum. O par (null, 0) é
    // justamente o caso em que um zero pareceria plausível — e mentiria.
    expect(saldo.estado).toBe("INDISPONIVEL");
  });
});

describe("excesso é exibido, nunca corrigido", () => {
  it("mais vínculos vigentes do que vagas dá saldo negativo e marca o excesso", () => {
    const saldo = derivarSaldo({ assinaturasAdquiridas: 100, vinculosVigentes: 103 });
    expect(saldo).toMatchObject({ estado: "APURADO", saldo: -3, excedido: true });
  });
});

describe("encerrar vínculo devolve a vaga e preserva o histórico", () => {
  it("vínculo sem fim é vigente; com fim, não", () => {
    expect(estaVigente({ fim: null })).toBe(true);
    expect(estaVigente({ fim: dia("2026-07-01") })).toBe(false);
  });

  it("a vaga volta ao saldo assim que o vínculo deixa de ser vigente", () => {
    const antes = derivarSaldo({ assinaturasAdquiridas: 10, vinculosVigentes: 10 });
    const depois = derivarSaldo({ assinaturasAdquiridas: 10, vinculosVigentes: 9 });
    expect(antes).toMatchObject({ saldo: 0 });
    expect(depois).toMatchObject({ saldo: 1 });
  });

  it("encerrar data o fim — jamais apaga a linha", () => {
    const encerrado = encerrar({ inicio: dia("2026-01-10"), fim: null }, dia("2026-07-27"));
    expect(encerrado.inicio).toEqual(dia("2026-01-10"));
    expect(encerrado.fim).toEqual(dia("2026-07-27"));
  });

  it("recusa encerrar duas vezes", () => {
    expect(() =>
      encerrar({ inicio: dia("2026-01-10"), fim: dia("2026-03-01") }, dia("2026-07-27")),
    ).toThrow(/já encerrado/);
  });

  it("recusa fim anterior ao início", () => {
    expect(() => encerrar({ inicio: dia("2026-07-01"), fim: null }, dia("2026-06-30"))).toThrow(
      /anterior ao início/,
    );
  });

  it("encerrar no mesmo dia em que começou é permitido", () => {
    expect(encerrar({ inicio: dia("2026-07-01"), fim: null }, dia("2026-07-01")).fim).toEqual(
      dia("2026-07-01"),
    );
  });
});

describe("vigência e seus selos (T32)", () => {
  const hoje = dia("2026-07-27");

  it("sem data de fim não se supõe nada", () => {
    expect(avaliarVigencia(null, hoje)).toEqual({ estado: "NAO_DECLARADA" });
    expect(rotularVigencia(avaliarVigencia(null, hoje))).toBe("vigência não declarada");
  });

  it("muito à frente é apenas vigente", () => {
    expect(avaliarVigencia(dia("2027-01-31"), hoje)).toMatchObject({ estado: "VIGENTE" });
  });

  it("dentro dos 30 dias é 'vencendo'", () => {
    expect(avaliarVigencia(dia("2026-08-10"), hoje)).toEqual({
      estado: "VENCENDO",
      diasRestantes: 14,
    });
    expect(rotularVigencia(avaliarVigencia(dia("2026-08-10"), hoje))).toBe("vencendo em 14 d");
  });

  it("o limite dos 30 dias é inclusivo, e o dia 31 já não é alerta", () => {
    const limite = dia("2026-08-26"); // 30 dias
    const alem = dia("2026-08-27"); // 31 dias
    expect(avaliarVigencia(limite, hoje).estado).toBe("VENCENDO");
    expect(avaliarVigencia(alem, hoje).estado).toBe("VIGENTE");
    expect(DIAS_DE_ALERTA_DE_VIGENCIA).toBe(30);
  });

  it("o dia do vencimento ainda é vigente; vencida começa no dia seguinte", () => {
    expect(avaliarVigencia(hoje, hoje)).toEqual({ estado: "VENCENDO", diasRestantes: 0 });
    expect(avaliarVigencia(dia("2026-07-26"), hoje)).toEqual({
      estado: "VENCIDA",
      diasVencidos: 1,
    });
    expect(rotularVigencia(avaliarVigencia(dia("2026-07-26"), hoje))).toBe("vencida");
  });

  it("a hora do dia não muda o resultado — a conta é de calendário", () => {
    const fimDeTarde = new Date("2026-08-10T23:59:59.000Z");
    const madrugada = new Date("2026-07-27T00:00:01.000Z");
    expect(avaliarVigencia(fimDeTarde, madrugada)).toMatchObject({ diasRestantes: 14 });
  });
});
