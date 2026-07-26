"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acaoAlternarOfertaDaCesta,
  acaoAtualizarCesta,
  acaoCriarCesta,
} from "../acoes";

/**
 * T24 — lista + detalhe das cestas (protótipo v7.1). A RN41 aparece como
 * etiqueta na lista e como aviso no detalhe: a cesta com oferta não
 * publicada existe, mas não entra em campanha enquanto isso.
 */

export interface OfertaDaCesta {
  id: string;
  titulo: string;
  aliado: string;
  categoria: string | null;
  natureza: string;
  status: string;
  precoDe: number | null;
  precoPor: number | null;
}

export interface CestaExibida {
  id: string;
  nome: string;
  narrativa: string | null;
  origemPerfil: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
  segmentoId: string | null;
  liberada: boolean;
  bloqueiam: string[];
  emCampanhaAtiva: boolean;
  ofertas: OfertaDaCesta[];
}

export interface OfertaDisponivel {
  id: string;
  titulo: string;
  aliado: string;
  sugestao: string | null;
}

const moeda = (valor: number | null) =>
  valor === null
    ? null
    : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function EditorDeCestas({
  cestas,
  selecionadaId,
  segmentos,
  ofertasDisponiveis,
  podeGerir,
}: {
  cestas: ReadonlyArray<CestaExibida>;
  selecionadaId: string | null;
  segmentos: ReadonlyArray<{ id: string; nome: string }>;
  ofertasDisponiveis: ReadonlyArray<OfertaDisponivel>;
  podeGerir: boolean;
}) {
  const [criando, setCriando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  const selecionada = cestas.find((cesta) => cesta.id === selecionadaId) ?? null;
  const naCesta = new Set(selecionada?.ofertas.map((oferta) => oferta.id) ?? []);
  const sugeridas = ofertasDisponiveis
    .filter((oferta) => oferta.sugestao && !naCesta.has(oferta.id))
    .slice(0, 5);
  const filtradas = ofertasDisponiveis.filter(
    (oferta) =>
      !naCesta.has(oferta.id) &&
      (busca.trim() === "" || oferta.titulo.toLowerCase().includes(busca.trim().toLowerCase())),
  );

  const executar = (acao: () => Promise<{ ok: boolean; erros?: string[] }>) => {
    iniciar(async () => {
      const resposta = await acao();
      if (resposta.ok) {
        setErros([]);
        router.refresh();
      } else {
        setErros(resposta.erros ?? []);
      }
    });
  };

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
          <h1 className="h-page">Cestas</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Conjuntos nomeados e reutilizáveis de ofertas, com narrativa e perfil-alvo
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeGerir ? (
          <button type="button" className="btn btn-azul" onClick={() => setCriando(true)}>
            + Nova cesta
          </button>
        ) : null}
      </div>

      {erros.length > 0 ? (
        <div
          className="aviso-inline"
          style={{ background: "var(--alerta-claro)", borderColor: "var(--alerta)" }}
          role="alert"
        >
          <span>{erros.join(" ")}</span>
        </div>
      ) : null}

      {criando ? (
        <div className="card" style={{ padding: "20px 22px", marginBottom: 16 }}>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Nova cesta
          </h2>
          <p className="cap" style={{ margin: "0 0 16px" }}>
            Uma cesta é um conjunto nomeado e reutilizável de ofertas — a narrativa viaja nas
            peças e no manifesto do kit.
          </p>
          <form
            action={(dados) => {
              iniciar(async () => {
                const resposta = await acaoCriarCesta({
                  nome: String(dados.get("nome") ?? ""),
                  narrativa: String(dados.get("narrativa") ?? ""),
                  segmentoId: String(dados.get("segmentoId") ?? "") || null,
                });
                if (resposta.ok) {
                  setCriando(false);
                  setErros([]);
                  router.push(`/campanhas/cestas?cesta=${resposta.cestaId}`);
                } else {
                  setErros(resposta.erros);
                }
              });
            }}
          >
            <div
              className="g-resp"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                gap: 16,
              }}
            >
              <div className="field">
                <label htmlFor="cesta-nome">Nome</label>
                <input
                  id="cesta-nome"
                  className="input"
                  name="nome"
                  required
                  placeholder="Ex.: Cesta Solo Vivo"
                />
              </div>
              <div className="field">
                <label htmlFor="cesta-segmento">Perfil-alvo (segmento salvo)</label>
                <select id="cesta-segmento" className="select" name="segmentoId">
                  <option value="">Selecionar…</option>
                  {segmentos.map((segmento) => (
                    <option value={segmento.id} key={segmento.id}>
                      {segmento.nome}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  A regra do segmento alimenta a recomendação por taxonomia (RN42).
                </span>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="cesta-narrativa">Narrativa</label>
                <textarea
                  id="cesta-narrativa"
                  className="textarea"
                  name="narrativa"
                  rows={2}
                  placeholder="O que esta cesta resolve para o assinante"
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <button type="submit" className="btn btn-azul" disabled={pendente}>
                Criar cesta
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCriando(false)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div
        className="g-resp"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,300px) minmax(0,1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {cestas.length === 0 ? (
              <p className="cap" style={{ margin: 0 }}>
                Nenhuma cesta ainda.
              </p>
            ) : (
              cestas.map((cesta) => (
                <a
                  key={cesta.id}
                  href={`/campanhas/cestas?cesta=${cesta.id}`}
                  className={`sec-it${cesta.id === selecionadaId ? " on" : ""}`}
                  aria-current={cesta.id === selecionadaId ? "true" : undefined}
                >
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cesta.nome}
                  </span>
                  {!cesta.liberada ? (
                    <span className="pill pill-warn" style={{ fontSize: 10 }}>
                      <i />
                      RN41
                    </span>
                  ) : null}
                </a>
              ))
            )}
          </div>
          <div
            className="cap"
            style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--borda)" }}
          >
            {cestas.length} cesta(s) · {cestas.filter((cesta) => !cesta.liberada).length} com
            pendência da RN41
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {!selecionada ? (
            <div className="card">
              <div className="vazio">
                <h2 className="h-el">Nenhuma cesta selecionada</h2>
                <p className="cap" style={{ margin: 0 }}>
                  Crie uma cesta para montar conjuntos reutilizáveis de ofertas.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: "20px 22px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <h2 className="h-el">{selecionada.nome}</h2>
                    <div className="cap" style={{ marginTop: 4 }}>
                      {selecionada.emCampanhaAtiva
                        ? "em campanha ativa — conteúdo congelado pelo kit (RN45)"
                        : `${selecionada.ofertas.length} oferta(s)`}
                    </div>
                  </div>
                </div>
                <div
                  className="g-resp"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                    gap: 16,
                  }}
                >
                  <div className="field">
                    <label htmlFor="cesta-detalhe-nome">Nome</label>
                    <input
                      id="cesta-detalhe-nome"
                      className="input"
                      defaultValue={selecionada.nome}
                      disabled={!podeGerir}
                      onBlur={(evento) =>
                        executar(() =>
                          acaoAtualizarCesta({
                            cestaId: selecionada.id,
                            nome: evento.target.value,
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="cesta-detalhe-perfil">Perfil-alvo</label>
                    <select
                      id="cesta-detalhe-perfil"
                      className="select"
                      defaultValue={selecionada.segmentoId ?? ""}
                      disabled={!podeGerir}
                      onChange={(evento) =>
                        executar(() =>
                          acaoAtualizarCesta({
                            cestaId: selecionada.id,
                            segmentoId: evento.target.value || null,
                          }),
                        )
                      }
                    >
                      <option value="">Sem perfil definido</option>
                      {segmentos.map((segmento) => (
                        <option value={segmento.id} key={segmento.id}>
                          {segmento.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="cesta-detalhe-narrativa">Narrativa</label>
                    <textarea
                      id="cesta-detalhe-narrativa"
                      className="textarea"
                      rows={2}
                      defaultValue={selecionada.narrativa ?? ""}
                      disabled={!podeGerir}
                      onBlur={(evento) =>
                        executar(() =>
                          acaoAtualizarCesta({
                            cestaId: selecionada.id,
                            narrativa: evento.target.value,
                          }),
                        )
                      }
                    />
                    <span className="hint">Aparece nas peças e no manifesto do kit.</span>
                  </div>
                </div>
              </div>

              {!selecionada.liberada ? (
                <div
                  className="aviso-inline"
                  style={{
                    background: "var(--alerta-claro)",
                    borderColor: "var(--alerta)",
                    margin: 0,
                  }}
                >
                  <span>
                    {selecionada.bloqueiam.length > 0 ? (
                      <>
                        Esta cesta tem oferta <b>não publicada</b> ({selecionada.bloqueiam.join(", ")})
                        — enquanto isso ela não entra em campanha (RN41). Publique a oferta ou
                        retire-a da cesta.
                      </>
                    ) : (
                      <>Cesta vazia — adicione ofertas publicadas para ela entrar em campanha (RN41).</>
                    )}
                  </span>
                </div>
              ) : null}

              <div className="card" style={{ padding: "20px 22px" }}>
                <h2 className="h-el" style={{ marginBottom: 12 }}>
                  Ofertas da cesta{" "}
                  <span className="cap" style={{ fontWeight: 400 }}>
                    · como aparecem na vitrine
                  </span>
                </h2>
                {selecionada.ofertas.length === 0 ? (
                  <div className="vazio" style={{ padding: "22px 10px" }}>
                    <p className="cap" style={{ maxWidth: "52ch", margin: 0 }}>
                      Nenhuma oferta ainda. Adicione pelas sugestões abaixo ou pela busca — a
                      cesta só entra em campanha com todas as ofertas publicadas (RN41).
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(206px, 1fr))",
                      gap: 14,
                    }}
                  >
                    {selecionada.ofertas.map((oferta) => (
                      <div className="vcard" style={{ width: "auto" }} key={oferta.id}>
                        <div className="corpo">
                          <div className="cat">{oferta.categoria ?? oferta.aliado}</div>
                          <div className="tit">{oferta.titulo}</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span className="por">{moeda(oferta.precoPor) ?? "—"}</span>
                            {oferta.precoDe ? <span className="de">{moeda(oferta.precoDe)}</span> : null}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                              marginTop: 4,
                            }}
                          >
                            <span
                              className={
                                oferta.status === "PUBLICADA" ? "pill pill-ok" : "pill pill-warn"
                              }
                            >
                              <i />
                              {oferta.status === "PUBLICADA" ? "Publicada" : oferta.status}
                            </span>
                            {podeGerir && !selecionada.emCampanhaAtiva ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={pendente}
                                onClick={() =>
                                  executar(() =>
                                    acaoAlternarOfertaDaCesta({
                                      cestaId: selecionada.id,
                                      ofertaId: oferta.id,
                                      incluir: false,
                                    }),
                                  )
                                }
                              >
                                Retirar
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {podeGerir && !selecionada.emCampanhaAtiva ? (
                <div className="card" style={{ padding: "20px 22px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <h2 className="h-el">Adicionar ofertas</h2>
                    <div style={{ flex: 1 }} />
                    <input
                      className="input"
                      style={{ width: 220 }}
                      placeholder="Buscar oferta publicada…"
                      aria-label="Buscar oferta para a cesta"
                      value={busca}
                      onChange={(evento) => setBusca(evento.target.value)}
                    />
                  </div>

                  {sugeridas.length > 0 ? (
                    <>
                      <div
                        className="cap"
                        style={{
                          textTransform: "uppercase",
                          letterSpacing: ".06em",
                          fontWeight: 700,
                          margin: "4px 0 8px",
                        }}
                      >
                        Sugeridas para o perfil-alvo
                      </div>
                      <p className="cap" style={{ margin: "0 0 10px" }}>
                        Casamento por taxonomia com o perfil-alvo — assistivo, decisão humana
                        (RN42).
                      </p>
                    </>
                  ) : null}

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(busca.trim() ? filtradas : [...sugeridas, ...filtradas.slice(0, 8)])
                      .filter(
                        (oferta, indice, lista) =>
                          lista.findIndex((o) => o.id === oferta.id) === indice,
                      )
                      .map((oferta) => (
                        <div className="cont-it" key={oferta.id}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ font: "var(--font-body-label-bold)" }}>
                              {oferta.titulo}
                            </div>
                            <div className="cap">{oferta.aliado}</div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {oferta.sugestao ? (
                              <span className="pill pill-info">sugerida · {oferta.sugestao}</span>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ flex: "none" }}
                              disabled={pendente}
                              onClick={() =>
                                executar(() =>
                                  acaoAlternarOfertaDaCesta({
                                    cestaId: selecionada.id,
                                    ofertaId: oferta.id,
                                    incluir: true,
                                  }),
                                )
                              }
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
