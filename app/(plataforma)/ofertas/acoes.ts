"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DestinacaoOferta, ModalidadePagamento, NaturezaOferta } from "@prisma/client";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  atualizarOferta,
  criarOferta,
  encerrarOferta,
  pausarOferta,
  publicarOferta,
} from "@/infra/casos-de-uso/ofertas";
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
    contexto: "acao-oferta",
  });
  return { erros: mensagens };
}

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

function numero(dados: FormData, campo: string): number | null {
  const bruto = texto(dados, campo);
  if (bruto === null) return null;
  const valor = Number(bruto.replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

function dataDoFormulario(dados: FormData, campo: string): Date | null {
  const bruto = texto(dados, campo);
  return bruto ? new Date(`${bruto}T00:00:00Z`) : null;
}

function dadosOfertaDoFormulario(dados: FormData) {
  const modalidade = texto(dados, "modalidadePagamento");
  return {
    titulo: texto(dados, "titulo") ?? undefined,
    natureza: (texto(dados, "natureza") ?? undefined) as NaturezaOferta | undefined,
    tipoBeneficioId: texto(dados, "tipoBeneficioId") ?? undefined,
    precoDe: numero(dados, "precoDe"),
    precoPor: numero(dados, "precoPor"),
    cupomCodigoRegras: texto(dados, "cupomCodigoRegras"),
    modalidadePagamento: (modalidade as ModalidadePagamento | null) ?? null,
    mecanicaId: texto(dados, "mecanicaId") ?? undefined,
    urlResgateExterno: texto(dados, "urlResgateExterno"),
    instrucoesResgate: texto(dados, "instrucoesResgate"),
    vigenciaInicio: dataDoFormulario(dados, "vigenciaInicio") ?? undefined,
    vigenciaFim: dataDoFormulario(dados, "vigenciaFim"),
    limiteResgates: numero(dados, "limiteResgates"),
    // Onda 4 (ficha §3): destinação da oferta. O vínculo só é gravado na
    // destinação correspondente — trocar de destinação limpa o outro lado.
    destinacao: (texto(dados, "destinacao") ?? "VITRINE") as DestinacaoOferta,
    destinacaoCampanhaId:
      texto(dados, "destinacao") === "CAMPANHA" ? texto(dados, "destinacaoCampanhaId") : null,
    destinacaoCestaId:
      texto(dados, "destinacao") === "CESTA" ? texto(dados, "destinacaoCestaId") : null,
  };
}

export async function acaoCriarOferta(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const solucaoId = String(dados.get("solucaoId") ?? "");
  let ofertaId = "";
  try {
    const oferta = await criarOferta(ator, solucaoId, dadosOfertaDoFormulario(dados));
    ofertaId = oferta.id;
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath("/ofertas");
  redirect(`/ofertas/${ofertaId}`);
}

export async function acaoAtualizarOferta(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const ofertaId = String(dados.get("ofertaId") ?? "");
  try {
    await atualizarOferta(ator, ofertaId, dadosOfertaDoFormulario(dados));
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/ofertas/${ofertaId}`);
  revalidatePath("/ofertas");
  redirect(`/ofertas/${ofertaId}`);
}

export async function acaoPublicarOferta(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const ofertaId = String(dados.get("ofertaId") ?? "");
  try {
    const resultado = await publicarOferta(ator, ofertaId);
    revalidatePath(`/ofertas/${ofertaId}`);
    revalidatePath("/ofertas");
    revalidatePath("/aprovacoes");
    return {
      sucesso:
        resultado.resultado === "PUBLICADA"
          ? "Oferta publicada."
          : "Solicitação de publicação enviada para a fila de aprovação (RN06).",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoPausarOferta(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const ofertaId = String(dados.get("ofertaId") ?? "");
  try {
    await pausarOferta(ator, ofertaId);
    revalidatePath(`/ofertas/${ofertaId}`);
    revalidatePath("/ofertas");
    return { sucesso: "Oferta pausada — será despublicada no próximo export." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoEncerrarOferta(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const ofertaId = String(dados.get("ofertaId") ?? "");
  try {
    await encerrarOferta(ator, ofertaId);
    revalidatePath(`/ofertas/${ofertaId}`);
    revalidatePath("/ofertas");
    return { sucesso: "Oferta encerrada (RN05: histórico preservado)." };
  } catch (erro) {
    return paraEstado(erro);
  }
}
