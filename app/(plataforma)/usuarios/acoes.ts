"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  atualizarUsuario,
  criarUsuario,
  inativarUsuario,
  reativarUsuario,
  redefinirCredencial,
  trocarPropriaSenha,
} from "@/infra/casos-de-uso/usuarios";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/**
 * Ações da T27. `senhaProvisoria` volta ao formulário porque é o ÚNICO
 * momento em que ela existe em claro: a tela a exibe uma vez, com aviso, e
 * o Administrador a repassa ao dono.
 */
export interface EstadoUsuarios {
  erros?: string[];
  sucesso?: string;
  senhaProvisoria?: string;
}

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown): EstadoUsuarios {
  // RN55 — a distinção por classe de erro vive em um lugar só, para
  // todas as server actions. Aqui fica apenas o que é desta tela: a
  // negativa de permissão com a referência da ficha e o verbo da
  // mensagem genérica, que nunca sugere repetir a ação.
  const mensagens = mensagensDeFalha(erro, {
    operacao: "concluir a ação",
    semPermissao: "Criar, editar e inativar usuários é exclusivo do Administrador da Plataforma (RN46).",
    contexto: "acao-usuario",
  });
  return { erros: mensagens };
}

export async function acaoCriarUsuario(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    const { senhaProvisoria } = await criarUsuario(ator, {
      nome: String(dados.get("nome") ?? ""),
      email: String(dados.get("email") ?? ""),
      papel: String(dados.get("papel") ?? ""),
    });
    revalidatePath("/usuarios");
    return {
      sucesso: "Usuário criado. A senha provisória aparece uma única vez — anote e repasse.",
      senhaProvisoria,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoAtualizarUsuario(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    await atualizarUsuario(ator, String(dados.get("usuarioId") ?? ""), {
      nome: String(dados.get("nome") ?? ""),
      papel: String(dados.get("papel") ?? ""),
    });
    revalidatePath("/usuarios");
    return { sucesso: "Usuário atualizado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoInativarUsuario(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    await inativarUsuario(ator, String(dados.get("usuarioId") ?? ""));
    revalidatePath("/usuarios");
    return {
      sucesso: "Usuário inativado. As sessões abertas dele caem na requisição seguinte (RN47).",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoReativarUsuario(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    const { senhaProvisoria } = await reativarUsuario(
      ator,
      String(dados.get("usuarioId") ?? ""),
    );
    revalidatePath("/usuarios");
    return {
      sucesso: "Usuário reativado com credencial nova — troca obrigatória no próximo acesso.",
      senhaProvisoria,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoRedefinirCredencial(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    const { senhaProvisoria } = await redefinirCredencial(
      ator,
      String(dados.get("usuarioId") ?? ""),
    );
    revalidatePath("/usuarios");
    return {
      sucesso: "Credencial redefinida — as sessões abertas do usuário foram derrubadas.",
      senhaProvisoria,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoTrocarPropriaSenha(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    await trocarPropriaSenha(ator, {
      nova: String(dados.get("nova") ?? ""),
      confirmacao: String(dados.get("confirmacao") ?? ""),
    });
  } catch (erro) {
    return paraEstado(erro);
  }
  // Fora do try: o redirect do Next se propaga como exceção e não pode
  // ser confundido com falha da troca.
  redirect("/");
}

/** Sair da plataforma a partir do aviso de sessão encerrada. */
export async function acaoSair(): Promise<void> {
  await signOut({ redirectTo: "/entrar" });
}
