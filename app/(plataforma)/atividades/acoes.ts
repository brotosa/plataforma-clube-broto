"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  type AlvoComentario,
  adicionarComentario,
  editarComentario,
  removerComentario,
  definirResolucaoPendencia,
} from "@/infra/casos-de-uso/comentarios";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/**
 * Ações do painel de atividades — o mesmo painel serve a ficha do aliado e a
 * do patrocinador. Cada ação revalida a rota da ficha (`/aliados/:id` ou
 * `/patrocinadores/:id`) para o feed refletir a mudança na próxima
 * renderização. A distinção por classe de erro (RN55) vive em
 * `mensagensDeFalha`. O `alvo` diz em qual ficha o comentário vive.
 */

export type { AlvoComentario };

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
      contexto: "acao-comentario",
    }),
  };
}

/** Rota da ficha a revalidar, conforme o tipo do alvo. */
function rotaDaFicha(alvo: AlvoComentario): string {
  return alvo.tipo === "patrocinador" ? `/patrocinadores/${alvo.id}` : `/aliados/${alvo.id}`;
}

export async function acaoAdicionarComentario(dados: {
  alvo: AlvoComentario;
  texto: string;
  ehPendencia?: boolean;
  mencionados?: string[];
}): Promise<EstadoAcaoComentario> {
  const ator = await atorDaSessao();
  try {
    await adicionarComentario(ator, dados.alvo, {
      texto: dados.texto,
      ehPendencia: dados.ehPendencia,
      mencionados: dados.mencionados,
    });
    revalidatePath(rotaDaFicha(dados.alvo));
    return { sucesso: "Comentário registrado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoEditarComentario(dados: {
  alvo: AlvoComentario;
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
    revalidatePath(rotaDaFicha(dados.alvo));
    return { sucesso: "Comentário atualizado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoRemoverComentario(dados: {
  alvo: AlvoComentario;
  comentarioId: string;
}): Promise<EstadoAcaoComentario> {
  const ator = await atorDaSessao();
  try {
    await removerComentario(ator, dados.comentarioId);
    revalidatePath(rotaDaFicha(dados.alvo));
    return { sucesso: "Comentário removido." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoResolverPendencia(dados: {
  alvo: AlvoComentario;
  comentarioId: string;
  resolvida: boolean;
}): Promise<EstadoAcaoComentario> {
  const ator = await atorDaSessao();
  try {
    await definirResolucaoPendencia(ator, dados.comentarioId, dados.resolvida);
    revalidatePath(rotaDaFicha(dados.alvo));
    return { sucesso: dados.resolvida ? "Pendência resolvida." : "Pendência reaberta." };
  } catch (erro) {
    return paraEstado(erro);
  }
}
