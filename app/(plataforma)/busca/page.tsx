import type { Metadata } from "next";
import Link from "next/link";
import type { StatusOferta } from "@prisma/client";
import { buscaGlobal } from "@/infra/consultas/busca-global";
import { PillEstagio } from "../aliados/componentes";

export const metadata: Metadata = {
  title: "Busca",
};

const ROTULO_STATUS_OFERTA: Record<StatusOferta, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
  EXPIRADA: "Expirada",
};

const LIMITE_POR_GRUPO = 25;

/**
 * Resultados da busca global do cabeçalho. Uma tela só, agrupada por tipo,
 * cada linha levando ao lugar de agir. O próprio formulário de refino é um
 * GET nativo para esta rota — funciona sem JavaScript.
 */
export default async function PaginaBusca({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const termo = typeof q === "string" ? q : "";
  const resultado = await buscaGlobal(termo);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1040 }}>
      <h1 className="h-page" style={{ marginBottom: 14 }}>
        Busca
      </h1>

      <form
        role="search"
        method="get"
        style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}
      >
        <label className="sr-oculto" htmlFor="q-busca">
          Termo de busca
        </label>
        <input
          id="q-busca"
          name="q"
          type="search"
          defaultValue={termo}
          className="input"
          style={{ flex: 1, minWidth: 220, maxWidth: 480 }}
          placeholder="Buscar aliados, soluções e ofertas…"
          aria-label="Termo de busca"
        />
        <button type="submit" className="btn btn-azul">
          Buscar
        </button>
      </form>

      {termo === "" ? (
        <p className="cap" style={{ maxWidth: "60ch" }}>
          Digite um termo para buscar por <b>aliados</b> (nome, razão social ou CNPJ),{" "}
          <b>soluções</b> e <b>ofertas</b> em toda a base.
        </p>
      ) : resultado.total === 0 ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Nada encontrado</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              Nenhum aliado, solução ou oferta corresponde a “{termo}”. Confira a grafia ou tente
              um termo mais curto.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <p className="cap">
            {resultado.total} resultado{resultado.total > 1 ? "s" : ""} para “{termo}”
          </p>

          <GrupoResultado titulo="Aliados" quantidade={resultado.aliados.length}>
            {resultado.aliados.map((aliado) => (
              <Link key={aliado.id} href={`/aliados/${aliado.id}`} className="busca-lin">
                <span className="busca-nome">{aliado.nome}</span>
                <PillEstagio estagio={aliado.estagio} />
              </Link>
            ))}
          </GrupoResultado>

          <GrupoResultado titulo="Soluções" quantidade={resultado.solucoes.length}>
            {resultado.solucoes.map((solucao) => (
              <Link
                key={solucao.id}
                href={`/aliados/${solucao.empresaId}/solucoes/${solucao.id}`}
                className="busca-lin"
              >
                <span className="busca-nome">{solucao.nome}</span>
                <span className="cap">{solucao.empresaNome}</span>
              </Link>
            ))}
          </GrupoResultado>

          <GrupoResultado titulo="Ofertas" quantidade={resultado.ofertas.length}>
            {resultado.ofertas.map((oferta) => (
              <Link key={oferta.id} href={`/ofertas/${oferta.id}`} className="busca-lin">
                <span className="busca-nome">{oferta.titulo}</span>
                <span className="cap" style={{ minWidth: 0, flex: 1 }}>
                  {oferta.solucaoNome} · {oferta.empresaNome}
                </span>
                <span className={oferta.status === "PUBLICADA" ? "pill pill-ok" : "pill pill-neutra"}>
                  <i aria-hidden="true" />
                  {ROTULO_STATUS_OFERTA[oferta.status]}
                </span>
              </Link>
            ))}
          </GrupoResultado>
        </div>
      )}
    </div>
  );
}

/** Um grupo (Aliados/Soluções/Ofertas). Some quando vazio; avisa quando trunca. */
function GrupoResultado({
  titulo,
  quantidade,
  children,
}: {
  titulo: string;
  quantidade: number;
  children: React.ReactNode;
}) {
  if (quantidade === 0) {
    return null;
  }
  return (
    <section className="card" style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h2 className="h-el">{titulo}</h2>
        <span className="cap">{quantidade}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
      {quantidade === LIMITE_POR_GRUPO ? (
        <p className="cap" style={{ margin: "8px 0 0" }}>
          Mostrando os primeiros {LIMITE_POR_GRUPO} — refine o termo para estreitar.
        </p>
      ) : null}
    </section>
  );
}
