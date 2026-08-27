"use client";

import { useActionState, useState } from "react";
import { ErrosDoFormulario, MensagemDeSucesso } from "../../aliados/formularios";
import {
  acaoEncerrarVinculo,
  acaoVincularAssinantePorCpf,
  type EstadoFormulario,
} from "../acoes";

/**
 * Vincular assinante a uma vaga do patrocinador **pelo CPF** (T33, aba
 * Base) — o caminho manual, para o operador que tem o CPF em mãos.
 *
 * O CPF é resolvido para o assinante por HMAC no serviço (RN69/RN36): não
 * é gravado nem ecoado de volta, e a recusa nomeia a causa (CPF em branco,
 * inválido, ou sem assinante na base). A data de início é opcional — vazia,
 * o serviço usa hoje.
 */
export function VincularAssinante({ patrocinadorId }: { patrocinadorId: string }) {
  const [aberto, definirAberto] = useState(false);
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoVincularAssinantePorCpf,
    {},
  );

  if (!aberto) {
    return (
      <button type="button" className="btn btn-azul btn-sm" onClick={() => definirAberto(true)}>
        Vincular assinante
      </button>
    );
  }
  return (
    <div className="card" style={{ padding: "16px 18px", minWidth: 300, maxWidth: 420 }}>
      <h2 className="h-el" style={{ marginBottom: 10 }}>
        Vincular assinante
      </h2>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      <form action={acao}>
        <input type="hidden" name="patrocinadorId" value={patrocinadorId} />
        <div className="field">
          <label htmlFor="vc-cpf">CPF do assinante</label>
          <input
            id="vc-cpf"
            className="input"
            name="cpf"
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            aria-describedby="vc-cpf-ajuda"
          />
          <span className="hint" id="vc-cpf-ajuda">
            O assinante já precisa estar na base. O CPF é usado só para encontrá-lo — não é
            gravado nem exibido de volta.
          </span>
        </div>
        <div className="field">
          <label htmlFor="vc-inicio">Início do vínculo</label>
          <input id="vc-inicio" className="input" type="date" name="inicio" />
          <span className="hint">Em branco, vale a partir de hoje.</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Vinculando…" : "Vincular"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => definirAberto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Encerrar o vínculo de uma linha (T33, aba Base). Encerrar **devolve a
 * vaga ao saldo e preserva o histórico** (RN62): a linha não some, ganha
 * data de fim. Confirma em dois passos para não encerrar por engano.
 */
export function EncerrarVinculo({
  patrocinadorId,
  vinculoId,
}: {
  patrocinadorId: string;
  vinculoId: string;
}) {
  const [confirmando, definirConfirmando] = useState(false);
  const [estado, acao, pendente] = useActionState<EstadoFormulario, FormData>(
    acaoEncerrarVinculo,
    {},
  );

  if (!confirmando) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => definirConfirmando(true)}
      >
        Encerrar
      </button>
    );
  }
  return (
    <form action={acao} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
      <input type="hidden" name="patrocinadorId" value={patrocinadorId} />
      <input type="hidden" name="vinculoId" value={vinculoId} />
      <input
        className="input"
        name="motivoFim"
        placeholder="Motivo (opcional)"
        aria-label="Motivo do encerramento"
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" className="btn btn-azul btn-sm" disabled={pendente}>
          {pendente ? "Encerrando…" : "Confirmar"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => definirConfirmando(false)}
        >
          Cancelar
        </button>
      </div>
      <ErrosDoFormulario erros={estado.erros} />
    </form>
  );
}
