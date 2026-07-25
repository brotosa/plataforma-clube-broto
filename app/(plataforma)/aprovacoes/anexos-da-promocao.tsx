import Link from "next/link";
import type { RecomendacaoAvaliacao, StatusDossie } from "@prisma/client";
import { ROTULOS_RECOMENDACAO } from "@/dominio/avaliacao/regras";
import { type SubtotalDimensao, subtotaisDoJson } from "@/dominio/avaliacao/score";
import { MARCA_REQUER_REVISAO, ROTULOS_ORIGEM_DOSSIE } from "@/dominio/dossie/regras";

/**
 * RN20 — o caso completo na fila de aprovação: a avaliação vigente e o
 * dossiê que viajaram anexados ao pedido. O aprovador decide vendo o
 * score explicado por dimensão e o estado de revisão do dossiê, sem sair
 * da T6 (os links levam à T10 e à T11 para o detalhe).
 *
 * Os dois anexos podem faltar, e a tela diz isso em vez de sumir com a
 * seção: promoção não exige avaliação nem dossiê, mas o aprovador precisa
 * saber que decidiu sem eles.
 */

export interface AvaliacaoAnexada {
  id: string;
  versao: number;
  total: number | null;
  recomendacao: RecomendacaoAvaliacao | null;
  fechadaEm: Date | null;
  avaliadorNome: string;
  subtotais: unknown;
  quantidadeNotas: number;
}

export interface DossieAnexado {
  id: string;
  status: StatusDossie;
  origem: keyof typeof ROTULOS_ORIGEM_DOSSIE;
  revisado: boolean;
  revisorNome: string | null;
  revisadoEm: Date | null;
  criadoEm: Date;
}

function data(valor: Date | null): string {
  return valor ? new Intl.DateTimeFormat("pt-BR").format(valor) : "—";
}

export function AnexosDaPromocao({
  empresaId,
  avaliacao,
  dossie,
}: {
  empresaId: string;
  avaliacao: AvaliacaoAnexada | null;
  dossie: DossieAnexado | null;
}) {
  const subtotais: SubtotalDimensao[] = avaliacao ? subtotaisDoJson(avaliacao.subtotais) : [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          border: "1px solid var(--borda)",
          borderRadius: "var(--r-md)",
          padding: "12px 14px",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>Avaliação de scout anexada</b>
          {avaliacao ? (
            <>
              <span className="pill pill-info">versão {avaliacao.versao}</span>
              <span className="num" style={{ font: "var(--font-body-label-bold)" }}>
                score {avaliacao.total ?? "—"}
              </span>
              {avaliacao.recomendacao ? (
                <span className="cap">
                  recomendação: {ROTULOS_RECOMENDACAO[avaliacao.recomendacao]}
                </span>
              ) : null}
            </>
          ) : (
            <span className="pill pill-pendente">sem avaliação fechada</span>
          )}
        </div>

        {avaliacao ? (
          <>
            <div className="cap" style={{ marginTop: 4 }}>
              fechada em {data(avaliacao.fechadaEm)} por {avaliacao.avaliadorNome} ·{" "}
              {avaliacao.quantidadeNotas} indicador(es) pontuado(s)
            </div>
            {subtotais.length > 0 ? (
              <div style={{ display: "grid", gap: 6, marginTop: 10, maxWidth: 520 }}>
                {subtotais.map((subtotal) => (
                  <div
                    key={subtotal.dimensao}
                    style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
                  >
                    <span className="cap" style={{ width: 190 }}>
                      {subtotal.dimensao}
                    </span>
                    <span
                      className="dim-bar"
                      style={{ flex: 1, minWidth: 90 }}
                      role="img"
                      aria-label={`${subtotal.dimensao}: subtotal ${subtotal.subtotal} de 100`}
                    >
                      <i style={{ width: `${Math.min(subtotal.subtotal, 100)}%` }} />
                    </span>
                    <span className="num cap">{subtotal.subtotal}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="cap" style={{ marginTop: 8 }}>
              <Link href={`/mercado/${empresaId}/avaliacao`}>ver a avaliação completa (T10)</Link>
            </div>
          </>
        ) : (
          <p className="cap" style={{ margin: "6px 0 0", maxWidth: "60ch" }}>
            O pedido chegou sem avaliação fechada — não há score para explicar a decisão. A
            avaliação pode ser feita na T10 antes de aprovar.
          </p>
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--borda)",
          borderRadius: "var(--r-md)",
          padding: "12px 14px",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14 }}>Dossiê de due diligence anexado</b>
          {dossie ? (
            dossie.revisado ? (
              <span className="pill pill-ok">
                <i />
                revisado por {dossie.revisorNome ?? "—"} · {data(dossie.revisadoEm)}
              </span>
            ) : (
              <span className="pill pill-warn">
                <i />
                requer revisão
              </span>
            )
          ) : (
            <span className="pill pill-pendente">sem dossiê</span>
          )}
        </div>

        {dossie ? (
          <>
            <div className="cap" style={{ marginTop: 4 }}>
              {ROTULOS_ORIGEM_DOSSIE[dossie.origem]} · gerado em {data(dossie.criadoEm)}
            </div>
            {!dossie.revisado ? (
              <p className="cap" style={{ margin: "6px 0 0", maxWidth: "60ch" }}>
                <b>{MARCA_REQUER_REVISAO}.</b> Nenhum analista marcou este dossiê como revisado —
                trate o conteúdo como evidência não conferida.
              </p>
            ) : null}
            <div className="cap" style={{ marginTop: 8 }}>
              <Link href={`/mercado/${empresaId}/dossie`}>ver o dossiê completo (T11)</Link>
            </div>
          </>
        ) : (
          <p className="cap" style={{ margin: "6px 0 0", maxWidth: "60ch" }}>
            O pedido chegou sem dossiê. A due diligence pública pode ser gerada ou inserida
            manualmente na T11 antes de aprovar.
          </p>
        )}
      </div>
    </div>
  );
}
