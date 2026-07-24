/** Estado de carregamento da T6 — skeletons no padrão DSeed (.skel). */
export default function CarregandoAprovacoes() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }} aria-busy="true">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="skel" style={{ width: 200, height: 28 }} />
          <span className="skel" style={{ width: 340, height: 14 }} />
        </div>
      </div>
      <div className="contadores" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        {[0, 1, 2].map((indice) => (
          <div className="c" key={indice} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="skel" style={{ width: 140, height: 12 }} />
            <span className="skel" style={{ width: 110, height: 24, borderRadius: "var(--r-pill)" }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2].map((indice) => (
          <span key={indice} className="skel" style={{ width: "100%", height: 40 }} />
        ))}
      </div>
    </div>
  );
}
