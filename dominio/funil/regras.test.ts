import { describe, expect, it } from "vitest";
import {
  acaoParaMoverNoFunil,
  destinosDeMovimentoManual,
  diasNoEstagio,
  ESTAGIOS_FUNIL,
  nivelEnvelhecimento,
  podeDescartarNoFunil,
  podeMoverNoFunil,
  rotuloTempoNoEstagio,
  validarDescarte,
  validarEntradaNoRadar,
} from "./regras";
import type { ReguaEnvelhecimento } from "./regras";

/** Régua vigente na implantação (14/30), hoje um valor do Parametrizador. */
const REGUA_DE_IMPLANTACAO: ReguaEnvelhecimento = { leveDias: 14, forteDias: 30 };

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
    expect(nivelEnvelhecimento(null, REGUA_DE_IMPLANTACAO)).toBeNull();
    expect(rotuloTempoNoEstagio(null)).toBe("—");
  });

  it("aplica a régua leve/forte nos limiares exatos", () => {
    const { leveDias, forteDias } = REGUA_DE_IMPLANTACAO;
    expect(nivelEnvelhecimento(leveDias - 1, REGUA_DE_IMPLANTACAO)).toBeNull();
    expect(nivelEnvelhecimento(leveDias, REGUA_DE_IMPLANTACAO)).toBe("LEVE");
    expect(nivelEnvelhecimento(forteDias - 1, REGUA_DE_IMPLANTACAO)).toBe("LEVE");
    expect(nivelEnvelhecimento(forteDias, REGUA_DE_IMPLANTACAO)).toBe("FORTE");
  });

  // F10 — a régua deixou de ser constante: o Parametrizador a altera e o
  // funil passa a marcar por ela na leitura seguinte, sem deploy.
  it("uma régua nova muda o alerta vivo, sem tocar em nada gravado", () => {
    const encurtada = { leveDias: 5, forteDias: 10 };
    expect(nivelEnvelhecimento(7, REGUA_DE_IMPLANTACAO)).toBeNull();
    expect(nivelEnvelhecimento(7, encurtada)).toBe("LEVE");
    expect(nivelEnvelhecimento(12, REGUA_DE_IMPLANTACAO)).toBeNull();
    expect(nivelEnvelhecimento(12, encurtada)).toBe("FORTE");
  });

  it('escreve "há N dias" como texto, com singular e "hoje"', () => {
    expect(rotuloTempoNoEstagio(0)).toBe("hoje");
    expect(rotuloTempoNoEstagio(1)).toBe("há 1 dia");
    expect(rotuloTempoNoEstagio(15)).toBe("há 15 dias");
  });
});

// ---------------------------------------------------------------------
// RN57 (F15) — arrastar não cria caminho de decisão
// ---------------------------------------------------------------------

describe("RN57 — quem pode mover o quê, para onde", () => {
  it("a ação exigida por destino é a mesma que o caso de uso já usava", () => {
    // Se estas três linhas mudarem sem que o caso de uso mude junto, a T8
    // passa a oferecer (ou negar) um arrasto que o servidor decide ao
    // contrário — que é exatamente a divergência que a RN57 proíbe.
    expect(acaoParaMoverNoFunil("PRIORIZADA")).toBe("PRIORIZAR");
    expect(acaoParaMoverNoFunil("EM_AVALIACAO")).toBe("ASSUMIR_E_AVALIAR");
    expect(acaoParaMoverNoFunil("MAPEADA")).toBe("ASSUMIR_E_AVALIAR");
    expect(acaoParaMoverNoFunil("EM_NEGOCIACAO")).toBe("ASSUMIR_NEGOCIACAO");
  });

  it("destino fora do pipeline não é aceito, nem para papel com todas as permissões", () => {
    // Gestor tem tudo; ainda assim o grafo manda. Permissão não cria
    // transição que o pipeline não tem.
    expect(podeMoverNoFunil("GESTOR", "MAPEADA", "EM_NEGOCIACAO")).toBe(false);
    expect(podeMoverNoFunil("GESTOR", "MAPEADA", "EM_AVALIACAO")).toBe(true);
  });

  it("Em aprovação não cede card por arrasto — o motor a governa", () => {
    for (const destino of ["MAPEADA", "EM_AVALIACAO", "PRIORIZADA", "EM_NEGOCIACAO"] as const) {
      expect(podeMoverNoFunil("GESTOR", "EM_APROVACAO", destino)).toBe(false);
    }
  });

  it("Em aprovação também não RECEBE card por arrasto", () => {
    for (const origem of ["MAPEADA", "EM_AVALIACAO", "PRIORIZADA", "EM_NEGOCIACAO"] as const) {
      expect(podeMoverNoFunil("GESTOR", origem, "EM_APROVACAO")).toBe(false);
    }
  });

  it("papel sem a ação não move, mesmo com a transição válida no pipeline", () => {
    expect(destinosDeMovimentoManual("EM_AVALIACAO")).toContain("PRIORIZADA");
    expect(podeMoverNoFunil("LEITURA", "EM_AVALIACAO", "PRIORIZADA")).toBe(false);
    expect(podeMoverNoFunil("GESTOR", "EM_AVALIACAO", "PRIORIZADA")).toBe(true);
  });

  it("handoff aceita as duas formas do ato (assumir para si ou designar)", () => {
    // RN16: qual das duas vale é decidido no servidor, com o responsável
    // já escolhido. Para saber se o card é arrastável, basta ter uma.
    expect(podeMoverNoFunil("COMERCIAL", "PRIORIZADA", "EM_NEGOCIACAO")).toBe(true);
    expect(podeMoverNoFunil("GESTOR", "PRIORIZADA", "EM_NEGOCIACAO")).toBe(true);
    expect(podeMoverNoFunil("LEITURA", "PRIORIZADA", "EM_NEGOCIACAO")).toBe(false);
  });
});

describe("RN57 — descarte por arrasto obedece à mesma regra do menu", () => {
  it("o time de scout descarta em qualquer estágio do funil que governa", () => {
    for (const estagio of ["MAPEADA", "EM_AVALIACAO", "PRIORIZADA", "EM_NEGOCIACAO"] as const) {
      expect(podeDescartarNoFunil("ANALISTA_SCOUT", estagio)).toBe(true);
    }
  });

  it("o comercial descarta apenas o que está em negociação", () => {
    expect(podeDescartarNoFunil("COMERCIAL", "EM_NEGOCIACAO")).toBe(true);
    expect(podeDescartarNoFunil("COMERCIAL", "MAPEADA")).toBe(false);
    expect(podeDescartarNoFunil("COMERCIAL", "PRIORIZADA")).toBe(false);
  });

  it("papel de leitura não descarta nada", () => {
    for (const estagio of ["MAPEADA", "EM_AVALIACAO", "PRIORIZADA", "EM_NEGOCIACAO"] as const) {
      expect(podeDescartarNoFunil("LEITURA", estagio)).toBe(false);
    }
  });

  it("Em aprovação e Descartada não descartam por arrasto", () => {
    expect(podeDescartarNoFunil("GESTOR", "EM_APROVACAO")).toBe(false);
    expect(podeDescartarNoFunil("GESTOR", "DESCARTADA")).toBe(false);
  });
});
