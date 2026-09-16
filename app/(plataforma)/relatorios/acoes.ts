"use server";

import { revalidatePath } from "next/cache";
import type { VisibilidadeRelatorio } from "@prisma/client";

import { auth } from "@/infra/auth";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import { LINHAS_DA_PREVIA } from "@/dominio/relatorios/compilador";
import type { TabelaPivotada } from "@/dominio/relatorios/pivo";
import {
  apagarRelatorio,
  executarRelatorio,
  renomearOuCompartilharRelatorio,
  salvarRelatorio,
} from "@/infra/casos-de-uso/relatorios";
import type { Ator } from "@/infra/casos-de-uso/contexto";

/**
 * Server actions da T36.
 *
 * Toda falha passa por `mensagensDeFalha` (RN55): erro de classe conhecida do
 * domínio propaga a própria mensagem — e aqui isso importa mais que de
 * costume, porque as mensagens do compilador SÃO a interface. "O operador
 * 'contém' não vale para o campo 'Situação'" é o que ensina a pessoa a montar
 * o relatório; um "não foi possível concluir" genérico a deixaria adivinhando.
 */

const OPCOES_DE_FALHA = {
  operacao: "executar o relatório",
  semPermissao:
    "Seu papel não alcança este assunto — o Gerador de relatórios não amplia o que você já vê na plataforma (RN76).",
  contexto: "gerador-de-relatorios",
} as const;

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    throw new Error("Sessão expirada.");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

export interface RespostaDaPrevia {
  ok: boolean;
  erro?: string;
  tabela?: TabelaPivotada;
  total?: number;
  truncado?: boolean;
  duracaoMs?: number;
  resumo?: string;
}

/**
 * A prévia — amostra, recalculada a cada mudança.
 *
 * Roda com o teto da amostra e não com o do resultado completo: a prévia
 * existe para a pessoa ver se montou o que queria, e puxar cinco mil linhas a
 * cada campo arrastado castigaria o banco para mostrar uma tela que ninguém
 * vai ler inteira.
 */
export async function preverRelatorio(definicao: unknown): Promise<RespostaDaPrevia> {
  try {
    const ator = await atorDaSessao();
    const resultado = await executarRelatorio(ator, definicao, { teto: LINHAS_DA_PREVIA });
    return {
      ok: true,
      tabela: resultado.tabela,
      total: resultado.total,
      truncado: resultado.truncado,
      duracaoMs: resultado.duracaoMs,
      resumo: resultado.resumo,
    };
  } catch (erro) {
    return { ok: false, erro: mensagensDeFalha(erro, OPCOES_DE_FALHA).join(" ") };
  }
}

export interface RespostaDeAcao {
  ok: boolean;
  erro?: string;
  id?: string;
}

export async function salvarRelatorioAction(dados: {
  nome: string;
  definicao: unknown;
  visibilidade: VisibilidadeRelatorio;
}): Promise<RespostaDeAcao> {
  try {
    const ator = await atorDaSessao();
    const { id } = await salvarRelatorio(ator, dados);
    revalidatePath("/relatorios");
    return { ok: true, id };
  } catch (erro) {
    return { ok: false, erro: mensagensDeFalha(erro, OPCOES_DE_FALHA).join(" ") };
  }
}

export async function renomearRelatorioAction(dados: {
  id: string;
  nome?: string;
  visibilidade?: VisibilidadeRelatorio;
}): Promise<RespostaDeAcao> {
  try {
    const ator = await atorDaSessao();
    await renomearOuCompartilharRelatorio(ator, dados.id, {
      nome: dados.nome,
      visibilidade: dados.visibilidade,
    });
    revalidatePath("/relatorios");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagensDeFalha(erro, OPCOES_DE_FALHA).join(" ") };
  }
}

export async function apagarRelatorioAction(id: string): Promise<RespostaDeAcao> {
  try {
    const ator = await atorDaSessao();
    await apagarRelatorio(ator, id);
    revalidatePath("/relatorios");
    return { ok: true };
  } catch (erro) {
    return { ok: false, erro: mensagensDeFalha(erro, OPCOES_DE_FALHA).join(" ") };
  }
}
