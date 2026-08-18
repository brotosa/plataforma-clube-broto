"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  adicionarComentario,
  editarComentario,
  removerComentario,
  definirResolucaoPendencia,
} from "@/infra/casos-de-uso/comentarios";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/**
 * Ações do painel de atividades da ficha do aliado. Cada ação revalida a
 * rota da ficha para o feed refletir a mudança na próxima renderização.
 * A distinção por classe de erro (RN55) vive em `mensagensDeFalha`.
 */

export interface EstadoAcaoComentario {
  erros?: string[];
  sucesso?: string;
}

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown): EstadoAcaoComentario {
  return {
    erros: mensagensDeFalha(erro, {
      operacao: "registrar o comentário",
      semPermissao: "Seu papel não tem permissão para comentar nesta ficha.",
      contexto: "acao-comentario-aliado",
    }),
  };
}

export async function acaoAdicionarComentario(dados: {
  empresaId: string;
  texto: string;
  ehPendencia?: boolean;
  mencionados?: string[];
}): Promise<EstadoAcaoComentario> {
  const ator = await atorDaSessao();
  try {
    await adicionarComentario(ator, dados.empresaId, {
      texto: dados.texto,
      ehPendencia: dados.ehPendencia,
      mencionados: dados.mencionados,
    });
    revalidatePath(`/aliados/${dados.empresaId}`);
    return { sucesso: "Comentário registrado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoEditarComentario(dados: {
  empresaId: string;
  comentarioId: string;
  texto: string;
  ehPendencia?: boolean;
  mencionados?: string[];
}): Promise<EstadoAcaoComentario> {
  const ator = await atorDaSessao();
  try {
    await editarComentario(ator, dados.comentarioId, {
      texto: dados.texto,
      ehPendencia: dados.ehPendencia,
      mencionados: dados.mencionados,
    });
    revalidatePath(`/aliados/${dados.empresaId}`);
    return { sucesso: "Comentário atualizado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoRemoverComentario(dados: {
  empresaId: string;
  comentarioId: string;
}): Promise<EstadoAcaoComentario> {
  const ator = await atorDaSessao();
  try {
    await removerComentario(ator, dados.comentarioId);
    revalidatePath(`/aliados/${dados.empresaId}`);
    return { sucesso: "Comentário removido." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoResolverPendencia(dados: {
  empresaId: string;
  comentarioId: string;
  resolvida: boolean;
}): Promise<EstadoAcaoComentario> {
  const ator = await atorDaSessao();
  try {
    await definirResolucaoPendencia(ator, dados.comentarioId, dados.resolvida);
    revalidatePath(`/aliados/${dados.empresaId}`);
    return { sucesso: dados.resolvida ? "Pendência resolvida." : "Pendência reaberta." };
  } catch (erro) {
    return paraEstado(erro);
  }
}
