"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OrigemEmpresa } from "@prisma/client";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import type { MapeamentoColunas } from "@/dominio/carga-prospects/mapeamento";
import {
  descartarEmpresa,
  entrarNoRadar,
  handoffParaNegociacao,
  moverNoFunil,
  reativarDescartada,
} from "@/infra/casos-de-uso/funil";
import {
  aplicarMapeamentoProspects,
  efetivarImportacaoProspects,
  iniciarImportacaoProspects,
  type ResumoImportacaoProspects,
} from "@/infra/casos-de-uso/carga-prospects";
import { ROTULOS_ESTAGIO_FUNIL } from "@/dominio/funil/regras";
import { logger } from "@/infra/log/logger";

/** Estado devolvido aos formulários e ao kanban (useActionState/toast). */
export interface EstadoAcaoFunil {
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

function paraEstado(erro: unknown): EstadoAcaoFunil {
  if (erro instanceof ErroDeValidacao) {
    return { erros: [...erro.erros] };
  }
  if (erro instanceof ErroDeAutorizacao) {
    return { erros: ["Seu papel não tem permissão para esta ação (ficha Onda 2 §2)."] };
  }
  logger.error({ erro: String(erro) }, "falha inesperada em ação do funil");
  return { erros: ["Não foi possível concluir a ação. Tente novamente."] };
}

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

/** T9 — formulário mínimo: inclui a empresa no radar como Mapeada (RN13). */
export async function acaoIncluirNoRadar(
  _anterior: EstadoAcaoFunil,
  dados: FormData,
): Promise<EstadoAcaoFunil> {
  const ator = await atorDaSessao();
  try {
    const empresa = await entrarNoRadar(ator, {
      nomeFantasia: texto(dados, "nomeFantasia") ?? "",
      site: texto(dados, "site"),
      origem: (texto(dados, "origem") as OrigemEmpresa | null) ?? null,
      categoriaIds: dados.getAll("categoriaIds").map(String).filter(Boolean),
    });
    revalidatePath("/mercado");
    return { sucesso: `${empresa.nomeFantasia} incluída no radar como Mapeada.` };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T8 — "Mover para {estágio}" do menu do card. */
export async function acaoMoverNoFunil(dados: {
  empresaId: string;
  destino: "MAPEADA" | "EM_AVALIACAO" | "PRIORIZADA";
}): Promise<EstadoAcaoFunil> {
  const ator = await atorDaSessao();
  try {
    const empresa = await moverNoFunil(ator, dados.empresaId, dados.destino);
    revalidatePath("/mercado");
    return {
      sucesso: `${empresa.nomeFantasia} movida para ${ROTULOS_ESTAGIO_FUNIL[dados.destino]}.`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T8 — handoff Priorizada → Em negociação com comercial designado (RN16). */
export async function acaoHandoffParaNegociacao(dados: {
  empresaId: string;
  responsavelComercialId: string;
}): Promise<EstadoAcaoFunil> {
  const ator = await atorDaSessao();
  try {
    const empresa = await handoffParaNegociacao(
      ator,
      dados.empresaId,
      dados.responsavelComercialId,
    );
    revalidatePath("/mercado");
    return { sucesso: `${empresa.nomeFantasia} em negociação, com responsável comercial designado.` };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T8 — descarte com motivo tipificado (RN17). */
export async function acaoDescartarEmpresa(dados: {
  empresaId: string;
  motivoDescarteId: string;
  descricao: string | null;
  comentario: string | null;
}): Promise<EstadoAcaoFunil> {
  const ator = await atorDaSessao();
  try {
    const empresa = await descartarEmpresa(ator, dados.empresaId, {
      motivoDescarteId: dados.motivoDescarteId,
      descricao: dados.descricao,
      comentario: dados.comentario,
    });
    revalidatePath("/mercado");
    return { sucesso: `${empresa.nomeFantasia} descartada com motivo registrado.` };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T8 (tabela) — reativação de descartada volta a Mapeada (RN17). */
export async function acaoReativarDescartada(dados: {
  empresaId: string;
}): Promise<EstadoAcaoFunil> {
  const ator = await atorDaSessao();
  try {
    const empresa = await reativarDescartada(ator, dados.empresaId);
    revalidatePath("/mercado");
    return { sucesso: `${empresa.nomeFantasia} reativada — voltou a Mapeada com histórico preservado.` };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T9 — passo 1: upload da lista (CSV/XLSX). */
export interface EstadoUploadLista extends EstadoAcaoFunil {
  importacaoId?: string;
  nomeArquivo?: string;
  cabecalhos?: string[];
  sugestaoMapeamento?: MapeamentoColunas;
  totalLinhas?: number;
}

export async function acaoIniciarImportacao(
  _anterior: EstadoUploadLista,
  dados: FormData,
): Promise<EstadoUploadLista> {
  const ator = await atorDaSessao();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione o arquivo CSV ou XLSX da lista de prospects."] };
  }
  try {
    const conteudo = Buffer.from(await arquivo.arrayBuffer());
    const resultado = await iniciarImportacaoProspects(ator, arquivo.name, conteudo);
    return { ...resultado };
  } catch (erro) {
    if (erro instanceof Error && erro.name === "ErroDeLeitura") {
      return { erros: [erro.message] };
    }
    return paraEstado(erro);
  }
}

/** T9 — passo 2: aplica o mapeamento e devolve o resumo com deduplicação. */
export async function acaoAplicarMapeamento(dados: {
  importacaoId: string;
  mapeamento: MapeamentoColunas;
}): Promise<EstadoAcaoFunil & { resumo?: ResumoImportacaoProspects }> {
  const ator = await atorDaSessao();
  try {
    const resumo = await aplicarMapeamentoProspects(
      ator,
      dados.importacaoId,
      dados.mapeamento,
    );
    return { resumo };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/** T9 — passo 3: efetiva as linhas novas como empresas Mapeadas. */
export async function acaoEfetivarImportacao(dados: {
  importacaoId: string;
}): Promise<EstadoAcaoFunil & { empresasCriadas?: number }> {
  const ator = await atorDaSessao();
  try {
    const { empresasCriadas } = await efetivarImportacaoProspects(ator, dados.importacaoId);
    revalidatePath("/mercado");
    return {
      empresasCriadas,
      sucesso: `Importação efetivada — ${empresasCriadas} empresa(s) no radar.`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}
