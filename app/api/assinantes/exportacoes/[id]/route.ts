import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { lerSnapshotExportacao } from "@/infra/casos-de-uso/assinantes-segmentos";

/**
 * Download do snapshot de exportação (RN34). A permissão é re-verificada
 * aqui: o arquivo é lista de contato plena — só quem pode exportar baixa.
 */
export async function GET(
  _requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { id } = await contexto.params;
  try {
    const { exportacao, conteudo } = await lerSnapshotExportacao(
      { id: sessao.user.id, papel: sessao.user.papel },
      id,
    );
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lista-contato-${exportacao.id}.csv"`,
      },
    });
  } catch (erro) {
    if (erro instanceof ErroDeAutorizacao) {
      return NextResponse.json(
        { erro: "Seu papel não exporta listas de contato (ficha §2)." },
        { status: 403 },
      );
    }
    return NextResponse.json({ erro: "Exportação não encontrada." }, { status: 404 });
  }
}
