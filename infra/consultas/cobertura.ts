import type { EstagioEmpresa, Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  ESTAGIOS_DA_MATRIZ,
  type FatoDeCategoria,
  type VolumeExcluido,
} from "@/dominio/cobertura/cobertura";
import { type Regiao, UFS_POR_REGIAO } from "@/dominio/geografia/regioes";

/**
 * RN51 — a consulta única de cobertura.
 *
 * Uma apuração, três lentes. Quem quiser saber de cobertura — T13 (pipeline),
 * T29 (portfólio) ou Dashboard (agregados) — passa por aqui. As lentes vivem
 * em `dominio/cobertura/cobertura.ts` e operam sobre o que este arquivo
 * devolve; nenhuma delas volta ao banco por conta própria.
 *
 * O que a apuração faz numa passada só:
 *   - as categorias ATIVAS da taxonomia (o denominador, inclusive as vazias);
 *   - aliados ativos por categoria;
 *   - soluções publicadas por categoria;
 *   - o funil pré-aliança por estágio e categoria;
 *   - e os volumes que ficam de fora, que a RN53 obriga a declarar.
 */

// ---------------------------------------------------------------------
// Recorte (filtros da T29)
// ---------------------------------------------------------------------

export interface RecorteDeCobertura {
  /** Cultura declarada nas soluções (ficha §2, filtro da T29). */
  culturaId?: string;
  /** Região da SEDE do aliado — nunca da abrangência (RN52). */
  regiao?: Regiao;
}

/**
 * O funil **não** é recortado por cultura, e isso é decisão, não esquecimento.
 *
 * Cultura é atributo declarado da solução (`solucao_culturas`), e empresa em
 * prospecção ainda não tem solução cadastrada. Aplicar o filtro ao funil
 * zeraria silenciosamente a coluna e faria toda categoria parecer "sem
 * cobertura e sem ninguém atrás" — exatamente o diagnóstico falso que a RN53
 * existe para impedir. Região o funil aceita, porque sede o prospect declara.
 *
 * A T29 exibe esta ressalva quando o filtro de cultura está ativo.
 */
export const FUNIL_IGNORA_CULTURA =
  "o funil não é recortado por cultura — empresa em prospecção ainda não declara solução, e portanto não declara cultura";

function ufsDaRegiao(regiao: Regiao): string[] {
  return [...UFS_POR_REGIAO[regiao]];
}

/** Filtro sobre a empresa aliada: sede na região e cultura via solução. */
function ondeDoAliado(recorte: RecorteDeCobertura): Prisma.EmpresaWhereInput {
  const onde: Prisma.EmpresaWhereInput = { estagio: "ALIADA_ATIVA" };
  if (recorte.regiao) {
    onde.enderecoUf = { in: ufsDaRegiao(recorte.regiao) };
  }
  if (recorte.culturaId) {
    onde.solucoes = { some: { culturas: { some: { culturaId: recorte.culturaId } } } };
  }
  return onde;
}

/** Filtro sobre a solução publicada (a que está na vitrine). */
function ondeDaSolucaoPublicada(recorte: RecorteDeCobertura): Prisma.SolucaoWhereInput {
  const onde: Prisma.SolucaoWhereInput = {
    ofertas: { some: { status: "PUBLICADA" } },
    empresa: { estagio: "ALIADA_ATIVA" },
  };
  if (recorte.regiao) {
    onde.empresa = { estagio: "ALIADA_ATIVA", enderecoUf: { in: ufsDaRegiao(recorte.regiao) } };
  }
  if (recorte.culturaId) {
    onde.culturas = { some: { culturaId: recorte.culturaId } };
  }
  return onde;
}

/** Filtro sobre a empresa em estágio pré-aliança (colunas do funil). */
function ondeDoFunil(recorte: RecorteDeCobertura): Prisma.EmpresaWhereInput {
  const onde: Prisma.EmpresaWhereInput = { estagio: { in: [...ESTAGIOS_DA_MATRIZ] } };
  if (recorte.regiao) {
    onde.enderecoUf = { in: ufsDaRegiao(recorte.regiao) };
  }
  return onde;
}

// ---------------------------------------------------------------------
// Apuração
// ---------------------------------------------------------------------

export interface CoberturaApurada {
  /** Uma linha por categoria ativa, na ordem da taxonomia. */
  fatos: FatoDeCategoria[];
  excluidos: VolumeExcluido;
  recorte: RecorteDeCobertura;
}

/**
 * Apura os fatos de cobertura. Chamada sem recorte devolve a rede inteira —
 * que é como a T13 e o Dashboard sempre a consumiram.
 */
export async function apurarCobertura(
  recorte: RecorteDeCobertura = {},
): Promise<CoberturaApurada> {
  const [
    categorias,
    aliados,
    solucoes,
    empresasDoFunil,
    aliadosSemCategoria,
    empresasDoFunilSemCategoria,
    solucoesSemCategoria,
  ] = await Promise.all([
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.empresaCategoria.findMany({
      where: { empresa: ondeDoAliado(recorte) },
      select: { categoriaId: true },
    }),
    prisma.solucao.groupBy({
      by: ["categoriaId"],
      where: { ...ondeDaSolucaoPublicada(recorte), categoriaId: { not: null } },
      _count: { _all: true },
    }),
    prisma.empresaCategoria.findMany({
      where: { empresa: ondeDoFunil(recorte) },
      select: { categoriaId: true, empresa: { select: { estagio: true } } },
    }),
    prisma.empresa.count({ where: { ...ondeDoAliado(recorte), categorias: { none: {} } } }),
    prisma.empresa.count({ where: { ...ondeDoFunil(recorte), categorias: { none: {} } } }),
    prisma.solucao.count({ where: { ...ondeDaSolucaoPublicada(recorte), categoriaId: null } }),
  ]);

  const aliadosPorCategoria = new Map<string, number>();
  for (const vinculo of aliados) {
    aliadosPorCategoria.set(
      vinculo.categoriaId,
      (aliadosPorCategoria.get(vinculo.categoriaId) ?? 0) + 1,
    );
  }

  const solucoesPorCategoria = new Map<string, number>(
    solucoes.map((linha) => [linha.categoriaId as string, linha._count._all]),
  );

  const funilPorCategoria = new Map<string, Partial<Record<EstagioEmpresa, number>>>();
  for (const vinculo of empresasDoFunil) {
    const porEstagio = funilPorCategoria.get(vinculo.categoriaId) ?? {};
    const estagio = vinculo.empresa.estagio;
    porEstagio[estagio] = (porEstagio[estagio] ?? 0) + 1;
    funilPorCategoria.set(vinculo.categoriaId, porEstagio);
  }

  // Categoria inativa sai da taxonomia e sai da matriz junto: os vínculos
  // dela simplesmente não encontram linha aqui.
  const fatos: FatoDeCategoria[] = categorias.map((categoria) => ({
    categoriaId: categoria.id,
    categoriaNome: categoria.nome,
    aliadosAtivos: aliadosPorCategoria.get(categoria.id) ?? 0,
    solucoesPublicadas: solucoesPorCategoria.get(categoria.id) ?? 0,
    funil: funilPorCategoria.get(categoria.id) ?? {},
  }));

  return {
    fatos,
    excluidos: { aliadosSemCategoria, empresasDoFunilSemCategoria, solucoesSemCategoria },
    recorte,
  };
}

// ---------------------------------------------------------------------
// Matriz Categoria × cultura (ficha §2)
// ---------------------------------------------------------------------

export interface MatrizCategoriaCultura {
  culturas: ReadonlyArray<{ id: string; nome: string }>;
  linhas: ReadonlyArray<{
    categoriaId: string;
    categoriaNome: string;
    /** Contagem por cultura, na ordem de `culturas`. */
    valores: ReadonlyArray<number>;
    /** Soluções publicadas da categoria — o total que NÃO é a soma da linha. */
    totalDaCategoria: number;
  }>;
  /** Soluções publicadas sem nenhuma cultura declarada — ficam fora (RN53). */
  solucoesSemCultura: number;
}

/**
 * Soluções publicadas por categoria e cultura declarada.
 *
 * Duas notas que a ficha §2 torna **obrigatórias** na tela, e que esta
 * consulta materializa:
 *
 * (a) uma solução pode servir mais de uma cultura, então a linha soma mais
 *     que o total da categoria — por isso `totalDaCategoria` viaja junto, em
 *     vez de deixar quem lê somar a linha e concluir errado;
 * (b) a matriz **independe do filtro de região**, porque cultura é
 *     característica declarada da solução, não da sede do aliado. Daí esta
 *     função não receber recorte algum: o recorte não se aplica a ela.
 */
export async function matrizCategoriaCultura(): Promise<MatrizCategoriaCultura> {
  const publicada = ondeDaSolucaoPublicada({});

  const [categorias, culturas, vinculos, porCategoria, solucoesSemCultura] = await Promise.all([
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.cultura.findMany({
      where: { ativa: true },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.solucaoCultura.findMany({
      where: { solucao: { ...publicada, categoriaId: { not: null } } },
      select: { culturaId: true, solucao: { select: { categoriaId: true } } },
    }),
    prisma.solucao.groupBy({
      by: ["categoriaId"],
      where: { ...publicada, categoriaId: { not: null } },
      _count: { _all: true },
    }),
    prisma.solucao.count({ where: { ...publicada, culturas: { none: {} } } }),
  ]);

  const contagens = new Map<string, number>();
  for (const vinculo of vinculos) {
    const categoriaId = vinculo.solucao.categoriaId;
    if (!categoriaId) {
      continue;
    }
    const chave = `${categoriaId}::${vinculo.culturaId}`;
    contagens.set(chave, (contagens.get(chave) ?? 0) + 1);
  }

  const totais = new Map<string, number>(
    porCategoria.map((linha) => [linha.categoriaId as string, linha._count._all]),
  );

  return {
    culturas,
    linhas: categorias.map((categoria) => ({
      categoriaId: categoria.id,
      categoriaNome: categoria.nome,
      valores: culturas.map((cultura) => contagens.get(`${categoria.id}::${cultura.id}`) ?? 0),
      totalDaCategoria: totais.get(categoria.id) ?? 0,
    })),
    solucoesSemCultura,
  };
}

// ---------------------------------------------------------------------
// Listas de apoio aos filtros
// ---------------------------------------------------------------------

/** Culturas ativas — lista mantida no Parametrizador (ficha §2). */
export async function culturasParaFiltro() {
  return prisma.cultura.findMany({
    where: { ativa: true },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}

/** Categorias ativas — usadas no filtro da T30. */
export async function categoriasParaFiltro() {
  return prisma.categoria.findMany({
    where: { ativa: true },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true },
  });
}
