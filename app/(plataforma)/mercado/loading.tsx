/** Estado de carregamento da T8 — skeletons no padrão DSeed (.skel). */
export default function CarregandoMercado() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1400 }} aria-busy="true">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="skel" style={{ width: 200, height: 28 }} />
          <span className="skel" style={{ width: 340, height: 14 }} />
        </div>
        <div style={{ flex: 1 }} />
        <span className="skel" style={{ width: 120, height: 40, borderRadius: "var(--r-pill)" }} />
        <span className="skel" style={{ width: 150, height: 40, borderRadius: "var(--r-pill)" }} />
      </div>
      <div className="contadores" style={{ marginBottom: 14 }}>
        {[0, 1, 2, 3].map((indice) => (
          <div className="c" key={indice} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="skel" style={{ width: 120, height: 12 }} />
            <span className="skel" style={{ width: 56, height: 34 }} />
          </div>
        ))}
      </div>
      <div className="kb-grid">
        {[0, 1, 2, 3, 4].map((lane) => (
          <div className="kb-lane" key={lane}>
            <div className="kb-col-h">
              <span className="skel" style={{ width: 90, height: 16 }} />
            </div>
            <div className="kb-cards">
              {[0, 1].map((carta) => (
                <span key={carta} className="skel" style={{ width: "100%", height: 96 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
