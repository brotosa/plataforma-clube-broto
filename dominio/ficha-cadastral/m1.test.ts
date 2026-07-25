import { describe, expect, it } from "vitest";
import {
  completudeM1,
  type DadosM1,
  MAXIMO_DE_DIFERENCIAIS,
  normalizarDiferenciais,
  percentualM1,
  SECOES_M1,
  validarIndicadoresDeclarados,
  validarOfertaPretendida,
} from "./m1";

function dadosCompletos(): DadosM1 {
  return {
    nomeFantasia: "Viasat Brasil",
    razaoSocial: "Viasat Brasil LTDA",
    site: "https://viasat.com.br",
    descricaoInstitucional: "Conectividade via satélite para o campo.",
    diferenciais: ["Cobertura nacional", "Instalação em 48h"],
    categorias: 1,
    modeloNegocio: "Assinatura mensal",
    publicoPorte: ["PEQUENO", "MEDIO"],
    publicoNatureza: "AMBAS",
    contatos: 2,
    temIndicadoresDeclarados: true,
    comissaoDefinida: true,
    ambientesDefinidos: true,
    ofertasPretendidas: 1,
  };
}

describe("régua de M1 — obrigatoriedade progressiva", () => {
  it("as seis seções da ficha estão na régua", () => {
    expect(SECOES_M1.map((secao) => secao.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("ficha completa fecha as seis seções em 100%", () => {
    const secoes = completudeM1(dadosCompletos());
    expect(secoes.every((secao) => secao.completa)).toBe(true);
    expect(percentualM1(secoes)).toBe(100);
  });

  it("M1 não exige CNPJ nem contrato anexado — isso é régua de M2", () => {
    // Os dados de M1 sequer carregam CNPJ/anexo: a régua de promoção vive
    // na Onda 1 e não é repetida aqui.
    const secoes = completudeM1(dadosCompletos());
    const textos = secoes.flatMap((secao) => secao.pendencias).join(" ");
    expect(textos).not.toContain("CNPJ");
    expect(textos).not.toContain("contrato");
  });

  it("um contato basta em M1", () => {
    const secoes = completudeM1({ ...dadosCompletos(), contatos: 1 });
    expect(secoes.find((secao) => secao.secao === "C")!.completa).toBe(true);
  });

  it("sem contato, a seção C aponta a pendência", () => {
    const secoes = completudeM1({ ...dadosCompletos(), contatos: 0 });
    const secaoC = secoes.find((secao) => secao.secao === "C")!;
    expect(secaoC.completa).toBe(false);
    expect(secaoC.pendencias[0]).toContain("contato");
  });

  it("classificação incompleta lista os dois eixos do público", () => {
    const secoes = completudeM1({
      ...dadosCompletos(),
      publicoPorte: [],
      publicoNatureza: null,
    });
    const secaoB = secoes.find((secao) => secao.secao === "B")!;
    expect(secaoB.completa).toBe(false);
    expect(secaoB.pendencias).toHaveLength(2);
  });

  it("ficha recém-aberta fica em 0% sem quebrar", () => {
    const vazia: DadosM1 = {
      nomeFantasia: "",
      razaoSocial: null,
      site: null,
      descricaoInstitucional: null,
      diferenciais: [],
      categorias: 0,
      modeloNegocio: null,
      publicoPorte: [],
      publicoNatureza: null,
      contatos: 0,
      temIndicadoresDeclarados: false,
      comissaoDefinida: false,
      ambientesDefinidos: false,
      ofertasPretendidas: 0,
    };
    const secoes = completudeM1(vazia);
    expect(percentualM1(secoes)).toBe(0);
    expect(secoes.every((secao) => secao.pendencias.length > 0)).toBe(true);
  });
});

describe("seção F — o formulário ensina a definição contratual", () => {
  const base = {
    natureza: "BENEFICIO" as const,
    titulo: "Plano rural com 20% off",
    precoDe: 200,
    precoPor: 160,
    instrucoesResgate: "Voucher direciona ao administrador comercial do aliado.",
  };

  it("benefício com valor e instruções passa", () => {
    expect(validarOfertaPretendida(base)).toEqual([]);
  });

  it("recompensa com preço é recusada com a definição contratual na mensagem", () => {
    const erros = validarOfertaPretendida({ ...base, natureza: "RECOMPENSA" });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("gratuidade");
    expect(erros[0]).toContain("Desconto é Benefício");
  });

  it("recompensa gratuita passa", () => {
    expect(
      validarOfertaPretendida({
        ...base,
        natureza: "RECOMPENSA",
        precoDe: null,
        precoPor: 0,
      }),
    ).toEqual([]);
  });

  it("benefício sem valor é recusado — sem valor, é recompensa", () => {
    const erros = validarOfertaPretendida({ ...base, precoDe: null, precoPor: null });
    expect(erros.join(" ")).toContain("natureza é Recompensa");
  });

  it("instruções de resgate são obrigatórias — é a lacuna do Word", () => {
    const erros = validarOfertaPretendida({ ...base, instrucoesResgate: "  " });
    expect(erros.join(" ")).toContain("pós-voucher");
  });

  it("título vazio é recusado", () => {
    expect(validarOfertaPretendida({ ...base, titulo: " " })).toHaveLength(1);
  });
});

describe("seção D — indicadores autodeclarados", () => {
  const vazio = {
    ticketMedio: null,
    nps: null,
    churnMensalPct: null,
    numeroClientes: null,
    anoFundacao: null,
  };

  it("ao menos um indicador é exigido", () => {
    expect(validarIndicadoresDeclarados(vazio, 2026)).toEqual([
      "Informe ao menos um indicador declarado.",
    ]);
  });

  it("um indicador basta", () => {
    expect(validarIndicadoresDeclarados({ ...vazio, nps: 62 }, 2026)).toEqual([]);
  });

  it("NPS fora da escala é recusado nos dois extremos", () => {
    expect(validarIndicadoresDeclarados({ ...vazio, nps: 101 }, 2026)).toHaveLength(1);
    expect(validarIndicadoresDeclarados({ ...vazio, nps: -101 }, 2026)).toHaveLength(1);
    expect(validarIndicadoresDeclarados({ ...vazio, nps: -100 }, 2026)).toEqual([]);
  });

  it("churn é percentual de 0 a 100", () => {
    expect(validarIndicadoresDeclarados({ ...vazio, churnMensalPct: 3.5 }, 2026)).toEqual([]);
    expect(validarIndicadoresDeclarados({ ...vazio, churnMensalPct: 120 }, 2026)).toHaveLength(1);
  });

  it("ano de fundação no futuro é recusado", () => {
    expect(validarIndicadoresDeclarados({ ...vazio, anoFundacao: 2030 }, 2026)).toHaveLength(1);
    expect(validarIndicadoresDeclarados({ ...vazio, anoFundacao: 2011 }, 2026)).toEqual([]);
  });

  it("valores negativos são recusados", () => {
    expect(validarIndicadoresDeclarados({ ...vazio, ticketMedio: -1 }, 2026)).toHaveLength(1);
    expect(validarIndicadoresDeclarados({ ...vazio, numeroClientes: -5 }, 2026)).toHaveLength(1);
  });
});

describe("seção A — diferenciais", () => {
  it("uma linha por diferencial, sem vazios", () => {
    expect(normalizarDiferenciais("Cobertura nacional\n\n  Instalação em 48h  \n")).toEqual([
      "Cobertura nacional",
      "Instalação em 48h",
    ]);
  });

  it("corta no limite de cinco itens", () => {
    const bruto = Array.from({ length: 9 }, (_valor, indice) => `Item ${indice + 1}`).join("\n");
    expect(normalizarDiferenciais(bruto)).toHaveLength(MAXIMO_DE_DIFERENCIAIS);
  });

  it("texto em branco vira lista vazia", () => {
    expect(normalizarDiferenciais("   \n  ")).toEqual([]);
  });
});
