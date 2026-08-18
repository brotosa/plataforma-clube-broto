import { prisma } from "@/infra/prisma/cliente";

/**
 * Consultas de leitura do painel de atividades da ficha do aliado.
 *
 * - `feedDoAliado`: comentários vivos (não removidos) do aliado, do mais
 *   recente para o mais antigo, com autor, menções e estado da pendência.
 * - `usuariosMencionaveis`: usuários ativos para o seletor de @menção.
 * - `contarPendenciasQueMencionam`: alimenta a linha derivada do sino
 *   ("pendências que mencionam você") — pendências abertas, não removidas,
 *   que mencionam o usuário. Sem fila nem lido/não-lido: é contagem derivada,
 *   no mesmo espírito das demais linhas do sino.
 */

export interface MencaoDoFeed {
  usuarioId: string;
  nome: string;
}

export interface ComentarioDoFeed {
  id: string;
  texto: string;
  autorId: string;
  autorNome: string;
  criadoEm: Date;
  editadoEm: Date | null;
  ehPendencia: boolean;
  pendenciaResolvidaEm: Date | null;
  mencoes: MencaoDoFeed[];
}

export async function feedDoAliado(empresaId: string): Promise<ComentarioDoFeed[]> {
  const notas = await prisma.notaRapida.findMany({
    where: { empresaId, removidoEm: null },
    orderBy: { criadoEm: "desc" },
    include: {
      autor: { select: { nome: true } },
      mencoes: { include: { usuario: { select: { id: true, nome: true } } } },
    },
  });
  return notas.map((nota) => ({
    id: nota.id,
    texto: nota.texto,
    autorId: nota.autorId,
    autorNome: nota.autor.nome,
    criadoEm: nota.criadoEm,
    editadoEm: nota.editadoEm,
    ehPendencia: nota.ehPendencia,
    pendenciaResolvidaEm: nota.pendenciaResolvidaEm,
    mencoes: nota.mencoes.map((mencao) => ({
      usuarioId: mencao.usuario.id,
      nome: mencao.usuario.nome,
    })),
  }));
}

export interface UsuarioMencionavel {
  id: string;
  nome: string;
}

/** Usuários ativos para o seletor de @menção (sem o próprio autor filtrado aqui). */
export async function usuariosMencionaveis(): Promise<UsuarioMencionavel[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  return usuarios;
}

/**
 * Quantas pendências abertas mencionam este usuário. Derivada, para o sino —
 * some sozinha quando a pendência é resolvida ou o comentário é removido.
 */
export function contarPendenciasQueMencionam(usuarioId: string): Promise<number> {
  return prisma.notaRapida.count({
    where: {
      removidoEm: null,
      ehPendencia: true,
      pendenciaResolvidaEm: null,
      mencoes: { some: { usuarioId } },
    },
  });
}
