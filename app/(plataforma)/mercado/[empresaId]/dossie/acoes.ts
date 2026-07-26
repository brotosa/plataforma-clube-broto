"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/infra/auth";
import {
  inserirDossieManual,
  marcarDossieComoRevisado,
  pedirGeracaoDeDossie,
  processarGeracao,
  tentarNovamenteGeracao,
} from "@/infra/casos-de-uso/dossies";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/**
 * Ações da T11 (dossiê). A geração é **assíncrona e sob demanda**: a ação
 * do analista cria o dossiê em "gerando" e devolve a tela na hora; a
 * pesquisa em si roda depois da resposta (`after`), e a T11 acompanha pelo
 * status — o analista pode sair da tela.
 *
 * Nenhuma ação daqui toca em nota de indicador (RN19).
 */

export interface EstadoAcaoDossie {
  erros?: string[];
  sucesso?: string;
  avisos?: string[];
}

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown): EstadoAcaoDossie {
  // RN55 — a distinção por classe de erro vive em um lugar só, para
  // todas as server actions. Aqui fica apenas o que é desta tela: a
  // negativa de permissão com a referência da ficha e o verbo da
  // mensagem genérica, que nunca sugere repetir a ação.
  const mensagens = mensagensDeFalha(erro, {
    operacao: "concluir a ação",
    semPermissao: "Seu papel não tem permissão para gerar ou revisar dossiê (ficha Onda 2 §2).",
    contexto: "acao-dossie",
  });
  return { erros: mensagens };
}

function revalidarTelas(empresaId: string) {
  revalidatePath(`/mercado/${empresaId}/dossie`);
  revalidatePath("/mercado");
}

/** T11 — "Gerar dossiê": cria em "gerando" e pesquisa depois da resposta. */
export async function acaoGerarDossie(dados: {
  empresaId: string;
  contextoAdicional?: string | null;
}): Promise<EstadoAcaoDossie> {
  const ator = await atorDaSessao();
  try {
    const { dossieId } = await pedirGeracaoDeDossie(ator, dados);
    after(async () => {
      await processarGeracao(dossieId);
      revalidarTelas(dados.empresaId);
    });
    revalidarTelas(dados.empresaId);
    return {
      sucesso:
        "Geração iniciada — consultando fontes públicas. Você pode sair desta tela; o status fica registrado aqui.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T11 — "Tentar novamente" depois de uma geração que falhou. */
export async function acaoTentarNovamente(dados: {
  empresaId: string;
  dossieId: string;
}): Promise<EstadoAcaoDossie> {
  const ator = await atorDaSessao();
  try {
    await tentarNovamenteGeracao(ator, dados.dossieId);
    after(async () => {
      await processarGeracao(dados.dossieId);
      revalidarTelas(dados.empresaId);
    });
    revalidarTelas(dados.empresaId);
    return { sucesso: "Nova tentativa iniciada — consultando fontes públicas." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T11 — "Inserir manualmente": o analista cola o dossiê pronto. */
export async function acaoInserirManualmente(dados: {
  empresaId: string;
  conteudoColado: string;
  contextoAdicional?: string | null;
}): Promise<EstadoAcaoDossie> {
  const ator = await atorDaSessao();
  try {
    const { avisos } = await inserirDossieManual(ator, dados);
    revalidarTelas(dados.empresaId);
    return {
      sucesso: "Dossiê inserido — nasce requerendo revisão (RN19).",
      avisos: [...avisos],
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T11 — RN19: "marcar como revisado", com autor e data. */
export async function acaoMarcarComoRevisado(dados: {
  empresaId: string;
  dossieId: string;
}): Promise<EstadoAcaoDossie> {
  const ator = await atorDaSessao();
  try {
    await marcarDossieComoRevisado(ator, dados.dossieId);
    revalidarTelas(dados.empresaId);
    return { sucesso: "Dossiê marcado como revisado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}
