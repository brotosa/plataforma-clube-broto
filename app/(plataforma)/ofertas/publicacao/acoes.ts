"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import { publicarCatalogo } from "@/infra/casos-de-uso/publicacao";
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
    operacao: "gerar o pacote",
    semPermissao: "Seu papel não tem permissão para gerar a exportação (ficha §2).",
    contexto: "publicacao-ofertas",
  });
  return { erros: mensagens };
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
