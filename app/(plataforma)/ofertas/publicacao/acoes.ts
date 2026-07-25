"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { ErroDeValidacao, type Ator } from "@/infra/casos-de-uso/contexto";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { publicarCatalogo } from "@/infra/casos-de-uso/publicacao";
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
    return { erros: ["Seu papel não tem permissão para gerar a exportação (ficha §2)."] };
  }
  logger.error({ erro: String(erro) }, "falha inesperada na publicação");
  return { erros: ["Não foi possível gerar o pacote. Tente novamente."] };
}

export async function acaoPublicarCatalogo(
  _anterior: EstadoFormulario,
  _dados: FormData,
): Promise<EstadoFormulario> {
  const ator = await atorDaSessao();
  try {
    const resultado = await publicarCatalogo(ator);
    revalidatePath("/ofertas/publicacao");
    revalidatePath("/ofertas");
    return {
      sucesso:
        `Pacote gerado (${resultado.adapter}): ${resultado.itensPublicados} publicadas, ` +
        `${resultado.despublicacoes} despublicações. Diff em relação ao anterior: ` +
        `+${resultado.diff.adicionadas.length} novas, ~${resultado.diff.alteradas.length} alteradas, ` +
        `−${resultado.diff.removidas.length} retiradas. ${resultado.flagsLimpas} flags de republicação limpas (RN10).`,
    };
  } catch (erro) {
    return paraEstado(erro);
  }
}
