import type { PeriodoMeta } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  type LinhaDaMatriz,
  montarMatriz,
  type ResumoDaCobertura,
  resumirCobertura,
} from "@/dominio/cobertura/cobertura";
import { apurarCobertura } from "./cobertura";
import { calcularLinha, type LinhaCalculada } from "@/dominio/metas/painel";
import {
  janelaDoPeriodo,
  type JanelaDePeriodo,
  rotuloDaJanela,
} from "@/dominio/metas/periodo";

/**
 * Consultas de leitura da T13 (mapa de cobertura) e da T14 (metas).
 *
 * O ponto delicado é o **realizado** da RN22: "promoções efetivadas no
 * período". A fonte é a trilha de auditoria — o único registro que sabe
 * *quando* a empresa virou aliada e *de onde* ela veio. As 46 aliadas da
 * carga inicial (F3) nasceram no estágio ALIADA_ATIVA e têm evento sem
 * valor anterior; promoção real sempre parte de um estágio anterior
 * (EM_NEGOCIACAO com a regra desligada, EM_APROVACAO pelo motor). Contar
 * pela auditoria cobre os dois caminhos de promoção sem contar a carga.
 */

export interface CoberturaDaTela {
  linhas: LinhaDaMatriz[];
  resumo: ResumoDaCobertura;
  /** Empresas do funil sem nenhuma categoria — ficam fora da matriz. */
  semCategoria: number;
  /**
   * Aliadas ativas sem categoria-alvo. A carga inicial (F3) trouxe os
   * sellers sem classificação, então esse número costuma ser alto: sem
   * exibi-lo, a matriz sugeriria portfólio vazio onde há aliada apenas
   * não classificada.
   */
  aliadasSemCategoria: number;
}

/**
 * Matriz categoria × (aliadas ativas · funil por estágio).
 *
 * A partir da F14 esta função **não apura mais nada**: ela pede os fatos ao
 * serviço único (RN51) e aplica a lente de pipeline. A assinatura, o formato
 * de retorno e — sobretudo — os números continuam idênticos aos da F9; é o
 * que `cobertura.regressao.test.ts` verifica contra a implementação anterior,
 * preservada ali como referência congelada.
 */
export async function mapaDeCobertura(): Promise<CoberturaDaTela> {
  const { fatos, excluidos } = await apurarCobertura();
  const linhas = montarMatriz(fatos);
  return {
    linhas,
    resumo: resumirCobertura(linhas),
    semCategoria: excluidos.empresasDoFunilSemCategoria,
    aliadasSemCategoria: excluidos.aliadosSemCategoria,
  };
}

/**
 * Promoções efetivadas na janela — a definição de "realizado" da RN22.
 * Opcionalmente restrita às empresas de uma categoria (linhas por
 * categoria do painel).
 */
export async function promocoesEfetivadas(
  janela: JanelaDePeriodo,
  categoriaId?: string,
): Promise<number> {
  const eventos = await prisma.auditoriaEvento.findMany({
    where: {
      entidade: "empresa",
      campo: "estagio",
      valorNovo: "ALIADA_ATIVA",
      // Carga inicial nasce aliada (sem valor anterior) e não é promoção.
      valorAnterior: { not: null },
      criadoEm: { gte: janela.inicio, lt: janela.fim },
    },
    select: { entidadeId: true },
  });

  const empresasPromovidas = [...new Set(eventos.map((evento) => evento.entidadeId))];
  if (empresasPromovidas.length === 0) {
    return 0;
  }
  if (!categoriaId) {
    return empresasPromovidas.length;
  }
  return prisma.empresa.count({
    where: {
      id: { in: empresasPromovidas },
      categorias: { some: { categoriaId } },
    },
  });
}

export interface MetasDaTela {
  /** Nulo quando nenhuma meta está configurada para a data de referência. */
  periodo: PeriodoMeta | null;
  rotuloPeriodo: string | null;
  janela: JanelaDePeriodo | null;
  geral: LinhaCalculada | null;
  origemDaMeta: string | null;
  porCategoria: LinhaCalculada[];
  /**
   * Promoções do período mesmo sem meta configurada — o realizado existe
   * independentemente de alguém ter definido a meta.
   */
  realizadoSemMeta: number | null;
}

/**
 * Painel de metas: a meta vigente na data de referência, o realizado do
 * mesmo período e as linhas por categoria quando houver metas por
 * categoria. Nada é inventado: sem meta na tabela, a tela diz isso.
 */
export async function painelDeMetas(referencia: Date = new Date()): Promise<MetasDaTela> {
  const metas = await prisma.metaPeriodo.findMany({
    where: { inicio: { lte: referencia }, fim: { gt: referencia } },
    include: { categoria: { select: { id: true, nome: true } } },
    orderBy: [{ categoriaId: "asc" }],
  });

  const metaGeral = metas.find((meta) => meta.categoriaId === null) ?? null;
  const metasPorCategoria = metas.filter((meta) => meta.categoriaId !== null);

  // Sem meta geral, o período de referência do painel vem de qualquer meta
  // vigente; sem meta nenhuma, o painel mostra o ano corrente e diz que a
  // meta não foi definida.
  const periodo = metaGeral?.periodo ?? metasPorCategoria[0]?.periodo ?? null;
  const janela = periodo ? janelaDoPeriodo(periodo, referencia) : null;

  if (!janela || !periodo) {
    const janelaAnual = janelaDoPeriodo("ANUAL", referencia);
    return {
      periodo: null,
      rotuloPeriodo: rotuloDaJanela("ANUAL", janelaAnual),
      janela: janelaAnual,
      geral: null,
      origemDaMeta: null,
      porCategoria: [],
      realizadoSemMeta: await promocoesEfetivadas(janelaAnual),
    };
  }

  const realizadoGeral = await promocoesEfetivadas(janela);
  const porCategoria = await Promise.all(
    metasPorCategoria.map(async (meta) => {
      const realizado = await promocoesEfetivadas(janela, meta.categoriaId!);
      return calcularLinha({
        categoriaId: meta.categoriaId,
        categoriaNome: meta.categoria?.nome ?? null,
        meta: meta.valor,
        realizado,
      });
    }),
  );

  return {
    periodo,
    rotuloPeriodo: rotuloDaJanela(periodo, janela),
    janela,
    geral: metaGeral
      ? calcularLinha({
          categoriaId: null,
          categoriaNome: null,
          meta: metaGeral.valor,
          realizado: realizadoGeral,
        })
      : null,
    origemDaMeta: metaGeral?.origem ?? null,
    porCategoria,
    realizadoSemMeta: metaGeral ? null : realizadoGeral,
  };
}
