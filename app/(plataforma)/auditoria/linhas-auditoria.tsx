"use client";

import { Fragment, useState } from "react";
import type { EventoDaTela } from "@/infra/consultas/auditoria";

/**
 * Corpo da tabela da T28: cada evento é uma linha expansível que abre a
 * comparação **antes → depois** em duas colunas, com as diferenças
 * destacadas (protótipo v8.1 FINAL).
 *
 * O controle de expansão é um `<button>` de verdade, na última célula.
 * A primeira tentativa foi um `<tr>` com `tabIndex` e `aria-expanded`, como
 * as linhas clicáveis da T1 — e o axe reprovou com razão: `aria-expanded`
 * só vale em linha de `treegrid`, não de `table`. Um botão real resolve o
 * estado ARIA e a navegação por teclado de uma vez; a linha inteira segue
 * clicável, mas isso agora é só conveniência de mouse.
 *
 * Só as diferenças recebem destaque: marcar todas as chaves de um evento
 * JSON seria o mesmo que não marcar nenhuma.
 */

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return (
    ((partes[0]?.charAt(0) ?? "") + (partes[partes.length - 1]?.charAt(0) ?? "")).toUpperCase() ||
    "?"
  );
}

function Coluna({
  titulo,
  linhas,
  lado,
}: {
  titulo: string;
  linhas: EventoDaTela["diferencas"];
  lado: "antes" | "depois";
}) {
  return (
    <div>
      <div
        className="cap"
        style={{
          textTransform: "uppercase",
          letterSpacing: ".06em",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {titulo}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "13.5px" }}>
        {linhas.map((linha) => {
          const valor = lado === "antes" ? linha.antes : linha.depois;
          return (
            <span key={`${lado}-${linha.rotulo}`} className={linha.mudou ? "diff" : undefined}>
              {linha.rotulo}: <b>{valor ?? "—"}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function LinhasAuditoria({ eventos }: { eventos: ReadonlyArray<EventoDaTela> }) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <tbody>
      {eventos.map((evento) => {
        const expandido = aberto === evento.id;
        return (
          <Fragment key={evento.id}>
            <tr
              className="click"
              onClick={() => setAberto(expandido ? null : evento.id)}
            >
              <td
                data-label="Data · hora"
                className="num"
                style={{ color: "var(--paragrafo-aaa)", whiteSpace: "nowrap" }}
              >
                {FORMATO_DATA.format(evento.criadoEm)}
              </td>
              <td data-label="Usuário">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="logo-ini" style={{ width: 24, height: 24, fontSize: 10 }}>
                    {iniciaisDe(evento.autorNome)}
                  </span>
                  {evento.autorNome}
                </div>
              </td>
              <td data-label="Transação">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontWeight: 600,
                  }}
                >
                  {evento.sensivel ? (
                    <span className="sens-dot" role="img" aria-label="Evento sensível" />
                  ) : null}
                  {evento.descricao}
                </span>
              </td>
              <td data-label="Entidade">
                <span className="pill pill-neutra">{evento.entidade}</span>
              </td>
              <td data-label="Registro" className="cap">
                {evento.entidadeId}
              </td>
              <td className="chev" style={{ color: "var(--paragrafo-aaa)" }}>
                <button
                  type="button"
                  className="btn-icone"
                  aria-expanded={expandido}
                  aria-controls={`detalhe-${evento.id}`}
                  aria-label={`${expandido ? "Recolher" : "Expandir"} o detalhe de ${evento.descricao}`}
                  onClick={(clique) => {
                    // A linha inteira também alterna; sem isto o clique no
                    // botão dispararia os dois e o detalhe voltaria a fechar.
                    clique.stopPropagation();
                    setAberto(expandido ? null : evento.id);
                  }}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{
                      transform: `rotate(${expandido ? 90 : 0}deg)`,
                      transition: "transform var(--dur-1) var(--ease)",
                    }}
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </td>
            </tr>
            {expandido ? (
              <tr>
                <td colSpan={6} style={{ padding: 0, borderBottom: "1px solid var(--borda)" }}>
                  <div id={`detalhe-${evento.id}`} className="aud-det" style={{ borderBottom: 0 }}>
                    <div
                      className="g-resp"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                        gap: 14,
                      }}
                    >
                      <Coluna titulo="Antes" linhas={evento.diferencas} lado="antes" />
                      <Coluna titulo="Depois" linhas={evento.diferencas} lado="depois" />
                    </div>
                    {evento.sensivel ? (
                      <p className="cap" style={{ margin: "10px 0 0" }}>
                        Evento sensível — acesso a dados pessoais, exportação, parâmetro ou regra
                        de aprovação.
                      </p>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}
