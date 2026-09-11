"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acaoReexecutarExportacao } from "../acoes";

/**
 * Ações por cartão da trilha de exportações (T18 → histórico):
 * - **Baixar**: link direto para a rota que serve o snapshot guardado.
 * - **Reexecutar**: gera um snapshot NOVO com a mesma finalidade (recalculado
 *   sobre a base de agora), atualiza a lista e baixa o arquivo recém-gerado.
 */
export function AcoesExportacao({ exportacaoId }: { exportacaoId: string }) {
  const roteador = useRouter();
  const [erros, setErros] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  /** Baixa um snapshot por id sem sair da página (a rota força attachment). */
  const baixar = (id: string) => {
    const ancora = document.createElement("a");
    ancora.href = `/api/assinantes/exportacoes/${id}`;
    ancora.rel = "noopener";
    document.body.appendChild(ancora);
    ancora.click();
    ancora.remove();
  };

  const reexecutar = async () => {
    setOcupado(true);
    setErros([]);
    const resultado = await acaoReexecutarExportacao(exportacaoId);
    setOcupado(false);
    if (resultado.ok) {
      // A lista se atualiza (o novo snapshot entra no topo) e o arquivo
      // recém-gerado é baixado.
      roteador.refresh();
      baixar(resultado.exportacaoId);
    } else {
      setErros(resultado.erros);
    }
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <a className="btn btn-ghost btn-sm" href={`/api/assinantes/exportacoes/${exportacaoId}`}>
          Baixar
        </a>
        <button
          type="button"
          className="btn btn-azul btn-sm"
          disabled={ocupado}
          onClick={() => void reexecutar()}
        >
          {ocupado ? "Reexecutando…" : "Reexecutar"}
        </button>
      </div>
      {erros.length > 0 ? (
        <p className="cap" role="alert" style={{ color: "var(--erro-texto-aaa)", marginTop: 8 }}>
          {erros.join(" ")}
        </p>
      ) : null}
    </>
  );
}
