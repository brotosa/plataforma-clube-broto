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
  exigirNovaSenha,
  exigirNovaSenhaDeTodos,
  encerrarSessoes,
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
    semPermissao: "Criar, editar e inativar usuários é exclusivo do Administrador (RN46).",
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
      confirmacaoAcessoTotal: dados.get("confirmacaoAcessoTotal") === "sim",
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
      // Caixa desmarcada não vem no FormData, então ausência é "não
      // confirmado" — que é o padrão seguro. Comparar com a string evita
      // que um valor inesperado ("false", "0") seja lido como verdadeiro.
      confirmacaoAcessoTotal: dados.get("confirmacaoAcessoTotal") === "sim",
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

/**
 * Exigir nova senha de um usuário. Diferente de redefinir credencial, **não
 * devolve senha provisória** — a atual continua valendo até a pessoa trocar —,
 * e por isso não há nada a exibir nem a transmitir.
 */
export async function acaoExigirNovaSenha(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    await exigirNovaSenha(ator, String(dados.get("usuarioId") ?? ""));
    revalidatePath("/usuarios");
    return {
      sucesso:
        "Troca de senha exigida — a pessoa entra com a senha atual e é levada à troca no próximo acesso.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** Exigir nova senha de todos os usuários ativos, inclusive de quem executa. */
export async function acaoExigirNovaSenhaDeTodos(
  _anterior: EstadoUsuarios,
  _dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  try {
    const { alcancados } = await exigirNovaSenhaDeTodos(ator);
    revalidatePath("/usuarios");
    revalidatePath("/configuracoes");
    return {
      sucesso:
        alcancados === 0
          ? "Nenhum usuário a alcançar: todos os ativos já estão com troca exigida."
          : `Troca de senha exigida de ${alcancados} usuário(s) ativo(s), inclusive você.`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/**
 * Encerrar as sessões abertas de um usuário. Não tira o acesso: a pessoa entra
 * de novo com a senha que já tem.
 */
export async function acaoEncerrarSessoes(
  _anterior: EstadoUsuarios,
  dados: FormData,
): Promise<EstadoUsuarios> {
  const ator = await atorDaSessao();
  const usuarioId = String(dados.get("usuarioId") ?? "");
  try {
    await encerrarSessoes(ator, usuarioId);
    revalidatePath("/usuarios");
    return {
      sucesso:
        ator.id === usuarioId
          ? "Suas sessões foram encerradas — inclusive esta, na próxima navegação."
          : "Sessões encerradas — o acesso continua, e a pessoa entra de novo com a senha atual.",
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
