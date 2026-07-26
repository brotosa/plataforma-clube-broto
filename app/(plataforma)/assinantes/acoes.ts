"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoliticaImportacao } from "@prisma/client";
import { auth } from "@/infra/auth";
import { type Ator, ErroDeValidacao } from "@/infra/casos-de-uso/contexto";
import type { DestinoMapeamento } from "@/dominio/assinantes/importacao";
import {
  aplicarMapeamentoEnriquecimento,
  aplicarMapeamentoNucleo,
  confirmarImportacaoEnriquecimento,
  confirmarImportacaoNucleo,
  prepararImportacaoAssinantes,
} from "@/infra/casos-de-uso/assinantes-importacao";
import {
  atualizarSegmento,
  duplicarSegmento,
  exportarLista,
  salvarSegmento,
} from "@/infra/casos-de-uso/assinantes-segmentos";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function mensagensDe(erro: unknown): string[] {
  // RN55 — a distinção por classe de erro vive em um lugar só, para
  // todas as server actions. Aqui fica apenas o que é desta tela: a
  // negativa de permissão com a referência da ficha e o verbo da
  // mensagem genérica, que nunca sugere repetir a ação.
  const mensagens = mensagensDeFalha(erro, {
    operacao: "concluir a ação",
    semPermissao: "Seu papel não tem permissão para esta ação (ficha §2).",
    contexto: "acao-assinantes",
  });
  return mensagens;
}

/** Passo 1-2 da T20: família + arquivo → staging bruto e sugestões. */
export async function acaoPrepararImportacao(dados: FormData) {
  const ator = await atorDaSessao();
  const familia = dados.get("familia");
  const arquivo = dados.get("arquivo");
  try {
    if (
      (familia !== "ASSINANTES_NUCLEO" && familia !== "ASSINANTES_ENRIQUECIMENTO") ||
      !(arquivo instanceof File) ||
      arquivo.size === 0
    ) {
      throw new ErroDeValidacao(["Escolha a família e um arquivo CSV ou XLSX."]);
    }
    const preparo = await prepararImportacaoAssinantes(ator, {
      familia,
      nomeArquivo: arquivo.name,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
    return { ok: true as const, preparo };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** Passo 3-4 (núcleo): de/para + política → dry-run com resumo. */
export async function acaoDryRunNucleo(parametros: {
  importacaoId: string;
  mapeamento: Record<string, DestinoMapeamento | null>;
  politica: PoliticaImportacao;
}) {
  const ator = await atorDaSessao();
  try {
    const resumo = await aplicarMapeamentoNucleo(ator, parametros.importacaoId, {
      mapeamento: parametros.mapeamento,
      politica: parametros.politica,
    });
    return { ok: true as const, resumo };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** Passo 3 (enriquecimento): de/para → dry-run com resumo. */
export async function acaoDryRunEnriquecimento(parametros: {
  importacaoId: string;
  mapeamento: Record<string, string | null>;
}) {
  const ator = await atorDaSessao();
  try {
    const resumo = await aplicarMapeamentoEnriquecimento(ator, parametros.importacaoId, {
      mapeamento: parametros.mapeamento,
    });
    return { ok: true as const, resumo };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** Passo 5: confirmação (foto completa exige o texto digitado — RN29). */
export async function acaoConfirmarImportacao(parametros: {
  importacaoId: string;
  familia: "ASSINANTES_NUCLEO" | "ASSINANTES_ENRIQUECIMENTO";
  confirmacaoFotoCompleta?: string;
}) {
  const ator = await atorDaSessao();
  try {
    const resumo =
      parametros.familia === "ASSINANTES_NUCLEO"
        ? await confirmarImportacaoNucleo(ator, parametros.importacaoId, {
            confirmacaoFotoCompleta: parametros.confirmacaoFotoCompleta,
          })
        : await confirmarImportacaoEnriquecimento(ator, parametros.importacaoId);
    revalidatePath("/assinantes");
    revalidatePath("/assinantes/importacoes");
    return { ok: true as const, resumo };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** T18 → "Salvar como segmento". */
export async function acaoSalvarSegmento(parametros: { nome: string; regras: unknown }) {
  const ator = await atorDaSessao();
  try {
    const segmento = await salvarSegmento(ator, parametros);
    revalidatePath("/assinantes/segmentos");
    return { ok: true as const, segmentoId: segmento.id };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** T21 → renomear (e futura edição de regras pela carteira). */
export async function acaoAtualizarSegmento(parametros: {
  segmentoId: string;
  nome?: string;
  regras?: unknown;
}) {
  const ator = await atorDaSessao();
  try {
    await atualizarSegmento(ator, parametros.segmentoId, {
      nome: parametros.nome,
      regras: parametros.regras,
    });
    revalidatePath("/assinantes/segmentos");
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** T21 → duplicar. */
export async function acaoDuplicarSegmento(segmentoId: string) {
  const ator = await atorDaSessao();
  try {
    await duplicarSegmento(ator, segmentoId);
    revalidatePath("/assinantes/segmentos");
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** T18 → exportar lista (RN34: finalidade obrigatória). */
export async function acaoExportarLista(parametros: {
  regras: unknown;
  finalidade: string;
  segmentoId?: string | null;
}) {
  const ator = await atorDaSessao();
  try {
    const exportacao = await exportarLista(ator, parametros);
    return {
      ok: true as const,
      exportacaoId: exportacao.id,
      contagem: exportacao.contagem,
    };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}
