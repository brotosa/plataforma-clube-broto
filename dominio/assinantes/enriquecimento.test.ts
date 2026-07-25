import { describe, expect, it } from "vitest";
import {
  type LinhaEnriquecimento,
  separarAtributosDeDivergencias,
  slugificarAtributo,
  validarLinhaEnriquecimento,
} from "./enriquecimento";

function linha(parcial: Partial<LinhaEnriquecimento>): LinhaEnriquecimento {
  return {
    linha: 2,
    cpf: "111.444.777-35",
    atributos: { cultura: "soja" },
    ...parcial,
  };
}

describe("slugificarAtributo", () => {
  it("gera slugs estáveis a partir de cabeçalhos reais", () => {
    expect(slugificarAtributo("Cultura")).toBe("cultura");
    expect(slugificarAtributo("Região da Unidade Produtiva")).toBe(
      "regiao-da-unidade-produtiva",
    );
    expect(slugificarAtributo("  Porte (hectares)  ")).toBe("porte-hectares");
  });
});

describe("RN31 — quarentena da família de enriquecimento", () => {
  it("linha com CPF válido e ao menos um atributo passa", () => {
    expect(validarLinhaEnriquecimento(linha({}))).toEqual([]);
  });

  it("CPF inválido e linha sem nenhum valor acumulam motivos", () => {
    expect(
      validarLinhaEnriquecimento(
        linha({ cpf: "123", atributos: { cultura: "  " } }),
      ),
    ).toEqual([
      "CPF inválido: dígito verificador não confere (RN30).",
      "Nenhum atributo com valor na linha.",
    ]);
  });
});

describe("RN35 — enriquecimento nunca sobrescreve o núcleo", () => {
  it("atributo novo vira EAV; colisão divergente vira registro de divergência", () => {
    const resultado = separarAtributosDeDivergencias({
      linha: linha({
        atributos: {
          cultura: "soja",
          email: "outro@exemplo.com.br",
          telefone: "(11) 90000-0000",
        },
      }),
      nucleoAtual: { email: "original@exemplo.com.br", telefone: "(11) 90000-0000" },
    });
    expect(resultado.atributos).toEqual([{ slug: "cultura", valor: "soja" }]);
    expect(resultado.divergencias).toEqual([
      {
        linha: 2,
        campo: "email",
        valorNucleo: "original@exemplo.com.br",
        valorArquivo: "outro@exemplo.com.br",
      },
    ]);
  });

  it("colisão com valor idêntico não gera nem atributo nem divergência", () => {
    const resultado = separarAtributosDeDivergencias({
      linha: linha({ atributos: { email: "igual@exemplo.com.br" } }),
      nucleoAtual: { email: "igual@exemplo.com.br" },
    });
    expect(resultado.atributos).toEqual([]);
    expect(resultado.divergencias).toEqual([]);
  });

  it("núcleo vazio também não é sobrescrito: a diferença é registrada", () => {
    // Decisão da RN35 levada ao pé da letra: mesmo sem valor no núcleo,
    // enriquecimento não escreve campo de núcleo — aponta a divergência
    // para decisão humana (o preenchimento correto é pela carga de núcleo).
    const resultado = separarAtributosDeDivergencias({
      linha: linha({ atributos: { email: "novo@exemplo.com.br" } }),
      nucleoAtual: { email: null },
    });
    expect(resultado.atributos).toEqual([]);
    expect(resultado.divergencias).toEqual([
      {
        linha: 2,
        campo: "email",
        valorNucleo: null,
        valorArquivo: "novo@exemplo.com.br",
      },
    ]);
  });

  it("valores em branco no arquivo são ignorados", () => {
    const resultado = separarAtributosDeDivergencias({
      linha: linha({ atributos: { cultura: "   " } }),
      nucleoAtual: {},
    });
    expect(resultado.atributos).toEqual([]);
    expect(resultado.divergencias).toEqual([]);
  });
});
