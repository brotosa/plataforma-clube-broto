import type { Metadata } from "next";
import { prisma } from "@/infra/prisma/cliente";

export const metadata: Metadata = {
  title: "Ofertas",
};

/**
 * T4 — Lista transversal de ofertas. Na F1 a tela exibe o layout base com
 * números reais (base vazia até F2/F3); tabela completa com coluna
 * Natureza, filtros, destaques e KPI "vitrine viva" chegam na F2/F4.
 */
export default async function PaginaOfertas() {
  const [totalOfertas, ofertasPublicadas] = await Promise.all([
    prisma.oferta.count(),
    prisma.oferta.count({ where: { status: "PUBLICADA" } }),
  ]);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="h-page">Ofertas</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Visão transversal de todas as ofertas da vitrine, com vigências e telemetria
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-azul"
          disabled
          title="Cadastro de ofertas disponível na F2 (domínio)"
        >
          + Nova oferta
        </button>
      </div>

      <div className="contadores" style={{ marginBottom: 18 }}>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Total de ofertas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {totalOfertas}
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Publicadas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {ofertasPublicadas}
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Vitrine viva (resgate em 90 d)
          </div>
          <div className="kpi-n" style={{ marginTop: 6, color: "var(--paragrafo-aaa)" }}>
            —
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="selo">pendente de telemetria</span>
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Vigências a vencer (15 d)
          </div>
          <div className="kpi-n" style={{ marginTop: 6, color: "var(--paragrafo-aaa)" }}>
            —
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="selo">pendente de carga</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="vazio">
          <span className="ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2H2v10l9.3 9.3a1.5 1.5 0 0 0 2.1 0l7.9-7.9a1.5 1.5 0 0 0 0-2.1zM7 7h.01" />
            </svg>
          </span>
          <h2 className="h-el">Nenhuma oferta cadastrada</h2>
          <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
            As ofertas entram pelo cadastro (F2) e pela carga inicial das planilhas reais
            (F3). A lista transversal com natureza, mecânica, vigência e telemetria chega
            com essas fases.
          </p>
        </div>
      </div>
    </div>
  );
}
