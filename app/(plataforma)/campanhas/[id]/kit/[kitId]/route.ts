import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { prisma } from "@/infra/prisma/cliente";
import { criarArmazenadorLocal } from "@/infra/exportacoes/armazenador";

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

  const conteudo = await criarArmazenadorLocal().ler(kit.arquivoChave);
  const nome = kit.arquivoChave.split("/").pop() ?? `kit-v${kit.versao}.zip`;
  return new NextResponse(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
