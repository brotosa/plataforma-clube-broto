"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { type Ator } from "@/infra/casos-de-uso/contexto";
import { alterarPoliticaDeSenha, alterarPoliticaDeSessao, alterarPoliticaDeLogin } from "@/infra/casos-de-uso/configuracoes";
import { desbloquearLogin } from "@/infra/casos-de-uso/bloqueio-login";
import type { PoliticaDeSenha } from "@/dominio/usuarios/politica-senha";
import type { PoliticaDeSessao } from "@/dominio/usuarios/politica-sessao";
import type { PoliticaDeLogin } from "@/dominio/usuarios/politica-login";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/** Estado da ação de salvar a política — erros nomeados ou sucesso. */
export interface EstadoConfiguracoes {
  ok?: boolean;
  erros?: string[];
}

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

/** Salva a política de senha (Configurações). Só Administrador; auditado. */
export async function acaoSalvarPoliticaSenha(
  politica: PoliticaDeSenha,
): Promise<EstadoConfiguracoes> {
  const ator = await atorDaSessao();
  try {
    await alterarPoliticaDeSenha(ator, politica);
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (erro) {
    return {
      erros: mensagensDeFalha(erro, {
        operacao: "salvar a política de senha",
        semPermissao: "Só o Administrador da Plataforma configura o portal.",
        contexto: "acao-configuracoes",
      }),
    };
  }
}

/** Salva a política de bloqueio por login. Só Administrador; auditado. */
export async function acaoSalvarBloqueioLogin(
  politica: PoliticaDeLogin,
): Promise<EstadoConfiguracoes> {
  const ator = await atorDaSessao();
  try {
    await alterarPoliticaDeLogin(ator, politica);
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (erro) {
    return {
      erros: mensagensDeFalha(erro, {
        operacao: "salvar o bloqueio por tentativas de login",
        semPermissao: "Só o Administrador da Plataforma configura o portal.",
        contexto: "acao-configuracoes",
      }),
    };
  }
}

/** Desbloqueia manualmente uma conta. Só Administrador; auditado. */
export async function acaoDesbloquearLogin(usuarioId: string): Promise<EstadoConfiguracoes> {
  const ator = await atorDaSessao();
  try {
    await desbloquearLogin(ator, usuarioId);
    revalidatePath("/configuracoes");
    return { ok: true };
  } catch (erro) {
    return {
      erros: mensagensDeFalha(erro, {
        operacao: "desbloquear a conta",
        semPermissao: "Só o Administrador da Plataforma desbloqueia contas.",
        contexto: "acao-configuracoes",
      }),
    };
  }
}

/** Salva a política de sessão (tempo de inatividade). Só Administrador; auditado. */
export async function acaoSalvarTempoSessao(
  politica: PoliticaDeSessao,
): Promise<EstadoConfiguracoes> {
  const ator = await atorDaSessao();
  try {
    await alterarPoliticaDeSessao(ator, politica);
    // A camada de sessão lê a política a cada requisição, mas revalidar mantém
    // o contador do cabeçalho coerente na navegação seguinte.
    revalidatePath("/configuracoes");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (erro) {
    return {
      erros: mensagensDeFalha(erro, {
        operacao: "salvar o tempo de sessão",
        semPermissao: "Só o Administrador da Plataforma configura o portal.",
        contexto: "acao-configuracoes",
      }),
    };
  }
}
