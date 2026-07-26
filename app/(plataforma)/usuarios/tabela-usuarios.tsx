"use client";

import { useActionState, useState } from "react";
import type { Papel } from "@prisma/client";
import { ROTULOS_PAPEL } from "@/dominio/autorizacao/papeis";
import { MENSAGEM_ULTIMO_ADMINISTRADOR } from "@/dominio/usuarios/regras";
import type { LinhaUsuario } from "@/infra/consultas/usuarios";
import { ErrosDoFormulario, MensagemDeSucesso } from "../aliados/formularios";
import {
  acaoAtualizarUsuario,
  acaoCriarUsuario,
  acaoInativarUsuario,
  acaoReativarUsuario,
  acaoRedefinirCredencial,
  type EstadoUsuarios,
} from "./acoes";

/**
 * T27 — Usuários, fiel ao protótipo v8.1 FINAL: tabela responsiva com
 * papel, situação e ações por linha; formulário de criação e edição; e o
 * aviso de somente leitura para quem não é Administrador.
 *
 * A RN46 aparece duas vezes de propósito. Aqui, desabilitando "Inativar" no
 * último administrador ativo com o motivo no `title` — recusar depois do
 * clique é pior experiência do que dizer antes. E no serviço, que recusa de
 * todo jeito: a UI é conveniência, não é a garantia.
 */

const PAPEIS: ReadonlyArray<Papel> = [
  "GESTOR",
  "ANALISTA",
  "ANALISTA_SCOUT",
  "COMERCIAL",
  "APROVADOR",
  "LEITURA",
  "ADMINISTRADOR_PLATAFORMA",
];

const ESTADO_INICIAL: EstadoUsuarios = {};

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return (
    ((partes[0]?.charAt(0) ?? "") + (partes[partes.length - 1]?.charAt(0) ?? "")).toUpperCase() ||
    "?"
  );
}

function Mensagens({ estado }: { estado: EstadoUsuarios }) {
  return (
    <>
      <ErrosDoFormulario erros={estado.erros} />
      <MensagemDeSucesso mensagem={estado.sucesso} />
      {estado.senhaProvisoria ? (
        <div className="aviso-inline" role="status">
          <span>
            Senha provisória: <b className="num">{estado.senhaProvisoria}</b> — ela não será
            exibida de novo.
          </span>
        </div>
      ) : null}
    </>
  );
}

function FormularioUsuario({
  usuario,
  aoFechar,
}: {
  usuario: LinhaUsuario | null;
  aoFechar: () => void;
}) {
  const [estado, despachar, pendente] = useActionState<EstadoUsuarios, FormData>(
    usuario ? acaoAtualizarUsuario : acaoCriarUsuario,
    ESTADO_INICIAL,
  );

  return (
    <div className="card" style={{ padding: "20px 22px", marginBottom: 18 }}>
      <h2 className="h-el" style={{ marginBottom: 12 }}>
        {usuario ? `Editar ${usuario.nome}` : "Novo usuário"}
      </h2>
      <Mensagens estado={estado} />
      <form action={despachar} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {usuario ? <input type="hidden" name="usuarioId" value={usuario.id} /> : null}
        <div className="field">
          <label htmlFor="usuario-nome">Nome completo</label>
          <input
            id="usuario-nome"
            name="nome"
            className="input"
            defaultValue={usuario?.nome ?? ""}
            required
          />
        </div>
        {usuario ? (
          <div className="field">
            <label htmlFor="usuario-email">E-mail corporativo</label>
            <input
              id="usuario-email"
              className="input"
              value={usuario.email}
              readOnly
              aria-describedby="usuario-email-nota"
            />
            <span id="usuario-email-nota" className="cap">
              O e-mail é a identidade do usuário na trilha de auditoria e não muda.
            </span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="usuario-email">E-mail corporativo</label>
            <input id="usuario-email" name="email" type="email" className="input" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="usuario-papel">Papel</label>
          <select
            id="usuario-papel"
            name="papel"
            className="select"
            defaultValue={usuario?.papel ?? "LEITURA"}
          >
            {PAPEIS.map((papel) => (
              <option key={papel} value={papel}>
                {ROTULOS_PAPEL[papel]}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Gravando…" : usuario ? "Gravar alterações" : "Criar usuário"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Fechar
          </button>
        </div>
        {usuario ? null : (
          <p className="cap" style={{ margin: 0 }}>
            O usuário nasce com credencial provisória e troca obrigatória no primeiro acesso
            (ficha §3). SSO Entra ID segue como decisão futura.
          </p>
        )}
      </form>
    </div>
  );
}

function AcoesDaLinha({ usuario }: { usuario: LinhaUsuario }) {
  const [estado, despachar, pendente] = useActionState<EstadoUsuarios, FormData>(
    usuario.ativo ? acaoInativarUsuario : acaoReativarUsuario,
    ESTADO_INICIAL,
  );
  const [credencial, despacharCredencial, pendenteCredencial] = useActionState<
    EstadoUsuarios,
    FormData
  >(acaoRedefinirCredencial, ESTADO_INICIAL);

  const bloqueado = usuario.ativo && usuario.unicoAdministradorAtivo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <form action={despachar}>
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <button
            type="submit"
            className="btn btn-ghost btn-sm"
            disabled={bloqueado || pendente}
            title={bloqueado ? MENSAGEM_ULTIMO_ADMINISTRADOR : undefined}
          >
            {usuario.ativo ? "Inativar" : "Reativar"}
          </button>
        </form>
        <form action={despacharCredencial}>
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <button type="submit" className="btn btn-ghost btn-sm" disabled={pendenteCredencial}>
            Redefinir credencial
          </button>
        </form>
      </div>
      {bloqueado ? (
        <span className="cap">{MENSAGEM_ULTIMO_ADMINISTRADOR}</span>
      ) : null}
      <Mensagens estado={estado} />
      <Mensagens estado={credencial} />
    </div>
  );
}

export function TabelaUsuarios({
  usuarios,
  podeGerir,
}: {
  usuarios: ReadonlyArray<LinhaUsuario>;
  podeGerir: boolean;
}) {
  const [emEdicao, setEmEdicao] = useState<LinhaUsuario | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Usuários</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Usuários internos da plataforma · credencial própria com troca no primeiro acesso ·
            SSO é decisão futura
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeGerir ? (
          <button
            type="button"
            className="btn btn-azul"
            onClick={() => {
              setEmEdicao(null);
              setCriando((aberto) => !aberto);
            }}
          >
            + Novo usuário
          </button>
        ) : null}
      </div>

      {podeGerir ? null : (
        <div className="aviso-inline">
          <span>
            Visualização — criar, editar e inativar usuários é exclusivo do Administrador da
            Plataforma (RN46).
          </span>
        </div>
      )}

      {podeGerir && (criando || emEdicao) ? (
        <FormularioUsuario
          key={emEdicao?.id ?? "novo"}
          usuario={emEdicao}
          aoFechar={() => {
            setCriando(false);
            setEmEdicao(null);
          }}
        />
      ) : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl tbl-resp">
          <caption className="sr-oculto">Usuários internos da plataforma</caption>
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Usuário</th>
              <th>E-mail</th>
              <th>Papel</th>
              <th>Situação</th>
              <th style={{ width: 260 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td data-label="Usuário">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="logo-ini" style={{ width: 30, height: 30, fontSize: 11 }}>
                      {iniciaisDe(usuario.nome)}
                    </span>
                    <span style={{ fontWeight: 600 }}>{usuario.nome}</span>
                  </div>
                </td>
                <td data-label="E-mail" className="num">
                  {usuario.email}
                </td>
                <td data-label="Papel">
                  <span
                    className={
                      usuario.papel === "ADMINISTRADOR_PLATAFORMA"
                        ? "pill pill-info"
                        : "pill pill-neutra"
                    }
                  >
                    {ROTULOS_PAPEL[usuario.papel]}
                  </span>
                </td>
                <td data-label="Situação">
                  <span className={usuario.ativo ? "pill pill-ok" : "pill pill-neutra"}>
                    <i aria-hidden="true" />
                    {usuario.ativo ? "Ativo" : "Inativo"}
                  </span>
                  {usuario.trocaSenhaObrigatoria ? (
                    <span className="cap" style={{ display: "block", marginTop: 2 }}>
                      credencial provisória
                    </span>
                  ) : null}
                </td>
                <td data-label="Ações">
                  {podeGerir ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setCriando(false);
                            setEmEdicao(usuario);
                          }}
                        >
                          Editar
                        </button>
                      </div>
                      <AcoesDaLinha usuario={usuario} />
                    </div>
                  ) : (
                    <span className="cap">somente leitura</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap" style={{ margin: "14px 0 0" }}>
        Não existe exclusão de usuário: quem tem histórico é inativado, e a autoria dele nos
        registros e na trilha de auditoria permanece (RN47).
      </p>
    </>
  );
}
