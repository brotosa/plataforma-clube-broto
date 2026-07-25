import { describe, expect, it } from "vitest";
import { DIMENSOES_MEDICAO, grupoDaDimensao } from "./dimensoes";
import {
  ESCALA_NOTA,
  ESTAGIOS_AVALIAVEIS,
  podeAvaliarNoEstagio,
  podeEditarAvaliacao,
  precisaReavaliacao,
  REAVALIACAO_ANUAL,
  validarFechamento,
  validarNota,
  validarPriorizacao,
} from "./regras";

describe("dimensões de medição — 14 canônicas do ScoutCB", () => {
  it("são 9 do grupo Empresa e 5 do grupo Produto", () => {
    expect(DIMENSOES_MEDICAO).toHaveLength(14);
    expect(DIMENSOES_MEDICAO.filter((d) => d.grupo === "EMPRESA")).toHaveLength(9);
    expect(DIMENSOES_MEDICAO.filter((d) => d.grupo === "PRODUTO")).toHaveLength(5);
  });

  it("resolve o grupo pelo nome e devolve null para nome desconhecido", () => {
    expect(grupoDaDimensao("Capilaridade")).toBe("EMPRESA");
    expect(grupoDaDimensao("Concorrência")).toBe("PRODUTO");
    expect(grupoDaDimensao("Dimensão inexistente")).toBeNull();
  });
});

describe("escala de nota 1–5 (ficha §3.3)", () => {
  it("aceita os extremos da escala", () => {
    expect(validarNota(ESCALA_NOTA.minima)).toEqual([]);
    expect(validarNota(ESCALA_NOTA.maxima)).toEqual([]);
  });

  it("rejeita nota fora da escala ou não inteira", () => {
    expect(validarNota(0)).not.toEqual([]);
    expect(validarNota(6)).not.toEqual([]);
    expect(validarNota(2.5)).not.toEqual([]);
  });
});

describe("fechamento de versão", () => {
  it("aceita fechamento com ao menos uma nota e recomendação", () => {
    expect(validarFechamento({ quantidadeNotas: 1, recomendacao: "AVANCAR" })).toEqual([]);
  });

  it("rejeita fechamento sem nenhuma nota", () => {
    expect(validarFechamento({ quantidadeNotas: 0, recomendacao: "MONITORAR" })).toContain(
      "Fechar a avaliação exige ao menos uma nota registrada.",
    );
  });

  it("rejeita fechamento sem recomendação", () => {
    expect(validarFechamento({ quantidadeNotas: 5, recomendacao: null })).toContain(
      "Fechar a avaliação exige uma recomendação (avançar · monitorar · descartar).",
    );
  });
});

describe("RN18 — avaliação fechada é imutável", () => {
  it("rascunho é editável; fechada não é", () => {
    expect(podeEditarAvaliacao("RASCUNHO")).toBe(true);
    expect(podeEditarAvaliacao("FECHADA")).toBe(false);
  });
});

describe("RN15 — priorização exige avaliação fechada", () => {
  it("com avaliação fechada não há erro", () => {
    expect(validarPriorizacao(true)).toEqual([]);
  });

  it("sem avaliação fechada devolve o erro da RN15", () => {
    const erros = validarPriorizacao(false);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("RN15");
  });
});

describe("estágios em que se avalia", () => {
  it("funil a partir de Em avaliação e Aliada ativa (reavaliação RN21)", () => {
    for (const estagio of ESTAGIOS_AVALIAVEIS) {
      expect(podeAvaliarNoEstagio(estagio)).toBe(true);
    }
    expect(podeAvaliarNoEstagio("EM_AVALIACAO")).toBe(true);
    expect(podeAvaliarNoEstagio("ALIADA_ATIVA")).toBe(true);
  });

  it("Mapeada exige assumir antes (RN14); caso no motor e fora do funil não avaliam", () => {
    expect(podeAvaliarNoEstagio("MAPEADA")).toBe(false);
    expect(podeAvaliarNoEstagio("EM_APROVACAO")).toBe(false);
    expect(podeAvaliarNoEstagio("DESCARTADA")).toBe(false);
    expect(podeAvaliarNoEstagio("SUSPENSA")).toBe(false);
    expect(podeAvaliarNoEstagio("ENCERRADA")).toBe(false);
  });
});

describe("RN21 — reavaliação anual de aliadas ativas", () => {
  const referencia = new Date("2026-07-25T12:00:00Z");

  it("sem avaliação fechada não há aniversário — nunca marca", () => {
    expect(precisaReavaliacao(null, referencia)).toBe(false);
  });

  it("antes de completar 12 meses não precisa", () => {
    expect(precisaReavaliacao(new Date("2025-08-01T12:00:00Z"), referencia)).toBe(false);
  });

  it("aos 12 meses completos precisa", () => {
    expect(precisaReavaliacao(new Date("2025-07-25T12:00:00Z"), referencia)).toBe(true);
    expect(REAVALIACAO_ANUAL.meses).toBe(12);
  });

  it("bem além do ciclo continua precisando", () => {
    expect(precisaReavaliacao(new Date("2024-01-10T00:00:00Z"), referencia)).toBe(true);
  });
});
