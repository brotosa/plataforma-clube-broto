"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { importarTelemetria } from "@/infra/casos-de-uso/telemetria";
import type { EstadoFormulario } from "../../aliados/acoes";
import { logger } from "@/infra/log/logger";

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
    return { erros: ["Seu papel não tem permissão para importar telemetria (ficha §2)."] };
  }
  logger.error({ erro: String(erro) }, "falha inesperada na importação de telemetria");
  return { erros: ["Não foi possível importar o arquivo. Tente novamente."] };
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
