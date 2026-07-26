"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acaoEncerrarCampanha, acaoGerarNovaVersaoDoKit } from "../../acoes";

/**
 * Ações do painel (T25): nova versão do kit (RN45) e encerramento com o
 * AVISO PRÉVIO da RN40 — a lista das ofertas que serão pausadas aparece
 * antes da confirmação, nunca depois.
 */
export function AcoesDoPainel({
  campanhaId,
  estado,
  podeOperar,
  avisoEncerramento,
  pausadas,
}: {
  campanhaId: string;
  estado: string;
  podeOperar: boolean;
  avisoEncerramento: string;
  pausadas: ReadonlyArray<string>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  if (!podeOperar) {
    return null;
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const resposta = await acaoGerarNovaVersaoDoKit({ campanhaId });
              if (resposta.ok) {
                setErros([]);
                router.refresh();
              } else {
                setErros(resposta.erros);
              }
            })
          }
        >
          Gerar nova versão
        </button>
        {estado === "ATIVA" ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmando(true)}
          >
            Encerrar campanha
          </button>
        ) : null}
      </div>
      {erros.length > 0 ? (
        <div className="aviso-inline" style={{ marginTop: 12 }} role="alert">
          <span>{erros.join(" ")}</span>
        </div>
      ) : null}

      {confirmando ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-transparency-black-on-light-30)",
            zIndex: 110,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") setConfirmando(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Encerrar campanha"
            className="card"
            style={{ width: "min(520px, 100%)", padding: "22px 24px" }}
          >
            <h2 className="h-el" style={{ marginBottom: 6 }}>
              Encerrar campanha?
            </h2>
            <div
              className="aviso-inline"
              style={{
                background: "var(--alerta-claro)",
                borderColor: "var(--alerta)",
                margin: "0 0 14px",
              }}
            >
              <span>{avisoEncerramento}</span>
            </div>
            {pausadas.length > 0 ? (
              <ul style={{ margin: "0 0 14px 18px" }}>
                {pausadas.map((titulo) => (
                  <li key={titulo} style={{ fontSize: 14 }}>
                    {titulo}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="cap" style={{ margin: "0 0 14px" }}>
              A reversão é manual, oferta a oferta, pela tela de ofertas.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-ghost"
                autoFocus
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-azul"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const resposta = await acaoEncerrarCampanha({ campanhaId });
                    setConfirmando(false);
                    if (resposta.ok) {
                      setErros([]);
                      router.refresh();
                    } else {
                      setErros(resposta.erros);
                    }
                  })
                }
              >
                Encerrar campanha
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
