import Link from "next/link";
import { ROTULOS_ESTAGIO_FUNIL } from "@/dominio/funil/regras";
import { ESTAGIOS_DA_MATRIZ, textoDaCelula } from "@/dominio/cobertura/cobertura";
import type { CoberturaDaTela } from "@/infra/consultas/cobertura-metas";

/**
 * T13 — Mapa de cobertura (aba "Cobertura" da T8 no protótipo v6.1):
 * matriz categoria × (aliadas ativas · funil por estágio), gap destacado
 * na linha e clique em qualquer célula abrindo o funil filtrado na
 * categoria.
 *
 * Diferença consciente em relação ao protótipo: lá a coluna "Aliadas
 * ativas" é um travessão fixo e o gap está escrito à mão em duas
 * categorias, porque o desenho é anterior à carga — o próprio rodapé diz
 * que "os gaps marcados são ilustrativos até lá". A carga já aconteceu
 * (F3), então a coluna traz a contagem real e o gap é derivado dela, como
 * a ficha §5 define ("célula vazia = gap de portfólio").
 */
export function MapaDeCobertura({ cobertura }: { cobertura: CoberturaDaTela }) {
  const { linhas, resumo, semCategoria, aliadasSemCategoria } = cobertura;

  if (linhas.length === 0) {
    return (
      <div className="card">
        <div className="vazio">
          <h2 className="h-el">Nenhuma categoria ativa</h2>
          <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
            O mapa de cobertura cruza as categorias da vitrine com o funil. Sem categoria ativa
            na taxonomia, não há matriz para montar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="contadores" style={{ marginBottom: 14 }}>
        <div className="c">
          <div
            className="cap"
            style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}
          >
            Categorias cobertas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {resumo.categoriasCobertas}/{resumo.categorias}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            com ao menos uma aliada ativa
          </div>
        </div>
        <div className="c">
          <div
            className="cap"
            style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}
          >
            Gaps de portfólio
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {resumo.gaps}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            categorias sem aliada ativa
          </div>
        </div>
        <div className="c">
          <div
            className="cap"
            style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}
          >
            Gaps descobertos
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {resumo.gapsDescobertos}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            sem aliada e sem ninguém no funil
          </div>
        </div>
        <div className="c">
          <div
            className="cap"
            style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}
          >
            No funil
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {resumo.empresasNoFunil}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            empresas nas cinco etapas
          </div>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <caption className="sr-oculto">
            Cobertura por categoria: aliadas ativas e empresas no funil por estágio
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ width: "26%" }}>
                Categoria
              </th>
              <th scope="col" style={{ textAlign: "right" }}>
                Aliadas ativas
              </th>
              {ESTAGIOS_DA_MATRIZ.map((estagio) => (
                <th key={estagio} scope="col" style={{ textAlign: "right" }}>
                  {ROTULOS_ESTAGIO_FUNIL[estagio]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <tr
                key={linha.categoriaId}
                style={linha.gap ? { background: "var(--alerta-claro)" } : undefined}
              >
                <th
                  scope="row"
                  style={{
                    // Cabeçalho de LINHA: mantém a semântica para o leitor de
                    // tela, mas não herda o caixa-alta do cabeçalho de coluna.
                    textAlign: "left",
                    textTransform: "none",
                    letterSpacing: "normal",
                    font: "var(--font-body-label-bold)",
                    color: "var(--preto)",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>{linha.categoriaNome}</span>
                    {linha.gap ? (
                      <span className="pill pill-warn">
                        <i />
                        {linha.gapDescoberto ? "gap descoberto" : "gap"}
                      </span>
                    ) : null}
                  </div>
                </th>
                <td className="num" style={{ textAlign: "right" }}>
                  {linha.aliadasAtivas === 0 ? (
                    <span style={{ color: "var(--paragrafo-aaa)" }}>—</span>
                  ) : (
                    <Link
                      href={`/aliados?categoria=${linha.categoriaId}`}
                      aria-label={`Ver aliadas ativas de ${linha.categoriaNome}`}
                    >
                      {linha.aliadasAtivas}
                    </Link>
                  )}
                </td>
                {linha.celulas.map((celula) => (
                  <td key={celula.estagio} style={{ textAlign: "right" }}>
                    {celula.quantidade === 0 ? (
                      <span className="num" style={{ color: "var(--paragrafo-aaa)" }}>
                        —
                      </span>
                    ) : (
                      <Link
                        href={`/mercado?categoria=${linha.categoriaId}`}
                        className="btn btn-ghost btn-sm num"
                        style={{ minWidth: 42, textDecoration: "none" }}
                        aria-label={`Abrir funil filtrado em ${linha.categoriaNome} (${celula.quantidade} em ${ROTULOS_ESTAGIO_FUNIL[celula.estagio]})`}
                      >
                        {textoDaCelula(celula.quantidade)}
                      </Link>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="cap" style={{ margin: "10px 0 0", maxWidth: "80ch" }}>
          Gap de portfólio = categoria sem nenhuma aliada ativa; <b>gap descoberto</b> é o gap que
          também não tem ninguém no funil — é onde o scouting rende mais. Clique em qualquer
          célula do funil para abrir a T8 filtrada na categoria.
          {aliadasSemCategoria > 0 ? (
            <>
              {" "}
              <b>
                {aliadasSemCategoria} aliada(s) ativa(s) ainda sem categoria-alvo
              </b>{" "}
              não entram em nenhuma linha: a carga inicial trouxe os aliados sem classificação, e
              até que ela seja feita um gap aqui pode significar portfólio não classificado, não
              portfólio ausente.
            </>
          ) : null}
          {semCategoria > 0 ? (
            <>
              {" "}
              {semCategoria} empresa(s) do funil ainda não têm categoria-alvo e ficam fora da
              matriz.
            </>
          ) : null}
        </p>
      </div>
    </>
  );
}
