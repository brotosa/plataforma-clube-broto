/** Estado de carregamento da T9 — skeletons no padrão DSeed (.skel). */
export default function CarregandoRadar() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }} aria-busy="true">
      <span className="skel" style={{ width: 260, height: 14, display: "inline-block", marginBottom: 14 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <span className="skel" style={{ width: 220, height: 28 }} />
        <span className="skel" style={{ width: 320, height: 14 }} />
      </div>
      <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 18 }}>
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {[0, 1, 2, 3, 4].map((indice) => (
            <span key={indice} className="skel" style={{ width: "100%", height: 40 }} />
          ))}
        </div>
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="skel" style={{ width: "60%", height: 20 }} />
          <span className="skel" style={{ width: "100%", height: 140 }} />
        </div>
      </div>
    </div>
  );
}
