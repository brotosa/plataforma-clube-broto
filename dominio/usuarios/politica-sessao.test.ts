import { describe, expect, it } from "vitest";
import {
  POLITICA_SESSAO_PADRAO,
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
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MINIMO })).toEqual([]);
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MAXIMO })).toEqual([]);
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MINIMO - 1 })).toHaveLength(1);
    expect(validarPoliticaDeSessao({ tempoSessaoMin: TEMPO_SESSAO_MAXIMO + 1 })).toHaveLength(1);
  });

  it("recusa valor não inteiro", () => {
    expect(validarPoliticaDeSessao({ tempoSessaoMin: 12.5 })).toHaveLength(1);
  });

  it("converte minutos em milissegundos", () => {
    expect(tempoSessaoEmMs({ tempoSessaoMin: 30 })).toBe(30 * 60_000);
  });

  it("expira quando a inatividade ultrapassa o tempo tolerado", () => {
    const politica = { tempoSessaoMin: 30 };
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
    expect(descreverPolitica({ tempoSessaoMin: 20 })).toContain("20");
    expect(descreverPolitica({ tempoSessaoMin: 20 })).toMatch(/atividade/i);
  });
});
