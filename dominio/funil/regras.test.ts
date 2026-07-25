import { describe, expect, it } from "vitest";
import {
  destinosDeMovimentoManual,
  diasNoEstagio,
  ESTAGIOS_FUNIL,
  nivelEnvelhecimento,
  REGUA_ENVELHECIMENTO,
  rotuloTempoNoEstagio,
  validarDescarte,
  validarEntradaNoRadar,
} from "./regras";

describe("RN13 — entrada no radar exige origem e ≥1 categoria-alvo", () => {
  it("aceita entrada com nome, origem e uma categoria-alvo", () => {
    expect(
      validarEntradaNoRadar({
        nomeFantasia: "Empresa do Radar",
        origem: "INDICACAO",
        quantidadeCategoriasAlvo: 1,
      }),
    ).toEqual([]);
  });

  it("rejeita entrada sem origem", () => {
    expect(
      validarEntradaNoRadar({
        nomeFantasia: "Empresa do Radar",
        origem: null,
        quantidadeCategoriasAlvo: 2,
      }),
    ).toContain("Entrada no radar exige origem (RN13).");
  });

  it("rejeita entrada sem categoria-alvo", () => {
    expect(
      validarEntradaNoRadar({
        nomeFantasia: "Empresa do Radar",
        origem: "SCOUTING_ATIVO",
        quantidadeCategoriasAlvo: 0,
      }),
    ).toContain("Entrada no radar exige ao menos uma categoria-alvo (RN13).");
  });

  it("rejeita entrada sem nome (empresa não identificável)", () => {
    expect(
      validarEntradaNoRadar({
        nomeFantasia: "   ",
        origem: "PROCURA_ESPONTANEA",
        quantidadeCategoriasAlvo: 1,
      }),
    ).toContain("Nome da empresa é obrigatório.");
  });
});

describe("RN17 — descarte exige motivo tipificado", () => {
  it("aceita descarte com motivo tipificado", () => {
    expect(validarDescarte({ motivoSlug: "SEM_RESPOSTA", descricao: null })).toEqual([]);
  });

  it("rejeita descarte sem motivo", () => {
    expect(validarDescarte({ motivoSlug: null, descricao: "qualquer" })).toContain(
      "Descarte exige motivo tipificado (RN17).",
    );
  });

  it('exige descrição quando o motivo é "OUTRO"', () => {
    expect(validarDescarte({ motivoSlug: "OUTRO", descricao: "  " })).toContain(
      'O motivo "Outro" exige descrição (RN17).',
    );
    expect(
      validarDescarte({ motivoSlug: "OUTRO", descricao: "Fora da tese do clube" }),
    ).toEqual([]);
  });
});

describe("menu de movimentação manual (T8)", () => {
  it("segue o pipeline nas lanes do funil", () => {
    expect(destinosDeMovimentoManual("MAPEADA")).toEqual(["EM_AVALIACAO"]);
    expect(destinosDeMovimentoManual("EM_AVALIACAO")).toEqual(["MAPEADA", "PRIORIZADA"]);
    expect(destinosDeMovimentoManual("PRIORIZADA")).toEqual(["EM_AVALIACAO", "EM_NEGOCIACAO"]);
  });

  it("não oferece EM_APROVACAO (alcançada só pelo pedido ao motor, RN06/RN20)", () => {
    expect(destinosDeMovimentoManual("EM_NEGOCIACAO")).toEqual(["PRIORIZADA"]);
    expect(destinosDeMovimentoManual("EM_APROVACAO")).toEqual([]);
  });

  it("não oferece DESCARTADA (ação própria com motivo tipificado, RN17)", () => {
    for (const estagio of ESTAGIOS_FUNIL) {
      expect(destinosDeMovimentoManual(estagio)).not.toContain("DESCARTADA");
    }
  });
});

describe("régua de envelhecimento 14/30 (constante nomeada)", () => {
  const referencia = new Date("2026-07-25T12:00:00Z");
  const diasAtras = (dias: number) =>
    new Date(referencia.getTime() - dias * 24 * 60 * 60 * 1000);

  it("conta dias completos no estágio", () => {
    expect(diasNoEstagio(diasAtras(0), referencia)).toBe(0);
    expect(diasNoEstagio(diasAtras(1), referencia)).toBe(1);
    expect(diasNoEstagio(diasAtras(29), referencia)).toBe(29);
  });

  it("sem data de início (anterior ao rastreamento) não estima: null e rótulo —", () => {
    expect(diasNoEstagio(null, referencia)).toBeNull();
    expect(nivelEnvelhecimento(null)).toBeNull();
    expect(rotuloTempoNoEstagio(null)).toBe("—");
  });

  it("aplica a régua leve/forte nos limiares exatos", () => {
    expect(nivelEnvelhecimento(REGUA_ENVELHECIMENTO.leveDias - 1)).toBeNull();
    expect(nivelEnvelhecimento(REGUA_ENVELHECIMENTO.leveDias)).toBe("LEVE");
    expect(nivelEnvelhecimento(REGUA_ENVELHECIMENTO.forteDias - 1)).toBe("LEVE");
    expect(nivelEnvelhecimento(REGUA_ENVELHECIMENTO.forteDias)).toBe("FORTE");
  });

  it('escreve "há N dias" como texto, com singular e "hoje"', () => {
    expect(rotuloTempoNoEstagio(0)).toBe("hoje");
    expect(rotuloTempoNoEstagio(1)).toBe("há 1 dia");
    expect(rotuloTempoNoEstagio(15)).toBe("há 15 dias");
  });
});
