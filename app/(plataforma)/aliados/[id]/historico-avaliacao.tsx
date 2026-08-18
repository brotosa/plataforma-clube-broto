"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RecomendacaoAvaliacao } from "@prisma/client";
import { ROTULOS_RECOMENDACAO } from "@/dominio/avaliacao/regras";
import type { SubtotalDimensao } from "@/dominio/avaliacao/score";
import { BarrasPorDimensao } from "../../mercado/[empresaId]/avaliacao/cartoes-avaliacao";

/** Classe do selo por recomendação (mesma leitura de cor do funil). */
const CLASSE_RECOMENDACAO: Record<RecomendacaoAvaliacao, string> = {
  AVANCAR: "pill pill-ok",
  MONITORAR: "pill pill-warn",
  DESCARTAR: "pill pill-erro",
};

/**
 * Modelo C (F9) — gaveta de histórico da aba Scouting.
 *
 * A avaliação vigente aparece inteira na tela (cartão da T10 reaproveitado);
 * aqui ficam as ações e o histórico "guardado fechado": um botão abre uma
 * gaveta lateral com **todas as versões, incluindo a atual** (a pedido, para
 * facilitar a comparação), cada uma expansível com o detalhe por dimensão.
 *
 * Nada aqui edita: cada versão é imutável (RN18). Reavaliar apenas abre a
 * T10, que cria uma nova versão pré-preenchida — a anterior fica intacta. O
 * desenho da barra vem de `BarrasPorDimensao`, a mesma fonte da T10.
 */

export interface VersaoDoHistorico {
  id: string;
  versao: number;
  total: number | null;
  fechadaEm: Date | string | null;
  avaliadorNome: string;
  recomendacao: RecomendacaoAvaliacao | null;
  subtotais: SubtotalDimensao[];
}

function formatarData(valor: Date | string | null): string {
  return valor ? new Date(valor).toLocaleDateString("pt-BR") : "—";
}

export function AcoesEHistoricoAvaliacao({
  empresaId,
  versoes,
  podeReavaliar,
}: {
  empresaId: string;
  /** Todas as versões fechadas, da mais recente para a mais antiga. */
  versoes: VersaoDoHistorico[];
  /** Gestor/Analista Scout em estágio avaliável (RN18/RN21). */
  podeReavaliar: boolean;
}) {
  const [aberta, definirAberta] = useState(false);
  const gavetaRef = useRef<HTMLDivElement | null>(null);
  const gatilhoRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!aberta) return;
    const aoTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") definirAberta(false);
    };
    document.addEventListener("keydown", aoTecla);
    // Move o foco para a gaveta ao abrir (acessibilidade).
    gavetaRef.current?.focus();
    return () => document.removeEventListener("keydown", aoTecla);
  }, [aberta]);

  function fechar() {
    definirAberta(false);
    gatilhoRef.current?.focus();
  }

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {podeReavaliar ? (
          <Link
            href={`/mercado/${empresaId}/avaliacao`}
            className="btn btn-azul btn-sm"
            style={{ textDecoration: "none" }}
          >
            Reavaliar (nova versão)
          </Link>
        ) : null}
        <button
          type="button"
          ref={gatilhoRef}
          className="btn btn-ghost btn-sm"
          aria-haspopup="dialog"
          aria-expanded={aberta}
          onClick={() => definirAberta(true)}
        >
          Ver histórico ({versoes.length})
        </button>
        {podeReavaliar ? (
          <span className="cap" style={{ fontSize: 12 }}>
            A versão vigente permanece imutável; reavaliar abre uma nova versão (RN18).
          </span>
        ) : null}
      </div>

      {aberta ? (
        <>
          <div
            onClick={fechar}
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--color-transparency-black-on-light-30, rgba(15,17,26,.42))",
              zIndex: 110,
            }}
          />
          <div
            ref={gavetaRef}
            role="dialog"
            aria-modal="true"
            aria-label="Histórico de avaliações de scouting"
            tabIndex={-1}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100%",
              width: "min(600px, 94vw)",
              background: "var(--branco)",
              borderLeft: "1px solid var(--borda)",
              boxShadow: "var(--shadow-lg)",
              zIndex: 111,
              display: "flex",
              flexDirection: "column",
              outline: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "16px 20px",
                borderBottom: "1px solid var(--borda)",
              }}
            >
              <h2 className="h-el" style={{ margin: 0, fontSize: 16 }}>
                Histórico de avaliações
              </h2>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={fechar}
                aria-label="Fechar histórico"
              >
                Fechar
              </button>
            </div>
            <div style={{ overflow: "auto", padding: "14px 20px 28px" }}>
              <p className="cap" style={{ margin: "0 0 12px", fontSize: 12.5 }}>
                Todas as versões, da mais recente para a mais antiga. Cada versão é somente leitura e
                imutável (RN18) — abra para ver o detalhe por dimensão.
              </p>
              {versoes.map((versao, indice) => (
                <details
                  key={versao.id}
                  open={indice === 0}
                  style={{
                    border: "1px solid var(--borda)",
                    borderRadius: "var(--r-sm)",
                    background: "var(--branco)",
                    marginBottom: 10,
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      padding: "11px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "nowrap",
                      fontSize: 13.5,
                      listStyle: "none",
                    }}
                  >
                    <b style={{ whiteSpace: "nowrap" }}>Versão {versao.versao}</b>
                    {indice === 0 ? <span className="pill pill-info">atual</span> : null}
                    <span className="num" style={{ fontWeight: 700 }}>
                      {versao.total ?? "—"}
                    </span>
                    {versao.recomendacao ? (
                      <span className={CLASSE_RECOMENDACAO[versao.recomendacao]}>
                        <i aria-hidden="true" />
                        {ROTULOS_RECOMENDACAO[versao.recomendacao]}
                      </span>
                    ) : null}
                    {/* Meta na mesma linha; se faltar espaço, trunca com … em
                        vez de quebrar a linha e empurrar os selos para baixo. */}
                    <span
                      className="cap"
                      style={{
                        fontSize: 12,
                        minWidth: 0,
                        flex: "1 1 auto",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={`/100 · ${formatarData(versao.fechadaEm)} · ${versao.avaliadorNome}`}
                    >
                      /100 · {formatarData(versao.fechadaEm)} · {versao.avaliadorNome}
                    </span>
                  </summary>
                  <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--borda)" }}>
                    <BarrasPorDimensao subtotais={versao.subtotais} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
