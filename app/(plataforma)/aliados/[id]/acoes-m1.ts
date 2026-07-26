"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NaturezaOferta, NaturezaPublico, PorteProdutor } from "@prisma/client";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  adicionarOfertaPretendida,
  registrarIndicadoresDeclarados,
  removerOfertaPretendida,
  salvarIdentificacaoM1,
} from "@/infra/casos-de-uso/ficha-m1";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/** Ações do formulário M1 (T12 — estágio Em negociação). */

export interface EstadoAcaoM1 {
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

function paraEstado(erro: unknown): EstadoAcaoM1 {
  // RN55 — a distinção por classe de erro vive em um lugar só, para
  // todas as server actions. Aqui fica apenas o que é desta tela: a
  // negativa de permissão com a referência da ficha e o verbo da
  // mensagem genérica, que nunca sugere repetir a ação.
  const mensagens = mensagensDeFalha(erro, {
    operacao: "concluir a ação",
    semPermissao: "Seu papel não tem permissão para preencher a ficha cadastral.",
    contexto: "acao-ficha-m1",
  });
  return { erros: mensagens };
}

function revalidar(empresaId: string) {
  revalidatePath(`/aliados/${empresaId}`);
}

export async function acaoSalvarIdentificacao(dados: {
  empresaId: string;
  razaoSocial: string;
  nomeFantasia: string;
  site: string;
  descricaoInstitucional: string;
  diferenciais: string;
  modeloNegocio: string;
  publicoPorte: PorteProdutor[];
  publicoNatureza: NaturezaPublico | null;
}): Promise<EstadoAcaoM1> {
  const ator = await atorDaSessao();
  try {
    await salvarIdentificacaoM1(ator, {
      empresaId: dados.empresaId,
      razaoSocial: dados.razaoSocial,
      nomeFantasia: dados.nomeFantasia,
      site: dados.site,
      descricaoInstitucional: dados.descricaoInstitucional,
      diferenciais: dados.diferenciais,
      modeloNegocio: dados.modeloNegocio,
      publicoPorte: dados.publicoPorte,
      publicoNatureza: dados.publicoNatureza,
    });
    revalidar(dados.empresaId);
    return { sucesso: "Identificação e classificação salvas (seções A e B)." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoRegistrarDeclaracao(dados: {
  empresaId: string;
  dataDeclaracao: string;
  ticketMedio: string;
  nps: string;
  churnMensalPct: string;
  numeroClientes: string;
  anoFundacao: string;
}): Promise<EstadoAcaoM1> {
  const ator = await atorDaSessao();
  const numero = (valor: string): number | null => {
    const texto = valor.trim().replace(",", ".");
    if (!texto) return null;
    const convertido = Number(texto);
    return Number.isFinite(convertido) ? convertido : null;
  };
  try {
    await registrarIndicadoresDeclarados(ator, {
      empresaId: dados.empresaId,
      dataDeclaracao: dados.dataDeclaracao ? new Date(dados.dataDeclaracao) : new Date(),
      ticketMedio: numero(dados.ticketMedio),
      nps: numero(dados.nps),
      churnMensalPct: numero(dados.churnMensalPct),
      numeroClientes: numero(dados.numeroClientes),
      anoFundacao: numero(dados.anoFundacao),
    });
    revalidar(dados.empresaId);
    return { sucesso: "Declaração registrada (seção D) — marcada como autodeclarada." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoAdicionarOfertaPretendida(dados: {
  empresaId: string;
  natureza: NaturezaOferta;
  titulo: string;
  descricao: string;
  tipoBeneficioId: string;
  mecanicaId: string;
  precoDe: string;
  precoPor: string;
  instrucoesResgate: string;
  vigenciaInicio: string;
  vigenciaFim: string;
}): Promise<EstadoAcaoM1> {
  const ator = await atorDaSessao();
  const numero = (valor: string): number | null => {
    const texto = valor.trim().replace(",", ".");
    if (!texto) return null;
    const convertido = Number(texto);
    return Number.isFinite(convertido) ? convertido : null;
  };
  try {
    await adicionarOfertaPretendida(ator, {
      empresaId: dados.empresaId,
      natureza: dados.natureza,
      titulo: dados.titulo,
      descricao: dados.descricao || null,
      tipoBeneficioId: dados.tipoBeneficioId || null,
      mecanicaId: dados.mecanicaId || null,
      precoDe: numero(dados.precoDe),
      precoPor: numero(dados.precoPor),
      instrucoesResgate: dados.instrucoesResgate || null,
      vigenciaInicio: dados.vigenciaInicio ? new Date(dados.vigenciaInicio) : null,
      vigenciaFim: dados.vigenciaFim ? new Date(dados.vigenciaFim) : null,
    });
    revalidar(dados.empresaId);
    return { sucesso: "Oferta pretendida registrada (seção F)." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoRemoverOfertaPretendida(dados: {
  empresaId: string;
  ofertaPretendidaId: string;
}): Promise<EstadoAcaoM1> {
  const ator = await atorDaSessao();
  try {
    await removerOfertaPretendida(ator, dados.ofertaPretendidaId);
    revalidar(dados.empresaId);
    return { sucesso: "Oferta pretendida removida." };
  } catch (erro) {
    return paraEstado(erro);
  }
}
