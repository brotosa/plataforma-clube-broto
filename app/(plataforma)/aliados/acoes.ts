"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PapelContato } from "@prisma/client";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import {
  atualizarEmpresa,
  criarEmpresa,
  encerrarEmpresa,
  reativarEmpresa,
  solicitarPromocao,
  suspenderEmpresa,
} from "@/infra/casos-de-uso/empresas";
import {
  criarContato,
  criarContrato,
  mudarStatusContrato,
  removerContato,
} from "@/infra/casos-de-uso/contatos-contratos";
import { enviarMarca, removerMarca } from "@/infra/casos-de-uso/marca-aliado";
import { logger } from "@/infra/log/logger";

/** Estado devolvido aos formulários (useActionState). */
export interface EstadoFormulario {
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

function paraEstado(erro: unknown): EstadoFormulario {
  if (erro instanceof ErroDeValidacao) {
    return { erros: [...erro.erros] };
  }
  if (erro instanceof ErroDeAutorizacao) {
    return { erros: ["Seu papel não tem permissão para esta ação (ficha §2)."] };
  }
  logger.error({ erro: String(erro) }, "falha inesperada em ação de aliado");
  return { erros: ["Não foi possível concluir a ação. Tente novamente."] };
}

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

function dadosEmpresaDoFormulario(dados: FormData) {
  return {
    nomeFantasia: texto(dados, "nomeFantasia") ?? undefined,
    razaoSocial: texto(dados, "razaoSocial"),
    cnpj: texto(dados, "cnpj"),
    enderecoCep: texto(dados, "enderecoCep"),
    enderecoLogradouro: texto(dados, "enderecoLogradouro"),
    enderecoNumero: texto(dados, "enderecoNumero"),
    enderecoComplemento: texto(dados, "enderecoComplemento"),
    enderecoBairro: texto(dados, "enderecoBairro"),
    enderecoMunicipio: texto(dados, "enderecoMunicipio"),
    enderecoUf: texto(dados, "enderecoUf"),
    // `logoUrl` sai do formulário na F15 (RN54) e some daqui de propósito:
    // ausente do objeto, o Prisma nem toca a coluna. Mapeá-la como null
    // apagaria, a cada edição de aliado, o valor obsoleto que ainda serve
    // de fallback à completude — perda silenciosa sobre base em produção.
    descricaoInstitucional: texto(dados, "descricaoInstitucional"),
    site: texto(dados, "site"),
    categoriaIds: dados.getAll("categoriaIds").map(String).filter(Boolean),
  };
}

export async function acaoCriarAliado(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  let empresaId = "";
  try {
    if (!texto(dados, "nomeFantasia")) {
      return { erros: ["Nome fantasia (nome de exibição) é obrigatório."] };
    }
    const empresa = await criarEmpresa(ator, dadosEmpresaDoFormulario(dados));
    empresaId = empresa.id;
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath("/aliados");
  redirect(`/aliados/${empresaId}`);
}

export async function acaoAtualizarAliado(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    await atualizarEmpresa(ator, empresaId, dadosEmpresaDoFormulario(dados));
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/aliados/${empresaId}`);
  revalidatePath("/aliados");
  redirect(`/aliados/${empresaId}`);
}

export async function acaoSolicitarPromocao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    const resultado = await solicitarPromocao(ator, empresaId);
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath("/aprovacoes");
    return {
      sucesso:
        resultado.resultado === "PROMOVIDA"
          ? "Aliado promovido a Aliada ativa."
          : "Solicitação de promoção enviada para a fila de aprovação.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoSuspenderAliado(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    const { ofertasPausadas } = await suspenderEmpresa(ator, empresaId, {
      motivoSuspensaoId: String(dados.get("motivoSuspensaoId") ?? ""),
      descricao: texto(dados, "descricao"),
    });
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath("/aliados");
    revalidatePath("/ofertas");
    return {
      sucesso:
        ofertasPausadas > 0
          ? `Aliado suspenso. ${ofertasPausadas} oferta(s) publicada(s) pausada(s) em cascata (RN04).`
          : "Aliado suspenso.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoReativarAliado(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    await reativarEmpresa(ator, empresaId);
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath("/aliados");
    return { sucesso: "Aliado reativado (Aliada ativa)." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoEncerrarAliado(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    const { ofertasPausadas } = await encerrarEmpresa(ator, empresaId);
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath("/aliados");
    revalidatePath("/ofertas");
    return {
      sucesso:
        ofertasPausadas > 0
          ? `Aliado encerrado. ${ofertasPausadas} oferta(s) pausada(s) e marcadas para despublicação (RN04).`
          : "Aliado encerrado.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoCriarContato(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    await criarContato(ator, empresaId, {
      papel: String(dados.get("papel")) as PapelContato,
      nome: texto(dados, "nome") ?? "",
      cargo: texto(dados, "cargo"),
      email: texto(dados, "email") ?? "",
      telefone: texto(dados, "telefone"),
    });
    revalidatePath(`/aliados/${empresaId}`);
    return { sucesso: "Contato adicionado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoRemoverContato(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  await removerContato(ator, String(dados.get("contatoId") ?? ""));
  revalidatePath(`/aliados/${empresaId}`);
}

export async function acaoCriarContrato(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    const vigenciaBase = texto(dados, "vigenciaBase");
    if (!vigenciaBase) {
      return { erros: ["Data-base da vigência é obrigatória."] };
    }
    const comissaoPct = texto(dados, "comissaoPct");
    await criarContrato(ator, empresaId, {
      vigenciaBase: new Date(`${vigenciaBase}T00:00:00Z`),
      dataAssinatura: texto(dados, "dataAssinatura")
        ? new Date(`${texto(dados, "dataAssinatura")}T00:00:00Z`)
        : null,
      anexoS3Key: texto(dados, "anexoS3Key"),
      hashVerificacao: texto(dados, "hashVerificacao"),
      comissaoPct: comissaoPct ? Number(comissaoPct.replace(",", ".")) : null,
      ambientesPagamento: String(dados.get("ambientesPagamento")) as
        | "DENTRO_PLATAFORMA"
        | "FORA_PLATAFORMA"
        | "AMBOS",
    });
    revalidatePath(`/aliados/${empresaId}`);
    return { sucesso: "Contrato registrado." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoMudarStatusContrato(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    const { ofertasPausadas } = await mudarStatusContrato(
      ator,
      String(dados.get("contratoId") ?? ""),
      String(dados.get("novoStatus")) as "DENUNCIADO" | "ENCERRADO",
    );
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath("/ofertas");
    return {
      sucesso:
        ofertasPausadas > 0
          ? `Contrato atualizado. ${ofertasPausadas} oferta(s) pausada(s) em cascata (RN04).`
          : "Contrato atualizado.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

// ---------------------------------------------------------------------
// RN54 — marca do aliado
// ---------------------------------------------------------------------

/**
 * Envia ou troca a marca. O arquivo chega pelo `FormData`; a régua inteira
 * (tamanho, tipo real, higienização) roda no servidor, sobre os bytes que
 * efetivamente chegaram — o que a tela faz antes é conveniência.
 */
export async function acaoEnviarMarca(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  const arquivo = dados.get("marca");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione um arquivo de marca para enviar."] };
  }
  try {
    await enviarMarca(ator, empresaId, {
      nome: arquivo.name,
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
    });
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/aliados/${empresaId}`);
  revalidatePath("/aliados");
  revalidatePath("/mercado");
  return { sucesso: "Marca do aliado atualizada." };
}

/** Remove a marca; o aliado volta a exibir a placa com a inicial. */
export async function acaoRemoverMarca(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    await removerMarca(ator, empresaId);
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/aliados/${empresaId}`);
  revalidatePath("/aliados");
  revalidatePath("/mercado");
  return { sucesso: "Marca removida. O aliado volta a exibir a inicial." };
}
