import { prisma } from "@/infra/prisma/cliente";
import {
  type DefinicaoFamilia,
  FAMILIAS_DE_LISTA,
  type FamiliaLista,
} from "@/dominio/parametrizador/listas";
import {
  CATALOGO_VALORES_REGRA,
  type ChaveValorRegra,
  type GrupoValorRegra,
} from "@/dominio/parametrizador/valores-regra";
import { PARAMETROS_ESTRUTURAIS } from "@/dominio/parametrizador/estruturais";
import { ENTIDADE_AUDITORIA, contarUsos, listarItens } from "@/infra/parametrizador/familias";
import type { PeriodoMeta, TipoValorRegra } from "@prisma/client";

/**
 * Leituras do Parametrizador (T15, T16 e T17). Nada é gravado aqui.
 *
 * "Último ajuste" vem da trilha de auditoria — a mesma que já registra
 * toda mutação desde a F1 —, e não de uma coluna paralela: um contador
 * desnormalizado envelheceria sem ninguém notar.
 */

function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(data);
}

/** "alterado por Ana em 18/07/2026" ou o texto de carga inicial. */
function textoDeAjuste(evento: { criadoEm: Date; autor: { nome: string } } | null): string {
  if (!evento) {
    return "carga inicial — sem alteração desde a implantação";
  }
  return `alterado por ${evento.autor.nome} em ${formatarData(evento.criadoEm)}`;
}

export interface CartaoDeFamilia extends DefinicaoFamilia {
  quantidade: number;
  quantidadeInativos: number;
  ultimoAjuste: string;
}

/** T15 — cartões das listas de domínio, com contagem e último ajuste. */
export async function cartoesDasFamilias(): Promise<CartaoDeFamilia[]> {
  return Promise.all(
    FAMILIAS_DE_LISTA.map(async (familia) => {
      const [itens, ultimoEvento] = await Promise.all([
        listarItens(prisma, familia.id),
        prisma.auditoriaEvento.findFirst({
          where: { entidade: ENTIDADE_AUDITORIA[familia.id] },
          orderBy: { criadoEm: "desc" },
          include: { autor: { select: { nome: true } } },
        }),
      ]);
      return {
        ...familia,
        quantidade: itens.length,
        quantidadeInativos: itens.filter((item) => !item.ativo).length,
        ultimoAjuste: textoDeAjuste(ultimoEvento),
      };
    }),
  );
}

export interface EstruturalExibido {
  chave: string;
  rotulo: string;
  justificativa: string;
  contagem: string;
}

/**
 * RN26 — estruturais com a contagem derivada dos metadados. Só as
 * mecânicas de resgate consultam o banco: são tabela, mas estruturais.
 */
export async function estruturaisDoHub(): Promise<EstruturalExibido[]> {
  const mecanicas = await prisma.mecanica.count();
  return PARAMETROS_ESTRUTURAIS.map((parametro) => {
    const quantidade =
      parametro.origem.tipo === "ENUM"
        ? parametro.origem.valores.length
        : parametro.origem.tipo === "TABELA"
          ? mecanicas
          : null;
    return {
      chave: parametro.chave,
      rotulo: parametro.rotulo,
      justificativa: parametro.justificativa,
      contagem:
        quantidade === null
          ? (parametro.origem.tipo === "ESCALA" ? parametro.origem.descricao : "—")
          : `${quantidade} ${quantidade === 1 ? "item" : "itens"}`,
    };
  });
}

export interface ValorExibido {
  chave: ChaveValorRegra;
  grupo: GrupoValorRegra;
  rotulo: string;
  descricao: string;
  tipo: TipoValorRegra;
  valor: number | null;
  sensivel: boolean;
  historico: string;
  /** `true` enquanto o negócio não definiu o valor (tetos do dossiê). */
  pendente: boolean;
}

/** T17 — valores de regra com o histórico legível de cada um (RN25). */
export async function valoresDeRegraExibidos(): Promise<ValorExibido[]> {
  const linhas = await prisma.valorRegra.findMany({
    orderBy: { ordem: "asc" },
    include: {
      historico: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        include: { autor: { select: { nome: true } } },
      },
    },
  });

  // Base sem seed: a T17 mostra o catálogo em vez de uma tela vazia que
  // faria parecer que a plataforma não tem régua nenhuma.
  if (linhas.length === 0) {
    return CATALOGO_VALORES_REGRA.map((definicao) => ({
      chave: definicao.chave,
      grupo: definicao.grupo,
      rotulo: definicao.rotulo,
      descricao: definicao.descricao,
      tipo: definicao.tipo,
      valor: definicao.valorInicial,
      sensivel: definicao.sensivel,
      historico: "carga inicial — sem alteração desde a implantação",
      pendente: definicao.valorInicial === null,
    }));
  }

  return linhas.map((linha) => {
    const ultimo = linha.historico[0];
    const valor = linha.valor === null ? null : Number(linha.valor);
    return {
      chave: linha.chave as ChaveValorRegra,
      grupo: linha.grupo as GrupoValorRegra,
      rotulo: linha.rotulo,
      descricao: linha.descricao,
      tipo: linha.tipo,
      valor,
      sensivel: linha.sensivel,
      historico: ultimo
        ? `alterado por ${ultimo.autor.nome} em ${formatarData(ultimo.criadoEm)}, de ${
            ultimo.valorAnterior === null ? "sem valor" : String(Number(ultimo.valorAnterior))
          } para ${ultimo.valorNovo === null ? "sem valor" : String(Number(ultimo.valorNovo))}`
        : valor === null
          ? "sem histórico — nunca definido"
          : "carga inicial — sem alteração desde a implantação",
      pendente: valor === null,
    };
  });
}

export interface MetaExibida {
  id: string;
  periodo: PeriodoMeta;
  inicio: Date;
  fim: Date;
  valor: number;
  categoriaId: string | null;
  categoriaNome: string | null;
  autorNome: string | null;
}

/** T17 — metas vigentes e futuras, mais recentes primeiro. */
export async function metasExibidas(): Promise<MetaExibida[]> {
  const metas = await prisma.meta.findMany({
    orderBy: [{ inicio: "desc" }, { periodo: "asc" }],
    include: {
      categoria: { select: { nome: true } },
      autor: { select: { nome: true } },
    },
  });
  return metas.map((meta) => ({
    id: meta.id,
    periodo: meta.periodo,
    inicio: meta.inicio,
    fim: meta.fim,
    valor: meta.valor,
    categoriaId: meta.categoriaId,
    categoriaNome: meta.categoria?.nome ?? null,
    autorNome: meta.autor?.nome ?? null,
  }));
}

/** T16 — itens da família com as frentes de uso já apuradas (RN24). */
export async function itensComUso(familia: FamiliaLista) {
  const itens = await listarItens(prisma, familia);
  return Promise.all(
    itens.map(async (item) => ({ ...item, usos: await contarUsos(prisma, familia, item.id) })),
  );
}

/** Histórico do item exibido no detalhe da T16. */
export async function ultimoAjusteDoItem(
  familia: FamiliaLista,
  itemId: string,
): Promise<string> {
  const evento = await prisma.auditoriaEvento.findFirst({
    where: { entidade: ENTIDADE_AUDITORIA[familia], entidadeId: itemId },
    orderBy: { criadoEm: "desc" },
    include: { autor: { select: { nome: true } } },
  });
  return textoDeAjuste(evento);
}

/** Estado da regra sensível — o hub avisa se ela está ligada (RN27). */
export async function regraSensivelExigida(): Promise<boolean> {
  const regra = await prisma.aprovacaoRegra.findUnique({
    where: { tipoEntidade: "PARAMETRO_SENSIVEL" },
  });
  return regra?.exigida ?? false;
}
