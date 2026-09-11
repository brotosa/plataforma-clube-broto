import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { lerAnexoDoComentario } from "@/infra/casos-de-uso/comentarios";

/**
 * Serve o anexo (PDF ou imagem) de um comentário do painel de atividades.
 *
 * Mesmo desenho das rotas da marca (`/api/aliados/{id}/marca`), da imagem do
 * card (`/api/solucoes/{id}/imagem`), da minuta (`/api/patrocinadores/{id}/minuta`)
 * e do anexo do contrato: cache versionado pelo hash, permissão verificada
 * aqui e não só na tela que aponta para cá, e os cabeçalhos de contenção.
 *
 * `Content-Disposition: attachment` com o nome sanitizado — o anexo é para
 * baixar, nunca para renderizar dentro da plataforma (a mesma decisão do
 * anexo do contrato; vale igual para a imagem, que aqui é anexo, não vitrine).
 * A CSP `default-src 'none'; sandbox` e o `nosniff` contêm qualquer conteúdo.
 */
export async function GET(
  requisicao: Request,
  contexto: { params: Promise<{ notaId: string }> },
) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { notaId } = await contexto.params;

  try {
    const anexo = await lerAnexoDoComentario(
      { id: sessao.user.id, papel: sessao.user.papel },
      notaId,
    );
    if (anexo === null) {
      return NextResponse.json({ erro: "Este comentário não tem anexo." }, { status: 404 });
    }

    const etag = `"${anexo.hash}"`;
    if (requisicao.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" },
      });
    }

    return new NextResponse(new Uint8Array(anexo.conteudo), {
      headers: {
        "Content-Type": anexo.tipoMime,
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; ${nomeParaCabecalho(anexo.nomeArquivo)}`,
      },
    });
  } catch (erro) {
    if (erro instanceof ErroDeAutorizacao) {
      return NextResponse.json({ erro: "Sem permissão para ver este anexo." }, { status: 403 });
    }
    throw erro;
  }
}

/**
 * Nome de arquivo para o `Content-Disposition`. O nome vem do usuário: aspas,
 * quebras e caracteres de controle quebrariam o cabeçalho ou permitiriam
 * injetar outro. Sai um `filename` ASCII saneado (para clientes antigos) e um
 * `filename*` em UTF-8 percent-encoded, que preserva acentos.
 */
function nomeParaCabecalho(nome: string): string {
  // Troca por "_" o que quebraria o cabeçalho — controles (< 0x20, 0x7F),
  // aspas, barra invertida e barra —, por ponto de código, sem regex de
  // caractere de controle (que é frágil no fonte).
  const saneado = Array.from(nome)
    .map((caractere) => {
      const cp = caractere.codePointAt(0) ?? 0;
      return cp < 0x20 || cp === 0x7f || caractere === '"' || caractere === "\\" || caractere === "/"
        ? "_"
        : caractere;
    })
    .join("")
    .slice(0, 120);
  const base = saneado.length > 0 ? saneado : "anexo";
  // Fallback ASCII para clientes antigos: só imprimíveis (0x20–0x7E).
  const ascii = base.replace(/[^ -~]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}
