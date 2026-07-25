import { describe, expect, it } from "vitest";
import {
  chaveAgrupamento,
  inferirPrecos,
  mapearCheckout,
  mapearStatusOferta,
  normalizarTexto,
  validarLinhaOferta,
  validarLinhaSeller,
} from "./mapeamento";

describe("carga inicial — normalização e agrupamento (ficha §7)", () => {
  it("normaliza espaços múltiplos e bordas (dados reais têm ambos)", () => {
    expect(normalizarTexto("Cyan Analytics ")).toBe("Cyan Analytics");
    expect(normalizarTexto("Fundação de Estudos  Agrários  Luiz de Queiroz")).toBe(
      "Fundação de Estudos Agrários Luiz de Queiroz",
    );
    expect(normalizarTexto(null)).toBe("");
  });

  it("mesmo seller + mesmo texto de produto = mesma chave; textos distintos separam", () => {
    expect(chaveAgrupamento("abc", "Produto  X ")).toBe(chaveAgrupamento("abc", "Produto X"));
    expect(chaveAgrupamento("abc", "Produto X")).not.toBe(chaveAgrupamento("outro", "Produto X"));
    expect(chaveAgrupamento("abc", "Produto X")).not.toBe(chaveAgrupamento("abc", "Produto Y"));
  });
});

describe("carga inicial — CheckOut → mecânica + natureza", () => {
  it("mapeia os três valores reais da planilha", () => {
    expect(mapearCheckout("Checkout no clube")).toEqual({
      mecanicaSlug: "CHECKOUT_CLUBE",
      natureza: "BENEFICIO",
    });
    expect(mapearCheckout("Checkout externo")).toEqual({
      mecanicaSlug: "CHECKOUT_EXTERNO",
      natureza: "BENEFICIO",
    });
    expect(mapearCheckout("Recompensa gratuita")).toEqual({
      mecanicaSlug: "RECOMPENSA_GRATUITA",
      natureza: "RECOMPENSA",
    });
  });

  it("valor desconhecido vai para quarentena (null), nunca é adivinhado", () => {
    expect(mapearCheckout("PIX na entrega")).toBeNull();
    expect(mapearCheckout("")).toBeNull();
  });
});

describe("carga inicial — Status da Oferta", () => {
  it("Ativa → Publicada; Inativa → Encerrada", () => {
    expect(mapearStatusOferta("Oferta Ativa")).toBe("PUBLICADA");
    expect(mapearStatusOferta("Oferta Inativa")).toBe("ENCERRADA");
  });

  it("desconhecido → null (quarentena)", () => {
    expect(mapearStatusOferta("Rascunho")).toBeNull();
  });
});

describe("carga inicial — inferência de tipo de benefício e preços", () => {
  it("recompensa → gratuidade com preços zerados (mesmo quando a planilha traz preço)", () => {
    // Caso real: Recompensa com preço 109,90 e desconto 109,90 (final 0)
    expect(
      inferirPrecos({ natureza: "RECOMPENSA", preco: 109.9, desconto: 109.9, precoFinal: 0 }),
    ).toEqual({ tipoBeneficioSlug: "GRATUIDADE", precoDe: null, precoPor: null });
  });

  it("benefício com desconto informado → valor fixo com preço de/por", () => {
    expect(
      inferirPrecos({ natureza: "BENEFICIO", preco: 200, desconto: 50, precoFinal: 150 }),
    ).toEqual({ tipoBeneficioSlug: "VALOR_FIXO", precoDe: 200, precoPor: 150 });
  });

  it("benefício sem números → condição especial com preços pendentes", () => {
    expect(
      inferirPrecos({ natureza: "BENEFICIO", preco: 0, desconto: 0, precoFinal: 0 }),
    ).toEqual({ tipoBeneficioSlug: "CONDICAO_ESPECIAL", precoDe: null, precoPor: null });
  });
});

describe("carga inicial — validação de linhas (quarentena com motivo)", () => {
  const sellers = new Set(["id-1"]);

  it("linha de seller completa passa; ausências geram motivos", () => {
    expect(
      validarLinhaSeller({ linha: 2, idSellerExterno: "id-1", nomeSeller: "Nome", dataEntrada: new Date() }),
    ).toEqual([]);
    expect(
      validarLinhaSeller({ linha: 3, idSellerExterno: "", nomeSeller: "", dataEntrada: null }),
    ).toHaveLength(2);
  });

  it("oferta com seller desconhecido, checkout ou status inválidos vai para quarentena", () => {
    const base = {
      linha: 2,
      idSellerExterno: "id-1",
      nomeSeller: "Nome",
      idOfertaExterno: "of-1",
      statusOferta: "Oferta Ativa",
      produto: "Produto X",
      checkout: "Checkout no clube",
      preco: 0,
      desconto: 0,
      precoFinal: 0,
      dataOferta: new Date(),
      resgates: 0,
      compras: 0,
    };
    expect(validarLinhaOferta(base, sellers)).toEqual([]);
    expect(
      validarLinhaOferta({ ...base, idSellerExterno: "desconhecido" }, sellers),
    ).toContain('"Id do Seller" não consta na Lista de Sellers');
    expect(validarLinhaOferta({ ...base, checkout: "???" }, sellers)).toContain(
      '"CheckOut" desconhecido: "???"',
    );
    expect(validarLinhaOferta({ ...base, statusOferta: "???" }, sellers)).toContain(
      '"Status da Oferta" desconhecido: "???"',
    );
    expect(validarLinhaOferta({ ...base, dataOferta: null }, sellers)).toContain(
      '"Data da Oferta" ausente (vira o início de vigência)',
    );
  });
});
