import { describe, expect, it } from "vitest";
import {
  COLUNAS_OFERTA,
  linhaOfertaPronta,
  parseData,
  parseNumero,
  validarLinhaOferta,
  validarLoteOfertas,
  type ContextoValidacaoOferta,
  type LinhaOfertaCrua,
} from "./ofertas";

function ctxBase(): ContextoValidacaoOferta {
  return {
    tiposBeneficio: [
      { id: "tb-fixo", nome: "Valor fixo", slug: "VALOR_FIXO" },
      { id: "tb-grat", nome: "Gratuidade", slug: "GRATUIDADE" },
      { id: "tb-pct", nome: "Percentual de desconto", slug: "PCT_DESCONTO" },
    ],
    mecanicas: [{ id: "mec-checkout", nome: "Checkout no clube", slug: "CHECKOUT" }],
    solucaoIds: new Set(["sol-1"]),
    ofertaIds: new Set(["of-1"]),
    idsExternosEmUso: new Map(),
  };
}

function linha(valores: Partial<Record<string, string>>, n = 2): LinhaOfertaCrua {
  const base: Record<string, string> = {
    [COLUNAS_OFERTA.idOferta]: "",
    [COLUNAS_OFERTA.idSolucao]: "sol-1",
    [COLUNAS_OFERTA.titulo]: "Oferta X",
    [COLUNAS_OFERTA.natureza]: "Benefício",
    [COLUNAS_OFERTA.tipoBeneficio]: "Valor fixo",
    [COLUNAS_OFERTA.mecanica]: "Checkout no clube",
    [COLUNAS_OFERTA.precoDe]: "11,90",
    [COLUNAS_OFERTA.precoPor]: "10,11",
    [COLUNAS_OFERTA.modalidade]: "Única",
    [COLUNAS_OFERTA.vigenciaInicio]: "05/08/2026",
  };
  return { linha: n, valores: { ...base, ...valores } as Record<string, string> };
}

describe("parsers auxiliares", () => {
  it("parseNumero entende pt-BR e vazio", () => {
    expect(parseNumero("11,90")).toBe(11.9);
    expect(parseNumero("1.234,56")).toBe(1234.56);
    expect(parseNumero("R$ 10.00")).toBe(10);
    expect(parseNumero("")).toBeNull();
    expect(parseNumero("abc")).toBeNull(); // sem dígito = sem valor
    expect(Number.isNaN(parseNumero("1.2.3") as number)).toBe(true); // dígitos, mas não é número
  });

  it("parseData entende dd/mm/aaaa e ISO", () => {
    expect(parseData("05/08/2026")?.toISOString().slice(0, 10)).toBe("2026-08-05");
    expect(parseData("2026-08-05")?.toISOString().slice(0, 10)).toBe("2026-08-05");
    expect(parseData("")).toBeNull();
    expect(parseData("31/31/2026")).toBeUndefined();
  });
});

describe("validarLinhaOferta — caminho feliz", () => {
  it("linha válida de Benefício resolve CRIAR com campos mapeados", () => {
    const r = validarLinhaOferta(linha({}), ctxBase());
    expect(r.pendencias).toEqual([]);
    expect(r.acao).toBe("CRIAR");
    expect(r.solucaoId).toBe("sol-1");
    expect(r.campos.natureza).toBe("BENEFICIO");
    expect(r.campos.tipoBeneficioId).toBe("tb-fixo");
    expect(r.campos.mecanicaId).toBe("mec-checkout");
    expect(r.campos.precoDe).toBe(11.9);
    expect(r.campos.modalidadePagamento).toBe("UNICA");
    expect(r.campos.vigenciaInicio?.toISOString().slice(0, 10)).toBe("2026-08-05");
  });

  it("ID Oferta existente resolve ENRIQUECER", () => {
    const r = validarLinhaOferta(linha({ [COLUNAS_OFERTA.idOferta]: "of-1" }), ctxBase());
    expect(r.acao).toBe("ENRIQUECER");
    expect(r.ofertaId).toBe("of-1");
    expect(r.pendencias).toEqual([]);
  });
});

describe("validarLinhaOferta — pendências", () => {
  function colunas(valores: Partial<Record<string, string>>) {
    return validarLinhaOferta(linha(valores), ctxBase()).pendencias.map((p) => p.coluna);
  }

  it("ID Solução ausente", () => {
    expect(colunas({ [COLUNAS_OFERTA.idSolucao]: "" })).toContain(COLUNAS_OFERTA.idSolucao);
  });
  it("ID Solução inexistente", () => {
    expect(colunas({ [COLUNAS_OFERTA.idSolucao]: "sol-zzz" })).toContain(COLUNAS_OFERTA.idSolucao);
  });
  it("ID Oferta inexistente", () => {
    expect(colunas({ [COLUNAS_OFERTA.idOferta]: "of-zzz" })).toContain(COLUNAS_OFERTA.idOferta);
  });
  it("título ausente", () => {
    expect(colunas({ [COLUNAS_OFERTA.titulo]: " " })).toContain(COLUNAS_OFERTA.titulo);
  });
  it("natureza inválida", () => {
    expect(colunas({ [COLUNAS_OFERTA.natureza]: "Xpto" })).toContain(COLUNAS_OFERTA.natureza);
  });
  it("tipo de benefício desconhecido", () => {
    expect(colunas({ [COLUNAS_OFERTA.tipoBeneficio]: "Inexistente" })).toContain(
      COLUNAS_OFERTA.tipoBeneficio,
    );
  });
  it("mecânica desconhecida", () => {
    expect(colunas({ [COLUNAS_OFERTA.mecanica]: "Inexistente" })).toContain(COLUNAS_OFERTA.mecanica);
  });
  it("preço inválido (dígitos mal formados)", () => {
    expect(colunas({ [COLUNAS_OFERTA.precoDe]: "1.2.3" })).toContain(COLUNAS_OFERTA.precoDe);
  });
  it("data de vigência inválida", () => {
    expect(colunas({ [COLUNAS_OFERTA.vigenciaInicio]: "32/13/2026" })).toContain(
      COLUNAS_OFERTA.vigenciaInicio,
    );
  });
  it("limite de resgates não inteiro", () => {
    expect(colunas({ [COLUNAS_OFERTA.limiteResgates]: "10,5" })).toContain(
      COLUNAS_OFERTA.limiteResgates,
    );
  });

  it("consistência de natureza (Recompensa com preço) reprova pela regra do manual", () => {
    const r = validarLinhaOferta(
      linha({ [COLUNAS_OFERTA.natureza]: "Recompensa", [COLUNAS_OFERTA.tipoBeneficio]: "Valor fixo" }),
      ctxBase(),
    );
    expect(linhaOfertaPronta(r)).toBe(false);
    // A regra de natureza reprova; a pendência é ancorada na coluna editável
    // (preço/tipo), não na Natureza, para dar saída à correção na conferência.
    expect(r.pendencias.some((p) => /Recompensa/.test(p.motivo))).toBe(true);
    expect(
      r.pendencias.some(
        (p) =>
          p.coluna === COLUNAS_OFERTA.precoPor || p.coluna === COLUNAS_OFERTA.tipoBeneficio,
      ),
    ).toBe(true);
  });
});

describe("validarLinhaOferta — pendência cruzada ancora na coluna editável", () => {
  it("cupom sem código NÃO gera pendência (código é opcional)", () => {
    const r = validarLinhaOferta(
      linha({
        [COLUNAS_OFERTA.natureza]: "Cupom de desconto",
        [COLUNAS_OFERTA.tipoBeneficio]: "Valor fixo",
        [COLUNAS_OFERTA.cupomCodigoRegras]: "",
        [COLUNAS_OFERTA.modalidade]: "",
      }),
      ctxBase(),
    );
    expect(r.pendencias.some((x) => x.motivo.includes("código/regras"))).toBe(false);
    expect(r.pendencias.some((x) => x.coluna === COLUNAS_OFERTA.cupomCodigoRegras)).toBe(false);
  });

  it("modalidade em Cupom aponta a coluna Modalidade de Pagamento (não Natureza)", () => {
    const r = validarLinhaOferta(
      linha({
        [COLUNAS_OFERTA.natureza]: "Cupom de desconto",
        [COLUNAS_OFERTA.cupomCodigoRegras]: "CUPOM10",
        [COLUNAS_OFERTA.modalidade]: "Única",
      }),
      ctxBase(),
    );
    const p = r.pendencias.find((x) => x.motivo.startsWith("Modalidade de pagamento"));
    expect(p, "esperava pendência de modalidade").toBeTruthy();
    expect(p?.coluna).toBe(COLUNAS_OFERTA.modalidade);
  });
});

describe("validarLinhaOferta — Percentual de desconto", () => {
  it("Percentual válido grava o % e zera os preços (some o preço, fica só o %)", () => {
    const r = validarLinhaOferta(
      linha({
        [COLUNAS_OFERTA.natureza]: "Benefício",
        [COLUNAS_OFERTA.tipoBeneficio]: "Percentual de desconto",
        [COLUNAS_OFERTA.percentualDesconto]: "15",
        [COLUNAS_OFERTA.precoDe]: "100,00",
        [COLUNAS_OFERTA.precoPor]: "85,00",
      }),
      ctxBase(),
    );
    expect(r.pendencias).toEqual([]);
    expect(r.campos.percentualDesconto).toBe(15);
    expect(r.campos.precoDe).toBeNull();
    expect(r.campos.precoPor).toBeNull();
  });

  it("Percentual não inteiro ou fora de 1–100 aponta a coluna Percentual de Desconto", () => {
    const r = validarLinhaOferta(
      linha({
        [COLUNAS_OFERTA.natureza]: "Benefício",
        [COLUNAS_OFERTA.tipoBeneficio]: "Percentual de desconto",
        [COLUNAS_OFERTA.percentualDesconto]: "120",
      }),
      ctxBase(),
    );
    const p = r.pendencias.find((x) => x.motivo.startsWith("Percentual de desconto"));
    expect(p, "esperava pendência de percentual").toBeTruthy();
    expect(p?.coluna).toBe(COLUNAS_OFERTA.percentualDesconto);
  });
});

describe("validarLinhaOferta — Id externo (Minutrade)", () => {
  it("mapeia o id externo para os campos e não gera pendência", () => {
    const r = validarLinhaOferta(
      linha({ [COLUNAS_OFERTA.idExternoMinutrade]: "MT-777" }),
      ctxBase(),
    );
    expect(r.pendencias).toEqual([]);
    expect(r.campos.idExternoMinutrade).toBe("MT-777");
  });

  it("vazio fica null (a oferta pode nascer sem vínculo)", () => {
    const r = validarLinhaOferta(linha({ [COLUNAS_OFERTA.idExternoMinutrade]: "  " }), ctxBase());
    expect(r.campos.idExternoMinutrade).toBeNull();
    expect(r.pendencias).toEqual([]);
  });

  it("id já usado por OUTRA oferta vira pendência na coluna do id externo", () => {
    const ctx = ctxBase();
    ctx.idsExternosEmUso.set("MT-1", "outra-oferta");
    const r = validarLinhaOferta(linha({ [COLUNAS_OFERTA.idExternoMinutrade]: "MT-1" }), ctx);
    const p = r.pendencias.find((x) => x.coluna === COLUNAS_OFERTA.idExternoMinutrade);
    expect(p, "esperava pendência de id externo duplicado").toBeTruthy();
    expect(p?.motivo).toContain("já está em uso");
  });

  it("reimportar a MESMA oferta com o próprio id não colide (enriquecer)", () => {
    const ctx = ctxBase();
    ctx.idsExternosEmUso.set("MT-1", "of-1");
    const r = validarLinhaOferta(
      linha({ [COLUNAS_OFERTA.idOferta]: "of-1", [COLUNAS_OFERTA.idExternoMinutrade]: "MT-1" }),
      ctx,
    );
    expect(r.pendencias.some((x) => x.coluna === COLUNAS_OFERTA.idExternoMinutrade)).toBe(false);
  });

  it("id externo repetido em duas linhas do lote vira pendência nas duas", () => {
    const lote = validarLoteOfertas(
      [
        linha({ [COLUNAS_OFERTA.idExternoMinutrade]: "MT-9" }, 2),
        linha({ [COLUNAS_OFERTA.idExternoMinutrade]: "MT-9" }, 3),
      ],
      ctxBase(),
    );
    for (const r of lote) {
      const p = r.pendencias.find((x) => x.coluna === COLUNAS_OFERTA.idExternoMinutrade);
      expect(p?.motivo).toContain("repetido em mais de uma linha");
      expect(r.acao).toBeNull();
    }
  });
});

describe("validarLinhaOferta — Recompensa: preço aponta o campo preenchido", () => {
  it("Recompensa com valor só em Preço De aponta a coluna Preço De", () => {
    const r = validarLinhaOferta(
      linha({
        [COLUNAS_OFERTA.natureza]: "Recompensa",
        [COLUNAS_OFERTA.tipoBeneficio]: "Gratuidade",
        [COLUNAS_OFERTA.precoDe]: "11,90",
        [COLUNAS_OFERTA.precoPor]: "0",
        [COLUNAS_OFERTA.modalidade]: "",
      }),
      ctxBase(),
    );
    const p = r.pendencias.find((x) => x.motivo.includes("preços devem ficar zerados"));
    expect(p, "esperava pendência de preços zerados").toBeTruthy();
    expect(p?.coluna).toBe(COLUNAS_OFERTA.precoDe);
  });

  it("Recompensa com valor em Preço Por aponta a coluna Preço Por", () => {
    const r = validarLinhaOferta(
      linha({
        [COLUNAS_OFERTA.natureza]: "Recompensa",
        [COLUNAS_OFERTA.tipoBeneficio]: "Gratuidade",
        [COLUNAS_OFERTA.precoDe]: "0",
        [COLUNAS_OFERTA.precoPor]: "10,00",
        [COLUNAS_OFERTA.modalidade]: "",
      }),
      ctxBase(),
    );
    const p = r.pendencias.find((x) => x.motivo.includes("preços devem ficar zerados"));
    expect(p?.coluna).toBe(COLUNAS_OFERTA.precoPor);
  });
});
