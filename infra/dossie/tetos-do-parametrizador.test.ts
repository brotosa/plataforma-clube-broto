import { describe, expect, it } from "vitest";
import { type AmbienteDoDossie, lerConfiguracaoDossie } from "./configuracao";

/**
 * Conciliação F8 × F10: os tetos do dossiê podem vir do Parametrizador
 * (T17) ou do ambiente. A F8 já anunciava que "os valores dos tetos passam
 * a ser editáveis sem código no Parametrizador"; estes casos fixam a ordem
 * de precedência e garantem que a chave e as tarifas continuam sendo
 * exclusivamente de ambiente — segredo e conversão cambial da TI, não
 * parâmetro de produto.
 */

const AMBIENTE_COMPLETO: AmbienteDoDossie = {
  ANTHROPIC_API_KEY: "chave-de-teste",
  DOSSIE_TETO_MENSAL_BRL: "1000",
  DOSSIE_CUSTO_MAX_UNITARIO_BRL: "20",
  DOSSIE_CUSTO_ENTRADA_BRL_MTOK: "18",
  DOSSIE_CUSTO_SAIDA_BRL_MTOK: "90",
};

const SEM_TETOS: AmbienteDoDossie = {
  ...AMBIENTE_COMPLETO,
  DOSSIE_TETO_MENSAL_BRL: undefined,
  DOSSIE_CUSTO_MAX_UNITARIO_BRL: undefined,
};

describe("Tetos do dossiê — Parametrizador e ambiente", () => {
  it("o teto definido na T17 vence o do ambiente", () => {
    const estado = lerConfiguracaoDossie(AMBIENTE_COMPLETO, {
      mensalBrl: 2500,
      unitarioBrl: 30,
    });
    expect(estado.disponivel).toBe(true);
    if (!estado.disponivel) return;
    expect(estado.configuracao.tetos).toEqual({ mensalBrl: 2500, unitarioBrl: 30 });
  });

  it("sem teto na T17, o ambiente responde", () => {
    const estado = lerConfiguracaoDossie(AMBIENTE_COMPLETO, {
      mensalBrl: null,
      unitarioBrl: null,
    });
    expect(estado.disponivel).toBe(true);
    if (!estado.disponivel) return;
    expect(estado.configuracao.tetos).toEqual({ mensalBrl: 1000, unitarioBrl: 20 });
  });

  it("a T17 sozinha basta — o ambiente pode não ter teto nenhum", () => {
    const estado = lerConfiguracaoDossie(SEM_TETOS, { mensalBrl: 800, unitarioBrl: 15 });
    expect(estado.disponivel).toBe(true);
    if (!estado.disponivel) return;
    expect(estado.configuracao.tetos).toEqual({ mensalBrl: 800, unitarioBrl: 15 });
  });

  it("cada teto resolve o seu lado: um da T17, outro do ambiente", () => {
    const estado = lerConfiguracaoDossie(AMBIENTE_COMPLETO, {
      mensalBrl: 5000,
      unitarioBrl: null,
    });
    expect(estado.disponivel).toBe(true);
    if (!estado.disponivel) return;
    expect(estado.configuracao.tetos).toEqual({ mensalBrl: 5000, unitarioBrl: 20 });
  });

  it("sem teto em lugar nenhum, a geração automática segue indisponível", () => {
    const estado = lerConfiguracaoDossie(SEM_TETOS, { mensalBrl: null, unitarioBrl: null });
    expect(estado.disponivel).toBe(false);
    if (estado.disponivel) return;
    expect(estado.faltando).toEqual([
      "DOSSIE_TETO_MENSAL_BRL",
      "DOSSIE_CUSTO_MAX_UNITARIO_BRL",
    ]);
    // A mensagem aponta os DOIS caminhos quando só os tetos faltam.
    expect(estado.mensagem).toContain("Parametrizador");
  });

  it("faltando chave ou tarifa, a T17 não salva — a mensagem fala só do ambiente", () => {
    const estado = lerConfiguracaoDossie(
      { ...AMBIENTE_COMPLETO, ANTHROPIC_API_KEY: "" },
      { mensalBrl: 2500, unitarioBrl: 30 },
    );
    expect(estado.disponivel).toBe(false);
    if (estado.disponivel) return;
    expect(estado.faltando).toEqual(["ANTHROPIC_API_KEY"]);
    expect(estado.mensagem).not.toContain("Parametrizador");
  });

  it("teto do Parametrizador não substitui tarifa: sem tarifa não há custo apurável", () => {
    const estado = lerConfiguracaoDossie(
      { ...AMBIENTE_COMPLETO, DOSSIE_CUSTO_SAIDA_BRL_MTOK: undefined },
      { mensalBrl: 2500, unitarioBrl: 30 },
    );
    expect(estado.disponivel).toBe(false);
    if (estado.disponivel) return;
    expect(estado.faltando).toEqual(["DOSSIE_CUSTO_SAIDA_BRL_MTOK"]);
  });
});
