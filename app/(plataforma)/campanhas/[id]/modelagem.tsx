"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CampoConstrutor,
  ConstrutorFiltros,
  type RegraConstrutor,
  useContagemViva,
} from "../../assinantes/construtor-filtros";
import {
  acaoAlternarConteudo,
  acaoAtivarCampanha,
  acaoAtualizarCampanha,
  acaoDefinirMeta,
  acaoRemoverMeta,
  acaoRemoverPeca,
  acaoSalvarPeca,
} from "../acoes";

/**
 * T23 — Criação/edição de campanha (protótipo v7.1): navegação de seções
 * com Público, Conteúdo, Peças, Metas e Revisão e ativação.
 *
 * O construtor de filtros é o COMPONENTE DA F11 IMPORTADO — a contagem
 * viva aqui é o simulador de alcance da ficha §5, sem uma linha de
 * filtro nova. As sugestões da RN42 chegam prontas do servidor,
 * rotuladas como sugestão: aceitar é ato humano, um clique de cada vez.
 */

export interface ItemConteudo {
  id: string;
  nome: string;
  detalhe: string;
  vinculado: boolean;
  bloqueada?: boolean;
  motivoBloqueio?: string | null;
  sugestao?: string | null;
}

export interface PecaExibida {
  id: string;
  formatoSlug: string;
  formatoNome: string;
  titulo: string;
  texto: string | null;
  temImagem: boolean;
}

export interface MetaExibida {
  id: string;
  tipo: "RESGATES" | "CONVERSAO_PCT" | "ALIADOS_PARTICIPANTES" | "OFERTAS_ATIVAS";
  rotulo: string;
  alvo: string;
  nota: string;
}

export interface PortaExibida {
  chave: string;
  atendida: boolean;
  texto: string;
}

const SECOES = [
  { id: "publico", rotulo: "Público", resumo: "quem recebe" },
  { id: "conteudo", rotulo: "Conteúdo", resumo: "cestas e ofertas" },
  { id: "pecas", rotulo: "Peças", resumo: "criativos do kit" },
  { id: "metas", rotulo: "Metas", resumo: "o que se espera" },
  { id: "revisao", rotulo: "Revisão e ativação", resumo: "o que a Minutrade recebe" },
] as const;

type Secao = (typeof SECOES)[number]["id"];

const TIPOS_META = [
  { valor: "RESGATES", rotulo: "Resgates" },
  { valor: "CONVERSAO_PCT", rotulo: "Conversão %" },
  { valor: "ALIADOS_PARTICIPANTES", rotulo: "Aliados participantes" },
  { valor: "OFERTAS_ATIVAS", rotulo: "Ofertas ativas" },
] as const;

function IconeEscudo() {
  return (
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  );
}

function IconeInfo() {
  return (
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
  );
}

export function ModelagemCampanha({
  campanha,
  campos,
  segmentos,
  formatos,
  cestas,
  ofertas,
  pecas,
  metas,
  portas,
  resumoKit,
}: {
  campanha: {
    id: string;
    nome: string;
    objetivo: string | null;
    origemPublico: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
    segmentoId: string | null;
    regrasPublico: RegraConstrutor[];
    vigenciaInicio: string | null;
    vigenciaFim: string | null;
    instrucoes: string | null;
  };
  campos: ReadonlyArray<CampoConstrutor>;
  segmentos: ReadonlyArray<{ id: string; nome: string }>;
  formatos: ReadonlyArray<{ slug: string; nome: string }>;
  cestas: ReadonlyArray<ItemConteudo>;
  ofertas: ReadonlyArray<ItemConteudo>;
  pecas: ReadonlyArray<PecaExibida>;
  metas: ReadonlyArray<MetaExibida>;
  portas: ReadonlyArray<PortaExibida>;
  resumoKit: ReadonlyArray<{ item: string; valor: string }>;
}) {
  const [secao, setSecao] = useState<Secao>("publico");
  const [origem, setOrigem] = useState(campanha.origemPublico);
  const [segmentoId, setSegmentoId] = useState(campanha.segmentoId ?? "");
  const [regras, setRegras] = useState<RegraConstrutor[]>(campanha.regrasPublico);
  const [erros, setErros] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tipoMeta, setTipoMeta] = useState<MetaExibida["tipo"]>("RESGATES");
  const [alvoMeta, setAlvoMeta] = useState("");
  const [confirmandoAtivacao, setConfirmandoAtivacao] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  const regrasDoSegmento = origem === "SEGMENTO_SALVO";
  const contagem = useContagemViva(regras);
  const indiceSecao = SECOES.findIndex((item) => item.id === secao);

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

  const salvarPublico = () =>
    executar(() =>
      acaoAtualizarCampanha({
        campanhaId: campanha.id,
        origemPublico: origem,
        segmentoId: regrasDoSegmento ? segmentoId || null : null,
        regrasPublico: regrasDoSegmento ? undefined : regras,
      }),
    );

  const conteudoSelecionado = useMemo(
    () =>
      [...cestas, ...ofertas].filter((item) => item.vinculado).map((item) => item.nome).join(", ") ||
      "nada selecionado ainda",
    [cestas, ofertas],
  );

  const todasAtendidas = portas.every((porta) => porta.atendida);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1280 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/campanhas">Campanhas</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>{campanha.nome}</b>
      </div>
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
          <h1 className="h-page">{campanha.nome}</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Rascunho · a plataforma não dispara nada: a ativação congela o público e gera o kit
            para a Minutrade
          </div>
        </div>
      </div>

      {erros.length > 0 ? (
        <div
          className="aviso-inline"
          style={{ background: "var(--alerta-claro)", borderColor: "var(--alerta)" }}
          role="alert"
        >
          <IconeEscudo />
          <span>{erros.join(" ")}</span>
        </div>
      ) : null}
      {aviso ? (
        <div className="aviso-inline" role="status">
          <IconeInfo />
          <span>{aviso}</span>
        </div>
      ) : null}

      <div
        className="g-resp"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,232px) minmax(0,1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <nav className="sec-nav" aria-label="Seções da campanha">
          {SECOES.map((item, indice) => (
            <button
              type="button"
              key={item.id}
              className={`sec-it${item.id === secao ? " on" : ""}`}
              aria-current={item.id === secao ? "step" : undefined}
              onClick={() => setSecao(item.id)}
            >
              <span className="sec-mk">{indice + 1}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block" }}>{item.rotulo}</span>
                <span className="cap" style={{ display: "block" }}>
                  {item.resumo}
                </span>
              </span>
            </button>
          ))}
        </nav>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {secao === "publico" ? (
            <>
              <div className="aviso-inline">
                <IconeEscudo />
                <span>
                  O público será <b>congelado na ativação</b> — o kit leva o snapshot da lista,
                  com autor, data, contagem e finalidade (RN34/RN38). Até lá, a contagem é viva.
                </span>
              </div>
              <div className="card" style={{ padding: "20px 22px" }}>
                <h2 className="h-el" style={{ marginBottom: 12 }}>
                  Público
                </h2>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}
                >
                  <label className={`radio-card${regrasDoSegmento ? " on" : ""}`}>
                    <input
                      type="radio"
                      name="origemPublico"
                      value="SEGMENTO_SALVO"
                      checked={regrasDoSegmento}
                      onChange={() => setOrigem("SEGMENTO_SALVO")}
                    />
                    <span>
                      <b>Usar um segmento salvo</b>
                      <div className="cap">
                        Os segmentos da carteira já são públicos reutilizáveis.
                      </div>
                    </span>
                  </label>
                  <label className={`radio-card${regrasDoSegmento ? "" : " on"}`}>
                    <input
                      type="radio"
                      name="origemPublico"
                      value="REGRAS_PROPRIAS"
                      checked={!regrasDoSegmento}
                      onChange={() => setOrigem("REGRAS_PROPRIAS")}
                    />
                    <span>
                      <b>Montar filtros agora</b>
                      <div className="cap">
                        Mesmo construtor da carteira — a contagem acima é o simulador de alcance.
                      </div>
                    </span>
                  </label>
                </div>

                {regrasDoSegmento ? (
                  <div className="field" style={{ maxWidth: 420 }}>
                    <label htmlFor="campanha-segmento">Segmento</label>
                    <select
                      id="campanha-segmento"
                      className="select"
                      value={segmentoId}
                      onChange={(evento) => setSegmentoId(evento.target.value)}
                    >
                      <option value="">Selecionar…</option>
                      {segmentos.map((segmento) => (
                        <option value={segmento.id} key={segmento.id}>
                          {segmento.nome}
                        </option>
                      ))}
                    </select>
                    <span className="hint">
                      A regra do segmento é copiada para a campanha — editar aqui não altera o
                      segmento salvo.
                    </span>
                  </div>
                ) : (
                  <ConstrutorFiltros
                    campos={campos}
                    regras={regras}
                    aoMudar={setRegras}
                    contagem={contagem}
                    textoContagemVazia="assinantes alcançados — nenhum filtro aplicado"
                    textoContagemFiltrada="assinantes alcançados por este público"
                  />
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-azul"
                    onClick={salvarPublico}
                    disabled={pendente}
                  >
                    Salvar público
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {secao === "conteudo" ? (
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
                <h2 className="h-el">Conteúdo da campanha</h2>
                <span className="cap">cestas e ofertas avulsas</span>
              </div>
              <div className="aviso-inline">
                <IconeInfo />
                <span>
                  <b>Sugeridas para este público</b> — o casamento é por taxonomia: cultura,
                  cobertura e preferência. A recomendação é assistiva; a escolha é sua (RN42).
                </span>
              </div>

              <div
                className="cap"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  fontWeight: 700,
                  margin: "4px 0 8px",
                }}
              >
                Cestas
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}
              >
                {cestas.length === 0 ? (
                  <p className="cap" style={{ margin: 0 }}>
                    Nenhuma cesta criada ainda — <Link href="/campanhas/cestas">criar cesta</Link>.
                  </p>
                ) : (
                  cestas.map((cesta) => (
                    <div className="cont-it" key={cesta.id}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: "var(--font-body-label-bold)" }}>{cesta.nome}</div>
                        <div className="cap">{cesta.detalhe}</div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flex: "none",
                          flexWrap: "wrap",
                        }}
                      >
                        {cesta.sugestao ? (
                          <span className="pill pill-info">sugerida · {cesta.sugestao}</span>
                        ) : null}
                        {cesta.bloqueada ? (
                          <span className="pill pill-warn">
                            <i />
                            {cesta.motivoBloqueio ?? "oferta não publicada"}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={cesta.vinculado ? "btn btn-ghost btn-sm" : "btn btn-azul btn-sm"}
                          disabled={pendente || (cesta.bloqueada && !cesta.vinculado)}
                          onClick={() =>
                            executar(() =>
                              acaoAlternarConteudo({
                                campanhaId: campanha.id,
                                tipo: "CESTA",
                                id: cesta.id,
                                vincular: !cesta.vinculado,
                              }),
                            )
                          }
                        >
                          {cesta.vinculado ? "Remover" : "Adicionar"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                className="cap"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  fontWeight: 700,
                  margin: "4px 0 8px",
                }}
              >
                Ofertas avulsas
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ofertas.length === 0 ? (
                  <p className="cap" style={{ margin: 0 }}>
                    Nenhuma oferta publicada disponível.
                  </p>
                ) : (
                  ofertas.map((oferta) => (
                    <div className="cont-it" key={oferta.id}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: "var(--font-body-label-bold)" }}>{oferta.nome}</div>
                        <div className="cap">{oferta.detalhe}</div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flex: "none",
                          flexWrap: "wrap",
                        }}
                      >
                        {oferta.sugestao ? (
                          <span className="pill pill-info">sugerida · {oferta.sugestao}</span>
                        ) : null}
                        <button
                          type="button"
                          className={
                            oferta.vinculado ? "btn btn-ghost btn-sm" : "btn btn-azul btn-sm"
                          }
                          disabled={pendente}
                          onClick={() =>
                            executar(() =>
                              acaoAlternarConteudo({
                                campanhaId: campanha.id,
                                tipo: "OFERTA",
                                id: oferta.id,
                                vincular: !oferta.vinculado,
                              }),
                            )
                          }
                        >
                          {oferta.vinculado ? "Remover" : "Adicionar"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <p className="cap" style={{ margin: "14px 0 0" }}>
                Selecionadas: {conteudoSelecionado}
              </p>
            </div>
          ) : null}

          {secao === "pecas" ? (
            <div className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el">Peças da campanha</h2>
              <p className="cap" style={{ margin: "4px 0 14px" }}>
                As peças viajam no kit — a plataforma não dispara nada (RN39). Formatos vêm da
                lista de domínio &quot;Formatos de peça&quot;.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {pecas.map((peca) => (
                  <div className="pc-item" key={peca.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ font: "var(--font-body-label-bold)" }}>
                          {peca.formatoNome} — {peca.titulo}
                        </div>
                        <div className="cap">{peca.texto ?? "sem texto"}</div>
                        <div className="cap">
                          {peca.temImagem ? "com imagem" : "sem imagem"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pendente}
                        onClick={() =>
                          executar(() =>
                            acaoRemoverPeca({ campanhaId: campanha.id, pecaId: peca.id }),
                          )
                        }
                      >
                        Remover peça
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form
                action={(dados) => {
                  dados.set("campanhaId", campanha.id);
                  iniciar(async () => {
                    const resposta = await acaoSalvarPeca(dados);
                    if (resposta.ok) {
                      setErros([]);
                      router.refresh();
                    } else {
                      setErros(resposta.erros);
                    }
                  });
                }}
                style={{ marginTop: 16 }}
              >
                <div
                  className="g-resp"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,180px) minmax(0,1fr)",
                    gap: 12,
                  }}
                >
                  <div className="field">
                    <label htmlFor="peca-formato">Formato</label>
                    <select id="peca-formato" className="select" name="formatoSlug" required>
                      {formatos.map((formato) => (
                        <option value={formato.slug} key={formato.slug}>
                          {formato.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="peca-titulo">Título</label>
                    <input id="peca-titulo" className="input" name="titulo" required />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="peca-texto">Texto</label>
                  <textarea id="peca-texto" className="textarea" name="texto" rows={3} />
                  <span className="hint">
                    Criativo genérico do Clube — nenhuma marca de terceiro na peça.
                  </span>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="peca-imagem">Imagem</label>
                  <input
                    id="peca-imagem"
                    type="file"
                    className="input"
                    name="imagem"
                    accept="image/*"
                    aria-describedby="peca-imagem-dica"
                  />
                  <span className="hint" id="peca-imagem-dica">
                    Selecione pelo teclado; a pré-visualização aparece na lista acima.
                  </span>
                </div>
                <button
                  type="submit"
                  className="btn btn-azul"
                  style={{ marginTop: 14 }}
                  disabled={pendente}
                >
                  + Adicionar peça
                </button>
              </form>
            </div>
          ) : null}

          {secao === "metas" ? (
            <div className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el" style={{ marginBottom: 4 }}>
                Metas da campanha
              </h2>
              <p className="cap" style={{ margin: "0 0 14px" }}>
                Múltiplas e opcionais. O realizado é calculado no nível de atribuição disponível
                (RN43/RN44).
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}
              >
                {metas.map((meta) => (
                  <div className="cont-it" key={meta.id}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: "var(--font-body-label-bold)" }}>
                        {meta.rotulo}: {meta.alvo}
                      </div>
                      <div className="cap">{meta.nota}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ flex: "none" }}
                      disabled={pendente}
                      onClick={() =>
                        executar(() =>
                          acaoRemoverMeta({ campanhaId: campanha.id, metaId: meta.id }),
                        )
                      }
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>

              <div
                className="g-resp"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) minmax(0,140px) minmax(0,150px)",
                  gap: 12,
                  alignItems: "end",
                }}
              >
                <div className="field">
                  <label htmlFor="meta-tipo">Tipo de meta</label>
                  <select
                    id="meta-tipo"
                    className="select"
                    value={tipoMeta}
                    onChange={(evento) => setTipoMeta(evento.target.value as MetaExibida["tipo"])}
                  >
                    {TIPOS_META.map((tipo) => (
                      <option value={tipo.valor} key={tipo.valor}>
                        {tipo.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="meta-alvo">Alvo</label>
                  <input
                    id="meta-alvo"
                    className="input num"
                    value={alvoMeta}
                    inputMode="numeric"
                    onChange={(evento) => setAlvoMeta(evento.target.value)}
                    placeholder="Ex.: 500"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pendente || !alvoMeta}
                  onClick={() =>
                    executar(() =>
                      acaoDefinirMeta({
                        campanhaId: campanha.id,
                        tipo: tipoMeta,
                        alvo: Number(alvoMeta.replace(",", ".")),
                      }),
                    )
                  }
                >
                  Adicionar meta
                </button>
              </div>
              {tipoMeta === "CONVERSAO_PCT" ? (
                <div className="aviso-inline" style={{ margin: "14px 0 0" }}>
                  <IconeInfo />
                  <span>
                    Conversão % exige o nível de atribuição por público —{" "}
                    <b>requer telemetria por CPF</b>. A meta pode ser registrada agora; o
                    realizado aparece como indisponível até a granularidade chegar (RN44).
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {secao === "revisao" ? (
            <div className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el" style={{ marginBottom: 4 }}>
                Revisão e ativação
              </h2>
              <p className="cap" style={{ margin: "0 0 14px" }}>
                O que a Minutrade vai receber quando você ativar.
              </p>

              <div
                className="g-resp"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div className="field">
                  <label htmlFor="campanha-vig-inicio">Vigência — início</label>
                  <input
                    id="campanha-vig-inicio"
                    type="date"
                    className="input num"
                    defaultValue={campanha.vigenciaInicio ?? ""}
                    onBlur={(evento) =>
                      executar(() =>
                        acaoAtualizarCampanha({
                          campanhaId: campanha.id,
                          vigenciaInicio: evento.target.value || null,
                        }),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="campanha-vig-fim">Vigência — fim</label>
                  <input
                    id="campanha-vig-fim"
                    type="date"
                    className="input num"
                    defaultValue={campanha.vigenciaFim ?? ""}
                    onBlur={(evento) =>
                      executar(() =>
                        acaoAtualizarCampanha({
                          campanhaId: campanha.id,
                          vigenciaFim: evento.target.value || null,
                        }),
                      )
                    }
                  />
                  <span className="hint">
                    Ofertas criadas para a campanha herdam esta vigência como sugestão.
                  </span>
                </div>
              </div>

              <div className="field" style={{ marginBottom: 16 }}>
                <label htmlFor="campanha-instrucoes">Instruções à operação</label>
                <textarea
                  id="campanha-instrucoes"
                  className="textarea"
                  rows={2}
                  defaultValue={campanha.instrucoes ?? ""}
                  onBlur={(evento) =>
                    executar(() =>
                      acaoAtualizarCampanha({
                        campanhaId: campanha.id,
                        instrucoes: evento.target.value || null,
                      }),
                    )
                  }
                />
                <span className="hint">Viajam no instrucoes.md do kit.</span>
              </div>

              <div
                className="g-resp"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                  gap: 16,
                }}
              >
                <div>
                  <div
                    className="cap"
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    Kit v1
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {resumoKit.map((linha) => (
                      <div className="kit-lin" key={linha.item}>
                        <span className="cap">{linha.item}</span>
                        <span style={{ fontWeight: 600, textAlign: "right" }}>{linha.valor}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div
                    className="cap"
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    O que a ativação exige
                  </div>
                  <ul
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                    }}
                  >
                    {portas.map((porta) => (
                      <li
                        key={porta.chave}
                        style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
                      >
                        <span className={`ck ${porta.atendida ? "ok" : "no"}`} aria-hidden="true">
                          {porta.atendida ? "✓" : "!"}
                        </span>
                        <span style={{ fontSize: 14, minWidth: 0 }}>
                          <span className="sr-oculto">
                            {porta.atendida ? "Requisito atendido: " : "Requisito pendente: "}
                          </span>
                          {porta.texto}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  borderTop: "1px solid var(--borda)",
                  paddingTop: 16,
                  marginTop: 16,
                }}
              >
                <button
                  type="button"
                  className="btn btn-azul"
                  disabled={!todasAtendidas || pendente}
                  onClick={() => setConfirmandoAtivacao(true)}
                >
                  Ativar campanha
                </button>
                <span className="cap" style={{ alignSelf: "center" }}>
                  Ativar congela o público e gera o kit v1 — o kit é imutável (RN45).
                </span>
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {indiceSecao > 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSecao(SECOES[indiceSecao - 1]!.id)}
              >
                ← {SECOES[indiceSecao - 1]!.rotulo}
              </button>
            ) : null}
            {indiceSecao < SECOES.length - 1 ? (
              <button
                type="button"
                className="btn btn-azul"
                onClick={() => setSecao(SECOES[indiceSecao + 1]!.id)}
              >
                {SECOES[indiceSecao + 1]!.rotulo} →
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {confirmandoAtivacao ? (
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
            if (evento.key === "Escape") setConfirmandoAtivacao(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ativar campanha"
            className="card"
            style={{ width: "min(520px, 100%)", padding: "22px 24px" }}
          >
            <h2 className="h-el" style={{ marginBottom: 6 }}>
              Ativar {campanha.nome}?
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              Ativar <b>congela o público</b> e <b>gera o kit v1</b> — a partir daí o kit é
              imutável e a execução é da Minutrade.
            </p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {resumoKit.map((linha) => (
                <div className="kit-lin" key={linha.item}>
                  <span className="cap">{linha.item}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{linha.valor}</span>
                </div>
              ))}
            </div>
            <div className="aviso-inline" style={{ margin: "14px 0 0" }}>
              <IconeEscudo />
              <span>
                O snapshot do público herda a permissão de exportar listas e a auditoria, com
                finalidade preenchida pelo nome da campanha (RN34).
              </span>
            </div>
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}
            >
              <button
                type="button"
                className="btn btn-ghost"
                autoFocus
                onClick={() => setConfirmandoAtivacao(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-azul"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const resposta = await acaoAtivarCampanha({ campanhaId: campanha.id });
                    setConfirmandoAtivacao(false);
                    if (!resposta.ok) {
                      setErros(resposta.erros);
                      return;
                    }
                    if (resposta.resultado === "SOLICITADA") {
                      setAviso(
                        "A porta de aprovação está ligada: a ativação foi para a fila e o público só será congelado na aprovação.",
                      );
                      router.refresh();
                    } else {
                      router.push(`/campanhas/${campanha.id}/painel`);
                    }
                  })
                }
              >
                Ativar e gerar kit v1
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
