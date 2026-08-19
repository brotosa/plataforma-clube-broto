"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import {
  importarOfertas,
  corrigirCelulaOferta,
  efetivarImportacaoOfertas,
} from "@/infra/casos-de-uso/importar-ofertas";
import type { EstadoFormulario } from "../../aliados/acoes";

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
      semPermissao: "Importar ofertas exige papel Gestor ou Analista (ficha §2).",
      contexto: "importar-ofertas",
    }),
  };
}

export async function acaoImportarOfertas(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione a planilha de ofertas antes de enviar."] };
  }
  let importacaoId: string;
  try {
    const resultado = await importarOfertas(ator, {
      nomeArquivo: arquivo.name,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });
    importacaoId = resultado.importacaoId;
  } catch (erro) {
    return paraEstado(erro, "importar a planilha");
  }
  redirect(`/ofertas/importar?lote=${importacaoId}`);
}

export async function acaoCorrigirCelulaOferta(dados: FormData): Promise<void> {
  const ator = await atorDaSessao();
  const stagingId = String(dados.get("stagingId") ?? "");
  const coluna = String(dados.get("coluna") ?? "");
  const valor = String(dados.get("valor") ?? "");
  const importacaoId = String(dados.get("importacaoId") ?? "");
  if (!stagingId || !coluna) return;
  await corrigirCelulaOferta(ator, { stagingId, coluna, valor });
  revalidatePath(`/ofertas/importar`);
  redirect(`/ofertas/importar?lote=${importacaoId}`);
}

export async function acaoEfetivarOfertas(
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
    const r = await efetivarImportacaoOfertas(ator, importacaoId);
    criadas = r.criadas;
    enriquecidas = r.enriquecidas;
  } catch (erro) {
    return paraEstado(erro, "efetivar a importação");
  }
  redirect(`/ofertas/importar?feito=1&criadas=${criadas}&enriquecidas=${enriquecidas}`);
}
