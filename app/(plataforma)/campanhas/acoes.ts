"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  alternarCestaDaCampanha,
  alternarOfertaDaCampanha,
  ativarCampanha,
  atualizarCampanha,
  criarCampanha,
  definirMeta,
  encerrarCampanha,
  enviarEvidenciaDaAprovacao,
  gerarNovaVersaoDoKit,
  registrarPatrocinioDaCampanha,
  removerEvidenciaDaAprovacao,
  removerMeta,
  removerPeca,
  salvarPeca,
} from "@/infra/casos-de-uso/campanhas";
import {
  alternarOfertaDaCesta,
  atualizarCesta,
  criarCesta,
} from "@/infra/casos-de-uso/cestas";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/** Ações das telas T22–T25 (Onda 4). O ator vem sempre da sessão. */

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
    contexto: "acao-campanha",
  });
  return mensagens;
}

export async function acaoCriarCampanha(dados: FormData) {
  const ator = await atorDaSessao();
  const nome = String(dados.get("nome") ?? "");
  const objetivo = String(dados.get("objetivo") ?? "");
  try {
    const campanha = await criarCampanha(ator, { nome, objetivo });
    revalidatePath("/campanhas");
    return { ok: true as const, campanhaId: campanha.id };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoAtualizarCampanha(parametros: {
  campanhaId: string;
  nome?: string;
  objetivo?: string | null;
  origemPublico?: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
  segmentoId?: string | null;
  regrasPublico?: unknown;
  vigenciaInicio?: string | null;
  vigenciaFim?: string | null;
  instrucoes?: string | null;
}) {
  const ator = await atorDaSessao();
  const { campanhaId, ...resto } = parametros;
  try {
    await atualizarCampanha(ator, campanhaId, resto);
    revalidatePath(`/campanhas/${campanhaId}`);
    revalidatePath("/campanhas");
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/**
 * RN64 — etiqueta do patrocinador e registro da aprovação externa.
 *
 * Diferente de `acaoAtualizarCampanha`, esta não exige rascunho: a
 * aprovação costuma chegar depois da ativação, e travá-la garantiria que o
 * registro nunca fosse feito.
 */
export async function acaoRegistrarPatrocinio(parametros: {
  campanhaId: string;
  patrocinadorId?: string | null;
  aprovacaoAprovador?: string | null;
  aprovacaoData?: string | null;
}) {
  const ator = await atorDaSessao();
  const { campanhaId, ...resto } = parametros;
  try {
    await registrarPatrocinioDaCampanha(ator, campanhaId, resto);
    revalidatePath(`/campanhas/${campanhaId}`);
    revalidatePath("/campanhas");
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoEnviarEvidencia(
  _estado: { erros?: string[]; sucesso?: string; versao?: string | null },
  dados: FormData,
) {
  const ator = await atorDaSessao();
  const campanhaId = String(dados.get("campanhaId") ?? "");
  const arquivo = dados.get("evidencia");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione a evidência da aprovação e envie novamente."] };
  }
  try {
    const conteudo = new Uint8Array(await arquivo.arrayBuffer());
    const { hash } = await enviarEvidenciaDaAprovacao(ator, campanhaId, {
      nome: arquivo.name,
      conteudo,
    });
    revalidatePath(`/campanhas/${campanhaId}`);
    return { sucesso: "Evidência anexada à aprovação.", versao: hash };
  } catch (erro) {
    return { erros: mensagensDe(erro) };
  }
}

export async function acaoRemoverEvidencia(
  _estado: { erros?: string[]; sucesso?: string; versao?: string | null },
  dados: FormData,
) {
  const ator = await atorDaSessao();
  const campanhaId = String(dados.get("campanhaId") ?? "");
  try {
    await removerEvidenciaDaAprovacao(ator, campanhaId);
    revalidatePath(`/campanhas/${campanhaId}`);
    return { sucesso: "Evidência removida. O registro da aprovação continua.", versao: null };
  } catch (erro) {
    return { erros: mensagensDe(erro) };
  }
}

export async function acaoAlternarConteudo(parametros: {
  campanhaId: string;
  tipo: "OFERTA" | "CESTA";
  id: string;
  vincular: boolean;
}) {
  const ator = await atorDaSessao();
  try {
    if (parametros.tipo === "OFERTA") {
      await alternarOfertaDaCampanha(ator, parametros.campanhaId, parametros.id, parametros.vincular);
    } else {
      await alternarCestaDaCampanha(ator, parametros.campanhaId, parametros.id, parametros.vincular);
    }
    revalidatePath(`/campanhas/${parametros.campanhaId}`);
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoSalvarPeca(dados: FormData) {
  const ator = await atorDaSessao();
  const campanhaId = String(dados.get("campanhaId") ?? "");
  const pecaId = String(dados.get("pecaId") ?? "");
  const arquivo = dados.get("imagem");
  try {
    const imagem =
      arquivo instanceof File && arquivo.size > 0
        ? { nomeArquivo: arquivo.name, conteudo: Buffer.from(await arquivo.arrayBuffer()) }
        : null;
    await salvarPeca(ator, campanhaId, {
      pecaId: pecaId || undefined,
      formatoSlug: String(dados.get("formatoSlug") ?? ""),
      titulo: String(dados.get("titulo") ?? ""),
      texto: String(dados.get("texto") ?? ""),
      imagem,
    });
    revalidatePath(`/campanhas/${campanhaId}`);
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoRemoverPeca(parametros: { campanhaId: string; pecaId: string }) {
  const ator = await atorDaSessao();
  try {
    await removerPeca(ator, parametros.pecaId);
    revalidatePath(`/campanhas/${parametros.campanhaId}`);
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoDefinirMeta(parametros: {
  campanhaId: string;
  tipo: "RESGATES" | "CONVERSAO_PCT" | "ALIADOS_PARTICIPANTES" | "OFERTAS_ATIVAS";
  alvo: number;
}) {
  const ator = await atorDaSessao();
  try {
    await definirMeta(ator, parametros.campanhaId, { tipo: parametros.tipo, alvo: parametros.alvo });
    revalidatePath(`/campanhas/${parametros.campanhaId}`);
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoRemoverMeta(parametros: { campanhaId: string; metaId: string }) {
  const ator = await atorDaSessao();
  try {
    await removerMeta(ator, parametros.metaId);
    revalidatePath(`/campanhas/${parametros.campanhaId}`);
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** RN38 — ativar congela o público e gera o kit v1 (ou abre a solicitação). */
export async function acaoAtivarCampanha(parametros: { campanhaId: string }) {
  const ator = await atorDaSessao();
  try {
    const resultado = await ativarCampanha(ator, parametros.campanhaId);
    revalidatePath(`/campanhas/${parametros.campanhaId}`);
    revalidatePath("/campanhas");
    revalidatePath("/aprovacoes");
    return { ok: true as const, resultado: resultado.resultado };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** RN45 — nova versão do kit, com diff auditado. */
export async function acaoGerarNovaVersaoDoKit(parametros: { campanhaId: string }) {
  const ator = await atorDaSessao();
  try {
    await gerarNovaVersaoDoKit(ator, parametros.campanhaId);
    revalidatePath(`/campanhas/${parametros.campanhaId}`);
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

/** RN40 — encerrar pausa as exclusivas, com o aviso prévio já exibido. */
export async function acaoEncerrarCampanha(parametros: { campanhaId: string }) {
  const ator = await atorDaSessao();
  try {
    const resultado = await encerrarCampanha(ator, parametros.campanhaId);
    revalidatePath(`/campanhas/${parametros.campanhaId}`);
    revalidatePath("/campanhas");
    revalidatePath("/ofertas");
    return { ok: true as const, pausadas: resultado.pausadas, aviso: resultado.aviso };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoCriarCesta(parametros: {
  nome: string;
  narrativa?: string | null;
  origemPerfil?: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
  segmentoId?: string | null;
  regrasPerfil?: unknown;
}) {
  const ator = await atorDaSessao();
  try {
    const cesta = await criarCesta(ator, parametros);
    revalidatePath("/campanhas/cestas");
    return { ok: true as const, cestaId: cesta.id };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoAtualizarCesta(parametros: {
  cestaId: string;
  nome?: string;
  narrativa?: string | null;
  origemPerfil?: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
  segmentoId?: string | null;
  regrasPerfil?: unknown;
}) {
  const ator = await atorDaSessao();
  const { cestaId, ...resto } = parametros;
  try {
    await atualizarCesta(ator, cestaId, resto);
    revalidatePath("/campanhas/cestas");
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}

export async function acaoAlternarOfertaDaCesta(parametros: {
  cestaId: string;
  ofertaId: string;
  incluir: boolean;
}) {
  const ator = await atorDaSessao();
  try {
    await alternarOfertaDaCesta(ator, parametros.cestaId, parametros.ofertaId, parametros.incluir);
    revalidatePath("/campanhas/cestas");
    return { ok: true as const };
  } catch (erro) {
    return { ok: false as const, erros: mensagensDe(erro) };
  }
}
