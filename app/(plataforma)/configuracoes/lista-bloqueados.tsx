"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acaoDesbloquearLogin } from "./acoes";

/** Uma conta bloqueada, na forma serializada que chega do servidor. */
export interface ItemBloqueado {
  id: string;
  nome: string;
  email: string;
  rotuloPapel: string;
  minutosRestantes: number;
}

/**
 * Lista das contas bloqueadas com o botão de desbloquear (Configurações). É o
 * "lugar para desbloquear": o Administrador libera uma conta antes de o tempo
 * correr. Vazia quando ninguém está bloqueado — estado explícito, não tabela
 * em branco.
 */
export function ListaBloqueados({ itens }: { itens: ItemBloqueado[] }) {
  const roteador = useRouter();
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function desbloquear(id: string) {
    setOcupadoId(id);
    setErro(null);
    const resultado = await acaoDesbloquearLogin(id);
    setOcupadoId(null);
    if (resultado.ok) {
      roteador.refresh();
    } else {
      setErro(resultado.erros?.join(" ") ?? "Não foi possível desbloquear.");
    }
  }

  if (itens.length === 0) {
    return (
      <p className="cap" style={{ margin: 0 }}>
        Nenhuma conta bloqueada no momento.
      </p>
    );
  }

  return (
    <div className="card" style={{ padding: 0, maxWidth: 760, overflow: "hidden" }}>
      {erro ? (
        <p className="cap" role="alert" style={{ color: "var(--erro-texto-aaa)", padding: "12px 16px 0" }}>
          {erro}
        </p>
      ) : null}
      <table className="tbl tbl-resp" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th scope="col">Usuário</th>
            <th scope="col">Papel</th>
            <th scope="col">Libera em</th>
            <th scope="col" style={{ textAlign: "right" }}>
              Ação
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id}>
              <td data-label="Usuário">
                <div style={{ font: "var(--font-body-label-bold)" }}>{item.nome}</div>
                <div className="cap">{item.email}</div>
              </td>
              <td data-label="Papel">{item.rotuloPapel}</td>
              <td data-label="Libera em">
                {item.minutosRestantes} min
              </td>
              <td data-label="Ação" style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={ocupadoId === item.id}
                  onClick={() => void desbloquear(item.id)}
                >
                  {ocupadoId === item.id ? "Desbloqueando…" : "Desbloquear"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
