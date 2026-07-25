/** Esqueleto da carteira enquanto a consulta paginada responde. */
export default function CarregandoAssinantes() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1280 }}>
      <div className="skel" style={{ height: 34, width: 320, marginBottom: 18 }} />
      <div className="skel" style={{ height: 84, marginBottom: 16 }} />
      <div className="skel" style={{ height: 56, marginBottom: 16 }} />
      <div
        className="card"
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        {[0, 1, 2, 3, 4, 5].map((indice) => (
          <div className="skel" style={{ height: 42 }} key={indice} />
        ))}
      </div>
    </div>
  );
}
