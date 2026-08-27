"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StatusPatrocinador } from "@prisma/client";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import {
  alterarStatusDoPatrocinador,
  criarPatrocinador,
  editarPatrocinador,
  encerrarVinculo,
  enviarMinuta,
  removerMinuta,
  salvarContrato,
  vincularAssinante,
  vincularAssinantePorCpf,
} from "@/infra/casos-de-uso/patrocinadores";
import { gerarRelatorio } from "@/infra/casos-de-uso/relatorio-patrocinador";

/** Estado devolvido aos formulários desta tela. */
export interface EstadoFormulario {
  erros?: string[];
  sucesso?: string;
  /** Versão da minuta depois da ação — lido pelo cartão de arquivo. */
  versao?: string | null;
}

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown, contexto: string, operacao: string): EstadoFormulario {
  // RN55 — a distinção por classe vive em um lugar só. Aqui fica apenas o
  // que é desta tela: a negativa com a referência da ficha e o verbo da
  // mensagem genérica, que nunca sugere repetir a ação.
  return {
    erros: mensagensDeFalha(erro, {
      operacao,
      semPermissao:
        "Seu papel não tem permissão para gerir patrocinadores — a ficha da Onda 12 §4 atribui isto ao Gestor do Clube.",
      contexto,
    }),
  };
}

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

function obrigatorio(dados: FormData, campo: string): string {
  return texto(dados, campo) ?? "";
}

/** Data de campo `<input type="date">`; vazio = ausência declarada. */
function data(dados: FormData, campo: string): Date | null {
  const valor = texto(dados, campo);
  if (valor === null) return null;
  const convertida = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(convertida.getTime()) ? null : convertida;
}

/**
 * Inteiro de campo numérico. Vazio devolve `null` — que é o que produz o
 * traço com motivo no saldo, e nunca zero.
 */
function inteiro(dados: FormData, campo: string): number | null {
  const valor = texto(dados, campo);
  if (valor === null) return null;
  const convertido = Number.parseInt(valor, 10);
  return Number.isNaN(convertido) ? null : convertido;
}

/** Valor monetário como texto, para o Decimal do Prisma não perder casas. */
function decimal(dados: FormData, campo: string): string | null {
  const valor = texto(dados, campo);
  if (valor === null) return null;
  const normalizado = valor.replace(/\./g, "").replace(",", ".");
  return Number.isNaN(Number(normalizado)) ? null : normalizado;
}

function dadosDoCadastro(dados: FormData) {
  return {
    razaoSocial: obrigatorio(dados, "razaoSocial"),
    cnpj: obrigatorio(dados, "cnpj"),
    segmento: texto(dados, "segmento"),
    contatoNome: texto(dados, "contatoNome"),
    contatoEmail: texto(dados, "contatoEmail"),
    contatoTelefone: texto(dados, "contatoTelefone"),
    responsavelComercialId: texto(dados, "responsavelComercialId"),
    observacoes: texto(dados, "observacoes"),
  };
}

export async function acaoCriarPatrocinador(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  let destino: string;
  try {
    const ator = await atorDaSessao();
    const { id } = await criarPatrocinador(ator, dadosDoCadastro(dados));
    destino = `/patrocinadores/${id}`;
  } catch (erro) {
    return paraEstado(erro, "criar-patrocinador", "cadastrar o patrocinador");
  }
  revalidatePath("/patrocinadores");
  redirect(destino);
}

export async function acaoEditarPatrocinador(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  try {
    const ator = await atorDaSessao();
    await editarPatrocinador(ator, id, dadosDoCadastro(dados));
  } catch (erro) {
    return paraEstado(erro, "editar-patrocinador", "salvar o cadastro do patrocinador");
  }
  revalidatePath(`/patrocinadores/${id}`);
  revalidatePath("/patrocinadores");
  return { sucesso: "Cadastro do patrocinador atualizado." };
}

export async function acaoAlterarStatus(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  const status = obrigatorio(dados, "status") as StatusPatrocinador;
  try {
    const ator = await atorDaSessao();
    await alterarStatusDoPatrocinador(ator, id, status);
  } catch (erro) {
    return paraEstado(erro, "status-patrocinador", "alterar o status do patrocinador");
  }
  revalidatePath(`/patrocinadores/${id}`);
  revalidatePath("/patrocinadores");
  return {
    sucesso:
      status === "ENCERRADO"
        ? "Patrocinador encerrado. Os vínculos vigentes permanecem — encerre-os um a um se for o caso."
        : "Patrocinador reativado.",
  };
}

export async function acaoSalvarContrato(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  try {
    const ator = await atorDaSessao();
    await salvarContrato(ator, id, {
      dataAssinatura: data(dados, "dataAssinatura"),
      vigenciaInicio: data(dados, "vigenciaInicio"),
      vigenciaFim: data(dados, "vigenciaFim"),
      precoUnitario: decimal(dados, "precoUnitario"),
      valorTotalContratado: decimal(dados, "valorTotalContratado"),
      assinaturasAdquiridas: inteiro(dados, "assinaturasAdquiridas"),
    });
  } catch (erro) {
    return paraEstado(erro, "salvar-contrato", "salvar o contrato");
  }
  revalidatePath(`/patrocinadores/${id}`);
  revalidatePath("/patrocinadores");
  return { sucesso: "Contrato salvo." };
}

export async function acaoEnviarMinuta(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  const arquivo = dados.get("minuta");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione a minuta do contrato e envie novamente."] };
  }
  try {
    const ator = await atorDaSessao();
    const conteudo = new Uint8Array(await arquivo.arrayBuffer());
    const { hash } = await enviarMinuta(ator, id, { nome: arquivo.name, conteudo });
    revalidatePath(`/patrocinadores/${id}`);
    return { sucesso: "Minuta anexada ao contrato.", versao: hash };
  } catch (erro) {
    return paraEstado(erro, "enviar-minuta", "anexar a minuta");
  }
}

export async function acaoRemoverMinuta(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  try {
    const ator = await atorDaSessao();
    await removerMinuta(ator, id);
    revalidatePath(`/patrocinadores/${id}`);
    return { sucesso: "Minuta removida. O contrato volta a exibir a pendência.", versao: null };
  } catch (erro) {
    return paraEstado(erro, "remover-minuta", "remover a minuta");
  }
}

export async function acaoVincularAssinante(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  const assinanteId = obrigatorio(dados, "assinanteId");
  const inicio = data(dados, "inicio") ?? new Date();
  try {
    const ator = await atorDaSessao();
    await vincularAssinante(ator, id, assinanteId, inicio);
  } catch (erro) {
    return paraEstado(erro, "vincular-assinante", "vincular o assinante");
  }
  revalidatePath(`/patrocinadores/${id}`);
  return { sucesso: "Assinante vinculado a uma vaga do patrocinador." };
}

export async function acaoVincularAssinantePorCpf(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  const cpf = obrigatorio(dados, "cpf");
  const inicio = data(dados, "inicio") ?? new Date();
  try {
    const ator = await atorDaSessao();
    await vincularAssinantePorCpf(ator, id, cpf, inicio);
  } catch (erro) {
    return paraEstado(erro, "vincular-assinante", "vincular o assinante");
  }
  revalidatePath(`/patrocinadores/${id}`);
  return { sucesso: "Assinante vinculado a uma vaga do patrocinador." };
}

export async function acaoEncerrarVinculo(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  const vinculoId = obrigatorio(dados, "vinculoId");
  const fim = data(dados, "fim") ?? new Date();
  try {
    const ator = await atorDaSessao();
    await encerrarVinculo(ator, vinculoId, fim, texto(dados, "motivoFim"));
  } catch (erro) {
    return paraEstado(erro, "encerrar-vinculo", "encerrar o vínculo");
  }
  revalidatePath(`/patrocinadores/${id}`);
  return { sucesso: "Vínculo encerrado. A vaga voltou ao saldo e o histórico ficou." };
}

export async function acaoGerarRelatorio(
  _estado: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const id = obrigatorio(dados, "patrocinadorId");
  const inicio = data(dados, "periodoInicio");
  const fim = data(dados, "periodoFim");
  const finalidade = texto(dados, "finalidade");
  if (inicio === null || fim === null) {
    return { erros: ["Informe o período do relatório (início e fim)."] };
  }
  if (finalidade === null) {
    // RN66: a finalidade é a razão de o relatório existir, e é ela que a
    // trilha guarda. Sem ela não há o que auditar.
    return { erros: ["Declare a finalidade do relatório — ela fica registrada na trilha."] };
  }
  let destino: string;
  try {
    const ator = await atorDaSessao();
    const { id: relatorioId } = await gerarRelatorio(ator, id, {
      periodoInicio: inicio,
      periodoFim: fim,
      finalidade,
    });
    destino = `/patrocinadores/${id}/relatorio/${relatorioId}`;
  } catch (erro) {
    return paraEstado(erro, "gerar-relatorio", "gerar o relatório do patrocinador");
  }
  revalidatePath(`/patrocinadores/${id}`);
  redirect(destino);
}
