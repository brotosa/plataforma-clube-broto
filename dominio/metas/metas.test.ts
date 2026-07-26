import { describe, expect, it } from "vitest";
import {
  calcularLinha,
  percentualDeAtingimento,
  resumoDoAtingimento,
} from "./painel";
import { dentroDaJanela, janelaDoPeriodo, rotuloDaJanela } from "./periodo";

describe("janelaDoPeriodo — a mesma janela vale para a meta e para o realizado", () => {
  it("anual vai de 1º de janeiro a 1º de janeiro do ano seguinte", () => {
    const janela = janelaDoPeriodo("ANUAL", new Date("2026-07-25T18:00:00Z"));
    expect(janela.inicio.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(janela.fim.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("trimestral fecha no trimestre da data (julho cai no 3º)", () => {
    const janela = janelaDoPeriodo("TRIMESTRAL", new Date("2026-07-25T18:00:00Z"));
    expect(janela.inicio.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(janela.fim.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("mensal vira o ano em dezembro", () => {
    const janela = janelaDoPeriodo("MENSAL", new Date("2026-12-31T23:30:00Z"));
    expect(janela.inicio.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(janela.fim.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("o fim é exclusivo: o primeiro instante do período seguinte fica de fora", () => {
    const janela = janelaDoPeriodo("ANUAL", new Date("2026-03-10T00:00:00Z"));
    expect(dentroDaJanela(janela, new Date("2026-01-01T00:00:00Z"))).toBe(true);
    expect(dentroDaJanela(janela, new Date("2026-12-31T23:59:59Z"))).toBe(true);
    expect(dentroDaJanela(janela, new Date("2027-01-01T00:00:00Z"))).toBe(false);
    expect(dentroDaJanela(janela, new Date("2025-12-31T23:59:59Z"))).toBe(false);
  });

  it("rotula a janela no vocabulário da tela", () => {
    const referencia = new Date("2026-07-25T00:00:00Z");
    expect(rotuloDaJanela("ANUAL", janelaDoPeriodo("ANUAL", referencia))).toBe("2026");
    expect(rotuloDaJanela("TRIMESTRAL", janelaDoPeriodo("TRIMESTRAL", referencia))).toBe(
      "3º trimestre de 2026",
    );
    expect(rotuloDaJanela("MENSAL", janelaDoPeriodo("MENSAL", referencia))).toBe(
      "julho de 2026",
    );
  });
});

describe("painel de meta × realizado (RN22)", () => {
  it("calcula percentual, faltantes e não estoura a barra ao superar a meta", () => {
    const linha = calcularLinha({
      categoriaId: null,
      categoriaNome: null,
      meta: 24,
      realizado: 30,
    });
    expect(linha.percentualReal).toBe(125);
    expect(linha.percentual).toBe(100);
    expect(linha.atingida).toBe(true);
    expect(linha.faltam).toBe(0);
  });

  it("meta em andamento informa quantas faltam", () => {
    const linha = calcularLinha({
      categoriaId: null,
      categoriaNome: null,
      meta: 24,
      realizado: 6,
    });
    expect(linha.percentual).toBe(25);
    expect(linha.atingida).toBe(false);
    expect(resumoDoAtingimento(linha)).toBe("Faltam 18 novas aliadas para a meta do período.");
  });

  it("falta uma: a frase fica no singular", () => {
    const linha = calcularLinha({
      categoriaId: null,
      categoriaNome: null,
      meta: 24,
      realizado: 23,
    });
    expect(resumoDoAtingimento(linha)).toBe("Falta 1 nova aliada para a meta do período.");
  });

  it("meta exatamente atingida não fala em excedente", () => {
    const linha = calcularLinha({ categoriaId: null, categoriaNome: null, meta: 24, realizado: 24 });
    expect(resumoDoAtingimento(linha)).toBe("Meta atingida.");
  });

  it("sem meta configurada não inventa número", () => {
    const linha = calcularLinha({ categoriaId: null, categoriaNome: null, meta: 0, realizado: 5 });
    expect(linha.percentual).toBe(0);
    expect(linha.atingida).toBe(false);
    expect(resumoDoAtingimento(linha)).toBe("Meta do período ainda não definida.");
    expect(percentualDeAtingimento(5, 0)).toBe(0);
  });

  it("realizado zero é estado legítimo, não erro", () => {
    const linha = calcularLinha({ categoriaId: null, categoriaNome: null, meta: 24, realizado: 0 });
    expect(linha.percentual).toBe(0);
    expect(linha.faltam).toBe(24);
  });
});

// O bloco "mapa de cobertura (T13)" mudou de endereço na F14: a definição
// passou a ser fonte única (RN51) e as mesmas expectativas vivem agora em
// `dominio/cobertura/cobertura.test.ts`, onde provam que a extração não
// alterou a lente da T13.
