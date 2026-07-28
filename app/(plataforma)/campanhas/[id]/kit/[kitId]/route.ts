import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { prisma } from "@/infra/prisma/cliente";
import { criarArmazenadorPrisma } from "@/infra/exportacoes/armazenador";
import { ErroDeArquivoAusente } from "@/dominio/arquivos/artefato-derivado";
import { mensagemGenerica } from "@/infra/erros/falha-para-mensagem";
import { logger } from "@/infra/log/logger";

/**
 * Download do kit (T25). O pacote leva a lista de assinantes: a rota
 * re-verifica AS DUAS permissões — operar campanha e exportar listas de
 * contato (RN34) —, como manda a ficha §2.
 */
export async function GET(
  _requisicao: Request,
  contexto: { params: Promise<{ id: string; kitId: string }> },
) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }
  try {
    exigirPermissao(sessao.user.papel, "ATIVAR_ENCERRAR_CAMPANHA");
    exigirPermissao(sessao.user.papel, "EXPORTAR_LISTAS_CONTATO");
  } catch {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const { id, kitId } = await contexto.params;
  const kit = await prisma.kitCampanha.findUnique({ where: { id: kitId } });
  if (!kit || kit.campanhaId !== id) {
    return NextResponse.json({ erro: "kit não encontrado" }, { status: 404 });
  }

  // RN71 — a rota lê pelo mesmo armazenador dos casos de uso. Até a F20
  // ela instanciava o local por conta própria, fora deles: era o caminho
  // que ninguém lembrava de migrar junto.
  let conteudo: Buffer;
  try {
    conteudo = await criarArmazenadorPrisma().ler(kit.arquivoChave);
  } catch (erro) {
    // Chave órfã sobe a própria mensagem (RN55): ela diz que o pacote não
    // está no armazenamento e que o caminho é gerar uma versão nova.
    if (erro instanceof ErroDeArquivoAusente) {
      return NextResponse.json({ erro: erro.message }, { status: 404 });
    }
    logger.error(
      {
        erro: erro instanceof Error ? { nome: erro.name, mensagem: erro.message } : String(erro),
        pilha: erro instanceof Error ? erro.stack : undefined,
        contexto: "download do kit",
      },
      "falha inesperada ao ler o pacote do kit",
    );
    return NextResponse.json({ erro: mensagemGenerica("baixar o kit") }, { status: 500 });
  }

  const nome = kit.arquivoChave.split("/").pop() ?? `kit-v${kit.versao}.zip`;
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
