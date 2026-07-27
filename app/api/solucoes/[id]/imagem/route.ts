import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { lerImagemDaSolucao } from "@/infra/casos-de-uso/imagem-solucao";

/**
 * RN60 — serve a imagem do card da solução.
 *
 * Mesmo desenho da rota da marca (`/api/aliados/{id}/marca`), e o
 * paralelismo é intencional: cache versionado pelo hash, permissão
 * verificada aqui e não só na tela que aponta para cá, e os cabeçalhos de
 * contenção.
 *
 * **Cache versionado pelo hash.** O ETag é o SHA-256 do conteúdo, então a
 * troca da imagem muda o ETag e o navegador nunca serve a antiga. Como a
 * URL é estável (`/api/solucoes/{id}/imagem`), o hash é o que faz a
 * revalidação funcionar — sem ele, `max-age` serviria imagem velha por
 * horas depois da troca. `private` porque a resposta depende da sessão:
 * cache compartilhado não pode guardá-la.
 *
 * **Os cabeçalhos de contenção ficam, mesmo sem SVG.** A RN60 não aceita
 * vetor nesta entidade, então a superfície que a CSP cobre na marca aqui
 * nem existe — mas `nosniff` continua valendo por si: sem ele o navegador
 * pode reinterpretar o tipo de um arquivo que passou pela validação de
 * assinatura e mesmo assim carrega bytes ambíguos. Manter os dois custa
 * nada e evita que a diferença entre as duas rotas vire pergunta.
 */
export async function GET(requisicao: Request, contexto: { params: Promise<{ id: string }> }) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { id } = await contexto.params;

  try {
    const imagem = await lerImagemDaSolucao({ id: sessao.user.id, papel: sessao.user.papel }, id);
    if (imagem === null) {
      return NextResponse.json({ erro: "Esta solução não tem imagem." }, { status: 404 });
    }

    const etag = `"${imagem.hash}"`;
    if (requisicao.headers.get("if-none-match") === etag) {
      // Nada mudou: 304 sem corpo, que é o ponto de versionar pelo hash.
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" },
      });
    }

    return new NextResponse(new Uint8Array(imagem.conteudo), {
      headers: {
        "Content-Type": imagem.tipoMime,
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
        { erro: "Seu papel não tem permissão para ver esta solução (ficha §2)." },
        { status: 403 },
      );
    }
    throw erro;
  }
}
