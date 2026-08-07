"use client";

import { useState, type ReactNode } from "react";

/**
 * Abre/fecha um bloco de edição com botões reais (não `<summary>`): o
 * `<summary>` estilizado como botão desalinhava o texto e não comportava um
 * "Cancelar". Aqui o gatilho é um `<button>` (herda a centralização do `.btn`)
 * e, aberto, o formulário aparece com um "Cancelar" que fecha sem salvar.
 */
export function AbreEdicao({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  const [aberto, definirAberto] = useState(false);

  if (!aberto) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => definirAberto(true)}>
        {rotulo}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {children}
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => definirAberto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
