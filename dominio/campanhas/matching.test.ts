import { describe, expect, it } from "vitest";
import {
  atributosDoPublico,
  sugerirParaPublico,
  type CandidatoSugestao,
} from "./matching";

const candidato = (
  id: string,
  nome: string,
  taxonomias: Partial<CandidatoSugestao["taxonomias"]> = {},
): CandidatoSugestao => ({
  id,
  nome,
  taxonomias: {
    categoria: null,
    culturas: [],
    coberturaNacional: false,
    ufs: [],
    ...taxonomias,
  },
});

describe("RN42 — leitura dos atributos do público", () => {
  it("extrai UF, cultura e preferência das regras de igualdade", () => {
    expect(
      atributosDoPublico([
        { campo: "uf", operador: "e", valor: "MT" },
        { campo: "cultura", operador: "e", valor: "Café", combinadorAnterior: "E" },
        { campo: "preferencia", operador: "e", valor: "agricultura", combinadorAnterior: "E" },
      ]),
    ).toEqual({ ufs: ["mt"], culturas: ["café"], preferencias: ["agricultura"] });
  });

  it('ignora regras "não é" — restrição não é afinidade', () => {
    expect(
      atributosDoPublico([{ campo: "uf", operador: "nao_e", valor: "SP" }]),
    ).toEqual({ ufs: [], culturas: [], preferencias: [] });
  });

  it("ignora campos que não participam do matching", () => {
    expect(
      atributosDoPublico([{ campo: "vencimento", operador: "vence_em", valor: "30" }]),
    ).toEqual({ ufs: [], culturas: [], preferencias: [] });
  });
});

describe("RN42 — sugestões assistivas", () => {
  const publico = { ufs: ["mt"], culturas: ["café"], preferencias: ["agricultura"] };

  it("sugere por cultura coincidente, com o motivo à vista", () => {
    const sugestoes = sugerirParaPublico(
      [candidato("of-1", "Consultoria de café", { culturas: ["Café"] })],
      publico,
    );
    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0]!.sinais).toContain("cultura");
    expect(sugestoes[0]!.motivo).toContain("cultura café");
  });

  it("sugere por cobertura nacional", () => {
    const sugestoes = sugerirParaPublico(
      [candidato("of-2", "Seguro agrícola", { coberturaNacional: true })],
      publico,
    );
    expect(sugestoes[0]!.motivo).toContain("cobertura nacional");
  });

  it("sugere por UF atendida", () => {
    const sugestoes = sugerirParaPublico(
      [candidato("of-3", "Assistência técnica", { ufs: ["MT", "GO"] })],
      publico,
    );
    expect(sugestoes[0]!.motivo).toContain("MT");
  });

  it('trata a cultura "Todas" como atendimento a qualquer cultura', () => {
    const sugestoes = sugerirParaPublico(
      [candidato("of-4", "Gestão financeira", { culturas: ["Todas"] })],
      publico,
    );
    expect(sugestoes[0]!.motivo).toContain("atende todas as culturas");
  });

  it("casa preferência pecuária com solução de cultura Pecuária", () => {
    const sugestoes = sugerirParaPublico(
      [candidato("of-5", "Nutrição animal", { culturas: ["Pecuária"] })],
      { ufs: [], culturas: [], preferencias: ["pecuaria"] },
    );
    expect(sugestoes[0]!.motivo).toContain("preferência pecuária");
  });

  it("não casa preferência pecuária com solução só de cultura agrícola", () => {
    expect(
      sugerirParaPublico([candidato("of-6", "Plantio direto", { culturas: ["Grãos"] })], {
        ufs: [],
        culturas: [],
        preferencias: ["pecuaria"],
      }),
    ).toEqual([]);
  });

  it('casa "ambos" com qualquer lado', () => {
    const sugestoes = sugerirParaPublico(
      [candidato("of-7", "Crédito rural", { culturas: ["Grãos"] })],
      { ufs: [], culturas: [], preferencias: ["ambos"] },
    );
    expect(sugestoes).toHaveLength(1);
  });

  it("deixa de fora o candidato sem nenhum sinal", () => {
    expect(
      sugerirParaPublico([candidato("of-8", "Logística", { ufs: ["RS"] })], publico),
    ).toEqual([]);
  });

  it("não sugere nada quando o público não tem atributos de afinidade", () => {
    expect(
      sugerirParaPublico([candidato("of-9", "Qualquer", { culturas: ["Café"] })], {
        ufs: [],
        culturas: [],
        preferencias: [],
      }),
    ).toEqual([]);
  });

  it("ordena por número de sinais e desempata pelo nome", () => {
    const sugestoes = sugerirParaPublico(
      [
        candidato("of-10", "Zeta — só cultura", { culturas: ["Café"] }),
        candidato("of-11", "Alfa — só cultura", { culturas: ["Café"] }),
        candidato("of-12", "Ômega — cultura e cobertura", {
          culturas: ["Café"],
          coberturaNacional: true,
        }),
      ],
      publico,
    );
    expect(sugestoes.map((s) => s.nome)).toEqual([
      "Ômega — cultura e cobertura",
      "Alfa — só cultura",
      "Zeta — só cultura",
    ]);
  });

  it("a categoria não vira sinal — não há campo de categoria no público", () => {
    expect(
      sugerirParaPublico(
        [candidato("of-13", "Consultoria", { categoria: "Consultorias e Serviços Profissionais" })],
        publico,
      ),
    ).toEqual([]);
  });
});
