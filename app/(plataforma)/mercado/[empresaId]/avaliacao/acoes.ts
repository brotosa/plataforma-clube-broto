"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RecomendacaoAvaliacao } from "@prisma/client";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import {
  fecharAvaliacao,
  iniciarAvaliacao,
  type NotaInformada,
  salvarNotas,
} from "@/infra/casos-de-uso/avaliacoes";
import { logger } from "@/infra/log/logger";

/**
 * Ações da T10 (avaliação de scout). O rascunho só passa a existir quando
 * o avaliador salva ou conclui — abrir a tela nunca grava nada. As duas
 * ações resolvem "rascunho aberto ou próxima versão" em iniciarAvaliacao
 * (pré-preenchida da última fechada, RN18).
 */

export interface EstadoAcaoAvaliacao {
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

function paraEstado(erro: unknown): EstadoAcaoAvaliacao {
  if (erro instanceof ErroDeValidacao) {
    return { erros: [...erro.erros] };
  }
  if (erro instanceof ErroDeAutorizacao) {
    return { erros: ["Seu papel não tem permissão para avaliar (ficha Onda 2 §2)."] };
  }
  logger.error({ erro: String(erro) }, "falha inesperada em ação da avaliação");
  return { erros: ["Não foi possível concluir a ação. Tente novamente."] };
}

function revalidarTelas(empresaId: string) {
  revalidatePath(`/mercado/${empresaId}/avaliacao`);
  revalidatePath("/mercado");
}

/** T10 — "Salvar rascunho": garante a versão aberta e grava as notas. */
export async function acaoSalvarRascunho(dados: {
  empresaId: string;
  notas: NotaInformada[];
}): Promise<EstadoAcaoAvaliacao> {
  const ator = await atorDaSessao();
  try {
    const rascunho = await iniciarAvaliacao(ator, dados.empresaId);
    if (dados.notas.length > 0) {
      await salvarNotas(ator, rascunho.id, dados.notas);
    }
    revalidarTelas(dados.empresaId);
    return { sucesso: `Rascunho da avaliação salvo (versão ${rascunho.versao}).` };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T10 — "Concluir avaliação": salva as notas e fecha com recomendação. */
export async function acaoConcluirAvaliacao(dados: {
  empresaId: string;
  notas: NotaInformada[];
  recomendacao: RecomendacaoAvaliacao | null;
}): Promise<EstadoAcaoAvaliacao> {
  const ator = await atorDaSessao();
  try {
    const rascunho = await iniciarAvaliacao(ator, dados.empresaId);
    if (dados.notas.length > 0) {
      await salvarNotas(ator, rascunho.id, dados.notas);
    }
    const fechada = await fecharAvaliacao(ator, rascunho.id, dados.recomendacao);
    revalidarTelas(dados.empresaId);
    return {
      sucesso: `Avaliação concluída — score ${fechada.total} e recomendação registrados (versão ${fechada.versao}).`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}
