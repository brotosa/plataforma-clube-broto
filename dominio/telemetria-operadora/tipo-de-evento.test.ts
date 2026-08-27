import { describe, expect, it } from "vitest";

import {
  classificarEvento,
  modalidadeDeResgate,
  VALORES_CONHECIDOS_DE_TIPO_DE_OFERTA,
} from "./tipo-de-evento";

/**
 * O de-para da coluna `Tipo de Oferta` — item 4 da requisição de 27/07,
 * `[A CONFIRMAR — Minutrade]`.
 *
 * Os três valores foram observados na coluna; o que falta é o dicionário
 * que diz o que cada um significa na contagem da operadora. Estes testes
 * fixam a leitura adotada, para que corrigi-la quando o dicionário chegar
 * seja uma edição visível — e não uma descoberta.
 *
 * **Decisão do Administrador da Plataforma (28/08): checkout é modalidade
 * de resgate.** Os três valores passam a ser RESGATE; a diferença entre
 * eles vira `modalidade`, preservada para não perder COMO foi resgatado.
 */

describe("classificação do evento nominal (RN65/RN69)", () => {
  it("Recompensa gratuita é resgate", () => {
    expect(classificarEvento("Recompensa gratuita")).toBe("RESGATE");
  });

  it("os dois checkouts também são resgate — checkout é modalidade, não categoria à parte", () => {
    expect(classificarEvento("Checkout no clube")).toBe("RESGATE");
    expect(classificarEvento("Checkout externo")).toBe("RESGATE");
  });

  it("emissao_voucher é resgate (decisão do Gestor, 26/08) — com variantes", () => {
    // O arquivo real de "Resgate e Compras" traz `emissao_voucher` na coluna
    // Tipo de Oferta; no contexto do relatório, representa resgate.
    expect(classificarEvento("emissao_voucher")).toBe("RESGATE");
    expect(classificarEvento("Emissao de Voucher")).toBe("RESGATE");
    expect(classificarEvento("emissão voucher")).toBe("RESGATE");
  });

  it("tolera caixa, acento e espaço repetido, como o resto do parser", () => {
    expect(classificarEvento("CHECKOUT NO CLUBE")).toBe("RESGATE");
    expect(classificarEvento("  recompensa   gratuita  ")).toBe("RESGATE");
  });

  it("valor ausente não vira resgate", () => {
    expect(classificarEvento(null)).toBe("NAO_CLASSIFICADO");
    expect(classificarEvento("")).toBe("NAO_CLASSIFICADO");
  });

  it("valor novo da operadora NÃO é encaixado no palpite mais provável", () => {
    // Encaixar "Checkout parcelado" em resgate por conter "checkout"
    // inventaria dado de negócio — a decisão é da operadora (item 4).
    expect(classificarEvento("Checkout parcelado")).toBe("NAO_CLASSIFICADO");
    expect(classificarEvento("Assinatura recorrente")).toBe("NAO_CLASSIFICADO");
  });

  it("não casa por substring — é valor inteiro ou nada", () => {
    expect(classificarEvento("checkout")).toBe("NAO_CLASSIFICADO");
    expect(classificarEvento("recompensa")).toBe("NAO_CLASSIFICADO");
  });

  it("os valores conhecidos classificam, e são exatamente quatro", () => {
    expect(VALORES_CONHECIDOS_DE_TIPO_DE_OFERTA).toHaveLength(4);
    for (const valor of VALORES_CONHECIDOS_DE_TIPO_DE_OFERTA) {
      expect(classificarEvento(valor)).not.toBe("NAO_CLASSIFICADO");
    }
  });
});

describe("modalidade de resgate (RN65) — o COMO, preservado", () => {
  it("Recompensa gratuita e emissao_voucher são a modalidade gratuita", () => {
    expect(modalidadeDeResgate("Recompensa gratuita")).toBe("GRATUITO");
    expect(modalidadeDeResgate("emissao_voucher")).toBe("GRATUITO");
    expect(modalidadeDeResgate("Emissao de Voucher")).toBe("GRATUITO");
  });

  it("os dois checkouts têm modalidade própria — ONDE foi resgatado", () => {
    expect(modalidadeDeResgate("Checkout no clube")).toBe("CHECKOUT_CLUBE");
    expect(modalidadeDeResgate("Checkout externo")).toBe("CHECKOUT_EXTERNO");
  });

  it("valor desconhecido não tem modalidade — null, nunca palpite", () => {
    expect(modalidadeDeResgate("Checkout parcelado")).toBeNull();
    expect(modalidadeDeResgate(null)).toBeNull();
    expect(modalidadeDeResgate("")).toBeNull();
  });
});
