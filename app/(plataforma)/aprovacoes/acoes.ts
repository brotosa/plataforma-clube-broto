"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TipoEntidadeAprovacao } from "@prisma/client";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import {
  configurarRegraAprovacao,
  decidirSolicitacao,
} from "@/infra/casos-de-uso/aprovacoes";
import type { EstadoFormulario } from "../aliados/acoes";
import { logger } from "@/infra/log/logger";

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown): EstadoFormulario {
  if (erro instanceof ErroDeValidacao) {
    return { erros: [...erro.erros] };
  }
  if (erro instanceof ErroDeAutorizacao) {
    return { erros: ["Seu papel não tem permissão para esta ação (ficha §2)."] };
  }
  logger.error({ erro: String(erro) }, "falha inesperada em ação de aprovação");
  return { erros: ["Não foi possível concluir a ação. Tente novamente."] };
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
