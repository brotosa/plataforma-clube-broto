"use client";

import { useActionState, useState } from "react";
import { ErrosDoFormulario } from "../aliados/formularios";
import { acaoPublicarTodasElegiveis, type EstadoPublicacaoEmMassa } from "./acoes";

/**
 * "Publicar todas elegíveis" (T4) — coloca no ar, de uma vez, todas as
 * ofertas em rascunho ou pausada.
 *
 * Confirma em dois passos (é mutação em massa) e, ao terminar, mostra o
 * resumo: quantas foram publicadas, quantas entraram na fila de aprovação
 * (RN06) e quais ficaram de fora com a causa nomeada (RN02/RN09/RN11) —
 * nunca em silêncio. Reusa o mesmo caso de uso da publicação individual,
 * então cada oferta passa pelas mesmas validações.
 */
export function PublicarTodasElegiveis({ candidatas }: { candidatas: number }) {
  const [confirmando, definirConfirmando] = useState(false);
  const [estado, acao, pendente] = useActionState<EstadoPublicacaoEmMassa, FormData>(
    acaoPublicarTodasElegiveis,
    {},
  );

  const resumo = estado.resumo;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {!confirmando ? (
        <button
          type="button"
          className="btn btn-azul"
          disabled={candidatas === 0}
          onClick={() => definirConfirmando(true)}
          title={
            candidatas === 0 ? "Nenhuma oferta em rascunho ou pausada para publicar" : undefined
          }
        >
          Publicar todas elegíveis{candidatas > 0 ? ` (${candidatas})` : ""}
        </button>
      ) : (
        <form action={acao} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="cap" style={{ maxWidth: "28ch", textAlign: "right" }}>
            Publicar as {candidatas} ofertas em rascunho/pausada? As inelegíveis ficam de fora com o
            motivo.
          </span>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Publicando…" : "Confirmar"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => definirConfirmando(false)}
            disabled={pendente}
          >
            Cancelar
          </button>
        </form>
      )}

      <ErrosDoFormulario erros={estado.erros} />

      {resumo ? (
        <div
          className="card"
          style={{ padding: "14px 16px", maxWidth: 460, textAlign: "left", width: "100%" }}
        >
          <strong style={{ fontSize: 14 }}>Publicação em massa concluída</strong>
          <ul className="cap" style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 2 }}>
            <li>{resumo.publicadas} publicada(s) direto</li>
            {resumo.solicitadas > 0 ? (
              <li>{resumo.solicitadas} enviada(s) para a fila de aprovação (RN06)</li>
            ) : null}
            <li>{resumo.inelegiveis.length} inelegível(is)</li>
          </ul>
          {resumo.inelegiveis.length > 0 ? (
            <details style={{ marginTop: 8 }}>
              <summary className="cap" style={{ cursor: "pointer" }}>
                Ver as inelegíveis e o motivo
              </summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
                {resumo.inelegiveis.map((item) => (
                  <li key={item.id} style={{ fontSize: 13 }}>
                    <span>{item.titulo}</span>
                    <div className="cap">{item.motivos.join(" ")}</div>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
