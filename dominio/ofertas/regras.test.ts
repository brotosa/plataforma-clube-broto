import { describe, expect, it } from "vitest";
import {
  type CondicoesPublicacao,
  type DadosCompletudeCard,
  type DadosNaturezaOferta,
  calcularCompletudeCard,
  deveMarcarRepublicacao,
  estaExpirada,
  explicacaoIncompatibilidade,
  impedimentosDePublicacao,
  mecanicaCompativelComAmbiente,
  validarNatureza,
} from "./regras";

describe("RN11 — compatibilidade mecânica × ambiente", () => {
  it("checkout no clube exige dentro da Plataforma (ou ambos)", () => {
    expect(mecanicaCompativelComAmbiente("CHECKOUT_CLUBE", "DENTRO_PLATAFORMA")).toBe(true);
    expect(mecanicaCompativelComAmbiente("CHECKOUT_CLUBE", "AMBOS")).toBe(true);
    expect(mecanicaCompativelComAmbiente("CHECKOUT_CLUBE", "FORA_PLATAFORMA")).toBe(false);
  });

  it("checkout externo exige fora da Plataforma (ou ambos)", () => {
    expect(mecanicaCompativelComAmbiente("CHECKOUT_EXTERNO", "FORA_PLATAFORMA")).toBe(true);
    expect(mecanicaCompativelComAmbiente("CHECKOUT_EXTERNO", "AMBOS")).toBe(true);
    expect(mecanicaCompativelComAmbiente("CHECKOUT_EXTERNO", "DENTRO_PLATAFORMA")).toBe(false);
  });

  it("recompensa gratuita independe de ambiente", () => {
    expect(mecanicaCompativelComAmbiente("RECOMPENSA_GRATUITA", null)).toBe(true);
    expect(mecanicaCompativelComAmbiente("RECOMPENSA_GRATUITA", "DENTRO_PLATAFORMA")).toBe(true);
  });

  it("sem bloco comercial definido, mecânicas de checkout ficam indisponíveis", () => {
    expect(mecanicaCompativelComAmbiente("CHECKOUT_CLUBE", null)).toBe(false);
    expect(mecanicaCompativelComAmbiente("CHECKOUT_EXTERNO", null)).toBe(false);
  });

  it("explica o porquê da mecânica desabilitada (a UI exibe)", () => {
    expect(explicacaoIncompatibilidade("CHECKOUT_CLUBE")).toContain("dentro da Plataforma");
    expect(explicacaoIncompatibilidade("CHECKOUT_EXTERNO")).toContain("fora da Plataforma");
  });
});

function beneficioValido(): DadosNaturezaOferta {
  return {
    natureza: "BENEFICIO",
    tipoBeneficioSlug: "PCT_DESCONTO",
    precoDe: 100,
    precoPor: 85,
    cupomCodigoRegras: null,
    modalidadePagamento: "UNICA",
  };
}

describe("validações de natureza da oferta (três valores, decisão de 24/07)", () => {
  it("benefício pago com modalidade é válido", () => {
    expect(validarNatureza(beneficioValido())).toEqual([]);
  });

  it("recompensa exige preços zerados e tipo gratuidade", () => {
    const erros = validarNatureza({
      natureza: "RECOMPENSA",
      tipoBeneficioSlug: "PCT_DESCONTO",
      precoDe: 100,
      precoPor: 0,
      cupomCodigoRegras: null,
      modalidadePagamento: null,
    });
    expect(erros.some((e) => e.includes("preços devem ficar zerados"))).toBe(true);
    expect(erros).toContain("Recompensa exige tipo de benefício Gratuidade.");
  });

  it("recompensa gratuita bem formada é válida", () => {
    expect(
      validarNatureza({
        natureza: "RECOMPENSA",
        tipoBeneficioSlug: "GRATUIDADE",
        precoDe: 0,
        precoPor: null,
        cupomCodigoRegras: null,
        modalidadePagamento: null,
      }),
    ).toEqual([]);
  });

  it("gratuidade implica recompensa", () => {
    expect(
      validarNatureza({ ...beneficioValido(), tipoBeneficioSlug: "GRATUIDADE" }),
    ).toContain("Gratuidade implica natureza Recompensa (ficha §3.3).");
  });

  it("cupom exige código/regras e desconto definido", () => {
    const erros = validarNatureza({
      natureza: "CUPOM_DESCONTO",
      tipoBeneficioSlug: "CONDICAO_ESPECIAL",
      precoDe: null,
      precoPor: null,
      cupomCodigoRegras: null,
      modalidadePagamento: null,
    });
    expect(erros).toContain("Cupom de desconto exige código/regras do cupom.");
    expect(erros.some((e) => e.includes("desconto definido"))).toBe(true);
  });

  it("cupom bem formado (percentual + código) é válido", () => {
    expect(
      validarNatureza({
        natureza: "CUPOM_DESCONTO",
        tipoBeneficioSlug: "PCT_DESCONTO",
        precoDe: null,
        precoPor: null,
        cupomCodigoRegras: "BROTO10 — 10% na primeira compra",
        modalidadePagamento: null,
      }),
    ).toEqual([]);
  });

  it("modalidade de pagamento é exclusiva de benefícios", () => {
    expect(
      validarNatureza({
        natureza: "RECOMPENSA",
        tipoBeneficioSlug: "GRATUIDADE",
        precoDe: null,
        precoPor: null,
        cupomCodigoRegras: null,
        modalidadePagamento: "RECORRENTE",
      }),
    ).toContain("Modalidade de pagamento (única/recorrente) aplica-se somente a Benefícios.");
  });
});

function cardCompleto(): DadosCompletudeCard {
  return {
    aliado: { nomeFantasia: "Exemplo", logoUrl: "s3://logos/exemplo.svg" },
    solucao: {
      nome: "Solução Exemplo",
      descricaoCurta: "Descrição curta do card",
      temCategoria: true,
      quantidadeCulturas: 1,
      coberturaNacional: true,
      quantidadeUfs: 0,
      imagemCardUrl: "s3://cards/exemplo.png",
    },
  };
}

describe("RN09 — régua de completude do card", () => {
  it("card completo: 100% e publicável", () => {
    const resultado = calcularCompletudeCard(cardCompleto());
    expect(resultado.completa).toBe(true);
    expect(resultado.percentual).toBe(100);
    expect(resultado.itens.every((item) => item.ok)).toBe(true);
  });

  it("cobertura aceita nacional OU conjunto de UFs", () => {
    const porUf = cardCompleto();
    porUf.solucao.coberturaNacional = false;
    porUf.solucao.quantidadeUfs = 3;
    expect(calcularCompletudeCard(porUf).completa).toBe(true);
  });

  it("sem logo do aliado a régua cai e bloqueia publicação", () => {
    const dados = cardCompleto();
    dados.aliado.logoUrl = null;
    const resultado = calcularCompletudeCard(dados);
    expect(resultado.completa).toBe(false);
    expect(resultado.percentual).toBe(88);
    expect(resultado.itens.find((i) => i.rotulo === "Logo do aliado")?.ok).toBe(false);
  });

  it("cada campo ausente reduz o percentual", () => {
    const dados: DadosCompletudeCard = {
      aliado: { nomeFantasia: null, logoUrl: null },
      solucao: {
        nome: null,
        descricaoCurta: null,
        temCategoria: false,
        quantidadeCulturas: 0,
        coberturaNacional: false,
        quantidadeUfs: 0,
        imagemCardUrl: null,
      },
    };
    const resultado = calcularCompletudeCard(dados);
    expect(resultado.percentual).toBe(0);
    expect(resultado.completa).toBe(false);
  });
});

function condicoesOk(): CondicoesPublicacao {
  return {
    estagioEmpresa: "ALIADA_ATIVA",
    statusContrato: "VIGENTE",
    statusSolucao: "ATIVA",
    completudeCard: true,
    mecanicaCompativel: true,
  };
}

describe("RN02 — condições de publicação", () => {
  it("sem impedimentos quando todas as condições valem", () => {
    expect(impedimentosDePublicacao(condicoesOk())).toEqual([]);
  });

  it("bloqueia aliado fora de Aliada ativa", () => {
    expect(
      impedimentosDePublicacao({ ...condicoesOk(), estagioEmpresa: "SUSPENSA" }),
    ).toContain("Aliado não está em estágio Aliada ativa (RN02).");
  });

  it("bloqueia contrato não vigente (denunciado, encerrado ou ausente)", () => {
    expect(
      impedimentosDePublicacao({ ...condicoesOk(), statusContrato: "DENUNCIADO" }),
    ).toContain("Aliado sem contrato vigente (RN02).");
    expect(
      impedimentosDePublicacao({ ...condicoesOk(), statusContrato: null }),
    ).toContain("Aliado sem contrato vigente (RN02).");
  });

  it("bloqueia solução inativa", () => {
    expect(
      impedimentosDePublicacao({ ...condicoesOk(), statusSolucao: "INATIVA" }),
    ).toContain("Solução inativa (RN02).");
  });

  it("acumula RN09 e RN11 como impedimentos", () => {
    const impedimentos = impedimentosDePublicacao({
      ...condicoesOk(),
      completudeCard: false,
      mecanicaCompativel: false,
    });
    expect(impedimentos).toHaveLength(2);
  });
});

describe("RN03 — expiração automática por vigência", () => {
  const hoje = new Date("2026-07-25T14:30:00Z");

  it("fim anterior a hoje expira", () => {
    expect(estaExpirada(new Date("2026-07-24T00:00:00Z"), hoje)).toBe(true);
  });

  it("fim hoje ainda não expira (expira no dia seguinte)", () => {
    expect(estaExpirada(new Date("2026-07-25T00:00:00Z"), hoje)).toBe(false);
  });

  it("fim futuro não expira", () => {
    expect(estaExpirada(new Date("2026-08-01T00:00:00Z"), hoje)).toBe(false);
  });

  it("fim vazio = prazo indeterminado, nunca expira", () => {
    expect(estaExpirada(null, hoje)).toBe(false);
  });
});

describe("RN10 — flag Pendente de republicação", () => {
  it("liga quando campo publicável muda em oferta Publicada", () => {
    expect(deveMarcarRepublicacao("PUBLICADA", ["titulo"])).toBe(true);
    expect(deveMarcarRepublicacao("PUBLICADA", ["precoPor", "vigenciaFim"])).toBe(true);
  });

  it("não liga para campos internos (ex.: limite de resgates)", () => {
    expect(deveMarcarRepublicacao("PUBLICADA", ["limiteResgates"])).toBe(false);
  });

  it("não liga quando a oferta não está Publicada", () => {
    expect(deveMarcarRepublicacao("RASCUNHO", ["titulo"])).toBe(false);
    expect(deveMarcarRepublicacao("PAUSADA", ["titulo"])).toBe(false);
  });
});
