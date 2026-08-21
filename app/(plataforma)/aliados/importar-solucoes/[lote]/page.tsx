import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/infra/prisma/cliente";
import { conferenciaImportacaoSolucoes } from "@/infra/casos-de-uso/importar-solucoes";
import { Conferencia } from "../conferencia";

export const metadata: Metadata = {
  title: "Conferência da importação de soluções",
};

/**
 * Conferência do importador de soluções — em ROTA PRÓPRIA (`[lote]`), não em
 * `?lote=`. O redirect de server action para a mesma rota mudando só a query
 * não navega quando o payload da conferência é grande (o cliente recebe o 303
 * e descarta o RSC; a URL não muda). Troca de rota navega de forma confiável —
 * ver a convenção de navegação no CLAUDE.md.
 */
const cabecalho = (
  <div className="cap" style={{ marginBottom: 14 }}>
    <Link href="/aliados">Aliados &amp; Soluções</Link> /{" "}
    <Link href="/aliados/importar-solucoes">Importar soluções</Link> /{" "}
    <b style={{ color: "var(--preto)" }}>Conferência</b>
  </div>
);

export default async function PaginaConferenciaSolucoes({
  params,
}: {
  params: Promise<{ lote: string }>;
}) {
  const { lote } = await params;
  const conferencia = await conferenciaImportacaoSolucoes(lote);

  if (!conferencia) {
    return (
      <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 720 }}>
        {cabecalho}
        <h1 className="h-page">Lote não encontrado</h1>
        <p className="cap" style={{ marginTop: 8 }}>
          Este lote de importação não existe (ou já foi efetivado).{" "}
          <Link href="/aliados/importar-solucoes">Começar de novo</Link>.
        </p>
      </div>
    );
  }

  const categorias = (
    await prisma.categoria.findMany({
      where: { ativa: true },
      orderBy: { ordem: "asc" },
      select: { nome: true },
    })
  ).map((c) => c.nome);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1100 }}>
      {cabecalho}
      <h1 className="h-page">Conferência da importação</h1>
      <div className="cap" style={{ marginTop: 4, marginBottom: 18, maxWidth: "82ch" }}>
        Revise as linhas antes de gravar. Ações: <b>criar</b> (solução nova) ou{" "}
        <b>enriquecer</b> (solução já existente, casada por CNPJ + nome).
      </div>
      <Conferencia conferencia={conferencia} categorias={categorias} />
    </div>
  );
}
