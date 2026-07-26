import { describe, expect, it } from "vitest";
import {
  CRITERIOS_SITUACAO,
  type FatoDeCategoria,
  calcularConcentracao,
  exigeAcao,
  montarMatriz,
  montarPortfolio,
  ordenarPorVolume,
  resumirCobertura,
  resumirPortfolio,
  situacaoDaCategoria,
  textoDaCelula,
  totalNoFunil,
} from "./cobertura";

/**
 * Os fatos abaixo são os MESMOS três da suíte da F9 (`dominio/metas/metas.test.ts`,
 * bloco de cobertura), acrescidos apenas do campo que a Onda 7 introduz. As
 * expectativas da lente de pipeline foram copiadas linha a linha: se a extração
 * do serviço único tivesse mexido na definição de gap, este arquivo ficaria
 * vermelho antes de qualquer tela abrir.
 */
const fatos: ReadonlyArray<FatoDeCategoria> = [
  {
    categoriaId: "c1",
    categoriaNome: "Tecnologia e Software",
    aliadosAtivos: 12,
    solucoesPublicadas: 9,
    funil: { MAPEADA: 2, EM_AVALIACAO: 1 },
  },
  {
    categoriaId: "c2",
    categoriaNome: "Saúde e Bem-estar no Campo",
    aliadosAtivos: 0,
    solucoesPublicadas: 0,
    funil: { EM_NEGOCIACAO: 1 },
  },
  {
    categoriaId: "c3",
    categoriaNome: "Regularização e Documentação",
    aliadosAtivos: 0,
    solucoesPublicadas: 0,
    funil: {},
  },
];

describe("RN51 · lente de pipeline (T13) — a definição de gap NÃO mudou na Onda 7", () => {
  it("monta as cinco colunas do funil na ordem do pipeline", () => {
    const [linha] = montarMatriz(fatos);
    expect(linha!.celulas.map((celula) => celula.estagio)).toEqual([
      "MAPEADA",
      "EM_AVALIACAO",
      "PRIORIZADA",
      "EM_NEGOCIACAO",
      "EM_APROVACAO",
    ]);
    expect(linha!.celulas.map((celula) => celula.quantidade)).toEqual([2, 1, 0, 0, 0]);
    expect(linha!.totalNoFunil).toBe(3);
  });

  it("categoria com aliada ativa não é gap", () => {
    const [linha] = montarMatriz(fatos);
    expect(linha!.gap).toBe(false);
    expect(linha!.gapDescoberto).toBe(false);
  });

  it("sem aliada ativa é gap; com gente no funil, gap coberto", () => {
    const linha = montarMatriz(fatos)[1]!;
    expect(linha.gap).toBe(true);
    expect(linha.gapDescoberto).toBe(false);
  });

  it("sem aliada ativa e sem funil é o gap que ninguém está atacando", () => {
    const linha = montarMatriz(fatos)[2]!;
    expect(linha.gap).toBe(true);
    expect(linha.gapDescoberto).toBe(true);
  });

  it("o resumo conta cobertas, gaps e descobertos", () => {
    expect(resumirCobertura(montarMatriz(fatos))).toEqual({
      categorias: 3,
      categoriasCobertas: 1,
      gaps: 2,
      gapsDescobertos: 1,
      aliadasAtivas: 12,
      empresasNoFunil: 4,
    });
  });

  it("célula vazia é travessão, nunca zero", () => {
    expect(textoDaCelula(0)).toBe("—");
    expect(textoDaCelula(3)).toBe("3");
  });

  it("matriz vazia não quebra o resumo", () => {
    expect(resumirCobertura(montarMatriz([]))).toMatchObject({
      categorias: 0,
      gaps: 0,
      aliadasAtivas: 0,
    });
  });

  it("a solução publicada não interfere na lente de pipeline", () => {
    // Mesma categoria, com e sem solução publicada: o gap da T13 é o mesmo.
    const semSolucao: FatoDeCategoria = { ...fatos[0]!, solucoesPublicadas: 0 };
    expect(montarMatriz([semSolucao])[0]!.gap).toBe(montarMatriz([fatos[0]!])[0]!.gap);
  });
});

describe("RN51 · lente de portfólio (T29) — coberta, frágil, sem cobertura, descoberta", () => {
  it("dois ou mais aliados com solução publicada é coberta", () => {
    expect(
      situacaoDaCategoria({
        categoriaId: "x",
        categoriaNome: "X",
        aliadosAtivos: 2,
        solucoesPublicadas: 1,
        funil: {},
      }),
    ).toBe("COBERTA");
  });

  it("aliado único é frágil, mesmo com soluções publicadas", () => {
    expect(
      situacaoDaCategoria({
        categoriaId: "x",
        categoriaNome: "X",
        aliadosAtivos: 1,
        solucoesPublicadas: 7,
        funil: {},
      }),
    ).toBe("FRAGIL");
  });

  it("aliados sem nenhuma solução publicada é frágil — prateleira vazia", () => {
    expect(
      situacaoDaCategoria({
        categoriaId: "x",
        categoriaNome: "X",
        aliadosAtivos: 5,
        solucoesPublicadas: 0,
        funil: {},
      }),
    ).toBe("FRAGIL");
  });

  it("sem aliado e com empresa em prospecção é descoberta no funil", () => {
    expect(situacaoDaCategoria(fatos[1]!)).toBe("DESCOBERTA_NO_FUNIL");
  });

  it("sem aliado e sem funil é sem cobertura — nunca zero silencioso (RN53)", () => {
    expect(situacaoDaCategoria(fatos[2]!)).toBe("SEM_COBERTURA");
  });

  it("categoria sem aliado permanece na lista de portfólio (RN53)", () => {
    const linhas = montarPortfolio(fatos);
    expect(linhas).toHaveLength(3);
    expect(linhas.map((linha) => linha.categoriaId)).toContain("c3");
  });

  it("o resumo do portfólio separa as quatro situações", () => {
    expect(resumirPortfolio(montarPortfolio(fatos))).toEqual({
      categorias: 3,
      cobertas: 1,
      fragis: 0,
      descobertasNoFunil: 1,
      semCobertura: 1,
      aliadosAtivos: 12,
      solucoesPublicadas: 9,
    });
  });

  it("só coberta dispensa ação; as outras três entram em 'Onde faltam'", () => {
    expect(exigeAcao("COBERTA")).toBe(false);
    expect(exigeAcao("FRAGIL")).toBe(true);
    expect(exigeAcao("DESCOBERTA_NO_FUNIL")).toBe(true);
    expect(exigeAcao("SEM_COBERTURA")).toBe(true);
  });

  it("todo critério tem texto declarado — 'frágil' não é adjetivo solto", () => {
    for (const texto of Object.values(CRITERIOS_SITUACAO)) {
      expect(texto.length).toBeGreaterThan(10);
    }
  });

  it("totalNoFunil soma só os cinco estágios pré-aliança", () => {
    expect(totalNoFunil(fatos[0]!)).toBe(3);
    expect(totalNoFunil(fatos[2]!)).toBe(0);
  });
});

describe("RN51 · ordenação e concentração da T29", () => {
  const linhas = montarPortfolio([
    { categoriaId: "a", categoriaNome: "Alfa", aliadosAtivos: 3, solucoesPublicadas: 1, funil: {} },
    { categoriaId: "b", categoriaNome: "Beta", aliadosAtivos: 8, solucoesPublicadas: 4, funil: {} },
    { categoriaId: "c", categoriaNome: "Gama", aliadosAtivos: 5, solucoesPublicadas: 9, funil: {} },
    { categoriaId: "d", categoriaNome: "Delta", aliadosAtivos: 0, solucoesPublicadas: 0, funil: {} },
  ]);

  it("ordena por volume decrescente da visão escolhida", () => {
    expect(ordenarPorVolume(linhas, "ALIADOS").map((l) => l.categoriaNome)).toEqual([
      "Beta",
      "Gama",
      "Alfa",
      "Delta",
    ]);
    expect(ordenarPorVolume(linhas, "SOLUCOES").map((l) => l.categoriaNome)).toEqual([
      "Gama",
      "Beta",
      "Alfa",
      "Delta",
    ]);
  });

  it("empate no volume é desfeito por nome — ordem estável entre recargas", () => {
    const empatadas = montarPortfolio([
      { categoriaId: "z", categoriaNome: "Zeta", aliadosAtivos: 2, solucoesPublicadas: 1, funil: {} },
      { categoriaId: "e", categoriaNome: "Épsilon", aliadosAtivos: 2, solucoesPublicadas: 1, funil: {} },
    ]);
    expect(ordenarPorVolume(empatadas, "ALIADOS").map((l) => l.categoriaNome)).toEqual([
      "Épsilon",
      "Zeta",
    ]);
  });

  it("concentração nomeia e posiciona as três maiores", () => {
    const concentracao = calcularConcentracao(linhas, "ALIADOS");
    expect(concentracao.total).toBe(16);
    expect(concentracao.percentual).toBe(100);
    expect(concentracao.maiores).toEqual([
      { posicao: 1, categoriaNome: "Beta", volume: 8 },
      { posicao: 2, categoriaNome: "Gama", volume: 5 },
      { posicao: 3, categoriaNome: "Alfa", volume: 3 },
    ]);
  });

  it("categoria vazia não entra entre as maiores", () => {
    const concentracao = calcularConcentracao(linhas, "ALIADOS");
    expect(concentracao.maiores.map((m) => m.categoriaNome)).not.toContain("Delta");
  });

  it("sem portfólio a concentração é indisponível, não 0% (RN53)", () => {
    const vazias = montarPortfolio([
      { categoriaId: "v", categoriaNome: "Vazia", aliadosAtivos: 0, solucoesPublicadas: 0, funil: {} },
    ]);
    const concentracao = calcularConcentracao(vazias, "ALIADOS");
    expect(concentracao.percentual).toBeNull();
    expect(concentracao.total).toBe(0);
    expect(concentracao.consideradas).toBe(0);
  });

  it("rede com menos de três categorias declara quantas considerou", () => {
    const duas = montarPortfolio([
      { categoriaId: "a", categoriaNome: "Alfa", aliadosAtivos: 3, solucoesPublicadas: 1, funil: {} },
      { categoriaId: "b", categoriaNome: "Beta", aliadosAtivos: 1, solucoesPublicadas: 1, funil: {} },
    ]);
    expect(calcularConcentracao(duas, "ALIADOS").consideradas).toBe(2);
  });
});
