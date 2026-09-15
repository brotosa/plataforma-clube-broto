"use client";

import { useActionState, useState } from "react";
import { ErrosDoFormulario, MensagemDeSucesso } from "../aliados/formularios";
import { acaoExigirNovaSenhaDeTodos, type EstadoUsuarios } from "../usuarios/acoes";

/**
 * "Exigir nova senha de todos" — o ato que dá início ao ciclo do vencimento
 * sobre uma base que já existia.
 *
 * **Por que mora aqui e não só na tela de Usuários.** O vencimento de senha
 * nasce sem alcançar ninguém: `senhaAlteradaEm` é nula para quem já estava na
 * base, e nulo significa "nunca vence". Ligar o parâmetro e ir embora deixa a
 * política acesa e sem efeito — e quem liga o parâmetro está exatamente aqui,
 * olhando para o campo. Pôr o remédio ao lado do sintoma é o que evita a
 * descoberta tardia de que 90 dias nunca começaram a contar.
 *
 * **Confirmação em dois passos, e não é cerimônia.** A ação alcança todo mundo
 * de uma vez, inclusive quem clica, e não tem desfazer: a marca só sai quando
 * cada pessoa troca a senha. Um clique único ao lado de campos de digitação
 * seria fácil demais de disparar sem querer.
 */
export function ExigirTrocaDeTodos() {
  const [estado, despachar, pendente] = useActionState<EstadoUsuarios, FormData>(
    acaoExigirNovaSenhaDeTodos,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <h3 className="h-el" style={{ margin: "0 0 4px", fontSize: "1rem" }}>
        Exigir nova senha de todos
      </h3>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "74ch" }}>
        Todos os usuários <strong>ativos</strong> passam a ser conduzidos à troca de senha no
        próximo acesso — <strong>inclusive você</strong>. A senha atual de cada um continua valendo
        até a troca, então nada precisa ser transmitido a ninguém. Usuários inativos ficam de fora:
        eles não acessam a plataforma, e quem for reativado já recebe credencial provisória.
      </p>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "74ch" }}>
        É assim que a <strong>validade da senha</strong> passa a valer para quem já estava na base:
        sem uma primeira troca, o prazo não começa a contar para ninguém.
      </p>

      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />

      {confirmando ? (
        <form action={despachar} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Aplicando…" : "Confirmar — exigir de todos"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(true)}>
          Exigir nova senha de todos
        </button>
      )}
    </div>
  );
}
