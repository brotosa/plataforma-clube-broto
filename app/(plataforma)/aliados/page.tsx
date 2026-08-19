import type { Metadata } from "next";
import Link from "next/link";
import type { EstagioEmpresa } from "@prisma/client";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import {
  contadoresAliados,
  ESTAGIOS_DA_REDE,
  listarAliados,
  TAMANHO_BLOCO_ROLAGEM,
} from "@/infra/consultas/aliados";
import { ListaDeAliadosComRolagem } from "./lista-rolagem";
import { SegmentadoDaSecao, VISOES_DE_ALIADOS } from "@/app/(plataforma)/segmentado-secao";

export const metadata: Metadata = {
  title: "Aliados",
};

const ESTAGIOS_VALIDOS: ReadonlyArray<EstagioEmpresa> = [
  "EM_NEGOCIACAO",
  "EM_APROVACAO",
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
  // Deep-links dos cartões de pendência do Dashboard (Onda 6/7).
  const completude = parametros.completude === "incompletos" ? "incompletos" : undefined;
  const contrato = parametros.contrato === "janela" ? "janela" : undefined;
  // Sino → "pendências que mencionam você": filtra pela menção ao usuário logado.
  const sessao = await auth();
  const mencaoDeUsuarioId =
    parametros.mencao === "minhas" && sessao?.user?.id ? sessao.user.id : undefined;
  const temFiltros = Boolean(
    busca || categoriaId || estagio || semOfertaAtiva || completude || contrato || mencaoDeUsuarioId,
  );

  const [contadores, resultado, categorias, totalGeral] = await Promise.all([
    contadoresAliados(),
    // RN56 — a T1 lê por rolagem contínua: o servidor entrega o PRIMEIRO
    // bloco (a tela pinta com conteúdo, sem esperar JavaScript) e os
    // seguintes chegam por server action, sempre paginados por baixo.
    listarAliados({
      busca,
      categoriaId: categoriaId || undefined,
      estagio,
      semOfertaAtiva,
      completude,
      contrato,
      mencaoDeUsuarioId,
      pagina: 1,
      tamanho: TAMANHO_BLOCO_ROLAGEM,
    }),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    // Rede (T1): estágios do funil pré-negociação ficam na T8.
    prisma.empresa.count({ where: { estagio: { in: [...ESTAGIOS_DA_REDE] } } }),
  ]);


  const parametrosBase = new URLSearchParams();
  if (busca) parametrosBase.set("busca", busca);
  if (categoriaId) parametrosBase.set("categoria", categoriaId);
  if (estagio) parametrosBase.set("estagio", estagio);
  if (semOfertaAtiva) parametrosBase.set("semOferta", "1");
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
    <div
      className="tela"
      // `data-tela` marca as três leituras da seção (T1/T29/T30): o CSS
      // desliga a animação de entrada entre elas, porque alternar aba não é
      // trocar de tela.
      data-tela="T1 Lista de aliados"
      style={{ padding: "26px 32px 40px", maxWidth: 1240 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Aliados</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Cadastro-mestre da rede: quem são os aliados, o que oferecem e em que condições
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentadoDaSecao
          nome="Visões de Aliados &amp; Soluções"
          visoes={VISOES_DE_ALIADOS}
          ativa="LISTA"
        />
        <Link
          href="/aliados/importar-solucoes"
          className="btn btn-ghost"
          style={{ textDecoration: "none" }}
        >
          Importar soluções
        </Link>
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
          <option value="EM_APROVACAO">Em aprovação</option>
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
        {/* RN56 — sem páginas, o intervalo "1–8 de 46" perdeu o sentido; a
            CONTAGEM TOTAL permanece, que é o que a régua exige preservar.
            Quanto já foi carregado fica no texto de situação da lista. */}
        <span className="cap num">
          {resultado.total} {resultado.total === 1 ? "aliado" : "aliados"}
        </span>
      </form>

      {completude || contrato || mencaoDeUsuarioId ? (
        <div
          className="aviso-inline"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <span>
            Mostrando{" "}
            <b>
              {mencaoDeUsuarioId
                ? "aliados com pendência que menciona você"
                : completude
                  ? "cadastros incompletos (bloqueiam publicação)"
                  : "contratos na janela de não-renovação"}
            </b>{" "}
            — filtro vindo do {mencaoDeUsuarioId ? "sino" : "painel de pendências"}.
          </span>
          {/* Navegação que só limpa a query usa âncora nativa (convenção do
              CLAUDE.md): com <Link>, o Router Cache descartava o payload e o
              filtro não saía. O lint quer <Link> para páginas internas — aqui
              a convenção medida vence a regra, e a exceção fica declarada. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/aliados" className="chip on" style={{ textDecoration: "none" }}>
            Limpar filtro
          </a>
        </div>
      ) : null}

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
          <ListaDeAliadosComRolagem
            blocoInicial={resultado.linhas}
            total={resultado.total}
            filtros={{
              busca: busca || undefined,
              categoriaId: categoriaId || undefined,
              estagio,
              semOfertaAtiva,
              completude,
              contrato,
              mencaoMinhas: Boolean(mencaoDeUsuarioId),
            }}
            tamanhoDoBloco={resultado.tamanhoPagina}
          />
          <p className="cap" style={{ marginTop: 10 }}>
            Vouchers e telemetria ficam disponíveis após a primeira importação (F4) — valores
            ausentes aparecem como “—”, nunca estimados.
            {totalGeral > contadores.totalAtivos
              ? " A lista inclui empresas pré-aliança (em negociação)."
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
