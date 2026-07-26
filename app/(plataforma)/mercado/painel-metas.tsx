import { ROTULOS_JANELA, ROTULOS_PERIODO } from "@/dominio/metas/periodo";
import { resumoDoAtingimento } from "@/dominio/metas/painel";
import type { MetasDaTela } from "@/infra/consultas/cobertura-metas";

/**
 * T14 — Metas (aba "Metas" da T8 no protótipo v6.1): meta × realizado do
 * período, geral e por categoria. Somente leitura nesta fase — a criação
 * e a edição de metas são do Administrador da Plataforma no Parametrizador
 * (Onda 3, T17, RN28), e a ficha da Onda 3 é errata explícita sobre a
 * matriz da Onda 2 nesse ponto.
 *
 * O valor exibido vem de `metas_periodo`; nada é escrito no código. Sem
 * meta configurada a tela diz isso e mostra apenas o realizado — número
 * que existe independentemente de alguém ter definido a meta.
 */
export function PainelDeMetas({ metas }: { metas: MetasDaTela }) {
  const janela = metas.periodo ? ROTULOS_JANELA[metas.periodo] : "no ano";

  return (
    <div
      className="g-resp"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 980 }}
    >
      <div className="card" style={{ padding: "22px 24px" }}>
        <h2 className="h-el" style={{ marginBottom: 12 }}>
          Novos aliados {janela}
        </h2>

        {metas.geral ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="kpi-n num" style={{ fontSize: 40 }}>
                {metas.geral.realizado}
              </span>
              <span className="cap" style={{ fontSize: 14 }}>
                de {metas.geral.meta} — meta {metas.periodo ? ROTULOS_PERIODO[metas.periodo] : ""}{" "}
                de {metas.rotuloPeriodo}
              </span>
            </div>
            <div
              className="dim-bar"
              style={{ marginTop: 12, height: 10 }}
              role="img"
              aria-label={`${metas.geral.percentualReal}% da meta do período`}
            >
              <i style={{ width: `${metas.geral.percentual}%` }} />
            </div>
            <p className="cap" style={{ margin: "12px 0 0" }}>
              {resumoDoAtingimento(metas.geral)}
            </p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="kpi-n num" style={{ fontSize: 40 }}>
                {metas.realizadoSemMeta ?? 0}
              </span>
              <span className="cap" style={{ fontSize: 14 }}>
                promoções em {metas.rotuloPeriodo}
              </span>
            </div>
            <p className="cap" style={{ margin: "12px 0 0" }}>
              <span className="selo">meta não definida</span> Nenhuma meta vigente para o período.
              A definição é do Administrador da Plataforma, no Parametrizador.
            </p>
          </>
        )}

        <p className="cap" style={{ margin: "12px 0 0" }}>
          Realizado = promoções efetivadas no período (RN22). As aliadas da carga inicial
          nasceram ativas e não contam como promoção.
          {metas.origemDaMeta ? (
            <>
              {" "}
              Origem da meta: {metas.origemDaMeta}.
            </>
          ) : null}
        </p>
      </div>

      <div className="card" style={{ padding: "22px 24px" }}>
        <h2 className="h-el" style={{ marginBottom: 14 }}>
          Por categoria
        </h2>

        {metas.porCategoria.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {metas.porCategoria.map((linha) => (
              <div
                key={linha.categoriaId}
                style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
              >
                <span style={{ width: 180, fontSize: 13.5 }}>{linha.categoriaNome}</span>
                <span
                  className="dim-bar"
                  style={{ flex: 1, minWidth: 120 }}
                  role="img"
                  aria-label={`${linha.categoriaNome}: ${linha.percentualReal}% da meta`}
                >
                  <i style={{ width: `${linha.percentual}%` }} />
                </span>
                <span className="num cap">
                  {linha.realizado} / {linha.meta}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="cap" style={{ maxWidth: "44ch" }}>
            <span className="selo">sem meta por categoria</span> A meta vigente é geral, sem
            abertura por categoria. Quando o Parametrizador registrar metas por categoria, elas
            aparecem aqui com o mesmo cálculo de realizado.
          </div>
        )}
      </div>
    </div>
  );
}
