/** Esqueleto da lista de campanhas enquanto a consulta responde (T22). */
export default function CarregandoCampanhas() {
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="skel" style={{ height: 34, width: 280, marginBottom: 18 }} />
      <div
        className="card"
        style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        {[0, 1, 2, 3].map((indice) => (
          <div className="skel" style={{ height: 44 }} key={indice} />
        ))}
      </div>
    </div>
  );
}
