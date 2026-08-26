import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lerArquivoTabular, lerCsvTabular } from "@/infra/planilhas/leitor-tabular";
import {
  higienizarCelula,
  removerApostrofoDePlanilha,
  removerEmoji,
  vazioSeTraco,
} from "./higienes";

/**
 * As quatro higienes do prompt §3, **uma a uma** — é essa a exigência:
 * "precisam de teste próprio, cada uma".
 *
 * Duas delas (1 e 2) são exercitadas também contra a amostra REAL de
 * `dados/`, porque foi nela que foram observadas. As outras duas
 * (apóstrofo em telefone e `'-` como vazio) não aparecem nos dois
 * arquivos de catálogo — nenhum deles tem coluna de telefone —, então
 * vão contra fixture sintética. Isso está declarado no PR: as quatro são
 * implementadas e testadas; duas têm amostra real por trás e duas não.
 */

const RAIZ = join(import.meta.dirname, "..", "..");

describe("higiene 1 — coluna de índice sem nome na primeira posição", () => {
  it("a amostra real de sellers tem a coluna sem nome, e ela não vira coluna de dado", async () => {
    const conteudo = readFileSync(join(RAIZ, "dados", "Lista_de_Sellers_1.xlsx"));
    const lido = await lerArquivoTabular("Lista_de_Sellers_1.xlsx", conteudo);

    // A primeira coluna do arquivo é o índice da planilha e não tem nome.
    expect(lido.colunas[0]).toBe("Id do Seller");
    expect(lido.colunas).not.toContain("");
    expect(lido.linhas.length).toBeGreaterThan(0);
    // E nenhuma linha ganhou uma chave vazia por causa dela.
    expect(Object.keys(lido.linhas[0]!.valores)).not.toContain("");
  });

  it("no CSV também some — a operadora passou a exportar 'Resgate e Compras' em CSV", () => {
    // Este teste registrava a diferença oposta: até então, o CSV
    // preservava a coluna sem nome (chave ""), e só o XLSX a descartava.
    // O "se um dia vierem em CSV com índice sem nome" aconteceu — o
    // arquivo `basetestev01` traz a coluna de índice E a grade cheia de
    // linhas ";;;;". Agora os dois leitores aplicam a higiene 1 igual, e
    // a linha só de delimitadores não vira dado.
    const lido = lerCsvTabular(
      Buffer.from(",Id do Seller\n1,abc\n,\n;;\n", "utf8"),
    );
    expect(lido.colunas).toEqual(["Id do Seller"]);
    expect(lido.colunas).not.toContain("");
    // Só a linha com dado; as vazias ("," e ";;") ficam de fora.
    expect(lido.linhas).toHaveLength(1);
    expect(lido.linhas[0]!.valores).toEqual({ "Id do Seller": "abc" });
  });
});

describe("higiene 2 — emoji no campo de status do seller", () => {
  it("remove o emoji e devolve o status legível", () => {
    expect(removerEmoji("🟢 Seller com oferta ativa")).toBe("Seller com oferta ativa");
    expect(removerEmoji("🔴 Seller sem oferta ativa")).toBe("Seller sem oferta ativa");
  });

  it("não toca em acento, cedilha nem em texto sem emoji", () => {
    expect(removerEmoji("Fundação de Estudos Agrários")).toBe(
      "Fundação de Estudos Agrários",
    );
    expect(removerEmoji("Oferta Ativa")).toBe("Oferta Ativa");
  });

  it("a amostra real traz emoji no status, e todas as linhas limpam", async () => {
    const conteudo = readFileSync(join(RAIZ, "dados", "Lista_de_Sellers_1.xlsx"));
    const lido = await lerArquivoTabular("Lista_de_Sellers_1.xlsx", conteudo);
    const coluna = "Seller com ofertas ativas?";

    const brutos = lido.linhas.map((l) => l.valores[coluna] ?? "");
    expect(brutos.some((valor) => /[\u{1F000}-\u{1FAFF}]/u.test(valor))).toBe(true);

    for (const bruto of brutos) {
      const limpo = removerEmoji(bruto);
      expect(limpo).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
      expect(limpo.startsWith(" ")).toBe(false);
      expect(limpo).toMatch(/^Seller (com|sem) oferta ativa$/);
    }
  });
});

describe("higiene 3 — apóstrofo à esquerda (artefato de planilha)", () => {
  it("remove só o apóstrofo inicial", () => {
    expect(removerApostrofoDePlanilha("'11999998888")).toBe("11999998888");
    expect(removerApostrofoDePlanilha("'0012")).toBe("0012");
  });

  it("apóstrofo no meio é conteúdo e permanece", () => {
    expect(removerApostrofoDePlanilha("D'Ávila")).toBe("D'Ávila");
    expect(removerApostrofoDePlanilha("O'Brien")).toBe("O'Brien");
  });

  it("texto sem apóstrofo atravessa intacto", () => {
    expect(removerApostrofoDePlanilha("11999998888")).toBe("11999998888");
  });
});

describe("higiene 4 — `'-` significando vazio", () => {
  it("traço com o apóstrofo da planilha vira vazio", () => {
    expect(vazioSeTraco("'-")).toBe("");
  });

  it("traço limpo também vira vazio", () => {
    expect(vazioSeTraco("-")).toBe("");
    expect(vazioSeTraco(" - ")).toBe("");
  });

  it("não confunde traço isolado com traço dentro do valor", () => {
    expect(vazioSeTraco("11-99999-8888")).toBe("11-99999-8888");
    expect(vazioSeTraco("Recompensa - gratuita")).toBe("Recompensa - gratuita");
  });

  it("vazio é vazio, nunca zero (RN53)", () => {
    expect(vazioSeTraco("'-")).not.toBe("0");
    expect(vazioSeTraco("'-")).toBe("");
  });
});

describe("composição das higienes 3 e 4", () => {
  it("`higienizarCelula` resolve `'-` na ordem certa", () => {
    expect(higienizarCelula("'-")).toBe("");
    expect(higienizarCelula("'11999998888")).toBe("11999998888");
    expect(higienizarCelula("São Paulo")).toBe("São Paulo");
  });

  it("não remove emoji — isso é escolha de quem lê o status", () => {
    // Emoji pode ser conteúdo legítimo (nome de produto). A higiene 2 é
    // chamada onde ela é devida, não em toda célula.
    expect(higienizarCelula("🟢 Seller com oferta ativa")).toBe(
      "🟢 Seller com oferta ativa",
    );
  });
});
