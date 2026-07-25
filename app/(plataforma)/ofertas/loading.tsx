/** Estado de carregamento da T4 — skeletons no padrão DSeed (.skel). */
export default function CarregandoOfertas() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }} aria-busy="true">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="skel" style={{ width: 160, height: 28 }} />
          <span className="skel" style={{ width: 320, height: 14 }} />
        </div>
        <div style={{ flex: 1 }} />
        <span className="skel" style={{ width: 140, height: 40, borderRadius: "var(--r-pill)" }} />
      </div>
      <div className="contadores" style={{ marginBottom: 18 }}>
        {[0, 1, 2, 3].map((indice) => (
          <div className="c" key={indice} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="skel" style={{ width: 120, height: 12 }} />
            <span className="skel" style={{ width: 64, height: 34 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2, 3, 4].map((indice) => (
          <span key={indice} className="skel" style={{ width: "100%", height: 40 }} />
        ))}
      </div>
    </div>
  );
}
