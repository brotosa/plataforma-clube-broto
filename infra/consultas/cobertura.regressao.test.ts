import type { EstagioEmpresa } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/infra/prisma/cliente";
import { ESTAGIOS_DA_MATRIZ } from "@/dominio/cobertura/cobertura";
import { mapaDeCobertura } from "./cobertura-metas";

/**
 * **Teste de regressão da T13 (F14, exigência explícita do prompt da Onda 7).**
 *
 * A F14 extraiu a definição de cobertura para um serviço único (RN51) e a T13
 * passou a consumi-lo. O produto está em produção: a extração só é legítima se
 * os números da tela continuarem exatamente os mesmos.
 *
 * A prova aqui não é um golden file — número gravado à mão envelhece e alguém
 * o "atualiza" quando fica vermelho, que é como uma regressão vira commit. O
 * que este arquivo faz é manter a **implementação anterior congelada**
 * (`mapaDeCoberturaComoNaF9`, copiada verbatim de `cobertura-metas.ts` antes da
 * extração) e rodar as duas contra o MESMO banco, campo a campo.
 *
 * Se as duas divergirem, a suíte fica vermelha com a diferença visível — e a
 * ordem do prompt é parar e reportar, porque a diferença pode ser correção
 * legítima de divergência ou defeito novo, e isso é decisão de negócio.
 *
 * O cenário é montado aqui mesmo, cobrindo os casos que separam as lentes:
 * categoria coberta, categoria só com funil, categoria totalmente vazia,
 * categoria com aliado mas sem solução publicada, e registros sem categoria.
 */

const SUFIXO = "-regressao-cobertura-f14";

// ---------------------------------------------------------------------
// Implementação congelada — como a F9 a deixou, antes da RN51
// ---------------------------------------------------------------------

interface ContagemComoNaF9 {
  categoriaId: string;
  categoriaNome: string;
  aliadasAtivas: number;
  funil: Partial<Record<EstagioEmpresa, number>>;
}

/**
 * Cópia verbatim de `mapaDeCobertura` como estava em `infra/consultas/cobertura-metas.ts`
 * no commit `458b206` (F9), incluindo `montarMatriz`/`resumirCobertura` de
 * `dominio/metas/cobertura.ts`, reproduzidos aqui para o teste não depender do
 * módulo que a F14 substituiu.
 */
async function mapaDeCoberturaComoNaF9() {
  const [categorias, vinculos, semCategoria, aliadasSemCategoria] = await Promise.all([
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.empresaCategoria.findMany({
      where: {
        empresa: { estagio: { in: ["ALIADA_ATIVA", ...ESTAGIOS_DA_MATRIZ] } },
      },
      select: { categoriaId: true, empresa: { select: { estagio: true } } },
    }),
    prisma.empresa.count({
      where: {
        estagio: { in: [...ESTAGIOS_DA_MATRIZ] },
        categorias: { none: {} },
      },
    }),
    prisma.empresa.count({
      where: { estagio: "ALIADA_ATIVA", categorias: { none: {} } },
    }),
  ]);

  const porCategoria = new Map<string, ContagemComoNaF9>(
    categorias.map((categoria) => [
      categoria.id,
      {
        categoriaId: categoria.id,
        categoriaNome: categoria.nome,
        aliadasAtivas: 0,
        funil: {},
      },
    ]),
  );

  for (const vinculo of vinculos) {
    const contagem = porCategoria.get(vinculo.categoriaId);
    if (!contagem) {
      continue;
    }
    if (vinculo.empresa.estagio === "ALIADA_ATIVA") {
      contagem.aliadasAtivas += 1;
      continue;
    }
    const funil = contagem.funil as Record<string, number>;
    funil[vinculo.empresa.estagio] = (funil[vinculo.empresa.estagio] ?? 0) + 1;
  }

  const linhas = [...porCategoria.values()].map((contagem) => {
    const celulas = ESTAGIOS_DA_MATRIZ.map((estagio) => ({
      estagio,
      quantidade: contagem.funil[estagio] ?? 0,
    }));
    const totalNoFunil = celulas.reduce((soma, celula) => soma + celula.quantidade, 0);
    const gap = contagem.aliadasAtivas === 0;
    return {
      categoriaId: contagem.categoriaId,
      categoriaNome: contagem.categoriaNome,
      aliadasAtivas: contagem.aliadasAtivas,
      celulas,
      totalNoFunil,
      gap,
      gapDescoberto: gap && totalNoFunil === 0,
    };
  });

  const resumo = {
    categorias: linhas.length,
    categoriasCobertas: linhas.filter((linha) => !linha.gap).length,
    gaps: linhas.filter((linha) => linha.gap).length,
    gapsDescobertos: linhas.filter((linha) => linha.gapDescoberto).length,
    aliadasAtivas: linhas.reduce((soma, linha) => soma + linha.aliadasAtivas, 0),
    empresasNoFunil: linhas.reduce((soma, linha) => soma + linha.totalNoFunil, 0),
  };

  return { linhas, resumo, semCategoria, aliadasSemCategoria };
}

// ---------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------

const idsCriados = {
  categorias: [] as string[],
  empresas: [] as string[],
  solucoes: [] as string[],
  ofertas: [] as string[],
};

async function criarEmpresa(
  nome: string,
  estagio: EstagioEmpresa,
  categoriaId: string | null,
  uf: string | null = "PR",
) {
  const empresa = await prisma.empresa.create({
    data: {
      nomeFantasia: `${nome}${SUFIXO}`,
      estagio,
      enderecoUf: uf,
      ...(categoriaId ? { categorias: { create: { categoriaId } } } : {}),
    },
  });
  idsCriados.empresas.push(empresa.id);
  return empresa;
}

async function criarSolucaoPublicada(empresaId: string, categoriaId: string | null) {
  // Tipo de benefício e mecânica vêm do seed de taxonomias (F1) — o teste
  // não inventa taxonomia, usa a que a plataforma já tem.
  const [tipo, mecanica] = await Promise.all([
    prisma.tipoBeneficio.findFirst({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.mecanica.findFirst({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
  ]);
  if (!tipo || !mecanica) {
    throw new Error("Seed de taxonomias ausente: rode `pnpm db:seed` antes da suíte.");
  }

  const solucao = await prisma.solucao.create({
    data: { empresaId, nome: `Solução${SUFIXO}`, categoriaId },
  });
  idsCriados.solucoes.push(solucao.id);
  const oferta = await prisma.oferta.create({
    data: {
      solucaoId: solucao.id,
      titulo: `Oferta${SUFIXO}`,
      natureza: "BENEFICIO",
      tipoBeneficioId: tipo.id,
      mecanicaId: mecanica.id,
      vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
      status: "PUBLICADA",
    },
  });
  idsCriados.ofertas.push(oferta.id);
  return solucao;
}

beforeAll(async () => {
  const base = await prisma.categoria.count();

  // Quatro categorias que cobrem as situações que separam as duas lentes.
  for (const [indice, nome] of [
    "Coberta com dois aliados",
    "Aliado único",
    "Só funil",
    "Totalmente vazia",
  ].entries()) {
    const categoria = await prisma.categoria.create({
      data: {
        slug: `regressao-f14-${indice}`,
        nome: `${nome}${SUFIXO}`,
        ordem: 900 + indice,
        ativa: true,
      },
    });
    idsCriados.categorias.push(categoria.id);
  }

  const [coberta, unico, soFunil] = idsCriados.categorias;

  // Coberta: dois aliados ativos, um deles com solução publicada.
  const a1 = await criarEmpresa("Aliado A", "ALIADA_ATIVA", coberta!);
  await criarEmpresa("Aliado B", "ALIADA_ATIVA", coberta!, "SP");
  await criarSolucaoPublicada(a1.id, coberta!);

  // Aliado único: um aliado ativo, SEM solução publicada — frágil na T29,
  // e deliberadamente NÃO é gap na T13. É o caso que prova que as lentes
  // divergem sem que os números da T13 mudem.
  await criarEmpresa("Aliado C", "ALIADA_ATIVA", unico!, "MG");

  // Só funil: ninguém ativo, duas empresas em prospecção.
  await criarEmpresa("Prospect D", "MAPEADA", soFunil!, "GO");
  await criarEmpresa("Prospect E", "EM_NEGOCIACAO", soFunil!, "BA");

  // Sem categoria: um aliado e um prospect que ficam fora da distribuição.
  await criarEmpresa("Aliado sem categoria", "ALIADA_ATIVA", null, "RS");
  await criarEmpresa("Prospect sem categoria", "PRIORIZADA", null, "AM");

  expect(await prisma.categoria.count()).toBe(base + 4);
});

afterAll(async () => {
  await prisma.oferta.deleteMany({ where: { id: { in: idsCriados.ofertas } } });
  await prisma.solucao.deleteMany({ where: { id: { in: idsCriados.solucoes } } });
  await prisma.empresaCategoria.deleteMany({
    where: { empresaId: { in: idsCriados.empresas } },
  });
  await prisma.empresa.deleteMany({ where: { id: { in: idsCriados.empresas } } });
  await prisma.categoria.deleteMany({ where: { id: { in: idsCriados.categorias } } });
});

// ---------------------------------------------------------------------
// A prova
// ---------------------------------------------------------------------

describe("RN51 · a extração do serviço único não mudou os números da T13", () => {
  it("linhas, resumo e volumes excluídos são idênticos aos da implementação da F9", async () => {
    const [novo, comoNaF9] = await Promise.all([mapaDeCobertura(), mapaDeCoberturaComoNaF9()]);

    // Igualdade estrutural completa: qualquer campo que divergir aparece no diff.
    expect(novo).toEqual(comoNaF9);
  });

  it("o resumo bate campo a campo — a leitura que a T13 exibe no topo", async () => {
    const [novo, comoNaF9] = await Promise.all([mapaDeCobertura(), mapaDeCoberturaComoNaF9()]);

    expect(novo.resumo.categorias).toBe(comoNaF9.resumo.categorias);
    expect(novo.resumo.categoriasCobertas).toBe(comoNaF9.resumo.categoriasCobertas);
    expect(novo.resumo.gaps).toBe(comoNaF9.resumo.gaps);
    expect(novo.resumo.gapsDescobertos).toBe(comoNaF9.resumo.gapsDescobertos);
    expect(novo.resumo.aliadasAtivas).toBe(comoNaF9.resumo.aliadasAtivas);
    expect(novo.resumo.empresasNoFunil).toBe(comoNaF9.resumo.empresasNoFunil);
    expect(novo.semCategoria).toBe(comoNaF9.semCategoria);
    expect(novo.aliadasSemCategoria).toBe(comoNaF9.aliadasSemCategoria);
  });

  it("a ordem das linhas segue a taxonomia, como antes", async () => {
    const [novo, comoNaF9] = await Promise.all([mapaDeCobertura(), mapaDeCoberturaComoNaF9()]);
    expect(novo.linhas.map((linha) => linha.categoriaId)).toEqual(
      comoNaF9.linhas.map((linha) => linha.categoriaId),
    );
  });

  it("o cenário exercita mesmo as quatro situações — teste que não testa nada é pior que nenhum", async () => {
    const { linhas } = await mapaDeCobertura();
    const doCenario = linhas.filter((linha) => linha.categoriaNome.endsWith(SUFIXO));
    expect(doCenario).toHaveLength(4);

    const [coberta, unico, soFunil, vazia] = doCenario;
    expect(coberta!.aliadasAtivas).toBe(2);
    expect(coberta!.gap).toBe(false);

    // O caso decisivo: aliado único sem solução publicada continua fora do gap.
    expect(unico!.aliadasAtivas).toBe(1);
    expect(unico!.gap).toBe(false);

    expect(soFunil!.gap).toBe(true);
    expect(soFunil!.gapDescoberto).toBe(false);
    expect(soFunil!.totalNoFunil).toBe(2);

    expect(vazia!.gap).toBe(true);
    expect(vazia!.gapDescoberto).toBe(true);
  });
});
