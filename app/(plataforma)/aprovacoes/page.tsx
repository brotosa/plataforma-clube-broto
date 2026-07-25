import type { Metadata } from "next";
import { prisma } from "@/infra/prisma/cliente";

export const metadata: Metadata = {
  title: "Aprovações",
};

/**
 * T6 — Fila de aprovação. Na F1 a tela exibe o layout base com o estado
 * real do motor (regras semeadas pela RN06 e fila vazia); dossiês,
 * aprovar/devolver (T6) e configuração de regras (T7) chegam na F2.
 */
export default async function PaginaAprovacoes() {
  const [pendentes, regras] = await Promise.all([
    prisma.aprovacaoSolicitacao.count({ where: { estado: "SOLICITADA" } }),
    prisma.aprovacaoRegra.findMany({ orderBy: { tipoEntidade: "asc" } }),
  ]);

  const rotuloRegra: Record<string, string> = {
    PROMOCAO_ALIADA_ATIVA: "Promoção a Aliada ativa",
    PUBLICACAO_OFERTA: "Publicação de Oferta",
  };

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="h-page">Aprovações</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Fila de pendências do motor de aprovação e regras por tipo de entidade
          </div>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <div className="contadores" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 18 }}>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Pendências na fila
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {pendentes}
          </div>
        </div>
        {regras.map((regra) => (
          <div className="c" key={regra.id}>
            <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
              {rotuloRegra[regra.tipoEntidade] ?? regra.tipoEntidade}
            </div>
            <div style={{ marginTop: 10 }}>
              <span className={regra.exigida ? "pill pill-ok" : "pill pill-neutra"}>
                <i aria-hidden="true" />
                {regra.exigida ? "Aprovação exigida" : "Aprovação desligada"}
              </span>
            </div>
            <div className="cap" style={{ marginTop: 6 }}>
              Reconfigurável em T7 (F2), sem código
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="vazio">
          <span className="ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.1V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" />
            </svg>
          </span>
          <h2 className="h-el">Nenhuma pendência de aprovação</h2>
          <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
            Solicitações de promoção a Aliada ativa entram aqui quando o fluxo de
            cadastro (F2) estiver no ar. A regra nasce ligada para Aliado e desligada
            para Oferta (RN06).
          </p>
        </div>
      </div>
    </div>
  );
}
