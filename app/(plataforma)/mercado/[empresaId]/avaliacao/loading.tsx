/** Estado de carregamento da T10 — skeletons no padrão DSeed (.skel). */
export default function CarregandoAvaliacao() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1300 }} aria-busy="true">
      <span className="skel" style={{ width: 300, height: 14, display: "inline-block", marginBottom: 14 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <span className="skel" style={{ width: 340, height: 28 }} />
        <span className="skel" style={{ width: 260, height: 14 }} />
      </div>
      <div
        className="g-resp"
        style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3, 4, 5].map((indice) => (
            <span key={indice} className="skel" style={{ width: "100%", height: 52 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="skel" style={{ width: "100%", height: 220 }} />
          <span className="skel" style={{ width: "100%", height: 140 }} />
        </div>
      </div>
    </div>
  );
}
