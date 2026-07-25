"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import {
  aprovarTudo,
  decidirAgrupamentos,
  decidirSellers,
  efetivarCarga,
  iniciarCarga,
  moverOferta,
  renomearAgrupamento,
} from "@/infra/casos-de-uso/carga-inicial";
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
  logger.error({ erro: String(erro) }, "falha inesperada na carga inicial");
  return { erros: ["Não foi possível concluir a ação. Tente novamente."] };
}

function atualizarTela() {
  revalidatePath("/carga-inicial");
  revalidatePath("/aliados");
  revalidatePath("/ofertas");
}

export async function acaoIniciarCarga(
  _anterior: EstadoFormulario,
  _dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  try {
    const resultado = await iniciarCarga(ator);
    atualizarTela();
    return {
      sucesso: `Staging criado: ${resultado.sellers} sellers e ${resultado.ofertas} ofertas lidos (${resultado.quarentena} em quarentena). Revise e aprove abaixo.`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoDecidirSeller(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  await decidirSellers(
    ator,
    [String(dados.get("id"))],
    String(dados.get("estado")) as "APROVADA" | "REJEITADA" | "PENDENTE",
  );
  revalidatePath("/carga-inicial");
}

export async function acaoDecidirAgrupamento(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  await decidirAgrupamentos(
    ator,
    [String(dados.get("id"))],
    String(dados.get("estado")) as "APROVADA" | "REJEITADA" | "PENDENTE",
  );
  revalidatePath("/carga-inicial");
}

export async function acaoAprovarTudo(): Promise<void> {
  const ator = await atorDaSessao();
  await aprovarTudo(ator);
  revalidatePath("/carga-inicial");
}

export async function acaoRenomearAgrupamento(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  await renomearAgrupamento(ator, String(dados.get("id")), String(dados.get("nome") ?? ""));
  revalidatePath("/carga-inicial");
}

export async function acaoMoverOferta(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  const destino = String(dados.get("agrupamentoDestinoId") ?? "");
  if (!destino) return;
  await moverOferta(ator, String(dados.get("stagingOfertaId")), destino);
  revalidatePath("/carga-inicial");
}

export async function acaoEfetivarCarga(
  _anterior: EstadoFormulario,
  _dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  try {
    const resultado = await efetivarCarga(ator);
    atualizarTela();
    return {
      sucesso:
        `Carga efetivada: ${resultado.empresasCriadas} aliados, ` +
        `${resultado.solucoesCriadas} soluções e ${resultado.ofertasCriadas} ofertas criados; ` +
        `${resultado.acumuladosGravados} acumulados de telemetria gravados.`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}
