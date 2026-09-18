"use server";

import { revalidatePath } from "next/cache";
import type { VisibilidadeRelatorio } from "@prisma/client";

import { auth } from "@/infra/auth";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import type { TabelaPivotada } from "@/dominio/relatorios/pivo";
import {
  type AtoDeEdicao,
  acrescentarAoPainel,
  apagarPainel,
  aplicarAtoDeEdicao,
  atualizarPainel,
  executarBlocoDoPainel,
  listarPaineisEditaveis,
  salvarPainel,
} from "@/infra/casos-de-uso/paineis";
import type { Ator } from "@/infra/casos-de-uso/contexto";

/**
 * Server actions da T37.
 *
 * Toda falha passa por `mensagensDeFalha` (RN55). A mensagem de falta de
 * permissão é a mesma da T36, palavra por palavra, de propósito: quem vê um
 * bloco recusado no painel e o mesmo assunto recusado no Gerador precisa
 * entender que é a mesma regra, e não duas.
 */

const OPCOES_DE_FALHA = {
  operacao: "abrir o painel",
  semPermissao:
    "Seu papel não alcança este assunto — o Gerador de relatórios não amplia o que você já vê na plataforma (RN76).",
  contexto: "painel-de-relatorios",
} as const;

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    throw new Error("Sessão expirada.");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

export interface RespostaDeAcao {
  ok: boolean;
  erro?: string;
  id?: string;
}

export interface RespostaDoBloco {
  ok: boolean;
  erro?: string;
  tabela?: TabelaPivotada;
  total?: number;
  truncado?: boolean;
  resumo?: string;
}

/**
 * Executa **um** bloco do painel.
 *
 * Um por chamada, e não o painel inteiro numa só, por duas razões que se
 * somam: a tela carrega cada bloco por conta própria — oito blocos não podem
 * fazer a página esperar pelo mais lento —, e a finalidade da RN88 chega
 * bloco a bloco, quando a pessoa a declara naquele bloco.
 */
export async function carregarBlocoAction(
  painelId: string,
  indice: number,
  finalidade?: string,
): Promise<RespostaDoBloco> {
  try {
    const resultado = await executarBlocoDoPainel(
      await atorDaSessao(),
      painelId,
      indice,
      finalidade,
    );
    return {
      ok: true,
      tabela: resultado.tabela,
      total: resultado.total,
      truncado: resultado.truncado,
      resumo: resultado.resumo,
    };
  } catch (erro) {
    return { ok: false, erro: mensagensDeFalha(erro, OPCOES_DE_FALHA).join(" ") };
  }
}

export async function salvarPainelAction(dados: {
  nome: string;
  blocos: unknown;
  visibilidade?: VisibilidadeRelatorio;
}): Promise<RespostaDeAcao> {
  try {
    const { id } = await salvarPainel(await atorDaSessao(), dados);
    revalidatePath("/paineis");
    return { ok: true, id };
  } catch (erro) {
    return {
      ok: false,
      erro: mensagensDeFalha(erro, { ...OPCOES_DE_FALHA, operacao: "salvar o painel" }).join(" "),
    };
  }
}

/**
 * RN94 — um ato de edição por chamada, e o cliente manda índice, não blocos.
 *
 * Uma gravação por ato, e não um "salvar" no fim: um formulário grande
 * perderia o trabalho de quem fechasse a aba e obrigaria a decidir o que
 * fazer com edição concorrente. Cada ato é pequeno, gravado e auditado — e o
 * desfazer é o ato inverso, que está na tela.
 */
export async function editarBlocoAction(
  painelId: string,
  ato: AtoDeEdicao,
  versao: string,
): Promise<RespostaDeAcao> {
  try {
    await aplicarAtoDeEdicao(await atorDaSessao(), painelId, ato, versao);
    revalidatePath("/paineis");
    return { ok: true };
  } catch (erro) {
    return {
      ok: false,
      erro: mensagensDeFalha(erro, { ...OPCOES_DE_FALHA, operacao: "editar o painel" }).join(" "),
    };
  }
}

/** Nome, visibilidade e filtro — os atributos do painel, fora dos blocos. */
export async function atualizarPainelAction(
  painelId: string,
  mudancas: { nome?: string; visibilidade?: VisibilidadeRelatorio; filtro?: unknown },
): Promise<RespostaDeAcao> {
  try {
    await atualizarPainel(await atorDaSessao(), painelId, mudancas);
    revalidatePath("/paineis");
    return { ok: true };
  } catch (erro) {
    return {
      ok: false,
      erro: mensagensDeFalha(erro, { ...OPCOES_DE_FALHA, operacao: "atualizar o painel" }).join(" "),
    };
  }
}

/** O destino do "Pôr no painel" quando não é painel novo. */
export async function acrescentarAoPainelAction(
  painelId: string,
  bloco: unknown,
): Promise<RespostaDeAcao> {
  try {
    await acrescentarAoPainel(await atorDaSessao(), painelId, bloco);
    revalidatePath("/paineis");
    return { ok: true, id: painelId };
  } catch (erro) {
    return {
      ok: false,
      erro: mensagensDeFalha(erro, {
        ...OPCOES_DE_FALHA,
        operacao: "acrescentar o bloco ao painel",
      }).join(" "),
    };
  }
}

/** A lista que a T36 oferece como destino — só os painéis de quem pergunta. */
export async function meusPaineisAction(): Promise<
  ReadonlyArray<{ id: string; nome: string; quantosBlocos: number }>
> {
  try {
    return await listarPaineisEditaveis(await atorDaSessao());
  } catch {
    // Lista vazia, e não erro: o destino "painel novo" continua funcionando,
    // e uma tela que falha inteira porque a lista de destinos não veio seria
    // pior que uma tela que oferece um destino a menos.
    return [];
  }
}

export async function apagarPainelAction(id: string): Promise<RespostaDeAcao> {
  try {
    await apagarPainel(await atorDaSessao(), id);
    revalidatePath("/paineis");
    return { ok: true };
  } catch (erro) {
    return {
      ok: false,
      erro: mensagensDeFalha(erro, { ...OPCOES_DE_FALHA, operacao: "apagar o painel" }).join(" "),
    };
  }
}
