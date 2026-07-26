import type { Metadata } from "next";
import Link from "next/link";
import {
  DESCRICOES_MODO,
  FONTES_MODO,
  MODOS_GEOGRAFICOS,
  type ModoGeografico,
  ROTULOS_MODO,
  lerOMapa,
  modoValido,
  participacao,
  rankingPorRegiao,
  somaExcedeBase,
} from "@/dominio/geografia/distribuicao";
import { ROTULOS_REGIAO } from "@/dominio/geografia/regioes";
import { distribuicaoGeografica } from "@/infra/consultas/mapa-rede";
import { categoriasParaFiltro, culturasParaFiltro } from "@/infra/consultas/cobertura";
import { PROVENIENCIA_GEOMETRIA } from "@/infra/geografia/projecao";
import { SegmentadoDaSecao, VISOES_DE_ALIADOS } from "@/app/(plataforma)/segmentado-secao";
import { MapaBrasil } from "./mapa-brasil";

export const metadata: Metadata = {
  title: "Distribuição geográfica",
};

const FORMATO = new Intl.NumberFormat("pt-BR");

/**
 * T30 — Distribuição geográfica / Mapa da rede (ficha Onda 7 §3).
 *
 * RN52 é o eixo da tela: o modo ativo está sempre visível, os dois modos
 * nunca se misturam e o volume que o modo não alcança é informado. O mapa é
 * apoio — os mesmos números vivem no ranking por região e na tabela por UF.
 */
export default async function PaginaMapa({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const modo: ModoGeografico = modoValido(parametros.modo) ?? "SEDE";
  const culturaId = typeof parametros.cultura === "string" ? parametros.cultura : "";
  const categoriaId = typeof parametros.categoria === "string" ? parametros.categoria : "";

  const [distribuicao, culturas, categorias] = await Promise.all([
    distribuicaoGeografica(modo, {
      culturaId: culturaId || undefined,
      categoriaId: categoriaId || undefined,
    }),
    culturasParaFiltro(),
    categoriasParaFiltro(),
  ]);

  const ranking = rankingPorRegiao(distribuicao);
  const leituras = lerOMapa(distribuicao);
  const maiorNoRanking = ranking[0]?.aliados ?? 0;

  const culturaNome = culturas.find((cultura) => cultura.id === culturaId)?.nome ?? null;
  const categoriaNome = categorias.find((categoria) => categoria.id === categoriaId)?.nome ?? null;
  const temFiltro = Boolean(culturaId || categoriaId);

  const recorte = [
    culturaNome ? `cultura ${culturaNome}` : null,
    categoriaNome ? `categoria ${categoriaNome}` : null,
  ].filter(Boolean);
  const resumoDoRecorte =
    recorte.length > 0
      ? `Recorte: ${recorte.join(" · ")} — ${FORMATO.format(distribuicao.baseDeAliados)} aliado(s) no mapa`
      : `Rede inteira — ${FORMATO.format(distribuicao.baseDeAliados)} aliado(s) no mapa`;

  const comUrl = (mudanca: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    const atual: Record<string, string | undefined> = {
      modo: modo === "ABRANGENCIA" ? "ABRANGENCIA" : undefined,
      cultura: culturaId || undefined,
      categoria: categoriaId || undefined,
      ...mudanca,
    };
    for (const [chave, valor] of Object.entries(atual)) {
      if (valor) {
        query.set(chave, valor);
      }
    }
    const texto = query.toString();
    return texto ? `/aliados/mapa?${texto}` : "/aliados/mapa";
  };

  const excedeBase = somaExcedeBase(distribuicao);
  const linhasComVolume = distribuicao.linhas.filter((linha) => linha.aliados > 0);

  return (
    <div
      className="tela"
      data-tela="T30 Mapa da rede"
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
          <h1 className="h-page">Distribuição geográfica</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Onde a rede existe no mapa — e onde o Clube ainda não chegou
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentadoDaSecao
          nome="Visões de Aliados &amp; Soluções"
          visoes={VISOES_DE_ALIADOS}
          ativa="MAPA"
        />
        <Link href="/aliados/novo" className="btn btn-azul" style={{ textDecoration: "none" }}>
          + Novo aliado
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {/* RN52 — o alternador é decisão de primeira classe, não filtro
            secundário: por isso abre a barra, com o modo ativo marcado.

            Âncoras, não <Link>: a troca de modo muda apenas a querystring, e
            o <Link> do App Router não confirma essa transição — medido em
            12/12 falhas no `main` já mergeado. O alternador é o coração da
            RN52; ele não pode ser um controle que às vezes não faz nada. */}
        <nav className="seg" aria-label="Leitura geográfica (RN52)">
          {MODOS_GEOGRAFICOS.map((opcao) => (
            <a
              key={opcao}
              href={comUrl({ modo: opcao === "SEDE" ? undefined : opcao })}
              className={modo === opcao ? "on" : ""}
              aria-current={modo === opcao ? "page" : undefined}
            >
              {ROTULOS_MODO[opcao]}
            </a>
          ))}
        </nav>

        <form method="get" action="/aliados/mapa" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {modo === "ABRANGENCIA" ? <input type="hidden" name="modo" value="ABRANGENCIA" /> : null}
          <label className="sr-oculto" htmlFor="mapa-cultura">
            Filtrar por cultura
          </label>
          <select
            id="mapa-cultura"
            name="cultura"
            className="select"
            style={{ width: 190 }}
            defaultValue={culturaId}
          >
            <option value="">Todas as culturas</option>
            {culturas.map((cultura) => (
              <option key={cultura.id} value={cultura.id}>
                {cultura.nome}
              </option>
            ))}
          </select>

          <label className="sr-oculto" htmlFor="mapa-categoria">
            Filtrar por categoria
          </label>
          <select
            id="mapa-categoria"
            name="categoria"
            className="select"
            style={{ width: 240 }}
            defaultValue={categoriaId}
          >
            <option value="">Todas as categorias</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>

          <button type="submit" className="btn btn-ghost btn-sm">
            Aplicar
          </button>
        </form>

        {temFiltro ? (
          <a
            href={comUrl({ cultura: undefined, categoria: undefined })}
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: "none" }}
          >
            Limpar filtros
          </a>
        ) : null}

        <div style={{ flex: 1 }} />
        <span className="cap">{resumoDoRecorte}</span>
      </div>

      <div
        className="cob-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,350px)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="card" style={{ padding: "20px 22px", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 4,
              flexWrap: "wrap",
            }}
          >
            <h2 className="h-el">Mapa da rede</h2>
            {/* O modo ativo é sempre visível — exigência literal da RN52. */}
            <span className="pill pill-info">
              <i />
              {ROTULOS_MODO[modo]}
            </span>
            <span className="cap">{DESCRICOES_MODO[modo]}</span>
          </div>
          <p className="cap" style={{ margin: "0 0 12px", maxWidth: "80ch" }}>
            Fonte deste modo: {FONTES_MODO[modo]}.{" "}
            {modo === "SEDE"
              ? "Plotar sede não é plotar cobertura de atendimento — para alcance, use a leitura por abrangência declarada."
              : "Alcance declarado não é presença física — para sede, use a outra leitura."}
          </p>

          {distribuicao.naoDeclarado ? (
            <div className="aviso-inline" style={{ margin: "0 0 12px" }}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ flex: "none" }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <span>
                <b>
                  {FORMATO.format(distribuicao.naoDeclarado.aliados)} aliado(s) fora deste mapa
                </b>{" "}
                — {distribuicao.naoDeclarado.motivo}.
              </span>
            </div>
          ) : null}

          <MapaBrasil linhas={distribuicao.linhas} modo={modo} />

          <div className="mapa-leg">
            <span className="b">
              <em style={{ width: 9, height: 9 }} />
              menor volume
            </span>
            <span className="b">
              <em style={{ width: 17, height: 17 }} />
              maior volume — área proporcional ao número de aliados
            </span>
            <span className="b" style={{ marginLeft: "auto" }}>
              {PROVENIENCIA_GEOMETRIA} · projeção Mercator
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Por região
            </h2>
            <p className="cap" style={{ margin: "0 0 10px" }}>
              Volume e participação sobre {FORMATO.format(distribuicao.baseDeAliados)} aliado(s)
              no mapa. Região sem ninguém permanece na lista.
            </p>
            <div className="rk">
              {ranking.map((linha) => (
                <div key={linha.regiao} className={linha.vazia ? "rk-lin vazio" : "rk-lin"}>
                  <span style={{ font: "var(--font-body-label-bold)", minWidth: 0 }}>
                    {ROTULOS_REGIAO[linha.regiao]}
                  </span>
                  <span className="rk-trk">
                    <span
                      className="rk-fill"
                      style={{
                        width: maiorNoRanking > 0 ? `${(linha.aliados / maiorNoRanking) * 100}%` : "0%",
                      }}
                    />
                  </span>
                  <span className="rk-n">
                    {FORMATO.format(linha.aliados)}
                    <span className="s">
                      {linha.participacao === null
                        ? "sem base"
                        : `${FORMATO.format(linha.participacao)}%`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Leitura do mapa
            </h2>
            <p className="cap" style={{ margin: 0 }}>
              Derivada do recorte ativo — muda quando o modo ou os filtros mudam.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {leituras.map((leitura) => (
                <div
                  key={leitura.marcador + leitura.texto.slice(0, 12)}
                  style={{ display: "flex", gap: 9, alignItems: "flex-start" }}
                >
                  <span
                    className={leitura.alerta ? "acao-n alerta" : "acao-n"}
                    style={{ fontSize: 15, minWidth: 20 }}
                    aria-hidden="true"
                  >
                    {leitura.marcador}
                  </span>
                  <span style={{ fontSize: 13.5, minWidth: 0 }}>{leitura.texto}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, overflowX: "auto" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <h2 className="h-el">Por UF</h2>
          <p className="cap" style={{ margin: "4px 0 12px", maxWidth: "84ch" }}>
            Leitura por {ROTULOS_MODO[modo].toLowerCase()} — {FONTES_MODO[modo]}.
            {excedeBase
              ? " Um aliado que declara atender várias UFs conta em cada uma delas, então a coluna soma mais que a base e as participações somam mais de 100%."
              : ""}
          </p>
        </div>
        <table className="tbl tbl-resp">
          <caption className="sr-oculto">
            Aliados e soluções por unidade federativa, com participação na rede e região, na
            leitura por {ROTULOS_MODO[modo].toLowerCase()}.
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: 90 }}>
                UF
              </th>
              <th scope="col" style={{ textAlign: "right" }}>
                Aliados
              </th>
              <th scope="col" style={{ textAlign: "right" }}>
                Soluções
              </th>
              <th scope="col" style={{ width: "38%" }}>
                Participação na rede
              </th>
              <th scope="col">Região</th>
            </tr>
          </thead>
          <tbody>
            {distribuicao.linhas.map((linha) => {
              const pct = participacao(linha.aliados, distribuicao.baseDeAliados);
              return (
                <tr key={linha.sigla}>
                  <td data-label="UF">
                    <span style={{ fontWeight: 700 }}>{linha.sigla}</span>{" "}
                    <span className="cap">{linha.nome}</span>
                  </td>
                  <td data-label="Aliados" className="num" style={{ textAlign: "right" }}>
                    {linha.aliados === 0 ? (
                      <span style={{ color: "var(--paragrafo-aaa)" }}>—</span>
                    ) : (
                      FORMATO.format(linha.aliados)
                    )}
                  </td>
                  <td data-label="Soluções" className="num" style={{ textAlign: "right" }}>
                    {linha.solucoes === 0 ? (
                      <span style={{ color: "var(--paragrafo-aaa)" }}>—</span>
                    ) : (
                      FORMATO.format(linha.solucoes)
                    )}
                  </td>
                  <td data-label="Participação na rede">
                    {pct === null ? (
                      <span className="indisp">sem base de cálculo</span>
                    ) : (
                      <span className="compl" style={{ width: "100%" }}>
                        <span className="trk" style={{ flex: 1 }}>
                          <span className="fill" style={{ width: `${Math.min(100, pct)}%` }} />
                        </span>
                        <span className="pct">{FORMATO.format(pct)}%</span>
                      </span>
                    )}
                  </td>
                  <td data-label="Região" className="cap">
                    {ROTULOS_REGIAO[linha.regiao]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="cap" style={{ margin: "14px 0 0", maxWidth: "88ch" }}>
        {linhasComVolume.length === 0
          ? "Nenhuma UF com aliado neste recorte: as 27 linhas aparecem zeradas em vez de a tabela sumir, porque a ausência é a informação (RN53). "
          : ""}
        Geometria de {PROVENIENCIA_GEOMETRIA.toLowerCase()}, projetada no servidor por d3-geo e
        versionada no repositório — nenhum contorno é desenhado à mão e nada é buscado de CDN
        quando a tela abre. Edição de categoria, cultura ou cobertura continua no cadastro do
        aliado e no Parametrizador.
      </p>
    </div>
  );
}
