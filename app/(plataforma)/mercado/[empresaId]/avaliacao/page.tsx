import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { telaAvaliacao } from "@/infra/consultas/avaliacoes";
import { FormularioAvaliacao } from "./formulario-avaliacao";
import { CartoesDaAvaliacaoFechada } from "./cartoes-avaliacao";

export const metadata: Metadata = {
  title: "Avaliação de scout",
};

/**
 * T10 — Avaliação (ficha Onda 2 §5): formulário de indicadores 1–5
 * agrupado por dimensão, com evidência por indicador, score ao vivo por
 * dimensão e total, recomendação e comparação com a versão anterior.
 * Layout do protótipo v6.1 (tela "T10 Avaliacao ScoutCB").
 */
export default async function PaginaAvaliacao({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const tela = await telaAvaliacao(empresaId);
  if (!tela) {
    notFound();
  }
  const { empresa, dimensoes, rascunho, fechadas, notasDaUltimaFechada, podeAvaliarAgora } = tela;
  const ultimaFechada = fechadas[0] ?? null;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1300 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/mercado">Mercado &amp; Scout</Link> / {empresa.nomeFantasia} /{" "}
        <b style={{ color: "var(--preto)" }}>Avaliação</b>
        {" · "}
        {/* O dossiê é evidência para a leitura humana: nenhum campo dele
            preenche nota de indicador (RN19). */}
        <Link href={`/mercado/${empresa.id}/dossie`}>Dossiê</Link>
      </div>

      {empresa.reavaliacaoPendente ? (
        <div
          className="card"
          role="status"
          style={{
            padding: "12px 16px",
            marginBottom: 14,
            borderColor: "var(--alerta)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span className="pill age-f">reavaliação anual pendente</span>
          <span style={{ fontSize: 13.5 }}>
            A última avaliação fechada completou 12 meses (RN21) — reavalie com o mesmo
            formulário; a conclusão abre nova versão e reinicia o ciclo.
          </span>
        </div>
      ) : null}

      {podeAvaliarAgora ? (
        <FormularioAvaliacao
          empresa={{ id: empresa.id, nomeFantasia: empresa.nomeFantasia }}
          dimensoes={dimensoes}
          rascunho={rascunho}
          ultimaFechada={ultimaFechada}
          notasDaUltimaFechada={notasDaUltimaFechada}
          fechadas={fechadas}
        />
      ) : ultimaFechada ? (
        <ResumoFechadaSomenteLeitura
          nomeFantasia={empresa.nomeFantasia}
          rotuloEstagio={empresa.rotuloEstagio}
          ultimaFechada={ultimaFechada}
          fechadas={fechadas}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h1 className="h-page">Avaliação — {empresa.nomeFantasia}</h1>
            <div className="cap" style={{ marginTop: 4 }}>
              ScoutCB · nota 1–5 por indicador · empresa em {empresa.rotuloEstagio}
            </div>
          </div>
          <div className="card">
          <div className="vazio">
            <div className="ic">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 11h6M9 15h4" />
                <rect x="5" y="4" width="14" height="17" rx="2" />
                <path d="M9 4v3h6V4" />
              </svg>
            </div>
            <h2 className="h-el">Nenhuma avaliação registrada</h2>
            <p className="cap" style={{ maxWidth: "46ch", margin: 0 }}>
              O score de {empresa.nomeFantasia} aparece aqui quando a avaliação ScoutCB for
              concluída — a IA nunca preenche nota. No estágio {empresa.rotuloEstagio} a
              avaliação não fica aberta: assuma a empresa no funil (RN14) para avaliar.
            </p>
            <Link href="/mercado" className="btn btn-azul" style={{ marginTop: 8, textDecoration: "none" }}>
              Abrir o funil
            </Link>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Estado somente leitura: estágio atual não permite avaliar, mas o
 * histórico fechado permanece consultável (RN18 — versões íntegras).
 */
function ResumoFechadaSomenteLeitura({
  nomeFantasia,
  rotuloEstagio,
  ultimaFechada,
  fechadas,
}: {
  nomeFantasia: string;
  rotuloEstagio: string;
  ultimaFechada: NonNullable<Awaited<ReturnType<typeof telaAvaliacao>>>["fechadas"][number];
  fechadas: NonNullable<Awaited<ReturnType<typeof telaAvaliacao>>>["fechadas"];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <div>
        <h1 className="h-page">Avaliação — {nomeFantasia}</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          ScoutCB · empresa em {rotuloEstagio} — avaliação em leitura; nova versão abre nos
          estágios avaliáveis do funil ou na reavaliação anual (RN21)
        </div>
      </div>
      <CartoesDaAvaliacaoFechada ultimaFechada={ultimaFechada} fechadas={fechadas} />
    </div>
  );
}
