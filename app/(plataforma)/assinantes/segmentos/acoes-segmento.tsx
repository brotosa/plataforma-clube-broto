"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acaoAtualizarSegmento, acaoDuplicarSegmento } from "../acoes";

/** Ações por cartão da T21: editar (na carteira), duplicar, renomear. */
export function AcoesSegmento({
  segmentoId,
  nomeAtual,
  regras,
}: {
  segmentoId: string;
  nomeAtual: string;
  regras: unknown;
}) {
  const roteador = useRouter();
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(nomeAtual);
  const [erros, setErros] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const renomear = async () => {
    setOcupado(true);
    const resultado = await acaoAtualizarSegmento({ segmentoId, nome });
    setOcupado(false);
    if (resultado.ok) {
      setRenomeando(false);
      setErros([]);
      roteador.refresh();
    } else {
      setErros(resultado.erros);
    }
  };

  const duplicar = async () => {
    setOcupado(true);
    const resultado = await acaoDuplicarSegmento(segmentoId);
    setOcupado(false);
    if (resultado.ok) {
      roteador.refresh();
    } else {
      setErros(resultado.erros);
    }
  };

  const consultaEditar = new URLSearchParams({
    regras: JSON.stringify(regras ?? []),
    segmento: segmentoId,
  });

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Link className="btn btn-ghost btn-sm" href={`/assinantes?${consultaEditar}`}>
          Editar
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={ocupado}
          onClick={() => void duplicar()}
        >
          Duplicar
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setNome(nomeAtual);
            setErros([]);
            setRenomeando(true);
          }}
        >
          Renomear
        </button>
      </div>
      {erros.length > 0 ? (
        <p className="cap" role="alert" style={{ color: "var(--erro-texto-aaa)", marginTop: 8 }}>
          {erros.join(" ")}
        </p>
      ) : null}
      {renomeando ? (
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
            if (evento.key === "Escape") setRenomeando(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Renomear segmento"
            className="card"
            style={{ width: "min(460px,100%)", padding: "22px 24px", boxShadow: "var(--shadow-lg)" }}
          >
            <h2 className="h-el" style={{ marginBottom: 12 }}>
              Renomear “{nomeAtual}”
            </h2>
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor={`ren-${segmentoId}`}>Novo nome</label>
              <input
                id={`ren-${segmentoId}`}
                className="input"
                value={nome}
                autoFocus
                onChange={(evento) => setNome(evento.target.value)}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setRenomeando(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-azul"
                disabled={ocupado || !nome.trim()}
                onClick={() => void renomear()}
              >
                Renomear
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
