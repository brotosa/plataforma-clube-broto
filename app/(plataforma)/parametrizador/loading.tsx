/** Estado de carregamento da T15 — skeletons no padrão DSeed (.skel). */
export default function CarregandoParametrizador() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }} aria-busy="true">
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <span className="skel" style={{ width: 220, height: 28 }} />
        <span className="skel" style={{ width: 420, height: 14 }} />
      </div>
      <div className="pm-grid" style={{ marginBottom: 26 }}>
        {[0, 1, 2, 3, 4].map((indice) => (
          <div key={indice} className="card" style={{ padding: "18px 20px" }}>
            <span className="skel" style={{ display: "block", height: 18, width: "60%" }} />
            <span
              className="skel"
              style={{ display: "block", height: 34, width: "38%", marginTop: 12 }}
            />
            <span
              className="skel"
              style={{ display: "block", height: 12, width: "80%", marginTop: 14 }}
            />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2, 3].map((indice) => (
          <span key={indice} className="skel" style={{ width: "100%", height: 40 }} />
        ))}
      </div>
    </div>
  );
}
