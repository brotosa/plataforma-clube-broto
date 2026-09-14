"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acaoDesbloquearOrigem } from "./acoes";

export interface ItemOrigem {
  id: string;
  origem: string;
  minutosRestantes: number;
}

/** Origens bloqueadas, com o botão de liberar. Vazia = estado explícito. */
export function ListaOrigens({ itens }: { itens: ItemOrigem[] }) {
  const roteador = useRouter();
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function desbloquear(id: string) {
    setOcupadoId(id);
    setErro(null);
    const resultado = await acaoDesbloquearOrigem(id);
    setOcupadoId(null);
    if (resultado.ok) roteador.refresh();
    else setErro(resultado.erros?.join(" ") ?? "Não foi possível desbloquear.");
  }

  if (itens.length === 0) {
    return (
      <p className="cap" style={{ margin: 0 }}>
        Nenhum endereço bloqueado no momento.
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
            <th scope="col">Endereço</th>
            <th scope="col">Libera em</th>
            <th scope="col" style={{ textAlign: "right" }}>
              Ação
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.id}>
              <td data-label="Endereço" style={{ fontVariantNumeric: "tabular-nums" }}>
                {item.origem}
              </td>
              <td data-label="Libera em">{item.minutosRestantes} min</td>
              <td data-label="Ação" style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={ocupadoId === item.id}
                  onClick={() => void desbloquear(item.id)}
                >
                  {ocupadoId === item.id ? "Liberando…" : "Liberar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
