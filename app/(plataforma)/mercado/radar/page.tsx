import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/infra/prisma/cliente";
import { ROTULOS_ORIGEM } from "@/dominio/funil/regras";
import { FormularioRadar } from "./formulario-radar";
import { ImportacaoDeLista } from "./importacao";

export const metadata: Metadata = {
  title: "Entrada no radar",
};

/** T9 — Entrada no radar (ficha Onda 2 §5): formulário mínimo + importação. */
export default async function PaginaRadar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const focoNaImportacao = parametros.importar === "1";
  const categorias = await prisma.categoria.findMany({
    where: { ativa: true },
    orderBy: { ordem: "asc" },
  });

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/mercado">Mercado &amp; Scout</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Entrada no radar</b>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="h-page">Entrada no radar</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Inclua uma empresa ou importe uma lista de prospects.
          </div>
        </div>
      </div>

      <div
        className="g-resp"
        style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 18, alignItems: "start" }}
      >
        <FormularioRadar
          categorias={categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome }))}
          origens={Object.entries(ROTULOS_ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo }))}
        />
        <ImportacaoDeLista focoInicial={focoNaImportacao} />
      </div>
    </div>
  );
}
