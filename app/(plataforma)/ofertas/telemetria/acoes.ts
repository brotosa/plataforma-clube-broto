"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import { importarTelemetria } from "@/infra/casos-de-uso/telemetria";
import type { EstadoFormulario } from "../../aliados/acoes";
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
    operacao: "importar o arquivo",
    semPermissao: "Seu papel não tem permissão para importar telemetria (ficha §2).",
    contexto: "importacao-telemetria",
  });
  return { erros: mensagens };
}

export async function acaoImportarTelemetria(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione um arquivo CSV de telemetria."] };
  }
  try {
    const conteudo = await arquivo.text();
    const relatorio = await importarTelemetria(ator, { nomeArquivo: arquivo.name, conteudo });
    revalidatePath("/ofertas/telemetria");
    revalidatePath("/ofertas");
    const semVinculo = relatorio.semVinculoOferta
      ? `, ${relatorio.semVinculoOferta} sem vínculo com oferta`
      : "";
    return {
      sucesso:
        `Importação de "${arquivo.name}": ${relatorio.importados} eventos importados, ` +
        `${relatorio.duplicados} duplicados ignorados, ${relatorio.emQuarentena} em quarentena${semVinculo}.`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}
