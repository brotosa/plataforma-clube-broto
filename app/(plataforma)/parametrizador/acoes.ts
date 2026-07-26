"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GrupoIndicador, PeriodoMeta } from "@prisma/client";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import {
  alterarValorDeRegra,
  apurarUsos,
  atualizarItemDeLista,
  criarItemDeLista,
  criarMeta,
  definirEstadoDoItem,
} from "@/infra/casos-de-uso/parametrizador";
import type { ChaveValorRegra } from "@/dominio/parametrizador/valores-regra";
import type { FamiliaLista } from "@/dominio/parametrizador/listas";
import type { EstadoFormulario } from "../aliados/acoes";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

/**
 * Server actions do Parametrizador (T16 e T17). Toda escrita passa pelos
 * casos de uso — RBAC, validação, histórico e auditoria vivem lá, nunca
 * aqui. Depois de aplicar, revalidamos também as telas que consomem a
 * régua alterada: é o que torna visível, na mesma navegação, que o valor
 * novo já está valendo.
 */

async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  return { id: sessao.user.id, papel: sessao.user.papel };
}

function paraEstado(erro: unknown): EstadoFormulario {
  // RN55 — a distinção por classe de erro vive em um lugar só, para
  // todas as server actions. Aqui fica apenas o que é desta tela: a
  // negativa de permissão com a referência da ficha e o verbo da
  // mensagem genérica, que nunca sugere repetir a ação.
  const mensagens = mensagensDeFalha(erro, {
    operacao: "concluir a ação",
    semPermissao: "Editar parâmetros é exclusivo do Administrador da Plataforma (RN23).",
    contexto: "acao-parametrizador",
  });
  return { erros: mensagens };
}

/** Telas que leem configuração e precisam refletir a mudança na hora. */
function revalidarConsumidores() {
  revalidatePath("/parametrizador");
  revalidatePath("/parametrizador/valores");
  revalidatePath("/mercado");
  revalidatePath("/ofertas");
  revalidatePath("/aliados");
}

function numeroOuNulo(valor: FormDataEntryValue | null): number | null {
  if (typeof valor !== "string" || valor.trim() === "") {
    return null;
  }
  return Number(valor.replace(",", "."));
}

export async function acaoAlterarValorDeRegra(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const chave = String(dados.get("chave") ?? "") as ChaveValorRegra;
  try {
    const resultado = await alterarValorDeRegra(ator, chave, numeroOuNulo(dados.get("valor")));
    revalidarConsumidores();
    return {
      sucesso: resultado.aplicado
        ? "Valor atualizado — vale a partir de agora, sem recalcular nada que já fechou."
        : "Alteração enviada para aprovação (RN27) — o valor vigente segue valendo até a decisão.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoCriarMeta(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const periodo = String(dados.get("periodo") ?? "ANUAL") as PeriodoMeta;
  const referenciaBruta = String(dados.get("referencia") ?? "");
  const categoriaId = String(dados.get("categoriaId") ?? "").trim();
  const valor = numeroOuNulo(dados.get("valor"));
  try {
    if (!referenciaBruta) {
      throw new ErroDeValidacao(["Informe o período da meta."]);
    }
    const resultado = await criarMeta(ator, {
      periodo,
      referencia: new Date(`${referenciaBruta}T00:00:00.000Z`),
      categoriaId: categoriaId === "" ? null : categoriaId,
      valor: valor ?? 0,
    });
    revalidarConsumidores();
    return {
      sucesso: resultado.aplicado
        ? "Meta criada — vale a partir do período escolhido; períodos fechados não mudam."
        : "Meta enviada para aprovação (RN27) — nada muda até a decisão.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoCriarItemDeLista(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const familia = String(dados.get("familia") ?? "") as FamiliaLista;
  const grupo = String(dados.get("grupo") ?? "").trim();
  const dimensao = String(dados.get("dimensao") ?? "").trim();
  const peso = numeroOuNulo(dados.get("peso"));
  try {
    await criarItemDeLista(ator, familia, {
      nome: String(dados.get("nome") ?? ""),
      descricao: String(dados.get("descricao") ?? "").trim() || undefined,
      grupo: grupo === "" ? undefined : (grupo as GrupoIndicador),
      dimensao: dimensao === "" ? undefined : dimensao,
      peso: peso ?? undefined,
    });
    revalidatePath(`/parametrizador/listas/${familia}`);
    revalidarConsumidores();
    return { sucesso: "Item criado — já disponível nas seleções." };
  } catch (erro) {
    return paraEstado(erro);
  }
}

export async function acaoSalvarItemDeLista(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const familia = String(dados.get("familia") ?? "") as FamiliaLista;
  const itemId = String(dados.get("itemId") ?? "");
  const grupo = String(dados.get("grupo") ?? "").trim();
  const dimensao = String(dados.get("dimensao") ?? "").trim();
  const peso = numeroOuNulo(dados.get("peso"));
  try {
    const resultado = await atualizarItemDeLista(ator, familia, itemId, {
      nome: String(dados.get("nome") ?? ""),
      ...(grupo === "" ? {} : { grupo: grupo as GrupoIndicador }),
      ...(dimensao === "" ? {} : { dimensao }),
      ...(peso === null ? {} : { peso }),
    });
    revalidatePath(`/parametrizador/listas/${familia}`);
    revalidarConsumidores();
    return {
      sucesso: resultado.aplicado
        ? "Alterações salvas — o nome novo aparece em todos os usos."
        : "Alteração de peso enviada para aprovação (RN27); o restante da edição foi salvo.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/**
 * RN24 — inativar/reativar. A contagem de uso é reapurada aqui, no
 * servidor, e não aceita o número que veio da tela: o que a T16 exibe é
 * informação para a pessoa decidir, não a evidência que a regra exige.
 */
export async function acaoDefinirEstadoDoItem(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const familia = String(dados.get("familia") ?? "") as FamiliaLista;
  const itemId = String(dados.get("itemId") ?? "");
  const ativo = String(dados.get("ativo") ?? "") === "true";
  try {
    const usos = ativo ? null : await apurarUsos(familia, itemId);
    await definirEstadoDoItem(ator, familia, itemId, ativo, usos);
    revalidatePath(`/parametrizador/listas/${familia}`);
    revalidarConsumidores();
    return {
      sucesso: ativo
        ? "Item reativado — volta às seleções."
        : "Item inativado — sai das seleções novas e permanece no histórico com etiqueta.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}
