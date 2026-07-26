"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acaoCriarCampanha } from "./acoes";

/**
 * "+ Nova campanha" da T22: modal curto (nome e objetivo) que abre a
 * modelagem em rascunho — a campanha só ganha público, conteúdo, peças e
 * metas na T23.
 */
export function NovaCampanha() {
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const dialogo = useRef<HTMLDivElement>(null);

  const enviar = (dados: FormData) => {
    iniciar(async () => {
      const resposta = await acaoCriarCampanha(dados);
      if (resposta.ok) {
        setAberto(false);
        router.push(`/campanhas/${resposta.campanhaId}`);
      } else {
        setErros(resposta.erros);
      }
    });
  };

  return (
    <>
      <button type="button" className="btn btn-azul" onClick={() => setAberto(true)}>
        + Nova campanha
      </button>
      {aberto ? (
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
            if (evento.key === "Escape") setAberto(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nova campanha"
            className="card"
            style={{ width: "min(500px, 100%)", padding: "22px 24px" }}
            ref={dialogo}
          >
            <h2 className="h-el" style={{ marginBottom: 6 }}>
              Nova campanha
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              A campanha nasce em rascunho: público, conteúdo, peças e metas vêm na modelagem.
            </p>
            <form action={enviar}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="campanha-nome">Nome</label>
                <input
                  id="campanha-nome"
                  className="input"
                  name="nome"
                  autoFocus
                  required
                  placeholder="Ex.: Safra 2026 — Centro-Oeste"
                />
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label htmlFor="campanha-objetivo">
                  Objetivo <span className="cap" style={{ fontWeight: 400 }}>· opcional</span>
                </label>
                <textarea id="campanha-objetivo" className="textarea" name="objetivo" rows={2} />
              </div>
              {erros.length > 0 ? (
                <div className="aviso-inline" style={{ margin: "0 0 12px" }} role="alert">
                  <span>{erros.join(" ")}</span>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-azul" disabled={pendente}>
                  {pendente ? "Criando…" : "Criar campanha"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
