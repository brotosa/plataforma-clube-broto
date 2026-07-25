import { EstagioEmpresa, StatusOferta } from "@prisma/client";
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

  it("qualquer estágio que não seja Aliada ativa bloqueia — inclusive futuros (Parametrizador)", () => {
    // Varre todos os estágios conhecidos do enum; se o Parametrizador
    // introduzir um novo estágio, ele nasce bloqueado até decisão explícita.
    for (const estagio of Object.values(EstagioEmpresa)) {
      expect(podeCriarSolucao(estagio)).toBe(estagio === "ALIADA_ATIVA");
    }
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

  it("nenhum status diferente de Publicada é afetado (varredura completa do enum)", () => {
    for (const status of Object.values(StatusOferta)) {
      if (status === "PUBLICADA") continue;
      expect(calcularCascata([{ id: "of", status }])).toEqual([]);
    }
  });

  it("re-disparar sobre ofertas já pausadas não gera nova ação (idempotência)", () => {
    // Estado após uma primeira cascata: as antes publicadas já estão PAUSADA.
    // Um novo disparo (ex.: nova suspensão) não deve repausá-las.
    expect(
      calcularCascata([
        { id: "of-1", status: "PAUSADA" },
        { id: "of-2", status: "PAUSADA" },
      ]),
    ).toEqual([]);
  });
});

describe("RN05 — nada é excluído após a primeira publicação", () => {
  it("permite exclusão física antes de qualquer publicação", () => {
    expect(podeExcluirFisicamente(false)).toBe(true);
  });

  it("bloqueia exclusão física após primeira publicação (soft-delete/status)", () => {
    expect(podeExcluirFisicamente(true)).toBe(false);
  });

  it("'já publicada' é histórico (já foi ao ar), não o status atual", () => {
    // O parâmetro é 'jaFoiPublicada', não 'está publicada agora': uma oferta
    // hoje Pausada/Expirada/Encerrada que já foi ao ar continua protegida.
    // A ausência de qualquer caminho de remoção física em produção é garantida
    // pelo teste de arquitetura em infra/arquitetura/imutabilidade.test.ts.
    expect(podeExcluirFisicamente(true)).toBe(false);
  });
});
