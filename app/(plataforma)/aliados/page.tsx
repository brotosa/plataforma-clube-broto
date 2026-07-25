import type { Metadata } from "next";
import Link from "next/link";
import type { EstagioEmpresa } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  contadoresAliados,
  listarAliados,
} from "@/infra/consultas/aliados";
import { BarraCompletude, PillEstagio, iniciaisDoNome } from "./componentes";

export const metadata: Metadata = {
  title: "Aliados",
};

const ESTAGIOS_VALIDOS: ReadonlyArray<EstagioEmpresa> = [
  "EM_NEGOCIACAO",
  "ALIADA_ATIVA",
  "SUSPENSA",
  "ENCERRADA",
];

/** T1 — Lista de aliados (ficha §5). */
export default async function PaginaAliados({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const busca = typeof parametros.busca === "string" ? parametros.busca : "";
  const categoriaId = typeof parametros.categoria === "string" ? parametros.categoria : "";
  const estagio =
    typeof parametros.estagio === "string" &&
    ESTAGIOS_VALIDOS.includes(parametros.estagio as EstagioEmpresa)
      ? (parametros.estagio as EstagioEmpresa)
      : undefined;
  const semOfertaAtiva = parametros.semOferta === "1";
  const pagina = Number(parametros.pagina ?? "1") || 1;
  const temFiltros = Boolean(busca || categoriaId || estagio || semOfertaAtiva);

  const [contadores, resultado, categorias, totalGeral] = await Promise.all([
    contadoresAliados(),
    listarAliados({ busca, categoriaId: categoriaId || undefined, estagio, semOfertaAtiva, pagina }),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.empresa.count(),
  ]);

  const inicio = resultado.total === 0 ? 0 : (resultado.pagina - 1) * resultado.tamanhoPagina + 1;
  const fim = Math.min(resultado.total, resultado.pagina * resultado.tamanhoPagina);
  const totalPaginas = Math.max(1, Math.ceil(resultado.total / resultado.tamanhoPagina));

  const parametrosBase = new URLSearchParams();
  if (busca) parametrosBase.set("busca", busca);
  if (categoriaId) parametrosBase.set("categoria", categoriaId);
  if (estagio) parametrosBase.set("estagio", estagio);
  if (semOfertaAtiva) parametrosBase.set("semOferta", "1");
  const urlComPagina = (novaPagina: number) => {
    const query = new URLSearchParams(parametrosBase);
    if (novaPagina > 1) query.set("pagina", String(novaPagina));
    const texto = query.toString();
    return texto ? `/aliados?${texto}` : "/aliados";
  };
  const urlAlternarSemOferta = () => {
    const query = new URLSearchParams(parametrosBase);
    if (semOfertaAtiva) {
      query.delete("semOferta");
    } else {
      query.set("semOferta", "1");
    }
    const texto = query.toString();
    return texto ? `/aliados?${texto}` : "/aliados";
  };

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="h-page">Aliados</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Cadastro-mestre da rede: quem são os aliados, o que oferecem e em que condições
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/aliados/novo" className="btn btn-azul" style={{ textDecoration: "none" }}>
          + Novo aliado
        </Link>
      </div>

      <div className="contadores" style={{ marginBottom: 18 }}>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Total de aliados
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {contadores.totalAtivos}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            em estágio Aliada ativa
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Com oferta ativa
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {contadores.comOfertaAtiva}
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Sem oferta ativa
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {contadores.semOfertaAtiva}
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Completude média
          </div>
          {contadores.completudeMedia === null ? (
            <>
              <div className="kpi-n" style={{ marginTop: 6, color: "var(--paragrafo-aaa)" }}>
                —
              </div>
              <div style={{ marginTop: 4 }}>
                <span className="selo">sem aliados ativos</span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <span
                className={contadores.completudeMedia < 50 ? "compl baixa" : "compl"}
                style={{ flex: 1 }}
              >
                <span className="trk" style={{ flex: 1, width: "auto" }}>
                  <span
                    className="fill"
                    style={{ width: `${contadores.completudeMedia}%`, display: "block" }}
                  />
                </span>
              </span>
              <span className="kpi-n num" style={{ fontSize: 22 }}>
                {contadores.completudeMedia}%
              </span>
            </div>
          )}
        </div>
      </div>

      <form
        method="GET"
        action="/aliados"
        style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}
      >
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="Buscar aliado…"
          aria-label="Buscar aliado"
          name="busca"
          defaultValue={busca}
        />
        <select
          className="select"
          style={{ width: 200 }}
          aria-label="Filtrar por categoria"
          name="categoria"
          defaultValue={categoriaId}
        >
          <option value="">Categoria</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: 170 }}
          aria-label="Filtrar por estágio"
          name="estagio"
          defaultValue={estagio ?? ""}
        >
          <option value="">Estágio</option>
          <option value="EM_NEGOCIACAO">Em negociação</option>
          <option value="ALIADA_ATIVA">Aliado ativo</option>
          <option value="SUSPENSA">Suspenso</option>
          <option value="ENCERRADA">Encerrado</option>
        </select>
        {semOfertaAtiva ? <input type="hidden" name="semOferta" value="1" /> : null}
        <button type="submit" className="btn btn-ghost btn-sm">
          Filtrar
        </button>
        <Link
          href={urlAlternarSemOferta()}
          className={semOfertaAtiva ? "chip on" : "chip"}
          style={{ textDecoration: "none" }}
        >
          Sem oferta ativa
          {semOfertaAtiva ? <span className="sr-oculto"> (filtro ativo — remover)</span> : null}
        </Link>
        <div style={{ flex: 1 }} />
        <span className="cap num">
          {inicio}–{fim} de {resultado.total}
        </span>
      </form>

      {resultado.total === 0 && !temFiltros ? (
        <div className="card">
          <div className="vazio">
            <div className="ic">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6" />
                <path d="M22 11h-6" />
              </svg>
            </div>
            <h2 className="h-el">Nenhum aliado cadastrado ainda</h2>
            <p className="cap" style={{ maxWidth: "44ch", margin: 0 }}>
              A rede nasce com a carga inicial das planilhas de Sellers e Ofertas.
              Importe-a ou comece cadastrando o primeiro aliado.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Link href="/carga-inicial" className="btn btn-azul" style={{ textDecoration: "none" }}>
                Importar carga inicial
              </Link>
              <Link href="/aliados/novo" className="btn btn-ghost" style={{ textDecoration: "none" }}>
                + Novo aliado
              </Link>
            </div>
          </div>
        </div>
      ) : resultado.total === 0 ? (
        <div className="card">
          <div className="vazio">
            <div className="ic">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
                <path d="M8 11h6" />
              </svg>
            </div>
            <h2 className="h-el">Nenhum aliado corresponde aos filtros</h2>
            <p className="cap" style={{ margin: 0 }}>
              Tente remover um dos filtros aplicados ou buscar por outro termo.
            </p>
            <Link href="/aliados" className="btn btn-ghost" style={{ marginTop: 8, textDecoration: "none" }}>
              Limpar filtros
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Aliado</th>
                  <th>Categorias</th>
                  <th>Estágio</th>
                  <th style={{ textAlign: "right" }}>Soluções</th>
                  <th style={{ textAlign: "right" }}>Ofertas ativas</th>
                  <th style={{ textAlign: "right" }}>Vouchers 90d</th>
                  <th>Completude</th>
                  <th style={{ width: 36 }}>
                    <span className="sr-oculto">Abrir ficha</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((linha) => (
                  <tr key={linha.id} className="click">
                    <td>
                      <Link
                        href={`/aliados/${linha.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          color: "inherit",
                          textDecoration: "none",
                        }}
                      >
                        <span className="logo-ini">{iniciaisDoNome(linha.nomeFantasia)}</span>
                        <span style={{ fontWeight: 600 }}>{linha.nomeFantasia}</span>
                        {linha.emJanelaNaoRenovacao ? (
                          <span className="pill pill-warn">
                            <i aria-hidden="true" />
                            janela contratual
                          </span>
                        ) : null}
                      </Link>
                    </td>
                    <td data-label="Categorias">
                      {linha.categorias.length === 0 ? (
                        <span className="pill pill-warn">
                          <i aria-hidden="true" />
                          obrigatório · não preenchido
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                          {linha.categorias.map((nome) => (
                            <span key={nome} className="tag-cat">
                              {nome}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td data-label="Estágio">
                      <PillEstagio estagio={linha.estagio} />
                    </td>
                    <td data-label="Soluções" className="num" style={{ textAlign: "right" }}>
                      {linha.quantidadeSolucoes}
                    </td>
                    <td data-label="Ofertas ativas" className="num" style={{ textAlign: "right" }}>
                      {linha.quantidadeOfertasAtivas}
                    </td>
                    <td
                      data-label="Vouchers 90d"
                      className="num"
                      style={{ textAlign: "right", color: "var(--paragrafo-aaa)" }}
                    >
                      —
                    </td>
                    <td data-label="Completude">
                      <BarraCompletude percentual={linha.completude} />
                    </td>
                    <td className="chev" style={{ color: "var(--paragrafo-aaa)" }}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span className="cap">
              Vouchers e telemetria ficam disponíveis após a primeira importação (F4) — valores
              ausentes aparecem como “—”, nunca estimados.
              {totalGeral > contadores.totalAtivos
                ? " A lista inclui empresas pré-aliança (em negociação)."
                : ""}
            </span>
            <span style={{ display: "flex", gap: 6 }}>
              {resultado.pagina > 1 ? (
                <Link href={urlComPagina(resultado.pagina - 1)} className="btn btn-ghost btn-sm" aria-label="Página anterior" style={{ textDecoration: "none" }}>
                  ‹
                </Link>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled aria-label="Página anterior">
                  ‹
                </button>
              )}
              {resultado.pagina < totalPaginas ? (
                <Link href={urlComPagina(resultado.pagina + 1)} className="btn btn-ghost btn-sm" aria-label="Próxima página" style={{ textDecoration: "none" }}>
                  ›
                </Link>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled aria-label="Próxima página">
                  ›
                </button>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
