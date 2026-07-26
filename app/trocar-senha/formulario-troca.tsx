"use client";

import { useActionState } from "react";
import { ErrosDoFormulario } from "@/app/(plataforma)/aliados/formularios";
import {
  acaoTrocarPropriaSenha,
  type EstadoUsuarios,
} from "@/app/(plataforma)/usuarios/acoes";

const ESTADO_INICIAL: EstadoUsuarios = {};

/**
 * Troca obrigatória no primeiro acesso (ficha §3). Em caso de sucesso a
 * ação redireciona para a HOME — não há mensagem de sucesso aqui porque o
 * usuário simplesmente entra na plataforma.
 */
export function FormularioTroca() {
  const [estado, despachar, pendente] = useActionState<EstadoUsuarios, FormData>(
    acaoTrocarPropriaSenha,
    ESTADO_INICIAL,
  );

  return (
    <form action={despachar} style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <ErrosDoFormulario erros={estado.erros} />
      <div className="field">
        <label htmlFor="senha-nova">Nova senha</label>
        <input
          id="senha-nova"
          name="nova"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={10}
          required
          aria-describedby="senha-nota"
        />
        <span id="senha-nota" className="cap">
          Ao menos 10 caracteres.
        </span>
      </div>
      <div className="field">
        <label htmlFor="senha-confirmacao">Confirme a nova senha</label>
        <input
          id="senha-confirmacao"
          name="confirmacao"
          type="password"
          className="input"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>
      <div>
        <button type="submit" className="btn btn-azul" disabled={pendente}>
          {pendente ? "Gravando…" : "Definir minha senha"}
        </button>
      </div>
    </form>
  );
}
