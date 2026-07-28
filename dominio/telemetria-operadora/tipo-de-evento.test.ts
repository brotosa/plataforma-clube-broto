import { describe, expect, it } from "vitest";

import {
  classificarEvento,
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
 */

describe("classificação do evento nominal (RN65/RN69)", () => {
  it("Recompensa gratuita é resgate", () => {
    expect(classificarEvento("Recompensa gratuita")).toBe("RESGATE");
  });

  it("os dois checkouts são compra — a diferença é ONDE, não SE houve pagamento", () => {
    expect(classificarEvento("Checkout no clube")).toBe("COMPRA");
    expect(classificarEvento("Checkout externo")).toBe("COMPRA");
  });

  it("tolera caixa, acento e espaço repetido, como o resto do parser", () => {
    expect(classificarEvento("CHECKOUT NO CLUBE")).toBe("COMPRA");
    expect(classificarEvento("  recompensa   gratuita  ")).toBe("RESGATE");
  });

  it("valor ausente não vira nem compra nem resgate", () => {
    expect(classificarEvento(null)).toBe("NAO_CLASSIFICADO");
    expect(classificarEvento("")).toBe("NAO_CLASSIFICADO");
  });

  it("valor novo da operadora NÃO é encaixado no palpite mais provável", () => {
    // Encaixar "Checkout parcelado" em compra por conter "checkout"
    // inventaria dado de negócio — a decisão é da operadora (item 4).
    expect(classificarEvento("Checkout parcelado")).toBe("NAO_CLASSIFICADO");
    expect(classificarEvento("Assinatura recorrente")).toBe("NAO_CLASSIFICADO");
  });

  it("não casa por substring — é valor inteiro ou nada", () => {
    expect(classificarEvento("checkout")).toBe("NAO_CLASSIFICADO");
    expect(classificarEvento("recompensa")).toBe("NAO_CLASSIFICADO");
  });

  it("os três valores conhecidos classificam, e são exatamente três", () => {
    expect(VALORES_CONHECIDOS_DE_TIPO_DE_OFERTA).toHaveLength(3);
    for (const valor of VALORES_CONHECIDOS_DE_TIPO_DE_OFERTA) {
      expect(classificarEvento(valor)).not.toBe("NAO_CLASSIFICADO");
    }
  });
});
