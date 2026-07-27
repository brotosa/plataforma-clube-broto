"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PorteProdutor, StatusSolucao } from "@prisma/client";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import {
  atualizarSolucao,
  criarSolucao,
  mudarStatusSolucao,
} from "@/infra/casos-de-uso/solucoes";
import {
  enviarImagemDaSolucao,
  removerImagemDaSolucao,
} from "@/infra/casos-de-uso/imagem-solucao";
import type { EstadoFormulario } from "../../acoes";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";

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
    semPermissao: "Seu papel não tem permissão para esta ação (ficha §2).",
    contexto: "acao-solucao",
  });
  return { erros: mensagens };
}

function texto(dados: FormData, campo: string): string | null {
  const valor = dados.get(campo);
  if (typeof valor !== "string") return null;
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

/**
 * Os campos que o formulário da T3 edita.
 *
 * `imagemCardUrl` NÃO está aqui, e não é esquecimento (F17, RN60). O campo
 * saiu da tela e a coluna virou obsoleta, mas ela ainda é a retaguarda de
 * leitura das soluções cadastradas antes desta onda. Se a chave voltasse
 * para cá, `texto()` devolveria `null` para um campo ausente e cada edição
 * de solução APAGARIA o valor legado — a solução perderia o ponto da régua
 * RN09 que já tinha, e o percentual mudaria em produção por uma edição de
 * texto qualquer. `infra/casos-de-uso/solucoes.integracao.test.ts` cobra.
 */
function dadosSolucaoDoFormulario(dados: FormData) {
  return {
    nome: texto(dados, "nome") ?? undefined,
    descricaoCurta: texto(dados, "descricaoCurta"),
    descricaoCompleta: texto(dados, "descricaoCompleta"),
    categoriaId: texto(dados, "categoriaId"),
    linkExterno: texto(dados, "linkExterno"),
    coberturaNacional: dados.get("coberturaNacional") === "1",
    perfilCliente: dados.getAll("perfilCliente").map(String) as PorteProdutor[],
    tecnologias: (texto(dados, "tecnologias") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    culturaIds: dados.getAll("culturaIds").map(String).filter(Boolean),
    ufIds: dados.getAll("ufIds").map(String).filter(Boolean),
  };
}

export async function acaoCriarSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  let solucaoId = "";
  try {
    const solucao = await criarSolucao(ator, empresaId, dadosSolucaoDoFormulario(dados));
    solucaoId = solucao.id;
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/aliados/${empresaId}`);
  redirect(`/aliados/${empresaId}/solucoes/${solucaoId}`);
}

export async function acaoAtualizarSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  const solucaoId = String(dados.get("solucaoId") ?? "");
  try {
    await atualizarSolucao(ator, solucaoId, dadosSolucaoDoFormulario(dados));
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidatePath(`/aliados/${empresaId}`);
  revalidatePath(`/aliados/${empresaId}/solucoes/${solucaoId}`);
  redirect(`/aliados/${empresaId}/solucoes/${solucaoId}`);
}

export async function acaoMudarStatusSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const empresaId = String(dados.get("empresaId") ?? "");
  const solucaoId = String(dados.get("solucaoId") ?? "");
  try {
    const { ofertasPausadas } = await mudarStatusSolucao(
      ator,
      solucaoId,
      String(dados.get("novoStatus")) as StatusSolucao,
    );
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath(`/aliados/${empresaId}/solucoes/${solucaoId}`);
    revalidatePath("/ofertas");
    return {
      sucesso:
        ofertasPausadas > 0
          ? `Status atualizado. ${ofertasPausadas} oferta(s) publicada(s) pausada(s) em cascata (RN04).`
          : "Status atualizado.",
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}

/**
 * RN60 — envia (ou troca) a imagem do card da solução.
 *
 * Mesmo desenho de `acaoEnviarMarca`: a recusa de arquivo é erro de causa
 * conhecida e a mensagem sobe inteira até a tela (RN55) — inclusive a do
 * SVG, que é o caso em que o arquivo está válido e o formato é que não
 * serve nesta entidade.
 */
export async function acaoEnviarImagemDaSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const solucaoId = String(dados.get("solucaoId") ?? "");
  const empresaId = String(dados.get("empresaId") ?? "");
  const arquivo = dados.get("imagem");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione um arquivo de imagem para enviar."] };
  }
  try {
    await enviarImagemDaSolucao(ator, solucaoId, {
      nome: arquivo.name,
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
    });
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidarTelasDaImagem(empresaId, solucaoId);
  return { sucesso: "Imagem do card atualizada." };
}

/** Remove a imagem; o card volta ao tratamento neutro. */
export async function acaoRemoverImagemDaSolucao(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const solucaoId = String(dados.get("solucaoId") ?? "");
  const empresaId = String(dados.get("empresaId") ?? "");
  try {
    await removerImagemDaSolucao(ator, solucaoId);
  } catch (erro) {
    return paraEstado(erro);
  }
  revalidarTelasDaImagem(empresaId, solucaoId);
  return { sucesso: "Imagem do card removida." };
}

/**
 * As telas que mostram a imagem, ou que mostram um número que ela move.
 *
 * `/ofertas` e `/` entram porque a imagem participa da régua de completude
 * (RN09): sem revalidar, o percentual da T4 e a contagem de cadastros
 * incompletos da HOME ficariam um passo atrás do que a tela acabou de
 * mudar. Foi a lição que a F15 registrou ao esquecer `/mercado` na marca.
 */
function revalidarTelasDaImagem(empresaId: string, solucaoId: string): void {
  if (empresaId) {
    revalidatePath(`/aliados/${empresaId}`);
    revalidatePath(`/aliados/${empresaId}/solucoes/${solucaoId}`);
  }
  revalidatePath("/ofertas");
  revalidatePath("/");
}
