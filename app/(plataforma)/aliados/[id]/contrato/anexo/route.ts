import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { lerAnexoDoContratoVigente } from "@/infra/casos-de-uso/contatos-contratos";

/**
 * Serve o anexo (PDF) do contrato vigente do aliado — Nível 2 do "editar
 * contrato".
 *
 * Mesmo desenho das rotas da marca (`/api/aliados/{id}/marca`), da imagem do
 * card (`/api/solucoes/{id}/imagem`) e da minuta do patrocínio
 * (`/api/patrocinadores/{id}/minuta`): cache versionado pelo hash, permissão
 * verificada aqui e não só na tela que aponta para cá, e os cabeçalhos de
 * contenção.
 *
 * **Duas diferenças, ambas por ser documento e não imagem:**
 * 1. `Content-Disposition: attachment`, com o nome do arquivo sanitizado — o
 *    anexo é para baixar e ler no leitor de PDF de quem baixou, não para
 *    renderizar dentro da plataforma.
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
    const anexo = await lerAnexoDoContratoVigente(
      { id: sessao.user.id, papel: sessao.user.papel },
      id,
    );
    if (anexo === null) {
      return NextResponse.json({ erro: "Este contrato não tem anexo." }, { status: 404 });
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
  const base = nome.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 120) || "anexo.pdf";
  const ascii = base.replace(/[^\x20-\x7e]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}
