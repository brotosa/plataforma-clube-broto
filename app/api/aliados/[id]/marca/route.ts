import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { lerMarca } from "@/infra/casos-de-uso/marca-aliado";

/**
 * RN54 — serve a marca do aliado.
 *
 * Permissão coerente com a do aliado: quem vê o aliado vê a marca dele; a
 * verificação acontece aqui, não só na tela que aponta para cá.
 *
 * **Cache versionado pelo hash.** O ETag é o SHA-256 do conteúdo, então a
 * troca da marca muda o ETag e o navegador nunca serve a antiga. Como a
 * URL é estável (`/api/aliados/{id}/marca`), o hash é o que faz a
 * revalidação funcionar — sem ele, `max-age` serviria marca velha por
 * horas depois da troca. `private` porque a resposta depende da sessão:
 * cache compartilhado não pode guardá-la.
 *
 * **Defesa do SVG.** O conteúdo já foi higienizado antes de gravar, mas
 * aqui vão as outras duas camadas: `nosniff` impede o navegador de
 * reinterpretar o tipo, e a CSP `default-src 'none'` neutraliza script,
 * requisição externa e plugin caso um SVG chegue a ser aberto direto
 * nesta URL. Nas telas a marca aparece em `<img>`, onde script não roda.
 */
export async function GET(requisicao: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { id } = await contexto.params;

  try {
    const marca = await lerMarca({ id: sessao.user.id, papel: sessao.user.papel }, id);
    if (marca === null) {
      return NextResponse.json({ erro: "Este aliado não tem marca." }, { status: 404 });
    }

    const etag = `"${marca.hash}"`;
    if (requisicao.headers.get("if-none-match") === etag) {
      // Nada mudou: 304 sem corpo, que é o ponto de versionar pelo hash.
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" },
      });
    }

    return new NextResponse(new Uint8Array(marca.conteudo), {
      headers: {
        "Content-Type": marca.tipoMime,
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
        // Nome de arquivo NÃO entra no cabeçalho: é texto do usuário, e o
        // que a rota entrega é imagem para exibir, não anexo para baixar.
        "Content-Disposition": "inline",
      },
    });
  } catch (erro) {
    if (erro instanceof ErroDeAutorizacao) {
      return NextResponse.json(
        { erro: "Seu papel não tem permissão para ver este aliado (ficha §2)." },
        { status: 403 },
      );
    }
    throw erro;
  }
}
