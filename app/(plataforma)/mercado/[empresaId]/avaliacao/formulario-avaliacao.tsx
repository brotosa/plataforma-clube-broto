"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RecomendacaoAvaliacao } from "@prisma/client";
import type { DimensaoDaTela, NotaDaTela, VersaoFechada } from "@/infra/consultas/avaliacoes";
import type { NotaInformada } from "@/infra/casos-de-uso/avaliacoes";
import { calcularScore, compararSubtotais, type NotaParaCalculo } from "@/dominio/avaliacao/score";
import { ESCALA_NOTA, ROTULOS_RECOMENDACAO } from "@/dominio/avaliacao/regras";
import { acaoConcluirAvaliacao, acaoSalvarRascunho, type EstadoAcaoAvaliacao } from "./acoes";

/**
 * T10 — formulário da avaliação (client): notas 1–5 por indicador em
 * radiogroups navegáveis por teclado, evidência por nota, score ao vivo
 * por dimensão e total (pesos exibidos discretamente), recomendação e
 * comparação com a versão anterior. Fechar é definitivo (RN18) e passa por
 * confirmação; o rascunho só é gravado ao salvar/concluir.
 */

interface NotaLocal {
  nota: number | null;
  evidencia: string;
}

const RECOMENDACOES: ReadonlyArray<RecomendacaoAvaliacao> = [
  "AVANCAR",
  "MONITORAR",
  "DESCARTAR",
];

/** Peso sem zeros à direita (1.00 → "1"; 1.50 → "1,5"). */
function formatarPeso(peso: number): string {
  return Number.isInteger(peso) ? String(peso) : String(peso).replace(".", ",");
}

export function FormularioAvaliacao({
  empresa,
  dimensoes,
  rascunho,
  ultimaFechada,
  notasDaUltimaFechada,
  fechadas,
}: {
  empresa: { id: string; nomeFantasia: string };
  dimensoes: DimensaoDaTela[];
  rascunho: { id: string; versao: number; notas: Record<string, NotaDaTela> } | null;
  ultimaFechada: VersaoFechada | null;
  notasDaUltimaFechada: Record<string, NotaDaTela> | null;
  fechadas: VersaoFechada[];
}) {
  const [pendente, iniciarTransicao] = useTransition();
  const [toast, setToast] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [recomendacao, setRecomendacao] = useState<RecomendacaoAvaliacao | null>(null);
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(
    () => new Set(dimensoes.slice(0, 1).map((dimensao) => dimensao.dimensao)),
  );

  const indicadoresConhecidos = useMemo(
    () => new Map(dimensoes.flatMap((d) => d.indicadores.map((i) => [i.id, i] as const))),
    [dimensoes],
  );

  // Estado inicial espelha o que iniciarAvaliacao fará no servidor: o
  // rascunho aberto ou, sem rascunho, o pré-preenchimento da última
  // fechada (RN18 — correção parte do que foi pontuado).
  const estadoInicial = useMemo(() => {
    const origem = rascunho?.notas ?? notasDaUltimaFechada ?? {};
    const inicial: Record<string, NotaLocal> = {};
    for (const [indicadorId, nota] of Object.entries(origem)) {
      if (indicadoresConhecidos.has(indicadorId)) {
        inicial[indicadorId] = { nota: nota.nota, evidencia: nota.evidencia ?? "" };
      }
    }
    return inicial;
  }, [rascunho, notasDaUltimaFechada, indicadoresConhecidos]);

  const [notas, setNotas] = useState<Record<string, NotaLocal>>(estadoInicial);

  // Sincroniza quando o servidor cria/fecha versão (salvar → rascunho novo;
  // concluir → rascunho some e a fechada vira a base da próxima).
  const assinaturaVersao = `${rascunho?.id ?? "sem-rascunho"}:${ultimaFechada?.id ?? "sem-fechada"}`;
  const assinaturaAnterior = useRef(assinaturaVersao);
  useEffect(() => {
    if (assinaturaAnterior.current !== assinaturaVersao) {
      assinaturaAnterior.current = assinaturaVersao;
      setNotas(estadoInicial);
      setRecomendacao(null);
    }
  }, [assinaturaVersao, estadoInicial]);

  useEffect(() => {
    if (!toast) return;
    const temporizador = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(temporizador);
  }, [toast]);

  const versaoExibida = rascunho?.versao ?? (ultimaFechada ? ultimaFechada.versao + 1 : 1);

  const notasParaCalculo: NotaParaCalculo[] = useMemo(
    () =>
      Object.entries(notas)
        .filter((par): par is [string, NotaLocal & { nota: number }] => par[1].nota !== null)
        .map(([indicadorId, local]) => {
          const indicador = indicadoresConhecidos.get(indicadorId)!;
          return { dimensao: indicador.dimensao, peso: indicador.peso, nota: local.nota };
        }),
    [notas, indicadoresConhecidos],
  );
  const score = useMemo(() => calcularScore(notasParaCalculo), [notasParaCalculo]);
  const subtotalPorDimensao = useMemo(
    () => new Map(score.subtotais.map((subtotal) => [subtotal.dimensao, subtotal])),
    [score],
  );
  const comparacao = useMemo(
    () => (ultimaFechada ? compararSubtotais(ultimaFechada.subtotais, score.subtotais) : []),
    [ultimaFechada, score],
  );

  const totalRespondidas = notasParaCalculo.length;
  const podeConcluir = totalRespondidas > 0 && recomendacao !== null;

  function aplicarResultado(resultado: EstadoAcaoAvaliacao) {
    if (resultado.erros?.length) {
      setToast({ tipo: "erro", texto: resultado.erros.join(" ") });
    } else if (resultado.sucesso) {
      setToast({ tipo: "ok", texto: resultado.sucesso });
    }
  }

  function notasInformadas(): NotaInformada[] {
    return Object.entries(notas)
      .filter((par): par is [string, NotaLocal & { nota: number }] => par[1].nota !== null)
      .map(([indicadorId, local]) => ({
        indicadorId,
        nota: local.nota,
        evidencia: local.evidencia.trim() || null,
      }));
  }

  function salvarRascunho() {
    iniciarTransicao(async () => {
      aplicarResultado(
        await acaoSalvarRascunho({ empresaId: empresa.id, notas: notasInformadas() }),
      );
    });
  }

  function concluir() {
    iniciarTransicao(async () => {
      const resultado = await acaoConcluirAvaliacao({
        empresaId: empresa.id,
        notas: notasInformadas(),
        recomendacao,
      });
      aplicarResultado(resultado);
      if (!resultado.erros) {
        setConfirmando(false);
      }
    });
  }

  function alternarDimensao(nome: string) {
    setAbertas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(nome)) proximas.delete(nome);
      else proximas.add(nome);
      return proximas;
    });
  }

  function definirNota(indicadorId: string, nota: number) {
    setNotas((atuais) => ({
      ...atuais,
      [indicadorId]: { nota, evidencia: atuais[indicadorId]?.evidencia ?? "" },
    }));
  }

  function definirEvidencia(indicadorId: string, evidencia: string) {
    setNotas((atuais) => ({
      ...atuais,
      [indicadorId]: { nota: atuais[indicadorId]?.nota ?? null, evidencia },
    }));
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Avaliação — {empresa.nomeFantasia}</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            ScoutCB · nota 1–5 por indicador ·{" "}
            {rascunho ? `versão ${versaoExibida} (rascunho)` : `versão ${versaoExibida} (nova)`}
            {" · "}
            {totalRespondidas}/{indicadoresConhecidos.size} indicadores respondidos
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" disabled={pendente} onClick={salvarRascunho}>
          Salvar rascunho
        </button>
        <button
          type="button"
          className="btn btn-azul"
          disabled={pendente}
          onClick={() => setConfirmando(true)}
        >
          Concluir avaliação
        </button>
      </div>

      <div
        className="g-resp"
        style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="cap" style={{ margin: 0 }}>
            Indicadores conforme as duas tabelas do ScoutCB — nota 1–5 com evidência opcional
            por indicador; a evidência pode citar o dossiê, mas a pontuação é sempre humana
            (RN19).
          </p>
          {dimensoes.map((dimensao) => {
            const aberta = abertas.has(dimensao.dimensao);
            const subtotal = subtotalPorDimensao.get(dimensao.dimensao);
            const respondidas = dimensao.indicadores.filter(
              (indicador) => notas[indicador.id]?.nota != null,
            ).length;
            const idSecao = `dim-${dimensao.indicadores[0]?.slug ?? dimensao.dimensao}`;
            return (
              <div className="card" key={dimensao.dimensao}>
                <button
                  type="button"
                  className="dim-h"
                  aria-expanded={aberta}
                  // Só referencia a seção quando ela existe no DOM (axe:
                  // aria-valid-attr-value com o painel fechado).
                  aria-controls={aberta ? idSecao : undefined}
                  onClick={() => alternarDimensao(dimensao.dimensao)}
                >
                  <span>
                    <span aria-hidden="true">{aberta ? "▾" : "▸"}</span> {dimensao.dimensao}
                    {dimensao.rotuloGrupo ? (
                      <span className="cap" style={{ marginLeft: 8 }}>
                        · {dimensao.rotuloGrupo}
                      </span>
                    ) : null}
                  </span>
                  <span className="num cap" style={{ fontSize: 13 }}>
                    {respondidas}/{dimensao.indicadores.length}
                    {subtotal ? ` · subtotal ${Math.round(subtotal.subtotal)}` : " · subtotal —"}
                  </span>
                </button>
                {aberta ? (
                  <div
                    id={idSecao}
                    style={{
                      padding: "2px 18px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                      borderTop: "1px solid var(--borda)",
                    }}
                  >
                    {dimensao.indicadores.map((indicador) => {
                      const local = notas[indicador.id];
                      return (
                        <div
                          key={indicador.id}
                          style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 12 }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 14,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={{ fontSize: 14 }}>
                              {indicador.nome}{" "}
                              <span className="cap" title={indicador.descricao}>
                                · {indicador.descricao} · peso {formatarPeso(indicador.peso)}
                              </span>
                            </span>
                            <span
                              className="nota"
                              role="radiogroup"
                              aria-label={`Nota de 1 a 5 — ${indicador.nome}`}
                            >
                              {[1, 2, 3, 4, 5].map((valor) => {
                                const selecionada = local?.nota === valor;
                                const semSelecao = local?.nota == null;
                                return (
                                  <button
                                    key={valor}
                                    type="button"
                                    role="radio"
                                    aria-checked={selecionada}
                                    aria-label={`Nota ${valor}`}
                                    className={selecionada ? "on" : ""}
                                    tabIndex={
                                      selecionada || (semSelecao && valor === ESCALA_NOTA.minima)
                                        ? 0
                                        : -1
                                    }
                                    onClick={() => definirNota(indicador.id, valor)}
                                    onKeyDown={(evento) => {
                                      const passo =
                                        evento.key === "ArrowRight" || evento.key === "ArrowDown"
                                          ? 1
                                          : evento.key === "ArrowLeft" || evento.key === "ArrowUp"
                                            ? -1
                                            : 0;
                                      if (passo === 0) return;
                                      evento.preventDefault();
                                      const atual = local?.nota ?? valor;
                                      // Passeia 1..5 com contorno nas pontas (padrão radiogroup).
                                      const proxima = ((atual - 1 + passo + 5) % 5) + 1;
                                      definirNota(indicador.id, proxima);
                                      const grupo = evento.currentTarget.parentElement;
                                      const botoes = grupo?.querySelectorAll("button");
                                      (botoes?.[proxima - 1] as HTMLButtonElement | undefined)?.focus();
                                    }}
                                  >
                                    {valor}
                                  </button>
                                );
                              })}
                            </span>
                          </div>
                          <label className="sr-oculto" htmlFor={`ev-${indicador.slug}`}>
                            Evidência da nota — {indicador.nome}
                          </label>
                          <input
                            id={`ev-${indicador.slug}`}
                            className="input"
                            style={{ fontSize: 13 }}
                            placeholder="Evidência — fato, fonte ou observação que sustenta a nota"
                            value={local?.evidencia ?? ""}
                            onChange={(evento) => definirEvidencia(indicador.id, evento.target.value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20 }}>
          <div
            className="card"
            style={{ padding: "20px 22px", borderColor: "var(--azul-claro)", boxShadow: "var(--shadow)" }}
          >
            <h2 className="h-el" style={{ marginBottom: 8 }}>
              Score ao vivo
            </h2>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }} aria-live="polite">
              <span className="kpi-n num" style={{ fontSize: 44 }}>
                {score.totalInteiro ?? "—"}
              </span>
              <span className="cap" style={{ fontSize: 14 }}>
                / 100
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14, fontSize: 12.5 }}>
              {dimensoes.map((dimensao) => {
                const subtotal = subtotalPorDimensao.get(dimensao.dimensao);
                return (
                  <div key={dimensao.dimensao} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 118,
                        flex: "none",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={dimensao.dimensao}
                    >
                      {dimensao.dimensao}
                    </span>
                    <span className="dim-bar">
                      <i style={{ width: subtotal ? `${Math.round(subtotal.subtotal)}%` : "0%" }} />
                    </span>
                    <span className="num" style={{ width: 64, textAlign: "right" }}>
                      {subtotal ? Math.round(subtotal.subtotal) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="cap" style={{ margin: "12px 0 0" }}>
              Total = média dos subtotais (média 1–5 da dimensão × 20) das dimensões avaliadas,
              ponderada pelo peso de cada uma — hoje todas 1×.{" "}
              <span className="selo">pesos conforme ScoutCB — parametrizável</span>
            </p>
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 10 }}>
              Recomendação
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
              {RECOMENDACOES.map((valor) => (
                <label key={valor} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="recomendacao"
                    value={valor}
                    checked={recomendacao === valor}
                    onChange={() => setRecomendacao(valor)}
                    style={{ accentColor: "var(--azul)" }}
                  />
                  {ROTULOS_RECOMENDACAO[valor]}
                </label>
              ))}
            </div>
            <p className="cap" style={{ margin: "10px 0 0" }}>
              O score recomenda, nunca decide — priorização e descarte são atos humanos
              explícitos no funil (RN15).
            </p>
          </div>

          <div className="card" style={{ padding: "16px 20px" }}>
            {ultimaFechada ? (
              <>
                <span style={{ fontSize: 13.5 }}>
                  Versão anterior: <b className="num">{ultimaFechada.total ?? "—"}</b> → atual{" "}
                  <b className="num">{score.totalInteiro ?? "—"}</b>
                </span>
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", font: "var(--font-body-label-bold)" }}>
                    ver diferenças por dimensão
                  </summary>
                  <ul
                    style={{
                      margin: "8px 0 0",
                      paddingLeft: 18,
                      fontSize: 12.5,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {comparacao.map((linha) => (
                      <li key={linha.dimensao}>
                        {linha.dimensao}:{" "}
                        <span className="num">
                          {linha.subtotalAnterior !== null ? Math.round(linha.subtotalAnterior) : "—"}{" "}
                          → {linha.subtotalAtual !== null ? Math.round(linha.subtotalAtual) : "—"}
                          {linha.delta !== null
                            ? ` (${linha.delta > 0 ? "+" : ""}${Math.round(linha.delta)})`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="cap" style={{ margin: "8px 0 0" }}>
                  Fechada em{" "}
                  {ultimaFechada.fechadaEm
                    ? new Date(ultimaFechada.fechadaEm).toLocaleDateString("pt-BR")
                    : "—"}{" "}
                  por {ultimaFechada.avaliadorNome} · versão {ultimaFechada.versao} (imutável, RN18)
                </p>
              </>
            ) : (
              <span className="cap" style={{ fontSize: 13 }}>
                Primeira avaliação da empresa — sem versão anterior para comparar.
              </span>
            )}
          </div>

          {fechadas.length > 0 ? (
            <div className="card" style={{ padding: "14px 20px" }}>
              <h2 className="h-el" style={{ marginBottom: 6, fontSize: 14 }}>
                Histórico de versões
              </h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 3 }}>
                {fechadas.map((versao) => (
                  <li key={versao.id}>
                    v{versao.versao} · <b className="num">{versao.total ?? "—"}</b>/100 ·{" "}
                    {versao.recomendacao ? ROTULOS_RECOMENDACAO[versao.recomendacao] : "—"} ·{" "}
                    {versao.fechadaEm ? new Date(versao.fechadaEm).toLocaleDateString("pt-BR") : "—"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {confirmando ? (
        <ModalConclusao
          nomeFantasia={empresa.nomeFantasia}
          total={score.totalInteiro}
          respondidas={totalRespondidas}
          recomendacao={recomendacao}
          podeConcluir={podeConcluir}
          pendente={pendente}
          aoFechar={() => setConfirmando(false)}
          aoConfirmar={concluir}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast.tipo === "ok" ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="var(--verde)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="var(--erro)"
              strokeWidth="3"
              strokeLinecap="round"
            >
              <path d="M12 8v5M12 16.5h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
          {toast.texto}
        </div>
      ) : null}
    </>
  );
}

/** Confirmação do fechamento — definitivo (RN18): correção = nova versão. */
function ModalConclusao({
  nomeFantasia,
  total,
  respondidas,
  recomendacao,
  podeConcluir,
  pendente,
  aoFechar,
  aoConfirmar,
}: {
  nomeFantasia: string;
  total: number | null;
  respondidas: number;
  recomendacao: RecomendacaoAvaliacao | null;
  podeConcluir: boolean;
  pendente: boolean;
  aoFechar: () => void;
  aoConfirmar: () => void;
}) {
  const botaoRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    botaoRef.current?.focus();
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-transparency-black-on-light-30)",
        zIndex: 110,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onKeyDown={(evento) => {
        if (evento.key === "Escape") aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Concluir avaliação de ${nomeFantasia}`}
        className="card"
        style={{ width: "min(480px,100%)", padding: "22px 24px", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 className="h-el" style={{ marginBottom: 6 }}>
          Concluir avaliação de {nomeFantasia}
        </h2>
        <p className="cap" style={{ margin: "0 0 14px" }}>
          Fechar é definitivo: a versão vira imutável (RN18) e correções futuras abrem nova
          versão. O score passa a valer na ficha e no funil — priorizar continua sendo decisão
          humana (RN15).
        </p>
        <div className="card" style={{ padding: "12px 16px", marginBottom: 14, fontSize: 14 }}>
          Score <b className="num">{total ?? "—"}</b>/100 · {respondidas} indicador(es)
          respondido(s) · recomendação:{" "}
          <b>{recomendacao ? ROTULOS_RECOMENDACAO[recomendacao] : "— não escolhida"}</b>
        </div>
        {!podeConcluir ? (
          <p className="cap" style={{ margin: "0 0 14px", color: "var(--erro)" }}>
            Para concluir: ao menos uma nota registrada e uma recomendação escolhida.
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" ref={botaoRef} className="btn btn-ghost" onClick={aoFechar}>
            Voltar ao formulário
          </button>
          <button
            type="button"
            className="btn btn-azul"
            disabled={!podeConcluir || pendente}
            onClick={aoConfirmar}
          >
            Concluir avaliação
          </button>
        </div>
      </div>
    </div>
  );
}
