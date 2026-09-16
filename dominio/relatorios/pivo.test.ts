import { describe, expect, it } from "vitest";

import type { ColunaProjetada } from "./compilador";
import { ROTULO_SEM_VALOR, pivotar, rotularDimensao, tabelaParaCsv } from "./pivo";

const dimensaoAliado: ColunaProjetada = {
  chave: "d0",
  rotulo: "Aliado",
  papel: "LINHA",
  campo: "aliado-nome",
  tipo: "TEXTO",
};
const dimensaoNatureza: ColunaProjetada = {
  chave: "d1",
  rotulo: "Natureza",
  papel: "COLUNA",
  campo: "oferta-natureza",
  tipo: "LISTA",
};
const medidaQuantos: ColunaProjetada = {
  chave: "v0",
  rotulo: "Título da oferta",
  papel: "VALOR",
  campo: "oferta-titulo",
  tipo: "NUMERO",
  agregacao: "QUANTOS",
};

describe("pivô sem campos em Colunas", () => {
  it("cada linha do banco vira uma linha da tabela", () => {
    const tabela = pivotar(
      [dimensaoAliado, medidaQuantos],
      [
        { d0: "AGROMOVE", v0: 28 },
        { d0: "Checkplant", v0: 12 },
      ],
    );
    expect(tabela.dimensoes.map((d) => d.rotulo)).toEqual(["Aliado"]);
    expect(tabela.medidas).toHaveLength(1);
    expect(tabela.linhas).toHaveLength(2);
    expect(tabela.linhas[0]!.chaves).toEqual(["AGROMOVE"]);
    expect(tabela.linhas[0]!.celulas.v0).toBe(28);
  });
});

describe("pivô com campos em Colunas", () => {
  it("funde as linhas que compartilham a dimensão e abre uma medida por valor de coluna", () => {
    const tabela = pivotar(
      [dimensaoAliado, dimensaoNatureza, medidaQuantos],
      [
        { d0: "AGROMOVE", d1: "BENEFICIO", v0: 20 },
        { d0: "AGROMOVE", d1: "CUPOM_DESCONTO", v0: 8 },
        { d0: "Checkplant", d1: "BENEFICIO", v0: 12 },
      ],
    );

    expect(tabela.linhas).toHaveLength(2);
    expect(tabela.medidas).toHaveLength(2);
    expect(tabela.medidas.map((m) => m.rotulo)).toEqual(["BENEFICIO", "CUPOM_DESCONTO"]);

    const agromove = tabela.linhas.find((linha) => linha.chaves[0] === "AGROMOVE")!;
    expect(agromove.celulas[tabela.medidas[0]!.chave]).toBe(20);
    expect(agromove.celulas[tabela.medidas[1]!.chave]).toBe(8);
  });

  /*
   * O caso que a RN53 governa. Checkplant não tem cupom nenhum, e a célula
   * precisa dizer "não houve o que medir", não "houve medição e deu zero".
   * Um pivô que preenche com 0 produz um relatório em que ausência de dado e
   * ausência de fato ficam indistinguíveis — e quem lê escolhe a leitura
   * errada com a mesma facilidade da certa.
   */
  it("cruzamento sem linha vira null, jamais zero", () => {
    const tabela = pivotar(
      [dimensaoAliado, dimensaoNatureza, medidaQuantos],
      [
        { d0: "AGROMOVE", d1: "BENEFICIO", v0: 20 },
        { d0: "AGROMOVE", d1: "CUPOM_DESCONTO", v0: 8 },
        { d0: "Checkplant", d1: "BENEFICIO", v0: 12 },
      ],
    );
    const checkplant = tabela.linhas.find((linha) => linha.chaves[0] === "Checkplant")!;
    const cupom = tabela.medidas[1]!;
    expect(checkplant.celulas[cupom.chave]).toBeNull();
    expect(checkplant.celulas[cupom.chave]).not.toBe(0);
  });

  it("com duas medidas, o nome da medida entra no cabeçalho", () => {
    const segundaMedida: ColunaProjetada = {
      chave: "v1",
      rotulo: "Preço por",
      papel: "VALOR",
      campo: "oferta-preco-por",
      tipo: "DINHEIRO",
      agregacao: "MEDIA",
    };
    const tabela = pivotar(
      [dimensaoAliado, dimensaoNatureza, medidaQuantos, segundaMedida],
      [{ d0: "AGROMOVE", d1: "BENEFICIO", v0: 20, v1: 99.9 }],
    );
    expect(tabela.medidas.map((m) => m.rotulo)).toEqual([
      "BENEFICIO · Título da oferta",
      "BENEFICIO · Preço por",
    ]);
  });

  it("valor nulo na dimensão de coluna vira uma coluna própria, rotulada", () => {
    const tabela = pivotar(
      [dimensaoAliado, dimensaoNatureza, medidaQuantos],
      [
        { d0: "AGROMOVE", d1: null, v0: 3 },
        { d0: "AGROMOVE", d1: "BENEFICIO", v0: 20 },
      ],
    );
    expect(tabela.medidas.map((m) => m.rotulo)).toEqual([ROTULO_SEM_VALOR, "BENEFICIO"]);
  });
});

describe("rótulo de dimensão", () => {
  it("nulo e vazio viram o mesmo rótulo explícito", () => {
    expect(rotularDimensao(null)).toBe(ROTULO_SEM_VALOR);
    expect(rotularDimensao("")).toBe(ROTULO_SEM_VALOR);
  });

  it("booleano vira Sim e Não, não true e false", () => {
    expect(rotularDimensao(true)).toBe("Sim");
    expect(rotularDimensao(false)).toBe("Não");
  });
});

describe("CSV", () => {
  it("traz BOM e separador de ponto e vírgula", () => {
    const csv = tabelaParaCsv(
      pivotar([dimensaoAliado, medidaQuantos], [{ d0: "AGROMOVE", v0: 28 }]),
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Aliado;Título da oferta");
    expect(csv).toContain("AGROMOVE;28");
  });

  it("escapa aspas, ponto e vírgula e quebra de linha", () => {
    const csv = tabelaParaCsv(
      pivotar(
        [dimensaoAliado, medidaQuantos],
        [{ d0: 'Agro; "Norte"\nLtda', v0: 1 }],
      ),
    );
    expect(csv).toContain('"Agro; ""Norte""\nLtda"');
  });

  it("célula nula sai vazia, e dimensão nula sai rotulada", () => {
    const csv = tabelaParaCsv(
      pivotar(
        [dimensaoAliado, dimensaoNatureza, medidaQuantos],
        [
          { d0: null, d1: "BENEFICIO", v0: 2 },
          { d0: "AGROMOVE", d1: "CUPOM_DESCONTO", v0: 8 },
        ],
      ),
    );
    // A linha sem aliado se identifica; a célula que não existe fica vazia.
    expect(csv).toContain(ROTULO_SEM_VALOR);
    expect(csv).toMatch(/;;|;\r\n/);
  });
});
