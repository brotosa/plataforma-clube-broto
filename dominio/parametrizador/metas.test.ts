import { describe, expect, it } from "vitest";
import {
  conflitoDeMeta,
  intervaloDoPeriodo,
  type MetaExistente,
  rotuloDoIntervalo,
  validarMeta,
} from "./metas";

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Meta vigente confirmada em 24/07 (ficha §3.2): 24 novos aliados/ano.
 * Janela semiaberta — `fim` é 1º de janeiro do ano seguinte, convenção da
 * tabela `metas_periodo` que a F9 criou e a T17 escreve.
 */
const META_ANUAL_2026: MetaExistente = {
  id: "meta-anual-geral",
  periodo: "ANUAL",
  inicio: dia("2026-01-01"),
  fim: dia("2027-01-01"),
  categoriaId: null,
};

describe("RN28 — períodos alinhados ao calendário, com fim exclusivo", () => {
  it("mensal cobre o mês inteiro; o fim é o 1º do mês seguinte", () => {
    const intervalo = intervaloDoPeriodo("MENSAL", dia("2026-03-17"));
    expect(intervalo.inicio.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(intervalo.fim.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("mensal acerta fevereiro de ano bissexto", () => {
    const intervalo = intervaloDoPeriodo("MENSAL", dia("2028-02-10"));
    expect(intervalo.fim.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  });

  it("trimestral cobre o trimestre civil que contém a referência", () => {
    const intervalo = intervaloDoPeriodo("TRIMESTRAL", dia("2026-08-30"));
    expect(intervalo.inicio.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(intervalo.fim.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("anual cobre o ano civil", () => {
    const intervalo = intervaloDoPeriodo("ANUAL", dia("2026-07-24"));
    expect(intervalo.inicio.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(intervalo.fim.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  // A borda é o ponto sensível do fim exclusivo: dezembro e janeiro são
  // meses vizinhos e não podem se cruzar.
  it("meses consecutivos não se cruzam na virada do ano", () => {
    const dezembro = intervaloDoPeriodo("MENSAL", dia("2026-12-15"));
    const janeiro = intervaloDoPeriodo("MENSAL", dia("2027-01-15"));
    expect(dezembro.fim.toISOString()).toBe(janeiro.inicio.toISOString());
    expect(
      conflitoDeMeta(
        { periodo: "MENSAL", ...janeiro, categoriaId: null, valor: 2 },
        [{ id: "dez", periodo: "MENSAL", ...dezembro, categoriaId: null }],
      ),
    ).toBeNull();
  });

  it("não desloca o 1º de janeiro por causa de fuso", () => {
    // O bug clássico: construir a data em horário local jogaria a borda do
    // ano para 31/12 do ano anterior em qualquer fuso a oeste de Greenwich.
    const intervalo = intervaloDoPeriodo("ANUAL", dia("2026-01-01"));
    expect(intervalo.inicio.getUTCFullYear()).toBe(2026);
    expect(intervalo.inicio.getUTCMonth()).toBe(0);
    expect(intervalo.inicio.getUTCDate()).toBe(1);
  });

  it("rotula o período em registro institucional", () => {
    expect(rotuloDoIntervalo("ANUAL", dia("2026-01-01"))).toBe("2026");
    expect(rotuloDoIntervalo("TRIMESTRAL", dia("2026-07-01"))).toBe("3º trimestre de 2026");
    expect(rotuloDoIntervalo("MENSAL", dia("2026-03-01"))).toBe("março de 2026");
  });
});

describe("RN28 — metas não se sobrepõem para o mesmo escopo e período", () => {
  it("aceita a primeira meta geral do ano (24 novos aliados/ano)", () => {
    const erros = validarMeta(
      {
        periodo: "ANUAL",
        inicio: dia("2026-01-01"),
        fim: dia("2027-01-01"),
        categoriaId: null,
        valor: 24,
      },
      [],
    );
    expect(erros).toEqual([]);
  });

  it("recusa segunda meta geral anual para o mesmo ano", () => {
    const erros = validarMeta(
      {
        periodo: "ANUAL",
        inicio: dia("2026-01-01"),
        fim: dia("2027-01-01"),
        categoriaId: null,
        valor: 30,
      },
      [META_ANUAL_2026],
    );
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("RN28");
    expect(erros[0]).toContain("2026");
  });

  it("aceita meta geral anual de outro ano", () => {
    const erros = validarMeta(
      {
        periodo: "ANUAL",
        inicio: dia("2027-01-01"),
        fim: dia("2028-01-01"),
        categoriaId: null,
        valor: 30,
      },
      [META_ANUAL_2026],
    );
    expect(erros).toEqual([]);
  });

  it("aceita meta mensal convivendo com a anual — períodos diferentes medem coisas diferentes", () => {
    const erros = validarMeta(
      {
        periodo: "MENSAL",
        inicio: dia("2026-03-01"),
        fim: dia("2026-04-01"),
        categoriaId: null,
        valor: 2,
      },
      [META_ANUAL_2026],
    );
    expect(erros).toEqual([]);
  });

  it("aceita meta por categoria no mesmo período da meta geral", () => {
    const erros = validarMeta(
      {
        periodo: "ANUAL",
        inicio: dia("2026-01-01"),
        fim: dia("2027-01-01"),
        categoriaId: "cat-tecnologia",
        valor: 6,
      },
      [META_ANUAL_2026],
    );
    expect(erros).toEqual([]);
  });

  it("recusa segunda meta da MESMA categoria no mesmo período", () => {
    const daCategoria: MetaExistente = {
      id: "meta-cat",
      periodo: "ANUAL",
      inicio: dia("2026-01-01"),
      fim: dia("2027-01-01"),
      categoriaId: "cat-tecnologia",
    };
    const erros = validarMeta(
      {
        periodo: "ANUAL",
        inicio: dia("2026-01-01"),
        fim: dia("2027-01-01"),
        categoriaId: "cat-tecnologia",
        valor: 8,
      },
      [META_ANUAL_2026, daCategoria],
      { nomeCategoria: "Tecnologia e Software" },
    );
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("Tecnologia e Software");
  });

  it("recusa meta trimestral que cruza outra trimestral do mesmo escopo", () => {
    const terceiroTrimestre: MetaExistente = {
      id: "meta-3t",
      periodo: "TRIMESTRAL",
      inicio: dia("2026-07-01"),
      fim: dia("2026-10-01"),
      categoriaId: null,
    };
    expect(
      conflitoDeMeta(
        {
          periodo: "TRIMESTRAL",
          inicio: dia("2026-07-01"),
          fim: dia("2026-10-01"),
          categoriaId: null,
          valor: 5,
        },
        [terceiroTrimestre],
      ),
    ).toEqual(terceiroTrimestre);
  });

  it("não acusa conflito da meta consigo mesma ao editar", () => {
    const erros = validarMeta(
      {
        periodo: "ANUAL",
        inicio: dia("2026-01-01"),
        fim: dia("2027-01-01"),
        categoriaId: null,
        valor: 28,
      },
      [META_ANUAL_2026],
      { ignorarId: META_ANUAL_2026.id },
    );
    expect(erros).toEqual([]);
  });

  it("recusa período que não cobre o calendário inteiro", () => {
    const erros = validarMeta(
      {
        periodo: "MENSAL",
        inicio: dia("2026-03-10"),
        fim: dia("2026-04-09"),
        categoriaId: null,
        valor: 3,
      },
      [],
    );
    expect(erros.some((e) => e.includes("período inteiro do calendário"))).toBe(true);
  });

  it("recusa meta sem contagem positiva", () => {
    for (const valor of [0, -1, 2.5]) {
      const erros = validarMeta(
        {
          periodo: "ANUAL",
          inicio: dia("2027-01-01"),
          fim: dia("2028-01-01"),
          categoriaId: null,
          valor,
        },
        [],
      );
      expect(erros.some((e) => e.includes("contagem inteira"))).toBe(true);
    }
  });
});
