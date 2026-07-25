import { describe, expect, it } from "vitest";
import {
  type CamposDeIndicador,
  exigeAprovacao,
  exigeNovaVersaoDeConfiguracao,
  podeRepontuar,
  validarPeso,
} from "./regras";
import {
  CATALOGO_VALORES_REGRA,
  definicaoDe,
  validarCoerenciaDasReguas,
  validarValorRegra,
} from "./valores-regra";
import { FAMILIAS_DE_LISTA, textoDeUso, validarInativacao, validarNomeDeItem } from "./listas";
import { PARAMETROS_ESTRUTURAIS } from "./estruturais";

const INDICADOR: CamposDeIndicador = {
  nome: "Presença geográfica (UFs atendidas)",
  grupo: "EMPRESA",
  dimensao: "Capilaridade",
  peso: 1,
  ativo: true,
};

describe("RN25 — efeito prospectivo e versão de configuração", () => {
  it("mudar o peso gera nova versão de configuração", () => {
    expect(exigeNovaVersaoDeConfiguracao(INDICADOR, { ...INDICADOR, peso: 2 })).toBe(true);
  });

  it("inativar o indicador gera nova versão — muda quem entra na conta", () => {
    expect(exigeNovaVersaoDeConfiguracao(INDICADOR, { ...INDICADOR, ativo: false })).toBe(true);
  });

  it("trocar a dimensão ou o grupo gera nova versão", () => {
    expect(
      exigeNovaVersaoDeConfiguracao(INDICADOR, { ...INDICADOR, dimensao: "Tração" }),
    ).toBe(true);
    expect(exigeNovaVersaoDeConfiguracao(INDICADOR, { ...INDICADOR, grupo: "PRODUTO" })).toBe(
      true,
    );
  });

  it("renomear NÃO gera versão — o score referencia o indicador por id", () => {
    expect(
      exigeNovaVersaoDeConfiguracao(INDICADOR, { ...INDICADOR, nome: "Presença geográfica" }),
    ).toBe(false);
  });

  it("escrita idêntica não gera versão", () => {
    expect(exigeNovaVersaoDeConfiguracao(INDICADOR, { ...INDICADOR })).toBe(false);
  });

  it("avaliação fechada nunca é repontuada; rascunho segue vivo", () => {
    expect(podeRepontuar("FECHADA")).toBe(false);
    expect(podeRepontuar("RASCUNHO")).toBe(true);
  });

  it("aceita peso positivo com até duas casas e recusa o resto", () => {
    expect(validarPeso(1)).toEqual([]);
    expect(validarPeso(2.5)).toEqual([]);
    expect(validarPeso(0.25)).toEqual([]);
    expect(validarPeso(0)).toHaveLength(1);
    expect(validarPeso(-1)).toHaveLength(1);
    expect(validarPeso(1.005)).toHaveLength(1);
    expect(validarPeso(1000)).toHaveLength(1);
    expect(validarPeso(Number.NaN)).toHaveLength(1);
  });
});

describe("RN27 — família sensível no motor de aprovação", () => {
  it("com a regra desligada, escrita sensível vale na hora (estado inicial)", () => {
    expect(exigeAprovacao(false, "COMISSAO_PADRAO")).toBe(false);
    expect(exigeAprovacao(false, "META")).toBe(false);
  });

  it("com a regra ligada na T7, escrita sensível passa a exigir aprovação — sem código novo", () => {
    expect(exigeAprovacao(true, "COMISSAO_PADRAO")).toBe(true);
    expect(exigeAprovacao(true, "PESO_DE_INDICADOR")).toBe(true);
    expect(exigeAprovacao(true, "TETO_DO_DOSSIE")).toBe(true);
    expect(exigeAprovacao(true, "META")).toBe(true);
  });

  it("escrita fora da família sensível nunca exige aprovação, mesmo com a regra ligada", () => {
    expect(exigeAprovacao(true, null)).toBe(false);
  });
});

describe("Catálogo de valores de regra — réguas reais das Ondas 1 e 2", () => {
  it("traz as réguas vigentes e a comissão-padrão confirmada em 24/07", () => {
    expect(definicaoDe("FUNIL_ENVELHECIMENTO_LEVE_DIAS").valorInicial).toBe(14);
    expect(definicaoDe("FUNIL_ENVELHECIMENTO_FORTE_DIAS").valorInicial).toBe(30);
    expect(definicaoDe("OFERTA_SEM_RESGATE_DIAS").valorInicial).toBe(90);
    expect(definicaoDe("OFERTA_VIGENCIA_A_VENCER_DIAS").valorInicial).toBe(15);
    expect(definicaoDe("REAVALIACAO_MESES").valorInicial).toBe(12);
    expect(definicaoDe("COMISSAO_PADRAO_PCT").valorInicial).toBe(5);
  });

  it("os tetos do dossiê nascem SEM valor — a ficha §8 os mantém [A CONFIRMAR]", () => {
    expect(definicaoDe("DOSSIE_TETO_MENSAL_BRL").valorInicial).toBeNull();
    expect(definicaoDe("DOSSIE_CUSTO_MAXIMO_UNITARIO_BRL").valorInicial).toBeNull();
  });

  it("marca como sensível exatamente comissão-padrão e tetos (RN27)", () => {
    const sensiveis = CATALOGO_VALORES_REGRA.filter((d) => d.sensivel).map((d) => d.chave);
    expect(sensiveis.sort()).toEqual(
      ["COMISSAO_PADRAO_PCT", "DOSSIE_CUSTO_MAXIMO_UNITARIO_BRL", "DOSSIE_TETO_MENSAL_BRL"].sort(),
    );
  });

  it("valida réguas como contagem inteira a partir de 1", () => {
    expect(validarValorRegra("OFERTA_SEM_RESGATE_DIAS", 60)).toEqual([]);
    expect(validarValorRegra("OFERTA_SEM_RESGATE_DIAS", 0)).toHaveLength(1);
    expect(validarValorRegra("OFERTA_SEM_RESGATE_DIAS", -5)).toHaveLength(1);
    expect(validarValorRegra("OFERTA_SEM_RESGATE_DIAS", 7.5)).toHaveLength(1);
  });

  it("valida percentual entre 0 e 100 e monetário não negativo", () => {
    expect(validarValorRegra("COMISSAO_PADRAO_PCT", 7.5)).toEqual([]);
    expect(validarValorRegra("COMISSAO_PADRAO_PCT", 101)).toHaveLength(1);
    expect(validarValorRegra("COMISSAO_PADRAO_PCT", -1)).toHaveLength(1);
    expect(validarValorRegra("DOSSIE_TETO_MENSAL_BRL", 2500)).toEqual([]);
    expect(validarValorRegra("DOSSIE_TETO_MENSAL_BRL", -1)).toHaveLength(1);
  });

  it("aceita limpar um valor pendente (nulo) sem inventar número", () => {
    expect(validarValorRegra("DOSSIE_TETO_MENSAL_BRL", null)).toEqual([]);
  });

  it("exige que o grau forte do envelhecimento venha depois do leve", () => {
    expect(
      validarCoerenciaDasReguas({
        FUNIL_ENVELHECIMENTO_LEVE_DIAS: 14,
        FUNIL_ENVELHECIMENTO_FORTE_DIAS: 30,
      }),
    ).toEqual([]);
    expect(
      validarCoerenciaDasReguas({
        FUNIL_ENVELHECIMENTO_LEVE_DIAS: 30,
        FUNIL_ENVELHECIMENTO_FORTE_DIAS: 14,
      }),
    ).toHaveLength(1);
    expect(
      validarCoerenciaDasReguas({
        FUNIL_ENVELHECIMENTO_LEVE_DIAS: 20,
        FUNIL_ENVELHECIMENTO_FORTE_DIAS: 20,
      }),
    ).toHaveLength(1);
  });

  it("recusa chave desconhecida em vez de devolver valor silencioso", () => {
    // @ts-expect-error — chave fora do catálogo é erro de programação.
    expect(() => definicaoDe("REGUA_INEXISTENTE")).toThrow();
  });
});

describe("RN24 — inativar exige contagem de uso; excluir não existe", () => {
  it("recusa inativar sem a contagem apurada", () => {
    expect(validarInativacao(null)).toHaveLength(1);
  });

  it("permite inativar item com uso, desde que a contagem tenha sido apurada", () => {
    expect(validarInativacao(37)).toEqual([]);
    expect(validarInativacao(0)).toEqual([]);
  });

  it("redige a contagem de uso em singular, plural e ausência", () => {
    expect(textoDeUso(0, "solução", "soluções")).toContain("Sem uso registrado");
    expect(textoDeUso(1, "solução", "soluções")).toBe("Em uso em 1 solução.");
    expect(textoDeUso(12, "solução", "soluções")).toBe("Em uso em 12 soluções.");
  });

  it("recusa nome vazio e duplicata, ignorando acento e caixa", () => {
    expect(validarNomeDeItem("  ", [])).toHaveLength(1);
    expect(validarNomeDeItem("Culturas", ["culturas"])).toHaveLength(1);
    expect(validarNomeDeItem("Café", ["cafe"])).toHaveLength(1);
    expect(validarNomeDeItem("Trigo", ["Café", "Soja"])).toEqual([]);
  });

  it("cobre as famílias da ficha §3.1 e mantém as mecânicas fora do editor", () => {
    const ids = FAMILIAS_DE_LISTA.map((f) => f.id);
    expect(ids).toContain("indicadores");
    expect(ids).toContain("categorias");
    expect(ids).toContain("culturas");
    expect(ids).toContain("cobertura");
    expect(ids).toContain("motivos-suspensao");
    expect(ids).toContain("motivos-descarte");
    expect(ids).toContain("tipos-beneficio");
    expect(ids).toContain("perfil-cliente");
    // Mecânicas de resgate são estruturais (ficha §3.3), não editáveis.
    expect(ids).not.toContain("mecanicas");
  });

  it("só o perfil de cliente nasce com texto de estado vazio — é a única lista sem seed", () => {
    const comTextoVazio = FAMILIAS_DE_LISTA.filter((f) => f.textoVazio).map((f) => f.id);
    expect(comTextoVazio).toEqual(["perfil-cliente"]);
  });
});

describe("RN26 — estruturais somente leitura, com contagem vinda de metadados", () => {
  it("cada estrutural tem justificativa de uma linha", () => {
    for (const parametro of PARAMETROS_ESTRUTURAIS) {
      expect(parametro.justificativa.length).toBeGreaterThan(0);
      expect(parametro.justificativa).not.toContain("\n");
    }
  });

  it("as contagens vêm do enum gerado pelo schema, não de número digitado", () => {
    const naturezas = PARAMETROS_ESTRUTURAIS.find((p) => p.chave === "naturezas-oferta");
    expect(naturezas?.origem.tipo).toBe("ENUM");
    if (naturezas?.origem.tipo === "ENUM") {
      // As três naturezas da decisão de 24/07 (ficha Onda 1 §3.3).
      expect(naturezas.origem.valores).toEqual([
        "RECOMPENSA",
        "BENEFICIO",
        "CUPOM_DESCONTO",
      ]);
    }
  });

  it("acrescentar estágio ao pipeline muda o hub sozinho", () => {
    const estagios = PARAMETROS_ESTRUTURAIS.find((p) => p.chave === "estagios-pipeline");
    if (estagios?.origem.tipo !== "ENUM") {
      throw new Error("Estágios do pipeline precisam vir do enum do schema.");
    }
    expect(estagios.origem.valores).toContain("MAPEADA");
    expect(estagios.origem.valores).toContain("ALIADA_ATIVA");
    expect(estagios.origem.valores).toContain("DESCARTADA");
  });

  it("as 14 dimensões de medição do ScoutCB aparecem como estruturais", () => {
    const dimensoes = PARAMETROS_ESTRUTURAIS.find((p) => p.chave === "dimensoes-medicao");
    if (dimensoes?.origem.tipo !== "ENUM") {
      throw new Error("Dimensões de medição precisam vir das constantes de domínio.");
    }
    expect(dimensoes.origem.valores).toHaveLength(14);
  });
});
