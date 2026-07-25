"use client";

import { useActionState, useId } from "react";
import type { EstadoFormulario } from "../aliados/acoes";
import { ErrosDoFormulario, MensagemDeSucesso } from "../aliados/formularios";
import { acaoDecidirSolicitacao } from "./acoes";

/**
 * T6 — decisão sobre a solicitação: aprovar ou devolver (comentário
 * obrigatório na devolução, RN06). Dois botões no mesmo formulário.
 */
export function FormularioDecisao({ solicitacaoId }: { solicitacaoId: string }) {
  const [estado, despachar, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoDecidirSolicitacao,
    {},
  );
  const idComentario = useId();

  return (
    <form action={despachar} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      <input type="hidden" name="solicitacaoId" value={solicitacaoId} />
      <div className="field">
        <label htmlFor={idComentario}>Comentário (obrigatório na devolução)</label>
        <textarea id={idComentario} className="textarea" name="comentario" rows={2} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="submit"
          name="decisao"
          value="APROVADA"
          className="btn btn-azul btn-sm"
          disabled={pendente}
        >
          Aprovar
        </button>
        <button
          type="submit"
          name="decisao"
          value="DEVOLVIDA"
          className="btn btn-ghost btn-sm"
          disabled={pendente}
        >
          Devolver com comentário
        </button>
      </div>
    </form>
  );
}
