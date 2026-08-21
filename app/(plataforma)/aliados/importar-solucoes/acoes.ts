"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import {
  importarSolucoes,
  corrigirCelulaSolucao,
  efetivarImportacaoSolucoes,
} from "@/infra/casos-de-uso/importar-solucoes";
import type { EstadoFormulario } from "../acoes";

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown, operacao: string): EstadoFormulario {
  return {
    erros: mensagensDeFalha(erro, {
      operacao,
      semPermissao: "Importar soluções exige papel Gestor ou Analista (ficha §2).",
      contexto: "importar-solucoes",
    }),
  };
}

/** Passo 1 — sobe a planilha e vai para a conferência do lote criado. */
export async function acaoImportarSolucoes(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione a planilha de soluções antes de enviar."] };
  }
  let importacaoId: string;
  try {
    const resultado = await importarSolucoes(ator, {
      nomeArquivo: arquivo.name,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
    importacaoId = resultado.importacaoId;
  } catch (erro) {
    return paraEstado(erro, "importar a planilha");
  }
  // Conferência em rota própria (não `?lote=`): redirect de server action para
  // a mesma rota mudando só a query não navega com payload grande. Ver a
  // convenção de navegação no CLAUDE.md.
  redirect(`/aliados/importar-solucoes/${importacaoId}`);
}

/** Correção leve: reescreve uma célula sinalizada e revalida o lote. */
export async function acaoCorrigirCelula(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  const stagingId = String(dados.get("stagingId") ?? "");
  const coluna = String(dados.get("coluna") ?? "");
  const valor = String(dados.get("valor") ?? "");
  const importacaoId = String(dados.get("importacaoId") ?? "");
  if (!stagingId || !coluna) return;
  await corrigirCelulaSolucao(ator, { stagingId, coluna, valor });
  revalidatePath(`/aliados/importar-solucoes/${importacaoId}`);
  redirect(`/aliados/importar-solucoes/${importacaoId}`);
}

/** Passo 3 — efetiva o lote (bloqueia se houver pendência). */
export async function acaoEfetivar(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const importacaoId = String(dados.get("importacaoId") ?? "");
  if (!importacaoId) {
    return { erros: ["Lote de importação não informado."] };
  }
  let criadas = 0;
  let enriquecidas = 0;
  try {
    const r = await efetivarImportacaoSolucoes(ator, importacaoId);
    criadas = r.criadas;
    enriquecidas = r.enriquecidas;
  } catch (erro) {
    return paraEstado(erro, "efetivar a importação");
  }
  // A importação cria/atualiza dezenas de soluções de uma vez: invalida o cache
  // de navegação de toda a app (dashboard, /aliados, vitrine e funil) para os
  // números refletirem sem depender de recarregar a página.
  revalidatePath("/", "layout");
  redirect(`/aliados/importar-solucoes?feito=1&criadas=${criadas}&enriquecidas=${enriquecidas}`);
}
