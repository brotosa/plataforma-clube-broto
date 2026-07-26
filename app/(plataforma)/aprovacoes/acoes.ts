"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TipoEntidadeAprovacao } from "@prisma/client";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  configurarRegraAprovacao,
  decidirSolicitacao,
} from "@/infra/casos-de-uso/aprovacoes";
import type { EstadoFormulario } from "../aliados/acoes";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown): EstadoFormulario {
  // RN55 — a distinção por classe de erro vive em um lugar só, para
  // todas as server actions. Aqui fica apenas o que é desta tela: a
  // negativa de permissão com a referência da ficha e o verbo da
  // mensagem genérica, que nunca sugere repetir a ação.
  const mensagens = mensagensDeFalha(erro, {
    operacao: "concluir a ação",
    semPermissao: "Seu papel não tem permissão para esta ação (ficha §2).",
    contexto: "acao-aprovacao",
  });
  return { erros: mensagens };
}

export async function acaoDecidirSolicitacao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const decisao = String(dados.get("decisao")) as "APROVADA" | "DEVOLVIDA";
  const comentarioBruto = dados.get("comentario");
  const comentario =
    typeof comentarioBruto === "string" && comentarioBruto.trim() !== ""
      ? comentarioBruto.trim()
      : null;
  try {
    await decidirSolicitacao(ator, String(dados.get("solicitacaoId") ?? ""), decisao, comentario);
    revalidatePath("/aprovacoes");
    revalidatePath("/aliados");
    revalidatePath("/ofertas");
    return {
      sucesso:
        decisao === "APROVADA"
          ? "Solicitação aprovada — efeito aplicado."
          : "Solicitação devolvida ao solicitante com comentário.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoAlternarRegra(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  const tipoEntidade = String(dados.get("tipoEntidade")) as TipoEntidadeAprovacao;
  const exigida = String(dados.get("exigida")) === "true";
  await configurarRegraAprovacao(ator, tipoEntidade, { exigida });
  revalidatePath("/aprovacoes/regras");
  revalidatePath("/aprovacoes");
}

export async function acaoDefinirAprovadores(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const tipoEntidade = String(dados.get("tipoEntidade")) as TipoEntidadeAprovacao;
  try {
    await configurarRegraAprovacao(ator, tipoEntidade, {
      aprovadorIds: dados.getAll("aprovadorIds").map(String).filter(Boolean),
    });
    revalidatePath("/aprovacoes/regras");
    return { sucesso: "Aprovadores designados atualizados." };
  } catch (erro) {
    return paraEstado(erro);
  }
}
