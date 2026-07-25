import { describe, expect, it } from "vitest";
import {
  calcularCascata,
  podeCriarSolucao,
  podeExcluirFisicamente,
} from "./regras";

describe("RN01 — solução só para Aliada ativa", () => {
  it("permite criar para empresa Aliada ativa", () => {
    expect(podeCriarSolucao("ALIADA_ATIVA")).toBe(true);
  });

  it("bloqueia para os demais estágios", () => {
    expect(podeCriarSolucao("EM_NEGOCIACAO")).toBe(false);
    expect(podeCriarSolucao("SUSPENSA")).toBe(false);
    expect(podeCriarSolucao("ENCERRADA")).toBe(false);
  });
});

describe("RN04 — cascata de pausa e despublicação", () => {
  it("pausa apenas ofertas publicadas e as marca para despublicação", () => {
    const acoes = calcularCascata([
      { id: "of-1", status: "PUBLICADA" },
      { id: "of-2", status: "RASCUNHO" },
      { id: "of-3", status: "PAUSADA" },
      { id: "of-4", status: "PUBLICADA" },
      { id: "of-5", status: "EXPIRADA" },
    ]);
    expect(acoes).toEqual([
      { ofertaId: "of-1", novoStatus: "PAUSADA", marcarParaDespublicacao: true },
      { ofertaId: "of-4", novoStatus: "PAUSADA", marcarParaDespublicacao: true },
    ]);
  });

  it("sem ofertas publicadas, a cascata é vazia", () => {
    expect(calcularCascata([{ id: "of-1", status: "ENCERRADA" }])).toEqual([]);
    expect(calcularCascata([])).toEqual([]);
  });
});

describe("RN05 — nada é excluído após a primeira publicação", () => {
  it("permite exclusão física antes de qualquer publicação", () => {
    expect(podeExcluirFisicamente(false)).toBe(true);
  });

  it("bloqueia exclusão física após primeira publicação (soft-delete/status)", () => {
    expect(podeExcluirFisicamente(true)).toBe(false);
  });
});
