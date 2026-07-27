import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { lerMinuta } from "@/infra/casos-de-uso/patrocinadores";

/**
 * RN62 — serve a minuta do contrato.
 *
 * Mesmo desenho das rotas da marca (`/api/aliados/{id}/marca`) e da imagem
 * do card (`/api/solucoes/{id}/imagem`), e o paralelismo é intencional:
 * cache versionado pelo hash, permissão verificada aqui e não só na tela
 * que aponta para cá, e os cabeçalhos de contenção.
 *
 * **Duas diferenças, ambas por ser documento e não imagem:**
 *
 * 1. `Content-Disposition: attachment`, com o nome do arquivo. A minuta é
 *    para baixar e ler no leitor de PDF de quem baixou, não para renderizar
 *    dentro da plataforma — e um PDF renderizado em iframe é superfície
 *    que a plataforma não precisa abrir. O nome do arquivo é dado do
 *    usuário, então vai **sanitizado**: só o que é seguro num cabeçalho, e
 *    a forma `filename*` em UTF-8 para acentos.
 * 2. Nenhuma dependência de higienização. PDF não passa por sanitizador de
 *    texto; o que o contém é a CSP, o `nosniff` e o download.
 */
export async function GET(requisicao: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { id } = await contexto.params;

  try {
    const minuta = await lerMinuta({ id: sessao.user.id, papel: sessao.user.papel }, id);
    if (minuta === null) {
      return NextResponse.json({ erro: "Este contrato não tem minuta." }, { status: 404 });
    }

    const etag = `"${minuta.hash}"`;
    if (requisicao.headers.get("if-none-match") === etag) {
      // Nada mudou: 304 sem corpo, que é o ponto de versionar pelo hash.
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" },
      });
    }

    return new NextResponse(new Uint8Array(minuta.conteudo), {
      headers: {
        "Content-Type": minuta.tipoMime,
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; ${nomeParaCabecalho(minuta.nomeArquivo)}`,
      },
    });
  } catch (erro) {
    if (erro instanceof ErroDeAutorizacao) {
      return NextResponse.json(
        { erro: "Seu papel não tem permissão para ver este patrocinador (ficha §4)." },
        { status: 403 },
      );
    }
    throw erro;
  }
}

/**
 * Nome de arquivo para o `Content-Disposition`.
 *
 * O nome vem do usuário: aspas, quebras de linha e caracteres de controle
 * dentro dele quebrariam o cabeçalho ou permitiriam injetar outro. Sai um
 * `filename` ASCII saneado (para clientes antigos) e um `filename*` em
 * UTF-8 percent-encoded, que é o que preserva acentos.
 */
function nomeParaCabecalho(nome: string): string {
  const base = nome.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 120) || "minuta.pdf";
  const ascii = base.replace(/[^\x20-\x7e]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}
