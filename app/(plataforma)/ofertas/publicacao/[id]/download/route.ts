import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { arquivosDaPublicacao } from "@/infra/casos-de-uso/publicacao";

/**
 * Download dos arquivos de uma publicação (JSON/CSV), regenerados do pacote
 * canônico guardado. Restrito a quem pode gerar exportação (ficha §2).
 */
export async function GET(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const sessao = await auth();
  if (!sessao?.user) {
    return new Response("Não autenticado.", { status: 401 });
  }
  if (!podeExecutar(sessao.user.papel, "GERAR_EXPORTACAO")) {
    return new Response("Sem permissão para exportar (ficha §2).", { status: 403 });
  }
  const { id } = await contexto.params;
  const formato = new URL(requisicao.url).searchParams.get("formato") === "json" ? "json" : "csv";

  try {
    const arquivos = await arquivosDaPublicacao(id);
    const arquivo = arquivos.find((item) => item.nomeArquivo.endsWith(`.${formato}`));
    if (!arquivo) {
      return new Response("Formato indisponível.", { status: 404 });
    }
    return new Response(arquivo.conteudo, {
      headers: {
        "Content-Type": `${arquivo.tipoConteudo}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${arquivo.nomeArquivo}"`,
      },
    });
  } catch {
    return new Response("Publicação não encontrada.", { status: 404 });
  }
}
