import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { telaAvaliacao } from "@/infra/consultas/avaliacoes";
import { FormularioAvaliacao } from "./formulario-avaliacao";

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
      <div className="card" style={{ padding: "20px 22px" }}>
        <h2 className="h-el" style={{ marginBottom: 8 }}>
          Última avaliação fechada · versão {ultimaFechada.versao}
        </h2>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="kpi-n num" style={{ fontSize: 44 }}>
            {ultimaFechada.total ?? "—"}
          </span>
          <span className="cap" style={{ fontSize: 14 }}>
            / 100 · ScoutCB
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14, fontSize: 12.5 }}>
          {ultimaFechada.subtotais.map((subtotal) => (
            <div key={subtotal.dimensao} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 200, flex: "none" }}>{subtotal.dimensao}</span>
              <span className="dim-bar">
                <i style={{ width: `${Math.round(subtotal.subtotal)}%` }} />
              </span>
              <span className="num" style={{ width: 64, textAlign: "right" }}>
                {Math.round(subtotal.subtotal)}
              </span>
            </div>
          ))}
        </div>
        <p className="cap" style={{ margin: "12px 0 0" }}>
          Fechada em{" "}
          {ultimaFechada.fechadaEm
            ? new Date(ultimaFechada.fechadaEm).toLocaleDateString("pt-BR")
            : "—"}{" "}
          por {ultimaFechada.avaliadorNome}. Avaliação fechada é imutável (RN18).
        </p>
      </div>
      {fechadas.length > 1 ? (
        <div className="card" style={{ padding: "16px 20px" }}>
          <h2 className="h-el" style={{ marginBottom: 8 }}>
            Histórico de versões
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: "flex", flexDirection: "column", gap: 4 }}>
            {fechadas.map((versao) => (
              <li key={versao.id}>
                Versão {versao.versao} · <b className="num">{versao.total ?? "—"}</b>/100 ·{" "}
                {versao.fechadaEm ? new Date(versao.fechadaEm).toLocaleDateString("pt-BR") : "—"} ·{" "}
                {versao.avaliadorNome}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
