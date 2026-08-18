import { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { validarTextoComentario } from "@/dominio/comentarios/regras";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do painel de atividades da ficha do aliado. O comentário
 * nasceu como "nota rápida" (dormante) e aqui ganha ciclo de vida:
 *
 * - comentar (com pendência e menções opcionais) — quem opera a ficha;
 * - editar / apagar — **só o próprio autor**, apagar é soft-delete;
 * - resolver / reabrir pendência — quem opera a ficha (a equipe fecha).
 *
 * Tudo auditado (RN49): apagar some da vista, a trilha permanece. As menções
 * só destacam o nome no painel; quando a pendência está aberta, a consulta do
 * sino conta "pendências que mencionam você" — sem fila nem lido/não-lido.
 */

export interface DadosComentario {
  texto: string;
  ehPendencia?: boolean;
  /** Ids de usuários mencionados (o próprio autor é ignorado). */
  mencionados?: ReadonlyArray<string>;
}

/** Confere que os ids mencionados são usuários ativos; devolve o conjunto. */
async function mencionadosValidos(
  tx: Prisma.TransactionClient,
  autorId: string,
  ids: ReadonlyArray<string> | undefined,
): Promise<string[]> {
  const unicos = [...new Set(ids ?? [])].filter((id) => id !== autorId);
  if (unicos.length === 0) {
    return [];
  }
  const usuarios = await tx.usuario.findMany({
    where: { id: { in: unicos }, ativo: true },
    select: { id: true },
  });
  if (usuarios.length !== unicos.length) {
    throw new ErroDeValidacao(["Menção a usuário inexistente ou inativo."]);
  }
  return unicos;
}

/** Comentar na ficha (opcionalmente como pendência e com menções). */
export async function adicionarComentario(
  ator: Ator,
  empresaId: string,
  dados: DadosComentario,
) {
  exigirPermissao(ator.papel, "COMENTAR_FICHA_ALIADO");
  const erros = validarTextoComentario(dados.texto);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  const texto = dados.texto.trim();
  const ehPendencia = dados.ehPendencia === true;

  return prisma.$transaction(async (tx) => {
    await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const mencionados = await mencionadosValidos(tx, ator.id, dados.mencionados);

    const nota = await tx.notaRapida.create({
      data: {
        empresaId,
        autorId: ator.id,
        texto,
        ehPendencia,
        mencoes: { create: mencionados.map((usuarioId) => ({ usuarioId })) },
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: nota.id,
      autorId: ator.id,
      anterior: null,
      novo: { empresaId, texto, ehPendencia, mencionados },
    });
    return nota;
  });
}

/** Editar o próprio comentário (texto, pendência, menções). */
export async function editarComentario(
  ator: Ator,
  comentarioId: string,
  dados: DadosComentario,
) {
  exigirPermissao(ator.papel, "COMENTAR_FICHA_ALIADO");
  const erros = validarTextoComentario(dados.texto);
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  const texto = dados.texto.trim();
  const ehPendencia = dados.ehPendencia === true;

  return prisma.$transaction(async (tx) => {
    const atual = await tx.notaRapida.findUniqueOrThrow({
      where: { id: comentarioId },
      include: { mencoes: true },
    });
    if (atual.removidoEm) {
      throw new ErroDeValidacao(["Comentário removido não pode ser editado."]);
    }
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao(["Só o autor pode editar o próprio comentário."]);
    }
    const mencionados = await mencionadosValidos(tx, ator.id, dados.mencionados);

    // Re-sincroniza as menções (substitui o conjunto anterior).
    await tx.notaRapidaMencao.deleteMany({ where: { notaRapidaId: comentarioId } });
    const nota = await tx.notaRapida.update({
      where: { id: comentarioId },
      data: {
        texto,
        ehPendencia,
        // Marca de edição; se deixar de ser pendência, a resolução perde sentido.
        editadoEm: new Date(),
        pendenciaResolvidaEm: ehPendencia ? atual.pendenciaResolvidaEm : null,
        mencoes: { create: mencionados.map((usuarioId) => ({ usuarioId })) },
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: comentarioId,
      autorId: ator.id,
      anterior: {
        texto: atual.texto,
        ehPendencia: atual.ehPendencia,
        mencionados: atual.mencoes.map((m) => m.usuarioId),
      },
      novo: { texto, ehPendencia, mencionados },
    });
    return nota;
  });
}

/** Apagar o próprio comentário — soft-delete (a trilha permanece). */
export async function removerComentario(ator: Ator, comentarioId: string) {
  exigirPermissao(ator.papel, "COMENTAR_FICHA_ALIADO");

  return prisma.$transaction(async (tx) => {
    const atual = await tx.notaRapida.findUniqueOrThrow({ where: { id: comentarioId } });
    if (atual.removidoEm) {
      return atual; // idempotente: já removido
    }
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao(["Só o autor pode apagar o próprio comentário."]);
    }
    const nota = await tx.notaRapida.update({
      where: { id: comentarioId },
      data: { removidoEm: new Date() },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: comentarioId,
      autorId: ator.id,
      anterior: { removidoEm: null },
      novo: { removidoEm: nota.removidoEm },
    });
    return nota;
  });
}

/**
 * Resolver ou reabrir a pendência de um comentário. É ato da equipe (quem
 * opera a ficha), não só do autor: quem foi mencionado pode fechar a sua.
 */
export async function definirResolucaoPendencia(
  ator: Ator,
  comentarioId: string,
  resolvida: boolean,
) {
  exigirPermissao(ator.papel, "COMENTAR_FICHA_ALIADO");

  return prisma.$transaction(async (tx) => {
    const atual = await tx.notaRapida.findUniqueOrThrow({ where: { id: comentarioId } });
    if (atual.removidoEm) {
      throw new ErroDeValidacao(["Comentário removido não tem pendência a alterar."]);
    }
    if (!atual.ehPendencia) {
      throw new ErroDeValidacao(["Este comentário não é uma pendência."]);
    }
    const pendenciaResolvidaEm = resolvida ? new Date() : null;
    const nota = await tx.notaRapida.update({
      where: { id: comentarioId },
      data: { pendenciaResolvidaEm },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: comentarioId,
      autorId: ator.id,
      anterior: { pendenciaResolvidaEm: atual.pendenciaResolvidaEm },
      novo: { pendenciaResolvidaEm },
    });
    return nota;
  });
}
