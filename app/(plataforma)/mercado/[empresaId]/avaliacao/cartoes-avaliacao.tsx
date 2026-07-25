import type { telaAvaliacao } from "@/infra/consultas/avaliacoes";

/**
 * Cartões de leitura da avaliação fechada: score com subtotais por
 * dimensão e histórico de versões. Nasceu na T10 (F7) e é reaproveitado
 * pela aba Scouting da ficha da empresa (T12, F9) — mesma informação,
 * mesma explicação do score, um só lugar para manter.
 */

type Fechadas = NonNullable<Awaited<ReturnType<typeof telaAvaliacao>>>["fechadas"];

export function CartoesDaAvaliacaoFechada({
  ultimaFechada,
  fechadas,
}: {
  ultimaFechada: Fechadas[number];
  fechadas: Fechadas;
}) {
  return (
    <>
      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 8 }}>
          Última avaliação fechada · versão {ultimaFechada.versao}
        </h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="kpi-n num" style={{ fontSize: 44 }}>
            {ultimaFechada.total ?? "—"}
          </span>
          <span className="cap" style={{ fontSize: 14 }}>
            / 100 · ScoutCB
          </span>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14, fontSize: 12.5 }}
        >
          {ultimaFechada.subtotais.map((subtotal) => (
            <div key={subtotal.dimensao} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 200, flex: "none" }}>{subtotal.dimensao}</span>
              <span
                className="dim-bar"
                role="img"
                aria-label={`${subtotal.dimensao}: ${Math.round(subtotal.subtotal)} de 100`}
              >
                <i style={{ width: `${Math.round(subtotal.subtotal)}%` }} />
              </span>
              <span className="num" style={{ width: 64, textAlign: "right" }}>
                {Math.round(subtotal.subtotal)}
              </span>
            </div>
          ))}
        </div>
        <p className="cap" style={{ margin: "12px 0 0" }}>
          Fechada em{" "}
          {ultimaFechada.fechadaEm
            ? new Date(ultimaFechada.fechadaEm).toLocaleDateString("pt-BR")
            : "—"}{" "}
          por {ultimaFechada.avaliadorNome}. Avaliação fechada é imutável (RN18).
        </p>
      </div>
      {fechadas.length > 1 ? (
        <div className="card" style={{ padding: "16px 20px" }}>
          <h2 className="h-el" style={{ marginBottom: 8 }}>
            Histórico de versões
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13.5,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {fechadas.map((versao) => (
              <li key={versao.id}>
                Versão {versao.versao} · <b className="num">{versao.total ?? "—"}</b>/100 ·{" "}
                {versao.fechadaEm ? new Date(versao.fechadaEm).toLocaleDateString("pt-BR") : "—"} ·{" "}
                {versao.avaliadorNome}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
