import type { EstagioEmpresa, OrigemEmpresa, Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  destinosDeMovimentoManual,
  diasNoEstagio,
  ESTAGIOS_FUNIL,
  nivelEnvelhecimento,
  ROTULOS_ESTAGIO_FUNIL,
  ROTULOS_ORIGEM,
  rotuloTempoNoEstagio,
} from "@/dominio/funil/regras";
import { lerReguaDeEnvelhecimento } from "@/infra/configuracao/servico-configuracao";

/**
 * Consultas de leitura da T8 (funil de mercado): kanban por estágio,
 * visão em tabela, contadores e filtros. Score vem de scoreScouting —
 * nulo até a F7 (avaliação): exibido como "—", nunca estimado.
 */

export type FaixaScore = "80_100" | "60_79" | "40_59" | "ABAIXO_40";

export interface FiltrosFunil {
  categoriaId?: string;
  origem?: OrigemEmpresa;
  faixaScore?: FaixaScore;
  /** Visão "Minhas empresas": responsável de scout = usuário. */
  minhasEmpresasDe?: string;
  /** Visão "Minhas negociações": responsável comercial = usuário. */
  minhasNegociacoesDe?: string;
}

const FAIXAS_SCORE: Readonly<Record<FaixaScore, Prisma.IntFilter>> = {
  "80_100": { gte: 80 },
  "60_79": { gte: 60, lte: 79 },
  "40_59": { gte: 40, lte: 59 },
  ABAIXO_40: { lt: 40 },
};

export interface CardFunil {
  id: string;
  nomeFantasia: string;
  /** RN54 — versão da marca para a URL; null = sem marca (placa inicial). */
  marcaHash: string | null;
  estagio: EstagioEmpresa;
  rotuloEstagio: string;
  categorias: string[];
  origem: OrigemEmpresa | null;
  rotuloOrigem: string | null;
  score: number | null;
  responsavelNome: string | null;
  dias: number | null;
  rotuloDias: string;
  envelhecimento: "LEVE" | "FORTE" | null;
  destinosDeMovimento: EstagioEmpresa[];
  motivoDescarte: string | null;
}

export async function funilDeMercado(filtros: FiltrosFunil = {}) {
  const onde: Prisma.EmpresaWhereInput = {
    estagio: { in: [...ESTAGIOS_FUNIL, "DESCARTADA"] },
  };
  if (filtros.categoriaId) {
    onde.categorias = { some: { categoriaId: filtros.categoriaId } };
  }
  if (filtros.origem) {
    onde.origem = filtros.origem;
  }
  if (filtros.faixaScore) {
    onde.scoreScouting = FAIXAS_SCORE[filtros.faixaScore];
  }
  if (filtros.minhasEmpresasDe) {
    onde.responsavelScoutId = filtros.minhasEmpresasDe;
  }
  if (filtros.minhasNegociacoesDe) {
    onde.responsavelComercialId = filtros.minhasNegociacoesDe;
  }

  // Régua vigente de envelhecimento (Parametrizador, F10): lida a cada
  // montagem do funil, para que a alteração na T17 apareça já na próxima
  // visita à T8 — sem retroagir sobre nada, porque o nível é derivado.
  const regua = await lerReguaDeEnvelhecimento();
  const empresas = await prisma.empresa.findMany({
    where: onde,
    orderBy: { criadoEm: "asc" },
    include: {
      categorias: { include: { categoria: true } },
      responsavelScout: { select: { id: true, nome: true } },
      responsavelComercial: { select: { id: true, nome: true } },
      motivoDescarte: { select: { nome: true } },
      // Hash da marca, jamais o binário: o funil monta dezenas de cards.
      marca: { select: { hash: true } },
    },
  });

  const agora = new Date();
  const cards: CardFunil[] = empresas.map((empresa) => {
    // Responsável exibido no card: comercial a partir do handoff (RN16);
    // antes disso, o responsável de scout (RN14).
    const responsavel =
      empresa.estagio === "EM_NEGOCIACAO" || empresa.estagio === "EM_APROVACAO"
        ? (empresa.responsavelComercial ?? empresa.responsavelScout)
        : empresa.responsavelScout;
    const dias = diasNoEstagio(empresa.estagioDesde, agora);
    return {
      id: empresa.id,
      nomeFantasia: empresa.nomeFantasia,
      marcaHash: empresa.marca?.hash ?? null,
      estagio: empresa.estagio,
      rotuloEstagio: ROTULOS_ESTAGIO_FUNIL[empresa.estagio],
      categorias: empresa.categorias.map((vinculo) => vinculo.categoria.nome),
      origem: empresa.origem,
      rotuloOrigem: empresa.origem ? ROTULOS_ORIGEM[empresa.origem] : null,
      score: empresa.scoreScouting,
      responsavelNome: responsavel?.nome ?? null,
      dias,
      rotuloDias: rotuloTempoNoEstagio(dias),
      envelhecimento: nivelEnvelhecimento(dias, regua),
      destinosDeMovimento: destinosDeMovimentoManual(empresa.estagio),
      motivoDescarte: empresa.motivoDescarte?.nome ?? null,
    };
  });

  const lanes = ESTAGIOS_FUNIL.map((estagio) => ({
    estagio,
    rotulo: ROTULOS_ESTAGIO_FUNIL[estagio],
    cards: cards.filter((card) => card.estagio === estagio),
  }));
  const descartadas = cards.filter((card) => card.estagio === "DESCARTADA");

  // Tabela: funil completo (inclui descartadas), score decrescente com
  // pendentes ao fim, desempate por nome.
  const tabela = [...cards].sort((a, b) => {
    if (a.score === null && b.score === null) {
      return a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR");
    }
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.nomeFantasia.localeCompare(b.nomeFantasia, "pt-BR");
  });

  return {
    lanes,
    tabela,
    regua,
    contadores: {
      identificadas: cards.length,
      noFunil: cards.length - descartadas.length,
      avaliadas: cards.filter((card) => card.score !== null).length,
      descartadas: descartadas.length,
    },
  };
}

/** Aliadas ativas (link "Aliada ativa · N ›" da T8). */
export function contarAliadasAtivas() {
  return prisma.empresa.count({ where: { estagio: "ALIADA_ATIVA" } });
}

/**
 * Usuários que podem conduzir negociação (modal de handoff, RN16):
 * time Comercial e Gestor, ativos.
 */
export function responsaveisComerciaisDisponiveis() {
  return prisma.usuario.findMany({
    where: { ativo: true, papel: { in: ["COMERCIAL", "GESTOR"] } },
    select: { id: true, nome: true, papel: true },
    orderBy: { nome: "asc" },
  });
}
