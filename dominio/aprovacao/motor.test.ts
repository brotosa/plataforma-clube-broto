import { describe, expect, it } from "vitest";
import { exigeAprovacao, validarDecisao } from "./motor";

describe("RN06 — porta do motor de aprovação", () => {
  it("regra ligada exige aprovação; desligada dá efeito direto", () => {
    expect(exigeAprovacao({ exigida: true, aprovadoresDesignados: [] })).toBe(true);
    expect(exigeAprovacao({ exigida: false, aprovadoresDesignados: [] })).toBe(false);
  });
});

describe("RN06 — decisão sobre solicitações", () => {
  const solicitacaoDeAna = { estado: "SOLICITADA" as const, solicitanteId: "usr-ana" };
  const regraSemDesignados = { exigida: true, aprovadoresDesignados: [] };

  it("aprovação por usuário distinto é válida (sem comentário obrigatório)", () => {
    expect(
      validarDecisao({
        solicitacao: solicitacaoDeAna,
        regra: regraSemDesignados,
        decisorId: "usr-bruno",
        decisao: "APROVADA",
        comentario: null,
      }),
    ).toEqual([]);
  });

  it("solicitante não decide o próprio item (segregação)", () => {
    expect(
      validarDecisao({
        solicitacao: solicitacaoDeAna,
        regra: regraSemDesignados,
        decisorId: "usr-ana",
        decisao: "APROVADA",
        comentario: null,
      }),
    ).toContain("Quem solicita não aprova o próprio item (RN06 — segregação de funções).");
  });

  it("devolução exige comentário", () => {
    expect(
      validarDecisao({
        solicitacao: solicitacaoDeAna,
        regra: regraSemDesignados,
        decisorId: "usr-bruno",
        decisao: "DEVOLVIDA",
        comentario: "   ",
      }),
    ).toContain("Devolução exige comentário (RN06).");
    expect(
      validarDecisao({
        solicitacao: solicitacaoDeAna,
        regra: regraSemDesignados,
        decisorId: "usr-bruno",
        decisao: "DEVOLVIDA",
        comentario: "Faltou o contrato anexado.",
      }),
    ).toEqual([]);
  });

  it("com aprovadores designados, somente eles decidem", () => {
    const regra = { exigida: true, aprovadoresDesignados: ["usr-carla"] };
    expect(
      validarDecisao({
        solicitacao: solicitacaoDeAna,
        regra,
        decisorId: "usr-bruno",
        decisao: "APROVADA",
        comentario: null,
      }),
    ).toContain("Decisor não está entre os aprovadores designados para esta regra.");
    expect(
      validarDecisao({
        solicitacao: solicitacaoDeAna,
        regra,
        decisorId: "usr-carla",
        decisao: "APROVADA",
        comentario: null,
      }),
    ).toEqual([]);
  });

  it("solicitação já decidida não pode ser decidida de novo", () => {
    expect(
      validarDecisao({
        solicitacao: { estado: "APROVADA", solicitanteId: "usr-ana" },
        regra: regraSemDesignados,
        decisorId: "usr-bruno",
        decisao: "APROVADA",
        comentario: null,
      }),
    ).toContain("Somente solicitações pendentes (Solicitada) podem ser decididas.");
  });
});
