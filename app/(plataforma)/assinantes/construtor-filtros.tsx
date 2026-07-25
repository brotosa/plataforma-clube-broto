"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Construtor de filtros da carteira (T18) — o motor de segmentação da
 * RN33 em forma de componente ISOLADO E REUTILIZÁVEL: a Onda 4 o embute
 * na seleção de público da campanha sem código novo de filtro.
 *
 * - Estrutura declarativa sempre: o estado É a lista de regras
 *   { campo, operador, valor, combinadorAnterior } persistida nos
 *   segmentos.
 * - Contagem viva no endpoint separado POST /api/assinantes/contagem,
 *   chamada a cada mudança de regra com debounce.
 * - Regra de uso em 90 dias (RN36) mostra a contagem indisponível — o
 *   aviso institucional vem do servidor, nunca um número estimado.
 * - Operável por teclado (selects e botões nativos, foco visível do
 *   dseed-admin).
 */

export interface OpcaoValor {
  valor: string;
  rotulo: string;
}

export interface CampoConstrutor {
  slug: string;
  rotulo: string;
  operadores: ReadonlyArray<"e" | "nao_e" | "vence_em">;
  /** null = valor em texto livre. */
  valores: ReadonlyArray<OpcaoValor> | null;
}

export interface RegraConstrutor {
  campo: string;
  operador: "e" | "nao_e" | "vence_em";
  valor: string;
  combinadorAnterior?: "E" | "OU";
}

export type EstadoContagem =
  | { status: "CARREGANDO" }
  | { status: "OK"; total: number }
  | { status: "AGUARDANDO_TELEMETRIA"; motivo: string }
  | { status: "ERRO" };

const ROTULO_OPERADOR: Record<string, string> = {
  e: "é",
  nao_e: "não é",
  vence_em: "vence em",
};

const SLUG_USO = "uso-90-dias";
const ATRASO_DEBOUNCE_MS = 350;

function regraPadrao(campos: ReadonlyArray<CampoConstrutor>): RegraConstrutor {
  const campo = campos[0]!;
  return {
    campo: campo.slug,
    operador: campo.operadores[0]!,
    valor: campo.valores?.[0]?.valor ?? "",
  };
}

export function formatarContagem(total: number): string {
  return total.toLocaleString("pt-BR");
}

/** Resumo textual das regras no vocabulário do protótipo. */
export function resumoDasRegras(
  regras: ReadonlyArray<RegraConstrutor>,
  campos: ReadonlyArray<CampoConstrutor>,
): string {
  if (regras.length === 0) {
    return "Nenhum filtro aplicado — carteira inteira";
  }
  const rotuloDe = (slug: string) =>
    campos.find((campo) => campo.slug === slug)?.rotulo ?? slug;
  return regras
    .map((regra, indice) => {
      const prefixo =
        indice === 0 ? "" : regra.combinadorAnterior === "OU" ? " OU " : " E ";
      if (regra.campo === "vencimento") {
        return `${prefixo}vence em ${regra.valor || "—"} dias`;
      }
      if (regra.campo === SLUG_USO) {
        return `${prefixo}${regra.valor === "sem" ? "sem" : "com"} uso em 90 dias`;
      }
      return `${prefixo}${rotuloDe(regra.campo)} ${ROTULO_OPERADOR[regra.operador]} ${regra.valor || "—"}`;
    })
    .join("");
}

export function ConstrutorFiltros({
  campos,
  regras,
  aoMudar,
  contagem,
  textoContagemVazia = "assinantes na base — nenhum filtro aplicado",
  textoContagemFiltrada = "assinantes correspondem aos filtros",
}: {
  campos: ReadonlyArray<CampoConstrutor>;
  regras: ReadonlyArray<RegraConstrutor>;
  aoMudar: (regras: RegraConstrutor[]) => void;
  contagem: EstadoContagem;
  textoContagemVazia?: string;
  textoContagemFiltrada?: string;
}) {
  const [aberto, setAberto] = useState(true);
  const idGrupo = useId();
  const temRegraDeUso = regras.some((regra) => regra.campo === SLUG_USO);

  const atualizarRegra = (indice: number, mudanca: Partial<RegraConstrutor>) => {
    const proximas = regras.map((regra, i) => {
      if (i !== indice) return regra;
      const nova = { ...regra, ...mudanca };
      if (mudanca.campo) {
        const definicao = campos.find((campo) => campo.slug === mudanca.campo);
        nova.operador = definicao?.operadores[0] ?? "e";
        nova.valor = definicao?.valores?.[0]?.valor ?? "";
      }
      return nova;
    });
    aoMudar(proximas);
  };

  const resumoFiltros =
    regras.length === 0
      ? "nenhuma regra aplicada"
      : regras.length === 1
        ? "1 regra aplicada"
        : `${regras.length} regras aplicadas`;

  return (
    <>
      <div className="viva">
        {contagem.status === "AGUARDANDO_TELEMETRIA" ? (
          <>
            <div className="viva-n" style={{ color: "var(--paragrafo-aaa)" }}>
              —
            </div>
            <div className="viva-t">
              contagem indisponível — a regra de uso depende da telemetria por
              assinante <span className="selo">aguardando telemetria por assinante</span>
            </div>
          </>
        ) : contagem.status === "ERRO" ? (
          <>
            <div className="viva-n" style={{ color: "var(--paragrafo-aaa)" }}>
              —
            </div>
            <div className="viva-t">não foi possível contar — tente de novo</div>
          </>
        ) : (
          <>
            <div className="viva-n num" aria-live="polite">
              {contagem.status === "CARREGANDO" ? "…" : formatarContagem(contagem.total)}
            </div>
            <div className="viva-t">
              {regras.length === 0 ? textoContagemVazia : textoContagemFiltrada}
            </div>
          </>
        )}
        <div className="cap" style={{ marginTop: 8 }}>
          {resumoDasRegras(regras, campos)}
        </div>
      </div>

      <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}>
        <button
          type="button"
          className="acc-h"
          aria-expanded={aberto}
          aria-controls={idGrupo}
          onClick={() => setAberto((atual) => !atual)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flex: "none",
              transform: `rotate(${aberto ? 90 : 0}deg)`,
              transition: "transform var(--dur-1) var(--ease)",
            }}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span className="h-el">Filtros e condições</span>
          <span className="cap">{resumoFiltros}</span>
          <span style={{ flex: 1 }} />
          <span className="cap">{aberto ? "recolher" : "expandir"}</span>
        </button>
        {aberto ? (
          <div id={idGrupo}>
            <div className="cap" style={{ margin: "10px 0 12px" }}>
              Operável por teclado · a contagem acima acompanha cada regra
            </div>
            <div
              role="group"
              aria-label="Construtor de filtros"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {regras.map((regra, indice) => {
                const definicao = campos.find((campo) => campo.slug === regra.campo);
                const numero = indice + 1;
                return (
                  <div className="regra" key={indice}>
                    {indice === 0 ? (
                      <span
                        className="cap"
                        style={{ width: 62, textAlign: "center", flex: "none" }}
                      >
                        onde
                      </span>
                    ) : (
                      <div className="seg" style={{ flex: "none" }}>
                        <button
                          type="button"
                          className={regra.combinadorAnterior !== "OU" ? "on" : ""}
                          aria-pressed={regra.combinadorAnterior !== "OU"}
                          onClick={() => atualizarRegra(indice, { combinadorAnterior: "E" })}
                        >
                          E
                        </button>
                        <button
                          type="button"
                          className={regra.combinadorAnterior === "OU" ? "on" : ""}
                          aria-pressed={regra.combinadorAnterior === "OU"}
                          onClick={() => atualizarRegra(indice, { combinadorAnterior: "OU" })}
                        >
                          OU
                        </button>
                      </div>
                    )}
                    <select
                      className="select"
                      style={{ width: 200, flex: "none" }}
                      aria-label={`Campo da regra ${numero}`}
                      value={regra.campo}
                      onChange={(evento) =>
                        atualizarRegra(indice, { campo: evento.target.value })
                      }
                    >
                      {campos.map((campo) => (
                        <option key={campo.slug} value={campo.slug}>
                          {campo.rotulo}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select"
                      style={{ width: 132, flex: "none" }}
                      aria-label={`Operador da regra ${numero}`}
                      value={regra.operador}
                      onChange={(evento) =>
                        atualizarRegra(indice, {
                          operador: evento.target.value as RegraConstrutor["operador"],
                        })
                      }
                    >
                      {(definicao?.operadores ?? ["e"]).map((operador) => (
                        <option key={operador} value={operador}>
                          {ROTULO_OPERADOR[operador]}
                        </option>
                      ))}
                    </select>
                    {definicao?.valores ? (
                      <select
                        className="select"
                        style={{ flex: 1, minWidth: 150 }}
                        aria-label={`Valor da regra ${numero}`}
                        value={regra.valor}
                        onChange={(evento) =>
                          atualizarRegra(indice, { valor: evento.target.value })
                        }
                      >
                        {definicao.valores.map((opcao) => (
                          <option key={opcao.valor} value={opcao.valor}>
                            {opcao.rotulo}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 150 }}
                        aria-label={`Valor da regra ${numero}`}
                        value={regra.valor}
                        placeholder="Ex.: Sorriso"
                        onChange={(evento) =>
                          atualizarRegra(indice, { valor: evento.target.value })
                        }
                      />
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ flex: "none" }}
                      aria-label={`Remover regra ${numero}`}
                      onClick={() => {
                        const proximas = regras.filter((_, i) => i !== indice);
                        if (proximas.length > 0) {
                          proximas[0] = { ...proximas[0]!, combinadorAnterior: undefined };
                        }
                        aoMudar(proximas);
                      }}
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
            </div>
            {temRegraDeUso ? (
              <div className="aviso-inline" style={{ margin: "12px 0 0" }}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{ flex: "none" }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span>
                  A regra de uso em 90 dias fica pronta na interface, mas só conta
                  quando a telemetria vier por assinante (granularidade por CPF em
                  confirmação com a Minutrade). Até então a contagem não é estimada.
                </span>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const nova = regraPadrao(campos);
                  aoMudar([
                    ...regras,
                    regras.length > 0 ? { ...nova, combinadorAnterior: "E" } : nova,
                  ]);
                }}
              >
                + Adicionar regra
              </button>
              {regras.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => aoMudar([])}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Contagem viva com debounce sobre o endpoint separado (RN33). */
export function useContagemViva(regras: ReadonlyArray<RegraConstrutor>): EstadoContagem {
  const [contagem, setContagem] = useState<EstadoContagem>({ status: "CARREGANDO" });
  const controladorRef = useRef<AbortController | null>(null);

  const consultar = useCallback(async (atuais: ReadonlyArray<RegraConstrutor>) => {
    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;
    try {
      const resposta = await fetch("/api/assinantes/contagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regras: atuais }),
        signal: controlador.signal,
      });
      if (!resposta.ok) {
        setContagem({ status: "ERRO" });
        return;
      }
      const corpo = (await resposta.json()) as
        | { status: "OK"; total: number }
        | { status: "AGUARDANDO_TELEMETRIA"; motivo: string };
      setContagem(corpo);
    } catch (erro) {
      if ((erro as Error).name !== "AbortError") {
        setContagem({ status: "ERRO" });
      }
    }
  }, []);

  useEffect(() => {
    setContagem((atual) => (atual.status === "OK" ? atual : { status: "CARREGANDO" }));
    const temporizador = setTimeout(() => {
      void consultar(regras);
    }, ATRASO_DEBOUNCE_MS);
    return () => clearTimeout(temporizador);
  }, [regras, consultar]);

  return contagem;
}
