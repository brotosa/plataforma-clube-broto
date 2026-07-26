"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PorteProdutor, StatusSolucao } from "@prisma/client";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  atualizarSolucao,
  criarSolucao,
  mudarStatusSolucao,
} from "@/infra/casos-de-uso/solucoes";
import type { EstadoFormulario } from "../../acoes";
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
    contexto: "acao-solucao",
  });
  return { erros: mensagens };
}

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

function dadosSolucaoDoFormulario(dados: FormData) {
  return {
    nome: texto(dados, "nome") ?? undefined,
    descricaoCurta: texto(dados, "descricaoCurta"),
    descricaoCompleta: texto(dados, "descricaoCompleta"),
    categoriaId: texto(dados, "categoriaId"),
    imagemCardUrl: texto(dados, "imagemCardUrl"),
    linkExterno: texto(dados, "linkExterno"),
    coberturaNacional: dados.get("coberturaNacional") === "1",
    perfilCliente: dados.getAll("perfilCliente").map(String) as PorteProdutor[],
    tecnologias: (texto(dados, "tecnologias") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    culturaIds: dados.getAll("culturaIds").map(String).filter(Boolean),
    ufIds: dados.getAll("ufIds").map(String).filter(Boolean),
  };
}

export async function acaoCriarSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  let solucaoId = "";
  try {
    const solucao = await criarSolucao(ator, empresaId, dadosSolucaoDoFormulario(dados));
    solucaoId = solucao.id;
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/aliados/${empresaId}`);
  redirect(`/aliados/${empresaId}/solucoes/${solucaoId}`);
}

export async function acaoAtualizarSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  const solucaoId = String(dados.get("solucaoId") ?? "");
  try {
    await atualizarSolucao(ator, solucaoId, dadosSolucaoDoFormulario(dados));
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/aliados/${empresaId}`);
  revalidatePath(`/aliados/${empresaId}/solucoes/${solucaoId}`);
  redirect(`/aliados/${empresaId}/solucoes/${solucaoId}`);
}

export async function acaoMudarStatusSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  const solucaoId = String(dados.get("solucaoId") ?? "");
  try {
    const { ofertasPausadas } = await mudarStatusSolucao(
      ator,
      solucaoId,
      String(dados.get("novoStatus")) as StatusSolucao,
    );
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath(`/aliados/${empresaId}/solucoes/${solucaoId}`);
    revalidatePath("/ofertas");
    return {
      sucesso:
        ofertasPausadas > 0
          ? `Status atualizado. ${ofertasPausadas} oferta(s) publicada(s) pausada(s) em cascata (RN04).`
          : "Status atualizado.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}
