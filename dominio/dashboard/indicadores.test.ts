import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOGO_ACAO_HOJE,
  CATALOGO_INDICADORES,
  FAIXA_SEM_PENDENCIA,
  type IndicadorApurado,
  TEXTOS_INDISPONIBILIDADE,
  campanhaEtiquetada,
  definicaoDoIndicador,
  disponivel,
  etiquetaDeAtribuicao,
  faixaEstaZerada,
  pendenciasAcionaveis,
  textoDoMarcador,
  totalDePendencias,
  indicadoresDoBloco,
  indisponivel,
  percentual,
} from "./indicadores";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("RN50 — catálogo fechado: nenhum indicador sem ficha validada", () => {
  it("traz as 19 métricas das fichas das Ondas 1, 2, 4 e 5 — e nada além", () => {
    expect(CATALOGO_INDICADORES).toHaveLength(19);
  });

  it("distribui os indicadores nos quatro blocos da ficha §2", () => {
    expect(indicadoresDoBloco("REDE_E_ALIADOS")).toHaveLength(5);
    expect(indicadoresDoBloco("MERCADO_E_FUNIL")).toHaveLength(6);
    expect(indicadoresDoBloco("ASSINANTES_E_USO")).toHaveLength(5);
    expect(indicadoresDoBloco("CAMPANHAS")).toHaveLength(3);
  });

  it("todo indicador declara a ficha de origem", () => {
    for (const definicao of CATALOGO_INDICADORES) {
      expect(definicao.fonte, `indicador ${definicao.chave}`).toMatch(/^ficha-onda[1245] §\d/);
    }
  });

  it("não repete chave", () => {
    const chaves = CATALOGO_INDICADORES.map((d) => d.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("cada chave do catálogo resolve para a própria definição", () => {
    for (const definicao of CATALOGO_INDICADORES) {
      expect(definicaoDoIndicador(definicao.chave).rotulo).toBe(definicao.rotulo);
    }
  });

  // Caso negativo: burlar o tipo com um cast não passa silenciosamente.
  it("recusa chave que não consta de ficha", () => {
    expect(() =>
      definicaoDoIndicador("RECEITA_PROJETADA_2027" as never),
    ).toThrow(/RN50/);
  });

  it("as fichas citadas existem mesmo em docs/especificacao", () => {
    const arquivos: Readonly<Record<string, string>> = {
      "ficha-onda1": "ficha-onda1-aliados-solucoes-ofertas.md",
      "ficha-onda2": "ficha-onda2-mercado-scout.md",
      "ficha-onda4": "ficha-onda4-campanhas-cestas.md",
      "ficha-onda5": "ficha-onda5-assinantes.md",
    };
    for (const definicao of CATALOGO_INDICADORES) {
      const prefixo = definicao.fonte.split(" ")[0] ?? "";
      const arquivo = arquivos[prefixo];
      expect(arquivo, `fonte de ${definicao.chave}`).toBeDefined();
      const caminho = join(RAIZ, "docs", "especificacao", arquivo as string);
      expect(() => readFileSync(caminho, "utf8"), `fonte de ${definicao.chave}`).not.toThrow();
    }
  });
});

describe("RN50 — indisponibilidade é estado, nunca aproximação", () => {
  it("usa o texto que a ficha exige para a granularidade por CPF", () => {
    expect(TEXTOS_INDISPONIBILIDADE.AGUARDA_TELEMETRIA_ASSINANTE).toBe(
      "aguarda telemetria por assinante",
    );
  });

  it("percentual com denominador zero é indisponível, não 0%", () => {
    expect(percentual(0, 0)).toEqual({
      estado: "INDISPONIVEL",
      motivo: "SEM_BASE_DE_CALCULO",
    });
    expect(percentual(3, -1).estado).toBe("INDISPONIVEL");
  });

  it("percentual com base calcula e devolve o par parte/total", () => {
    expect(percentual(3, 4)).toEqual({
      estado: "DISPONIVEL",
      valor: 75,
      base: { parte: 3, total: 4 },
    });
  });

  it("arredonda para uma casa decimal", () => {
    expect(percentual(1, 3)).toMatchObject({ valor: 33.3 });
    expect(percentual(2, 3)).toMatchObject({ valor: 66.7 });
  });

  it("0 de 10 é 0% disponível — zero medido não é zero por falta de fonte", () => {
    expect(percentual(0, 10)).toMatchObject({ estado: "DISPONIVEL", valor: 0 });
  });

  it("indisponivel() carrega o motivo até a tela", () => {
    expect(indisponivel("AGUARDA_TELEMETRIA_ASSINANTE")).toEqual({
      estado: "INDISPONIVEL",
      motivo: "AGUARDA_TELEMETRIA_ASSINANTE",
    });
  });
});

describe("RN43 na T26 — número de campanha viaja etiquetado", () => {
  const daCampanha = (resultado: IndicadorApurado["resultado"]): IndicadorApurado => ({
    ...definicaoDoIndicador("CAMPANHAS_ATIVAS"),
    resultado,
  });

  it("etiqueta o nível com o rótulo da Onda 4", () => {
    expect(etiquetaDeAtribuicao("POR_OFERTA")).toBe("atribuição por oferta");
    expect(etiquetaDeAtribuicao("POR_PUBLICO")).toBe("atribuição por público");
  });

  it("aprova o número de campanha com nível declarado", () => {
    expect(campanhaEtiquetada(daCampanha(disponivel(4, { nivelAtribuicao: "POR_OFERTA" })))).toBe(
      true,
    );
  });

  it("reprova o número de campanha sem nível", () => {
    expect(campanhaEtiquetada(daCampanha(disponivel(4)))).toBe(false);
  });

  it("indicador indisponível não precisa de etiqueta — não há número", () => {
    expect(campanhaEtiquetada(daCampanha(indisponivel("AGUARDA_TELEMETRIA_ASSINANTE")))).toBe(
      true,
    );
  });

  it("indicador de outro bloco não exige etiqueta de atribuição", () => {
    const rede: IndicadorApurado = {
      ...definicaoDoIndicador("COBERTURA_CATEGORIAS"),
      resultado: disponivel(80),
    };
    expect(campanhaEtiquetada(rede)).toBe(true);
  });
});

describe("faixa 'Exige ação hoje' (ficha §2)", () => {
  it("traz as seis pendências, cada uma com destino e fonte", () => {
    expect(CATALOGO_ACAO_HOJE).toHaveLength(6);
    for (const pendencia of CATALOGO_ACAO_HOJE) {
      expect(pendencia.destino.startsWith("/"), pendencia.chave).toBe(true);
      expect(pendencia.fonte.length).toBeGreaterThan(0);
    }
  });

  it("reconhece a faixa zerada para exibir o estado positivo", () => {
    const zerada = CATALOGO_ACAO_HOJE.map((p) => ({ ...p, contagem: 0 }));
    expect(faixaEstaZerada(zerada)).toBe(true);
    expect(FAIXA_SEM_PENDENCIA).toContain("Nada exige ação hoje");
  });

  it("uma pendência basta para a faixa não estar zerada", () => {
    const comUma = CATALOGO_ACAO_HOJE.map((p, i) => ({ ...p, contagem: i === 2 ? 1 : 0 }));
    expect(faixaEstaZerada(comUma)).toBe(false);
  });
});

describe("sino de pendências (Onda 7 §7) — o mesmo número dos cartões da HOME", () => {
  const comContagens = (valores: ReadonlyArray<number>) =>
    CATALOGO_ACAO_HOJE.map((p, i) => ({ ...p, contagem: valores[i] ?? 0 }));

  it("o total é a soma exata das contagens da camada 2", () => {
    expect(totalDePendencias(comContagens([3, 0, 1, 1, 0, 92]))).toBe(97);
  });

  it("sem pendência o total é zero e o marcador não aparece", () => {
    expect(totalDePendencias(comContagens([0, 0, 0, 0, 0, 0]))).toBe(0);
  });

  it("pendência indisponível NÃO entra na soma (RN53)", () => {
    const pendencias = comContagens([3, 0, 1, 0, 0, 0]).map((p, i) =>
      // A segunda fica sem base: não vale zero, não tem valor.
      i === 1 ? { ...p, contagem: 999, indisponivel: "SEM_BASE_DE_CALCULO" as const } : p,
    );
    expect(totalDePendencias(pendencias)).toBe(4);
  });

  it("as linhas do sino são exatamente os cartões da HOME — acionáveis ou indisponíveis", () => {
    const pendencias = comContagens([3, 0, 1, 0, 0, 0]).map((p, i) =>
      i === 4 ? { ...p, contagem: 0, indisponivel: "SEM_BASE_DE_CALCULO" as const } : p,
    );
    const linhas = pendenciasAcionaveis(pendencias);
    // Duas com contagem > 0 e uma indisponível; as três zeradas ficam de fora.
    expect(linhas.map((l) => l.chave)).toEqual([
      CATALOGO_ACAO_HOJE[0]!.chave,
      CATALOGO_ACAO_HOJE[2]!.chave,
      CATALOGO_ACAO_HOJE[4]!.chave,
    ]);
  });

  it("faixa só com indisponíveis conta como zerada — não há ação a tomar", () => {
    const todas = comContagens([0, 0, 0, 0, 0, 0]).map((p) => ({
      ...p,
      indisponivel: "SEM_BASE_DE_CALCULO" as const,
    }));
    expect(faixaEstaZerada(todas)).toBe(true);
    expect(totalDePendencias(todas)).toBe(0);
  });

  it("o marcador tem texto acessível, com plural correto", () => {
    expect(textoDoMarcador(0)).toBe("Nenhuma ação pendente — abrir o painel");
    expect(textoDoMarcador(1)).toBe("1 ação pendente — abrir o painel");
    expect(textoDoMarcador(7)).toBe("7 ações pendentes — abrir o painel");
  });
});
