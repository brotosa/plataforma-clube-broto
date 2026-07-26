import type { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  type EventoDeTrilha,
  type TipoDeEvento,
  classificarSensibilidade,
  descricaoDoEvento,
  montarDiferenca,
  tipoDoEvento,
} from "@/dominio/auditoria/extrato";

/**
 * Consulta da T28 (Onda 6, ficha §4) — SOMENTE LEITURA (RN48).
 *
 * Este módulo não tem, e não pode ganhar, nenhuma escrita sobre
 * `auditoria_eventos`: um teste de arquitetura
 * (infra/arquitetura/retencao-auditoria.test.ts) quebra o build se aparecer
 * update, delete ou truncate. A única gravação relacionada à auditoria que
 * a Onda 6 acrescenta é o evento da PRÓPRIA exportação (RN48), e ela vive
 * no caso de uso, não aqui.
 */

export const TAMANHO_PAGINA_AUDITORIA = 25;

export interface FiltrosAuditoria {
  entidade?: string;
  registro?: string;
  autorId?: string;
  tipo?: TipoDeEvento;
  /** Dias para trás a partir de agora; ausente = tudo. */
  dias?: number;
  pagina?: number;
}

export interface EventoDaTela extends EventoDeTrilha {
  tipo: TipoDeEvento;
  descricao: string;
  sensivel: boolean;
  diferencas: ReturnType<typeof montarDiferenca>;
}

/**
 * Filtro por tipo traduzido para o banco.
 *
 * Nem todo tipo é filtrável por coluna com precisão — "publicação" e
 * "aprovação", por exemplo, dependem da mesma leitura combinada que o
 * domínio faz. O que este `where` faz é ESTREITAR o conjunto o máximo
 * possível no banco; o refino final é do domínio, com `tipoDoEvento`, para
 * que a tela e o CSV nunca divirjam de critério.
 */
function whereDoTipo(tipo: TipoDeEvento | undefined): Prisma.AuditoriaEventoWhereInput {
  switch (tipo) {
    case "CRIACAO":
      return { valorAnterior: null };
    case "ALTERACAO":
      return { valorAnterior: { not: null } };
    case "ACESSO_PF":
      return { campo: "acesso_dados_plenos" };
    case "EXPORTACAO":
      return { entidade: { in: ["exportacao_lista", "kit_campanha", "exportacao_auditoria"] } };
    case "APROVACAO":
      return { entidade: { in: ["aprovacao_solicitacao", "aprovacao_regra"] } };
    case "PUBLICACAO":
      return { OR: [{ entidade: "publicacao" }, { valorNovo: "PUBLICADA" }] };
    default:
      return {};
  }
}

export function montarWhere(filtros: FiltrosAuditoria): Prisma.AuditoriaEventoWhereInput {
  const where: Prisma.AuditoriaEventoWhereInput = { ...whereDoTipo(filtros.tipo) };

  if (filtros.entidade) {
    where.entidade = filtros.entidade;
  }
  if (filtros.autorId) {
    where.autorId = filtros.autorId;
  }
  if (filtros.registro) {
    // "Registro" é o identificador do que foi tocado. O usuário raramente
    // conhece o cuid, então a busca também alcança o VALOR gravado — é
    // assim que procurar por "Agromove" encontra a linha da razão social.
    const termo = filtros.registro.trim();
    where.OR = [
      { entidadeId: { contains: termo, mode: "insensitive" } },
      { valorNovo: { contains: termo, mode: "insensitive" } },
      { valorAnterior: { contains: termo, mode: "insensitive" } },
    ];
  }
  if (filtros.dias && filtros.dias > 0) {
    const corte = new Date();
    corte.setUTCDate(corte.getUTCDate() - filtros.dias);
    where.criadoEm = { gte: corte };
  }
  return where;
}

function paraTela(evento: {
  id: string;
  entidade: string;
  entidadeId: string;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  autorId: string;
  criadoEm: Date;
  autor: { nome: string };
}): EventoDaTela {
  const base: EventoDeTrilha = {
    id: evento.id,
    entidade: evento.entidade,
    entidadeId: evento.entidadeId,
    campo: evento.campo,
    valorAnterior: evento.valorAnterior,
    valorNovo: evento.valorNovo,
    autorId: evento.autorId,
    autorNome: evento.autor.nome,
    criadoEm: evento.criadoEm,
  };
  return {
    ...base,
    tipo: tipoDoEvento(base),
    descricao: descricaoDoEvento(base),
    sensivel: classificarSensibilidade(base) !== null,
    diferencas: montarDiferenca(base),
  };
}

export interface PaginaDeAuditoria {
  eventos: EventoDaTela[];
  total: number;
  pagina: number;
  paginas: number;
}

export async function consultarTrilha(
  filtros: FiltrosAuditoria = {},
): Promise<PaginaDeAuditoria> {
  const where = montarWhere(filtros);
  const pagina = Math.max(1, filtros.pagina ?? 1);

  const [total, linhas] = await Promise.all([
    prisma.auditoriaEvento.count({ where }),
    prisma.auditoriaEvento.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (pagina - 1) * TAMANHO_PAGINA_AUDITORIA,
      take: TAMANHO_PAGINA_AUDITORIA,
      include: { autor: { select: { nome: true } } },
    }),
  ]);

  return {
    eventos: linhas.map(paraTela),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA_AUDITORIA)),
  };
}

/** Entidades presentes na trilha, para popular o filtro sem inventar opções. */
export async function entidadesDaTrilha(): Promise<string[]> {
  const grupos = await prisma.auditoriaEvento.groupBy({
    by: ["entidade"],
    orderBy: { entidade: "asc" },
  });
  return grupos.map((grupo) => grupo.entidade);
}

/** Autores presentes na trilha — mesma disciplina do filtro de entidade. */
export async function autoresDaTrilha(): Promise<Array<{ id: string; nome: string }>> {
  const grupos = await prisma.auditoriaEvento.groupBy({ by: ["autorId"] });
  const autores = await prisma.usuario.findMany({
    where: { id: { in: grupos.map((grupo) => grupo.autorId) } },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
  return autores;
}

/**
 * Eventos do extrato (RN48). Sem paginação, mas com teto explícito: um
 * extrato de auditoria pode ser enorme, e o limite é declarado ao usuário
 * na tela em vez de a exportação simplesmente truncar em silêncio.
 */
export const TETO_DO_EXTRATO = 10_000;

export async function eventosParaExtrato(
  filtros: FiltrosAuditoria = {},
): Promise<{ eventos: EventoDeTrilha[]; total: number; truncado: boolean }> {
  const where = montarWhere(filtros);
  const [total, linhas] = await Promise.all([
    prisma.auditoriaEvento.count({ where }),
    prisma.auditoriaEvento.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: TETO_DO_EXTRATO,
      include: { autor: { select: { nome: true } } },
    }),
  ]);

  return {
    eventos: linhas.map((linha) => ({
      id: linha.id,
      entidade: linha.entidade,
      entidadeId: linha.entidadeId,
      campo: linha.campo,
      valorAnterior: linha.valorAnterior,
      valorNovo: linha.valorNovo,
      autorId: linha.autorId,
      autorNome: linha.autor.nome,
      criadoEm: linha.criadoEm,
    })),
    total,
    truncado: total > TETO_DO_EXTRATO,
  };
}
