"use client";

import { Fragment, useState } from "react";
import { acaoRemoverContato } from "../acoes";
import { FormularioContato } from "./paineis";

const ROTULO_PAPEL: Record<string, string> = {
  COMERCIAL: "Comercial",
  TECNICO: "Técnico",
  FINANCEIRO: "Financeiro",
};

interface ContatoLinha {
  id: string;
  papel: string;
  nome: string;
  cargo: string | null;
  email: string;
  telefone: string | null;
}

/**
 * Tabela de contatos (aba Contatos) com edição inline.
 *
 * Client porque cada linha tem um "Editar" que abre o formulário logo abaixo
 * dela, com "Cancelar" — sem trocar de rota e sem `<summary>`. "Editar" e
 * "Remover" ficam lado a lado na mesma célula, com botões reais (texto
 * centralizado pelo `.btn`).
 */
export function GestaoContatos({
  empresaId,
  contatos,
  podeEditar,
}: {
  empresaId: string;
  contatos: ContatoLinha[];
  podeEditar: boolean;
}) {
  const [editandoId, definirEditandoId] = useState<string | null>(null);
  const colunas = podeEditar ? 6 : 5;

  return (
    <>
      {contatos.length === 0 ? (
        <p className="cap" style={{ margin: "0 0 14px" }}>
          Nenhum contato — mínimo de 1 para promover; o financeiro recebe o ciclo de conciliação de
          comissão.
        </p>
      ) : (
        <table className="tbl" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Papel</th>
              <th>Nome</th>
              <th>Cargo</th>
              <th>E-mail</th>
              <th>Telefone</th>
              {podeEditar ? (
                <th style={{ width: 170 }}>
                  <span className="sr-oculto">Ações</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {contatos.map((contato) => (
              <Fragment key={contato.id}>
                <tr>
                  <td>
                    <span className="pill pill-info">
                      <i aria-hidden="true" />
                      {ROTULO_PAPEL[contato.papel] ?? contato.papel}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{contato.nome}</td>
                  <td className="cap">{contato.cargo ?? "—"}</td>
                  <td className="cap">{contato.email}</td>
                  <td className="cap num">{contato.telefone ?? "—"}</td>
                  {podeEditar ? (
                    <td>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-expanded={editandoId === contato.id}
                          onClick={() =>
                            definirEditandoId(editandoId === contato.id ? null : contato.id)
                          }
                        >
                          Editar
                        </button>
                        <form action={acaoRemoverContato}>
                          <input type="hidden" name="empresaId" value={empresaId} />
                          <input type="hidden" name="contatoId" value={contato.id} />
                          <button type="submit" className="btn btn-ghost btn-sm">
                            Remover
                          </button>
                        </form>
                      </div>
                    </td>
                  ) : null}
                </tr>
                {podeEditar && editandoId === contato.id ? (
                  <tr>
                    <td colSpan={colunas} style={{ background: "var(--off)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "6px 2px" }}>
                        <FormularioContato
                          empresaId={empresaId}
                          contato={{
                            id: contato.id,
                            papel: contato.papel,
                            nome: contato.nome,
                            cargo: contato.cargo ?? "",
                            email: contato.email,
                            telefone: contato.telefone ?? "",
                          }}
                        />
                        <div>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => definirEditandoId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {podeEditar ? (
        <>
          <h3 className="h-el" style={{ fontSize: 15, marginBottom: 10 }}>
            Adicionar contato
          </h3>
          <FormularioContato empresaId={empresaId} />
        </>
      ) : null}
    </>
  );
}
