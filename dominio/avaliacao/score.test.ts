import { describe, expect, it } from "vitest";
import {
  calcularScore,
  compararSubtotais,
  subtotaisDoJson,
} from "./score";

describe("calcularScore — subtotal da dimensão = média 1–5 × 20", () => {
  it("uma dimensão com uma nota: nota 3 vira subtotal e total 60", () => {
    const score = calcularScore([{ dimensao: "Capilaridade", peso: 1, nota: 3 }]);
    expect(score.subtotais).toHaveLength(1);
    expect(score.subtotais[0]).toMatchObject({
      dimensao: "Capilaridade",
      grupo: "EMPRESA",
      quantidadeNotas: 1,
      media: 3,
      subtotal: 60,
    });
    expect(score.total).toBe(60);
    expect(score.totalInteiro).toBe(60);
  });

  it("duas notas na mesma dimensão fazem média antes do × 20 (3 e 4 → 70)", () => {
    const score = calcularScore([
      { dimensao: "Fit de Negócio", peso: 1, nota: 3 },
      { dimensao: "Fit de Negócio", peso: 1, nota: 4 },
    ]);
    expect(score.subtotais[0].media).toBe(3.5);
    expect(score.subtotais[0].subtotal).toBe(70);
    expect(score.total).toBe(70);
  });

  it("com pesos v1 (todos 1) o total é a média simples dos subtotais", () => {
    const score = calcularScore([
      { dimensao: "Capilaridade", peso: 1, nota: 3 }, // subtotal 60
      { dimensao: "Tração", peso: 1, nota: 4 }, // subtotal 80
    ]);
    expect(score.total).toBe(70);
    expect(score.totalInteiro).toBe(70);
  });

  it("dimensão sem nota não entra no cálculo (avaliação parcial)", () => {
    const score = calcularScore([{ dimensao: "Inovação", peso: 1, nota: 5 }]);
    expect(score.subtotais).toHaveLength(1);
    expect(score.total).toBe(100);
  });

  it("pesos diferentes ponderam o total por dimensão", () => {
    const score = calcularScore([
      { dimensao: "Capilaridade", peso: 2, nota: 5 }, // subtotal 100, peso 2
      { dimensao: "Tração", peso: 1, nota: 1 }, // subtotal 20, peso 1
    ]);
    // (100×2 + 20×1) / 3 = 73,33…
    expect(score.total).toBeCloseTo(220 / 3, 10);
    expect(score.totalInteiro).toBe(73);
  });

  it("peso da dimensão é a média dos pesos dos indicadores respondidos", () => {
    const score = calcularScore([
      { dimensao: "Saúde do caixa", peso: 2, nota: 4 },
      { dimensao: "Saúde do caixa", peso: 1, nota: 2 },
    ]);
    expect(score.subtotais[0].peso).toBe(1.5);
    expect(score.subtotais[0].media).toBe(3);
  });

  it("extremos da escala: todas 1 dá 20; todas 5 dá 100", () => {
    expect(
      calcularScore([
        { dimensao: "Capilaridade", peso: 1, nota: 1 },
        { dimensao: "Inovação", peso: 1, nota: 1 },
      ]).total,
    ).toBe(20);
    expect(
      calcularScore([
        { dimensao: "Capilaridade", peso: 1, nota: 5 },
        { dimensao: "Inovação", peso: 1, nota: 5 },
      ]).total,
    ).toBe(100);
  });

  it("sem nenhuma nota o total é null — nunca um número plausível", () => {
    const score = calcularScore([]);
    expect(score.subtotais).toEqual([]);
    expect(score.total).toBeNull();
    expect(score.totalInteiro).toBeNull();
  });

  it("subtotais saem na ordem canônica das tabelas do ScoutCB", () => {
    const score = calcularScore([
      { dimensao: "Concorrência", peso: 1, nota: 3 },
      { dimensao: "Capilaridade", peso: 1, nota: 3 },
      { dimensao: "Relevância de Mercado", peso: 1, nota: 3 },
    ]);
    expect(score.subtotais.map((s) => s.dimensao)).toEqual([
      "Capilaridade",
      "Relevância de Mercado",
      "Concorrência",
    ]);
  });

  it("soma de pesos degenerada em zero cai na média simples, sem dividir por zero", () => {
    const score = calcularScore([
      { dimensao: "Capilaridade", peso: 0, nota: 5 },
      { dimensao: "Tração", peso: 0, nota: 1 },
    ]);
    expect(score.total).toBe(60);
  });

  it("total quebrado arredonda para o inteiro persistido", () => {
    const score = calcularScore([
      { dimensao: "Capilaridade", peso: 1, nota: 2 }, // 40
      { dimensao: "Tração", peso: 1, nota: 3 }, // 60
      { dimensao: "Inovação", peso: 1, nota: 3 }, // 60
    ]);
    // (40+60+60)/3 = 53,33 → 53
    expect(score.totalInteiro).toBe(53);
  });
});

describe("compararSubtotais — comparação com a versão anterior (T10)", () => {
  const anterior = calcularScore([
    { dimensao: "Capilaridade", peso: 1, nota: 2 },
    { dimensao: "Tração", peso: 1, nota: 4 },
  ]).subtotais;

  it("calcula o delta por dimensão presente nas duas versões", () => {
    const atual = calcularScore([
      { dimensao: "Capilaridade", peso: 1, nota: 4 },
      { dimensao: "Tração", peso: 1, nota: 4 },
    ]).subtotais;
    const comparacao = compararSubtotais(anterior, atual);
    expect(comparacao).toHaveLength(2);
    expect(comparacao[0]).toMatchObject({
      dimensao: "Capilaridade",
      subtotalAnterior: 40,
      subtotalAtual: 80,
      delta: 40,
    });
    expect(comparacao[1].delta).toBe(0);
  });

  it("dimensão avaliada só em uma das versões aparece com delta null", () => {
    const atual = calcularScore([
      { dimensao: "Inovação", peso: 1, nota: 5 },
    ]).subtotais;
    const comparacao = compararSubtotais(anterior, atual);
    const inovacao = comparacao.find((c) => c.dimensao === "Inovação");
    const tracao = comparacao.find((c) => c.dimensao === "Tração");
    expect(inovacao).toMatchObject({ subtotalAnterior: null, subtotalAtual: 100, delta: null });
    expect(tracao).toMatchObject({ subtotalAnterior: 80, subtotalAtual: null, delta: null });
  });

  it("sem versão anterior, todas as linhas vêm sem delta", () => {
    const atual = calcularScore([{ dimensao: "Capilaridade", peso: 1, nota: 3 }]).subtotais;
    expect(compararSubtotais(null, atual)).toEqual([
      expect.objectContaining({ subtotalAnterior: null, delta: null }),
    ]);
  });
});

describe("subtotaisDoJson — reidratação do congelado no fechamento", () => {
  it("reidrata a estrutura congelada preservando os valores", () => {
    const congelado = JSON.parse(
      JSON.stringify(calcularScore([{ dimensao: "Capilaridade", peso: 1, nota: 3 }]).subtotais),
    );
    expect(subtotaisDoJson(congelado)).toEqual([
      expect.objectContaining({ dimensao: "Capilaridade", grupo: "EMPRESA", subtotal: 60 }),
    ]);
  });

  it("descarta linhas fora do formato e entradas que não são lista", () => {
    expect(subtotaisDoJson(null)).toEqual([]);
    expect(subtotaisDoJson("texto")).toEqual([]);
    expect(subtotaisDoJson([{ dimensao: "Capilaridade" }, 42])).toEqual([]);
  });
});
