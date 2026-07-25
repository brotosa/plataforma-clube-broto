"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { acaoIncluirNoRadar, type EstadoAcaoFunil } from "../acoes";

/**
 * T9 — formulário mínimo da entrada no radar (RN13): nome, site, origem e
 * categorias-alvo (≥1). Após incluir, o formulário limpa para a próxima
 * empresa — o radar recebe até ~100 por mês.
 */
export function FormularioRadar({
  categorias,
  origens,
}: {
  categorias: Array<{ id: string; nome: string }>;
  origens: Array<{ valor: string; rotulo: string }>;
}) {
  const formularioRef = useRef<HTMLFormElement | null>(null);
  const [estado, enviar, pendente] = useActionState(
    async (anterior: EstadoAcaoFunil, dados: FormData) => {
      const resultado = await acaoIncluirNoRadar(anterior, dados);
      if (resultado.sucesso) {
        formularioRef.current?.reset();
      }
      return resultado;
    },
    {} as EstadoAcaoFunil,
  );

  return (
    <form
      ref={formularioRef}
      action={enviar}
      className="card"
      style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}
    >
      <h2 className="h-el">Incluir empresa</h2>

      {estado.erros?.length ? (
        <div className="aviso-inline" role="alert">
          <span>{estado.erros.join(" ")}</span>
        </div>
      ) : null}
      {estado.sucesso ? (
        <div className="aviso-inline" role="status">
          <span>
            {estado.sucesso}{" "}
            <Link href="/mercado">Ver no funil ›</Link>
          </span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="radar-nome">Nome</label>
        <input id="radar-nome" name="nomeFantasia" className="input" placeholder="Nome da empresa" />
      </div>
      <div className="field">
        <label htmlFor="radar-site">
          Site <span className="cap" style={{ fontWeight: 400 }}>· opcional</span>
        </label>
        <input id="radar-site" name="site" className="input" placeholder="https://…" />
      </div>
      <div className="field">
        <label htmlFor="radar-origem">Origem</label>
        <select id="radar-origem" name="origem" className="select" defaultValue="">
          <option value="">Selecionar…</option>
          {origens.map((origem) => (
            <option key={origem.valor} value={origem.valor}>
              {origem.rotulo}
            </option>
          ))}
        </select>
        <span className="cap">Obrigatória na entrada (RN13).</span>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ font: "var(--font-body-label-bold)", marginBottom: 6 }}>
          Categorias-alvo <span className="cap" style={{ fontWeight: 400 }}>· ao menos uma (RN13)</span>
        </legend>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px 12px",
            maxHeight: 180,
            overflowY: "auto",
            border: "1px solid var(--borda)",
            borderRadius: "var(--r-sm)",
            padding: "10px 12px",
          }}
        >
          {categorias.map((categoria) => (
            <label
              key={categoria.id}
              style={{ display: "flex", alignItems: "center", gap: 8, font: "var(--font-body-label-regular)" }}
            >
              <input
                type="checkbox"
                name="categoriaIds"
                value={categoria.id}
                style={{ accentColor: "var(--azul)" }}
              />
              {categoria.nome}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" className="btn btn-azul" disabled={pendente}>
        {pendente ? "Adicionando…" : "Adicionar ao radar"}
      </button>
    </form>
  );
}
