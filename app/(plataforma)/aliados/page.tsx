import type { Metadata } from "next";
import { prisma } from "@/infra/prisma/cliente";

export const metadata: Metadata = {
  title: "Aliados",
};

/**
 * T1 — Lista de aliados. Na F1 a tela exibe o layout base com os números
 * reais da base (vazia até a carga inicial da F3); a tabela, filtros e
 * alertas chegam na F2/F3.
 */
export default async function PaginaAliados() {
  const totalAliados = await prisma.empresa.count({
    where: { estagio: "ALIADA_ATIVA" },
  });

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="h-page">Aliados</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Cadastro-mestre da rede: quem são os aliados, o que oferecem e em que condições
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-azul"
          disabled
          title="Cadastro de aliados disponível na F2 (domínio)"
        >
          + Novo aliado
        </button>
      </div>

      <div className="contadores" style={{ marginBottom: 18 }}>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Total de aliados
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {totalAliados}
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Com oferta ativa
          </div>
          <div className="kpi-n" style={{ marginTop: 6, color: "var(--paragrafo-aaa)" }}>
            —
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="selo">pendente de carga</span>
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Sem oferta ativa
          </div>
          <div className="kpi-n" style={{ marginTop: 6, color: "var(--paragrafo-aaa)" }}>
            —
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="selo">pendente de carga</span>
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Completude média
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M12.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0" />
            </svg>
          </span>
          <h2 className="h-el">Nenhum aliado cadastrado</h2>
          <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
            A base é povoada pela carga inicial das planilhas reais (F3) e pelo cadastro
            manual (F2). A lista com busca, filtros e alertas de janela contratual chega
            com essas fases.
          </p>
        </div>
      </div>
    </div>
  );
}
