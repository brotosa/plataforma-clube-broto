import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { ROTULOS_META, ROTULOS_NIVEL } from "@/dominio/campanhas/atribuicao";
import { ROTULOS_ESTADO_CAMPANHA } from "@/dominio/campanhas/regras";
import { previaDoEncerramento } from "@/infra/casos-de-uso/campanhas";
import { painelDaCampanha } from "@/infra/consultas/campanhas";
import { AcoesDoPainel } from "./acoes-painel";

/**
 * T25 — Painel da campanha (protótipo v7.1): metas × realizado com o
 * NÍVEL DE ATRIBUIÇÃO declarado em cada número, desempenho por oferta,
 * linha do tempo, kit para download e histórico de versões.
 */

export const dynamic = "force-dynamic";

function dataBr(data: Date | null): string {
  return data ? data.toISOString().slice(0, 10).split("-").reverse().join("/") : "—";
}

export default async function PaginaPainel({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const { id } = await params;
  const { campanha, realizados, desempenho, linhaDoTempo } = await painelDaCampanha(id);
  if (campanha.estado === "RASCUNHO") {
    redirect(`/campanhas/${id}`);
  }
  const previa = await previaDoEncerramento(id);
  const podeOperar = podeExecutar(sessao.user.papel, "ATIVAR_ENCERRAR_CAMPANHA");
  const kitAtual = campanha.kits[0] ?? null;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/campanhas">Campanhas</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>{campanha.nome}</b>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">{campanha.nome}</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <span className={campanha.estado === "ATIVA" ? "pill pill-ok" : "pill pill-neutra"}>
              <i />
              {ROTULOS_ESTADO_CAMPANHA[campanha.estado]}
            </span>
            <span className="cap num">
              {dataBr(campanha.vigenciaInicio)} → {dataBr(campanha.vigenciaFim)}
            </span>
            <span className="pill pill-neutra">
              público congelado: {(campanha.publicoSnapshot?.contagem ?? 0).toLocaleString("pt-BR")}
            </span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {kitAtual ? (
          <a className="btn btn-ghost" href={`/campanhas/${id}/kit/${kitAtual.id}`}>
            Baixar kit
          </a>
        ) : null}
      </div>

      <div className="aviso-inline" style={{ background: "var(--off)" }}>
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
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>
          Cada número carrega o seu <b>nível de atribuição</b>. &quot;Por oferta&quot; conta
          vouchers e compras das ofertas da campanha dentro da vigência; &quot;por público&quot;
          cruza o snapshot com a telemetria por CPF — os dois nunca se misturam sem rótulo
          (RN43).
        </span>
      </div>

      <div className="pm-grid" style={{ marginBottom: 16 }}>
        {realizados.length === 0 ? (
          <div className="pm-card">
            <div className="pm-secao">Metas</div>
            <p className="cap" style={{ marginTop: 8 }}>
              Nenhuma meta definida — metas são múltiplas e opcionais (ficha §3).
            </p>
          </div>
        ) : (
          realizados.map((meta) => (
            <div className="pm-card" key={meta.tipo}>
              <div className="pm-secao">{ROTULOS_META[meta.tipo]}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                <span
                  className="kpi-n"
                  style={{ color: meta.disponivel ? undefined : "var(--paragrafo-aaa)" }}
                >
                  {meta.disponivel ? meta.valor : "—"}
                </span>
                <span className="cap">de {meta.alvo}</span>
              </div>
              <div className="compl" style={{ marginTop: 10 }}>
                <span className="trk" style={{ flex: 1 }}>
                  <span
                    className="fill"
                    style={{
                      width: meta.disponivel
                        ? `${Math.min(100, Math.round(((meta.valor ?? 0) / meta.alvo) * 100))}%`
                        : "0%",
                    }}
                  />
                </span>
              </div>
              <div style={{ marginTop: 10 }}>
                <span className={meta.disponivel ? "pill pill-neutra" : "pill pill-pendente"}>
                  {meta.nivel ? ROTULOS_NIVEL[meta.nivel] : "sem nível"}
                </span>
              </div>
              <div className="cap" style={{ marginTop: 8 }}>
                {meta.nota}
              </div>
            </div>
          ))
        )}
      </div>

      <div
        className="g-resp"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="card" style={{ overflowX: "auto" }}>
            <div style={{ padding: "18px 20px 0" }}>
              <h2 className="h-el">Desempenho por oferta</h2>
              <p className="cap" style={{ margin: "4px 0 12px" }}>
                Atribuição por oferta — vouchers e compras dentro da vigência.
              </p>
            </div>
            <table className="tbl tbl-resp">
              <caption className="sr-only">
                Desempenho de cada oferta da campanha, com o nível de atribuição
              </caption>
              <thead>
                <tr>
                  <th style={{ width: "34%" }}>Oferta</th>
                  <th>Aliado</th>
                  <th style={{ textAlign: "right" }}>Vouchers emit. → resg.</th>
                  <th style={{ textAlign: "right" }}>Compras</th>
                  <th>Atribuição</th>
                </tr>
              </thead>
              <tbody>
                {desempenho.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="cap">
                      Nenhuma oferta vinculada.
                    </td>
                  </tr>
                ) : (
                  desempenho.map((oferta) => (
                    <tr key={oferta.id}>
                      <td data-label="Oferta">
                        <span style={{ fontWeight: 600 }}>{oferta.titulo}</span>
                      </td>
                      <td data-label="Aliado">{oferta.aliado}</td>
                      <td data-label="Vouchers" className="num" style={{ textAlign: "right" }}>
                        {oferta.emitidos} → {oferta.resgatados}
                      </td>
                      <td data-label="Compras" className="num" style={{ textAlign: "right" }}>
                        {oferta.compras}
                      </td>
                      <td data-label="Atribuição">
                        <span className="pill pill-neutra">por oferta</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 12 }}>
              Linha do tempo
            </h2>
            <div className="tl">
              {linhaDoTempo.map((evento, indice) => (
                <div className="tl-it" key={`${evento.evento}-${indice}`}>
                  <span className="tl-d num">{dataBr(evento.data)}</span>
                  <span>
                    <b>{evento.evento}</b>
                    <div className="cap">{evento.detalhe}</div>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Kit da campanha
            </h2>
            <p className="cap" style={{ margin: "0 0 12px" }}>
              Imutável — ajustes após a ativação geram nova versão com diff auditado (RN45).
            </p>
            {kitAtual ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div className="kit-lin">
                  <span className="cap">versão</span>
                  <span style={{ fontWeight: 600 }}>v{kitAtual.versao}</span>
                </div>
                <div className="kit-lin">
                  <span className="cap">adapter</span>
                  <span style={{ fontWeight: 600 }}>{kitAtual.adapter}</span>
                </div>
                <div className="kit-lin">
                  <span className="cap">hash</span>
                  <span style={{ fontWeight: 600 }} className="num">
                    {kitAtual.hashArquivo.slice(0, 12)}…
                  </span>
                </div>
                <div className="kit-lin">
                  <span className="cap">gerado em</span>
                  <span style={{ fontWeight: 600 }} className="num">
                    {dataBr(kitAtual.criadoEm)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="cap">Sem kit gerado.</p>
            )}
            <AcoesDoPainel
              campanhaId={id}
              estado={campanha.estado}
              podeOperar={podeOperar}
              avisoEncerramento={previa.aviso}
              pausadas={previa.efeito.pausar.map((oferta) => oferta.titulo)}
            />
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 10 }}>
              Histórico de versões
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {campanha.kits.map((kit) => (
                <div
                  key={kit.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}
                >
                  <span>
                    <b>v{kit.versao}</b>{" "}
                    <span className="cap">
                      {kit.diffTexto ? kit.diffTexto.split("\n")[0] : "versão inicial"}
                    </span>
                  </span>
                  <span className="cap num" style={{ whiteSpace: "nowrap" }}>
                    {dataBr(kit.criadoEm)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
