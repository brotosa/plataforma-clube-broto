import { NextResponse } from "next/server";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { prisma } from "@/infra/prisma/cliente";

/**
 * Download dos erros de quarentena da carga (T20 — "Baixar erros (CSV)").
 * RN31: cada linha rejeitada sai com o motivo; nada é descartado em
 * silêncio.
 */
export async function GET(
  _requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const sessao = await auth();
  if (!sessao?.user) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  if (!podeExecutar(sessao.user.papel, "IMPORTAR_ASSINANTES")) {
    return NextResponse.json(
      { erro: "Seu papel não opera importações de assinantes (ficha §2)." },
      { status: 403 },
    );
  }
  const { id } = await contexto.params;
  const importacao = await prisma.importacao.findUnique({ where: { id } });
  if (
    !importacao ||
    (importacao.tipo !== "ASSINANTES_NUCLEO" &&
      importacao.tipo !== "ASSINANTES_ENRIQUECIMENTO")
  ) {
    return NextResponse.json({ erro: "Importação não encontrada." }, { status: 404 });
  }

  const rejeitadas = await prisma.stagingAssinante.findMany({
    where: { importacaoId: id, estado: "REJEITADA" },
    orderBy: { linhaOrigem: "asc" },
    select: { linhaOrigem: true, mensagemErro: true, dadosOriginais: true },
  });

  const escapar = (valor: string) =>
    /[";\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
  const linhas = ["linha;motivo;conteudo_original"];
  for (const rejeitada of rejeitadas) {
    linhas.push(
      [
        String(rejeitada.linhaOrigem),
        escapar(rejeitada.mensagemErro ?? ""),
        escapar(JSON.stringify(rejeitada.dadosOriginais)),
      ].join(";"),
    );
  }

  return new NextResponse(linhas.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quarentena-${importacao.nomeArquivo.replace(/[^\w.-]+/g, "_")}.csv"`,
    },
  });
}
