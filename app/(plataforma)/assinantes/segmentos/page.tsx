import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { listarSegmentosComContagem } from "@/infra/consultas/assinantes";
import { AcoesSegmento } from "./acoes-segmento";

/**
 * T21 — Segmentos salvos: filtros declarativos nomeados com contagem
 * recalculada a cada consulta (RN33). Nota institucional: segmentos
 * alimentam os públicos de campanha (Onda 4) — na ativação, o público é
 * congelado em snapshot auditável (padrão RN34).
 */
export default async function PaginaSegmentos() {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const segmentos = await listarSegmentosComContagem();
  const podeGerir = podeExecutar(sessao.user.papel, "GERIR_SEGMENTOS");

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/assinantes">Assinantes</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Segmentos salvos</b>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Segmentos salvos</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Filtros declarativos nomeados · contagem recalculada a cada consulta
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Link className="btn btn-azul" href="/assinantes">
          + Novo segmento na carteira
        </Link>
      </div>

      <div className="aviso-inline">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ flex: "none" }}
        >
          <path d="M12 8v4l3 3" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        <span>
          Segmentos alimentam os públicos de campanha — na ativação, o público é
          congelado em snapshot auditável.
        </span>
      </div>

      {segmentos.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="vazio">
            <h2 className="h-el">Nenhum segmento salvo ainda</h2>
            <p className="cap" style={{ maxWidth: "46ch", margin: 0 }}>
              Monte um filtro na carteira e salve — ele passa a valer como público
              reutilizável.
            </p>
            <Link className="btn btn-azul" style={{ marginTop: 8 }} href="/assinantes">
              Ir para a carteira
            </Link>
          </div>
        </div>
      ) : (
        <div className="pm-grid" style={{ marginTop: 16 }}>
          {segmentos.map((segmento) => (
            <div className="pm-card" key={segmento.id}>
              <div className="pm-secao">Assinantes</div>
              <h2 className="h-el" style={{ fontSize: 16, marginTop: 6 }}>
                {segmento.nome}
              </h2>
              <p className="cap" style={{ margin: "8px 0 0" }}>
                {segmento.resumo}
              </p>
              <div
                style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}
              >
                {segmento.contagem.status === "OK" ? (
                  <>
                    <span className="kpi-n num" style={{ fontSize: 26 }}>
                      {segmento.contagem.total.toLocaleString("pt-BR")}
                    </span>
                    <span className="cap">assinantes hoje</span>
                  </>
                ) : (
                  <>
                    <span className="kpi-n" style={{ fontSize: 26, color: "var(--paragrafo-aaa)" }}>
                      —
                    </span>
                    <span className="cap">{segmento.contagem.motivo}</span>
                  </>
                )}
              </div>
              <div className="cap" style={{ marginTop: 6 }}>
                criado por {segmento.autor} ·{" "}
                {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
                  segmento.criadoEm,
                )}
              </div>
              {podeGerir ? (
                <AcoesSegmento
                  segmentoId={segmento.id}
                  nomeAtual={segmento.nome}
                  regras={segmento.regras}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
