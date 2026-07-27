import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { lerEvidenciaDaAprovacao } from "@/infra/casos-de-uso/campanhas";

/**
 * RN64 — serve a evidência da aprovação externa da campanha.
 *
 * Mesmo desenho das rotas da marca, da imagem do card e da minuta: ETag
 * pelo hash, permissão verificada aqui, cabeçalhos de contenção.
 *
 * `attachment` como na minuta: a evidência é prova a ser guardada por quem
 * a baixa, não conteúdo a renderizar dentro da plataforma — e ela pode ser
 * um PDF, que não se renderiza aqui por decisão.
 */
export async function GET(requisicao: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { id } = await contexto.params;

  try {
    const evidencia = await lerEvidenciaDaAprovacao(
      { id: sessao.user.id, papel: sessao.user.papel },
      id,
    );
    if (evidencia === null) {
      return NextResponse.json({ erro: "Esta campanha não tem evidência." }, { status: 404 });
    }

    const etag = `"${evidencia.hash}"`;
    if (requisicao.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" },
      });
    }

    return new NextResponse(new Uint8Array(evidencia.conteudo), {
      headers: {
        "Content-Type": evidencia.tipoMime,
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `attachment; ${nomeParaCabecalho(evidencia.nomeArquivo)}`,
      },
    });
  } catch (erro) {
    if (erro instanceof ErroDeAutorizacao) {
      return NextResponse.json(
        { erro: "Seu papel não tem permissão para ver esta campanha (ficha §2)." },
        { status: 403 },
      );
    }
    throw erro;
  }
}

/**
 * Nome de arquivo para o `Content-Disposition`. O nome vem do usuário:
 * aspas, quebras de linha e caracteres de controle quebrariam o cabeçalho
 * ou permitiriam injetar outro.
 */
function nomeParaCabecalho(nome: string): string {
  const base = nome.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 120) || "evidencia";
  const ascii = base.replace(/[^\x20-\x7e]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}
