/** Estado de carregamento da T11 — skeletons no padrão DSeed (.skel). */
export default function CarregandoDossie() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1300 }} aria-busy="true">
      <span
        className="skel"
        style={{ width: 300, height: 14, display: "inline-block", marginBottom: 14 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <span className="skel" style={{ width: 340, height: 28 }} />
        <span className="skel" style={{ width: 260, height: 14 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="skel" style={{ width: "100%", height: 96 }} />
        <span className="skel" style={{ width: "100%", height: 320 }} />
      </div>
    </div>
  );
}
