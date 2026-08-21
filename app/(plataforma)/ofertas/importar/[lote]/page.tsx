import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/infra/prisma/cliente";
import { conferenciaImportacaoOfertas } from "@/infra/casos-de-uso/importar-ofertas";
import { ROTULO_MODALIDADE, ROTULO_NATUREZA } from "@/dominio/importacao-catalogo/ofertas";
import { Conferencia } from "../conferencia";

export const metadata: Metadata = {
  title: "Conferência da importação de ofertas",
};

/**
 * Conferência do importador de ofertas — em ROTA PRÓPRIA (`[lote]`), não em
 * `?lote=`. O redirect de server action para a mesma rota mudando só a query
 * não navega quando o payload da conferência é grande (o cliente recebe o 303
 * e descarta o RSC; a URL não muda). Troca de rota navega de forma confiável —
 * ver a convenção de navegação no CLAUDE.md.
 */
const cabecalho = (
  <div className="cap" style={{ marginBottom: 14 }}>
    <Link href="/ofertas">Ofertas</Link> /{" "}
    <Link href="/ofertas/importar">Importar ofertas</Link> /{" "}
    <b style={{ color: "var(--preto)" }}>Conferência</b>
  </div>
);

export default async function PaginaConferenciaOfertas({
  params,
}: {
  params: Promise<{ lote: string }>;
}) {
  const { lote } = await params;
  const conferencia = await conferenciaImportacaoOfertas(lote);

  if (!conferencia) {
    return (
      <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 720 }}>
        {cabecalho}
        <h1 className="h-page">Lote não encontrado</h1>
        <p className="cap" style={{ marginTop: 8 }}>
          Este lote de importação não existe (ou já foi efetivado).{" "}
          <Link href="/ofertas/importar">Começar de novo</Link>.
        </p>
      </div>
    );
  }

  const [tipos, mecanicas] = await Promise.all([
    prisma.tipoBeneficio.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
    prisma.mecanica.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
  ]);
  const listas = {
    naturezas: Object.values(ROTULO_NATUREZA),
    tipos: tipos.map((t) => t.nome),
    mecanicas: mecanicas.map((m) => m.nome),
    modalidades: Object.values(ROTULO_MODALIDADE),
  };

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1100 }}>
      {cabecalho}
      <h1 className="h-page">Conferência da importação</h1>
      <div className="cap" style={{ marginTop: 4, marginBottom: 18, maxWidth: "82ch" }}>
        Revise as linhas antes de gravar. Ações: <b>criar</b> (rascunho) ou <b>enriquecer</b>{" "}
        (oferta existente, quando o `ID Oferta` vem preenchido).
      </div>
      <Conferencia conferencia={conferencia} listas={listas} />
    </div>
  );
}
