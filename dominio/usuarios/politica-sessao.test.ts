import { describe, expect, it } from "vitest";
import {
  POLITICA_SESSAO_PADRAO,
  TETO_MAXIMO,
  sessaoEstourouTeto,
  TEMPO_SESSAO_MAXIMO,
  TEMPO_SESSAO_MINIMO,
  descreverPolitica,
  sessaoExpirouPorInatividade,
  tempoSessaoEmMs,
  validarPoliticaDeSessao,
} from "./politica-sessao";

describe("política de sessão (Configurações)", () => {
  it("o padrão do domínio é 30 minutos", () => {
    expect(POLITICA_SESSAO_PADRAO.tempoSessaoMin).toBe(30);
    expect(validarPoliticaDeSessao(POLITICA_SESSAO_PADRAO)).toEqual([]);
  });

  it("aceita valores dentro da faixa e recusa fora dela", () => {
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MINIMO, tetoMin: 0 })).toEqual([]);
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MAXIMO, tetoMin: 0 })).toEqual([]);
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MINIMO - 1, tetoMin: 0 })).toHaveLength(1);
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MAXIMO + 1, tetoMin: 0 })).toHaveLength(1);
  });

  it("recusa valor não inteiro", () => {
    expect(validarPoliticaDeSessao({ tempoSessaoMin: 12.5, tetoMin: 0 })).toHaveLength(1);
  });

  it("converte minutos em milissegundos", () => {
    expect(tempoSessaoEmMs({ tempoSessaoMin: 30, tetoMin: 0 })).toBe(30 * 60_000);
  });

  it("expira quando a inatividade ultrapassa o tempo tolerado", () => {
    const politica = { tempoSessaoMin: 30, tetoMin: 0 };
    const agora = 1_000_000_000;
    const dentro = agora - 29 * 60_000;
    const noLimite = agora - 30 * 60_000;
    const alem = agora - 31 * 60_000;
    expect(sessaoExpirouPorInatividade(dentro, agora, politica)).toBe(false);
    // Exatamente no teto ainda não expirou (estritamente maior).
    expect(sessaoExpirouPorInatividade(noLimite, agora, politica)).toBe(false);
    expect(sessaoExpirouPorInatividade(alem, agora, politica)).toBe(true);
  });

  it("sessão sem marca de atividade (token antigo) não expira por inatividade", () => {
    expect(sessaoExpirouPorInatividade(undefined, Date.now(), POLITICA_SESSAO_PADRAO)).toBe(false);
    expect(sessaoExpirouPorInatividade(Number.NaN, Date.now(), POLITICA_SESSAO_PADRAO)).toBe(false);
  });

  it("descreve a política de forma legível", () => {
    expect(descreverPolitica({ tempoSessaoMin: 20, tetoMin: 0 })).toContain("20");
    expect(descreverPolitica({ tempoSessaoMin: 20, tetoMin: 0 })).toMatch(/atividade/i);
  });
});

describe("teto absoluto e desligamento (tudo configurável)", () => {
  const AGORA = 1_000_000_000;
  const MIN = 60_000;

  it("0 desliga a expiração por inatividade — nem com dias parada a sessão cai", () => {
    const desligada = { tempoSessaoMin: 0, tetoMin: 0 };
    expect(validarPoliticaDeSessao(desligada)).toEqual([]);
    expect(sessaoExpirouPorInatividade(AGORA - 10 * 24 * 60 * MIN, AGORA, desligada)).toBe(false);
  });

  it("0 desliga o teto absoluto", () => {
    expect(sessaoEstourouTeto(AGORA - 99 * 60 * MIN, AGORA, { tempoSessaoMin: 30, tetoMin: 0 })).toBe(
      false,
    );
  });

  it("o teto derruba a sessão mesmo com uso contínuo", () => {
    const politica = { tempoSessaoMin: 30, tetoMin: 60 };
    // Atividade agorinha, mas logada há 61 minutos.
    expect(sessaoExpirouPorInatividade(AGORA, AGORA, politica)).toBe(false);
    expect(sessaoEstourouTeto(AGORA - 61 * MIN, AGORA, politica)).toBe(true);
    // No limite ainda não estourou (estritamente maior).
    expect(sessaoEstourouTeto(AGORA - 60 * MIN, AGORA, politica)).toBe(false);
  });

  it("token sem marca de início (emitido antes desta fase) não estoura o teto", () => {
    expect(sessaoEstourouTeto(undefined, AGORA, { tempoSessaoMin: 30, tetoMin: 60 })).toBe(false);
  });

  it("recusa teto fora da faixa e teto menor que a inatividade", () => {
    expect(validarPoliticaDeSessao({ tempoSessaoMin: 30, tetoMin: 5 })).toHaveLength(1);
    expect(validarPoliticaDeSessao({ tempoSessaoMin: 30, tetoMin: TETO_MAXIMO + 1 })).toHaveLength(1);
    // Teto de 30 com inatividade de 60: o teto cairia antes da janela contar.
    expect(validarPoliticaDeSessao({ tempoSessaoMin: 60, tetoMin: 30 })).toHaveLength(1);
  });

  it("descreve os dois estados — ligado e desligado", () => {
    expect(descreverPolitica({ tempoSessaoMin: 0, tetoMin: 0 })).toMatch(/desligad/i);
    expect(descreverPolitica({ tempoSessaoMin: 30, tetoMin: 120 })).toContain("120");
  });
});
