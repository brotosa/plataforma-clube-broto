"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/infra/auth";
import type { Ator } from "@/infra/casos-de-uso/contexto";
import { importarRelatorioDaOperadora } from "@/infra/casos-de-uso/telemetria-operadora";
import { TEXTO_DA_CAUSA } from "@/dominio/telemetria-operadora/causas";
import { mensagensDeFalha } from "@/infra/erros/falha-para-mensagem";
import type { EstadoFormulario } from "../../aliados/acoes";

/**
 * T34 — envio de um dos quatro relatórios da operadora.
 *
 * O layout **não é escolhido pelo usuário**: é detectado pelo cabeçalho
 * (RN67). Um seletor aqui seria uma chance a mais de gravar o arquivo no
 * lugar errado, e o cabeçalho já sabe a resposta.
 */

const ROTULO_DO_LAYOUT: Readonly<Record<string, string>> = {
  USUARIOS: "base de usuários",
  RESGATES: "extrato de resgates",
  SELLERS: "catálogo de sellers",
  OFERTAS: "catálogo de ofertas",
};

export async function acaoImportarRelatorio(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const ator: Ator = { id: sessao.user.id, papel: sessao.user.papel };

  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erros: ["Selecione o arquivo do relatório antes de enviar."] };
  }

  try {
    const resultado = await importarRelatorioDaOperadora(ator, {
      nomeArquivo: arquivo.name,
      conteudo: Buffer.from(await arquivo.arrayBuffer()),
    });

    const rotulo = ROTULO_DO_LAYOUT[resultado.tipoLayout] ?? resultado.tipoLayout;

    if (resultado.jaImportado) {
      // RN67 — reimportar não é erro nem sucesso silencioso: é um fato a
      // informar. Sem esta frase, quem envia acha que nada aconteceu.
      return {
        erros: [],
        sucesso:
          `Este arquivo (${rotulo}) já havia sido importado — o conteúdo é idêntico, ` +
          `reconhecido pelo hash. Nada foi duplicado e nenhuma contagem mudou.`,
      };
    }

    const causas = Object.entries(resultado.recusasPorCausa)
      .map(([causa, quantidade]) => {
        const texto = TEXTO_DA_CAUSA[causa as keyof typeof TEXTO_DA_CAUSA] ?? causa;
        return `${quantidade} ${texto}`;
      })
      .join(" · ");

    revalidatePath("/ofertas/telemetria-operadora");
    revalidatePath("/ofertas");
    revalidatePath("/");

    return {
      erros: [],
      sucesso:
        `Importado o ${rotulo}: ${resultado.lidas} linha(s) lida(s), ` +
        `${resultado.aplicadas} aplicada(s), ${resultado.recusadas} recusada(s)` +
        (causas ? ` — ${causas}` : "") +
        (resultado.divergencias > 0
          ? `. ${resultado.divergencias} divergência(s) registrada(s) — relatadas, nunca corrigidas (RN70).`
          : ".") +
        (resultado.colunaDeCpfEncontrada
          ? ` Coluna de chave encontrada: "${resultado.colunaDeCpfEncontrada}".`
          : ""),
    };
  } catch (erro) {
    return {
      erros: mensagensDeFalha(erro, {
        operacao: "importar o relatório da operadora",
        semPermissao:
          "Seu papel não tem permissão para importar telemetria (ficha da Onda 12 §8).",
        contexto: "acao-telemetria-operadora",
      }),
    };
  }
}
