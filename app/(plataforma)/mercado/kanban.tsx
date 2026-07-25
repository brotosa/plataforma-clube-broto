"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstagioEmpresa } from "@prisma/client";
import type { CardFunil } from "@/infra/consultas/funil";
import { podeAvaliarNoEstagio } from "@/dominio/avaliacao/regras";
import {
  acaoDescartarEmpresa,
  acaoHandoffParaNegociacao,
  acaoMoverNoFunil,
  acaoReativarDescartada,
  type EstadoAcaoFunil,
} from "./acoes";

/**
 * T8 — kanban e tabela do funil (client): menu por card com "Mover para
 * {estágio}" e "Descartar" (modal com os motivos tipificados, RN17) e
 * handoff com comercial designado (RN16). Todo o fluxo é operável por
 * teclado: Tab alcança o gatilho do card, Enter abre o menu, Esc fecha e
 * devolve o foco ao gatilho (e2e cobre o caminho completo).
 */

export interface OpcaoMotivo {
  id: string;
  slug: string;
  nome: string;
}

export interface OpcaoResponsavel {
  id: string;
  nome: string;
}

interface Lane {
  estagio: EstagioEmpresa;
  rotulo: string;
  cards: CardFunil[];
}

const ROTULO_DESTINO: Partial<Record<EstagioEmpresa, string>> = {
  MAPEADA: "Mapeada",
  EM_AVALIACAO: "Em avaliação",
  PRIORIZADA: "Priorizada",
  EM_NEGOCIACAO: "Em negociação",
};

function classeDias(card: CardFunil): string {
  if (card.envelhecimento === "FORTE") return "pill age-f";
  if (card.envelhecimento === "LEVE") return "pill age-l";
  return "cap num";
}

export function KanbanFunil({
  lanes,
  tabela,
  visao,
  motivosDescarte,
  responsaveisComerciais,
  usuarioId,
}: {
  lanes: Lane[];
  tabela: CardFunil[];
  visao: "kanban" | "tabela";
  motivosDescarte: OpcaoMotivo[];
  responsaveisComerciais: OpcaoResponsavel[];
  usuarioId: string;
}) {
  const roteador = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const [descarteDe, setDescarteDe] = useState<CardFunil | null>(null);
  const [handoffDe, setHandoffDe] = useState<CardFunil | null>(null);
  const [toast, setToast] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const gatilhoRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!toast) return;
    const temporizador = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(temporizador);
  }, [toast]);

  // Clique fora fecha o menu do card.
  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (evento: MouseEvent) => {
      if (!menuRef.current?.contains(evento.target as Node)) {
        setMenuAberto(null);
      }
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [menuAberto]);

  function aplicarResultado(resultado: EstadoAcaoFunil) {
    if (resultado.erros?.length) {
      setToast({ tipo: "erro", texto: resultado.erros.join(" ") });
    } else if (resultado.sucesso) {
      setToast({ tipo: "ok", texto: resultado.sucesso });
    }
  }

  function abrirMenu(card: CardFunil, gatilho: HTMLButtonElement) {
    gatilhoRef.current = gatilho;
    setMenuAberto((atual) => (atual === card.id ? null : card.id));
  }

  function fecharMenuDevolvendoFoco() {
    setMenuAberto(null);
    gatilhoRef.current?.focus();
  }

  function mover(card: CardFunil, destino: EstagioEmpresa) {
    setMenuAberto(null);
    if (destino === "EM_NEGOCIACAO") {
      // RN16: Em negociação exige responsável comercial designado.
      setHandoffDe(card);
      return;
    }
    iniciarTransicao(async () => {
      aplicarResultado(
        await acaoMoverNoFunil({
          empresaId: card.id,
          destino: destino as "MAPEADA" | "EM_AVALIACAO" | "PRIORIZADA",
        }),
      );
    });
  }

  function abrirFicha(id: string) {
    roteador.push(`/aliados/${id}`);
  }

  function abrirAvaliacao(id: string) {
    roteador.push(`/mercado/${id}/avaliacao`);
  }

  return (
    <>
      {visao === "kanban" ? (
        <div className="kb-grid">
          {lanes.map((lane) => (
            <div className="kb-lane" key={lane.estagio}>
              <div className="kb-col-h">
                <span>{lane.rotulo}</span>
                <span className="pill pill-neutra num" style={{ background: "var(--branco)" }}>
                  {lane.cards.length}
                </span>
              </div>
              <div className="kb-cards">
                {lane.cards.length === 0 ? (
                  <div className="kb-drop">mova empresas para cá</div>
                ) : null}
                {lane.cards.map((card) => (
                  <CardDoFunil
                    card={card}
                    key={card.id}
                    aberto={menuAberto === card.id}
                    pendente={pendente}
                    menuRef={menuAberto === card.id ? menuRef : undefined}
                    aoAbrirMenu={abrirMenu}
                    aoFecharMenu={fecharMenuDevolvendoFoco}
                    aoMover={mover}
                    aoDescartar={(alvo) => {
                      setMenuAberto(null);
                      setDescarteDe(alvo);
                    }}
                    aoAbrirFicha={abrirFicha}
                    aoAbrirAvaliacao={abrirAvaliacao}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl tbl-resp">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>Empresa</th>
                <th>Estágio</th>
                <th>Categoria-alvo</th>
                <th>Origem</th>
                <th style={{ textAlign: "right" }}>Score</th>
                <th>Responsável</th>
                <th>Dias no estágio</th>
                <th style={{ width: 120 }}>
                  <span className="sr-oculto">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tabela.map((linha) => (
                <tr key={linha.id}>
                  <td>
                    <a
                      href={`/aliados/${linha.id}`}
                      style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
                    >
                      {linha.nomeFantasia}
                      <span className="sr-oculto"> — abrir ficha da empresa</span>
                    </a>
                  </td>
                  <td data-label="Estágio">
                    <span
                      className={
                        linha.estagio === "DESCARTADA" ? "pill pill-neutra" : "pill pill-info"
                      }
                    >
                      <i aria-hidden="true" />
                      {linha.rotuloEstagio}
                    </span>
                  </td>
                  <td data-label="Categoria">
                    {linha.categorias.length > 0 ? (
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                        {linha.categorias.map((nome) => (
                          <span key={nome} className="tag-cat" style={{ fontSize: 10.5 }}>
                            {nome}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="cap">—</span>
                    )}
                  </td>
                  <td data-label="Origem" style={{ color: "var(--paragrafo-aaa)" }}>
                    {linha.rotuloOrigem ?? "—"}
                  </td>
                  <td data-label="Score" className="num" style={{ textAlign: "right", fontWeight: 700 }}>
                    {linha.score ?? "—"}
                  </td>
                  <td data-label="Responsável">{linha.responsavelNome ?? "—"}</td>
                  <td data-label="Dias">
                    <span className={classeDias(linha)} style={{ fontSize: 11 }}>
                      {linha.rotuloDias}
                    </span>
                  </td>
                  <td>
                    {linha.estagio === "DESCARTADA" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pendente}
                        title={linha.motivoDescarte ? `Motivo: ${linha.motivoDescarte}` : undefined}
                        onClick={() =>
                          iniciarTransicao(async () => {
                            aplicarResultado(await acaoReativarDescartada({ empresaId: linha.id }));
                          })
                        }
                      >
                        Reativar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {descarteDe ? (
        <ModalDescarte
          card={descarteDe}
          motivos={motivosDescarte}
          pendente={pendente}
          aoFechar={() => setDescarteDe(null)}
          aoConfirmar={(dados) =>
            iniciarTransicao(async () => {
              const resultado = await acaoDescartarEmpresa({ empresaId: descarteDe.id, ...dados });
              aplicarResultado(resultado);
              if (!resultado.erros) setDescarteDe(null);
            })
          }
        />
      ) : null}

      {handoffDe ? (
        <ModalHandoff
          card={handoffDe}
          responsaveis={responsaveisComerciais}
          usuarioId={usuarioId}
          pendente={pendente}
          aoFechar={() => setHandoffDe(null)}
          aoConfirmar={(responsavelComercialId) =>
            iniciarTransicao(async () => {
              const resultado = await acaoHandoffParaNegociacao({
                empresaId: handoffDe.id,
                responsavelComercialId,
              });
              aplicarResultado(resultado);
              if (!resultado.erros) setHandoffDe(null);
            })
          }
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status">
          {toast.tipo === "ok" ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--verde)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--erro)" strokeWidth="3" strokeLinecap="round">
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

/**
 * Card do kanban. O menu segue o padrão de menu acessível: Enter no
 * gatilho abre e move o foco ao primeiro item; Esc fecha e devolve o foco
 * ao gatilho; "Mover para Em negociação" abre o modal de handoff (RN16).
 */
function CardDoFunil({
  card,
  aberto,
  pendente,
  menuRef,
  aoAbrirMenu,
  aoFecharMenu,
  aoMover,
  aoDescartar,
  aoAbrirFicha,
  aoAbrirAvaliacao,
}: {
  card: CardFunil;
  aberto: boolean;
  pendente: boolean;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  aoAbrirMenu: (card: CardFunil, gatilho: HTMLButtonElement) => void;
  aoFecharMenu: () => void;
  aoMover: (card: CardFunil, destino: EstagioEmpresa) => void;
  aoDescartar: (card: CardFunil) => void;
  aoAbrirFicha: (id: string) => void;
  aoAbrirAvaliacao: (id: string) => void;
}) {
  const primeiroItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (aberto) {
      primeiroItemRef.current?.focus();
    }
  }, [aberto]);

  const podeDescartar = card.estagio !== "EM_APROVACAO";
  return (
    <div className={aberto ? "kb-card menu-aberto" : "kb-card"}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <a
          href={`/aliados/${card.id}`}
          style={{
            fontWeight: 600,
            flex: 1,
            fontSize: 14,
            lineHeight: 1.35,
            color: "inherit",
            textDecoration: "none",
          }}
        >
          {card.nomeFantasia}
          <span className="sr-oculto"> — abrir ficha da empresa</span>
        </a>
        <button
          type="button"
          className="kb-dots"
          aria-label={`Ações de ${card.nomeFantasia} (mover, descartar, abrir)`}
          aria-haspopup="menu"
          aria-expanded={aberto}
          onClick={(evento) => aoAbrirMenu(card, evento.currentTarget)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      </div>
      <div className="kb-cat">
        {card.categorias.length > 0 ? card.categorias.join(" · ") : "sem categoria-alvo"}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 10,
          paddingTop: 10,
          borderTop: "1px solid var(--borda)",
        }}
      >
        <span className={card.score === null ? "score-chip vazio" : "score-chip"}>
          {card.score === null ? "score —" : `score ${card.score}`}
        </span>
        <span
          className="cap"
          style={{
            fontSize: 11.5,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
          title={card.rotuloOrigem ? `Origem: ${card.rotuloOrigem}` : "Origem não informada"}
        >
          {card.rotuloOrigem ? `via ${card.rotuloOrigem}` : "origem —"}
        </span>
        <span style={{ flex: 1 }} />
        <span className={classeDias(card)} style={{ fontSize: 11 }}>
          {card.rotuloDias}
          {card.envelhecimento ? (
            <span className="sr-oculto">
              {card.envelhecimento === "FORTE"
                ? " (envelhecimento forte no estágio)"
                : " (envelhecimento leve no estágio)"}
            </span>
          ) : null}
        </span>
      </div>
      <div className="cap" style={{ marginTop: 6, fontSize: 11.5 }}>
        {card.responsavelNome ? `Responsável: ${card.responsavelNome}` : "sem responsável"}
      </div>
      {aberto ? (
        <div
          ref={menuRef}
          className="kb-menu"
          role="menu"
          aria-label={`Ações de ${card.nomeFantasia}`}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") {
              evento.stopPropagation();
              aoFecharMenu();
            }
          }}
        >
          {card.destinosDeMovimento.map((destino, indice) => (
            <button
              key={destino}
              type="button"
              role="menuitem"
              ref={indice === 0 ? primeiroItemRef : undefined}
              disabled={pendente}
              onClick={() => aoMover(card, destino)}
            >
              Mover para {ROTULO_DESTINO[destino] ?? destino}
            </button>
          ))}
          {card.estagio === "PRIORIZADA" ? (
            <button
              type="button"
              role="menuitem"
              disabled={pendente}
              onClick={() => aoMover(card, "EM_NEGOCIACAO")}
            >
              Mover para Em negociação
            </button>
          ) : null}
          {podeDescartar ? (
            <button
              type="button"
              role="menuitem"
              ref={card.destinosDeMovimento.length === 0 ? primeiroItemRef : undefined}
              disabled={pendente}
              onClick={() => aoDescartar(card)}
            >
              Descartar (motivo obrigatório)
            </button>
          ) : (
            <div className="cap" style={{ padding: "8px 10px" }}>
              Aguardando decisão na fila de aprovação (RN06/RN20).
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            ref={!podeDescartar && card.destinosDeMovimento.length === 0 ? primeiroItemRef : undefined}
            onClick={() => aoAbrirFicha(card.id)}
          >
            <b>Abrir ficha da empresa</b>
          </button>
          {podeAvaliarNoEstagio(card.estagio) ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => aoAbrirAvaliacao(card.id)}
            >
              Avaliar (ScoutCB)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Modal de descarte (RN17): motivo tipificado; "Outro" exige descrição. */
function ModalDescarte({
  card,
  motivos,
  pendente,
  aoFechar,
  aoConfirmar,
}: {
  card: CardFunil;
  motivos: OpcaoMotivo[];
  pendente: boolean;
  aoFechar: () => void;
  aoConfirmar: (dados: {
    motivoDescarteId: string;
    descricao: string | null;
    comentario: string | null;
  }) => void;
}) {
  const [motivoId, setMotivoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [comentario, setComentario] = useState("");
  const primeiroCampoRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    primeiroCampoRef.current?.focus();
  }, []);

  const motivoSelecionado = motivos.find((motivo) => motivo.id === motivoId);
  const exigeDescricao = motivoSelecionado?.slug === "OUTRO";
  const invalido = !motivoId || (exigeDescricao && !descricao.trim());

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
        aria-label={`Descartar ${card.nomeFantasia}`}
        className="card"
        style={{ width: "min(480px,100%)", padding: "22px 24px", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 className="h-el" style={{ marginBottom: 6 }}>
          Descartar {card.nomeFantasia}
        </h2>
        <p className="cap" style={{ margin: "0 0 14px" }}>
          Descarte é ato humano explícito: motivo tipificado obrigatório, registrado na
          auditoria com autor e data (RN17).
        </p>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="descarte-motivo">Motivo</label>
          <select
            id="descarte-motivo"
            ref={primeiroCampoRef}
            className="select"
            value={motivoId}
            onChange={(evento) => setMotivoId(evento.target.value)}
          >
            <option value="">Selecionar…</option>
            {motivos.map((motivo) => (
              <option key={motivo.id} value={motivo.id}>
                {motivo.nome}
              </option>
            ))}
          </select>
        </div>
        {exigeDescricao ? (
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="descarte-descricao">
              Descrição do motivo <span className="cap" style={{ fontWeight: 400 }}>· obrigatória</span>
            </label>
            <textarea
              id="descarte-descricao"
              className="textarea"
              rows={2}
              value={descricao}
              onChange={(evento) => setDescricao(evento.target.value)}
            />
          </div>
        ) : null}
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="descarte-comentario">
            Comentário <span className="cap" style={{ fontWeight: 400 }}>· opcional</span>
          </label>
          <textarea
            id="descarte-comentario"
            className="textarea"
            rows={2}
            value={comentario}
            onChange={(evento) => setComentario(evento.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-azul"
            disabled={invalido || pendente}
            onClick={() =>
              aoConfirmar({
                motivoDescarteId: motivoId,
                descricao: descricao.trim() || null,
                comentario: comentario.trim() || null,
              })
            }
          >
            Descartar empresa
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal de handoff (RN16): Em negociação exige responsável comercial. */
function ModalHandoff({
  card,
  responsaveis,
  usuarioId,
  pendente,
  aoFechar,
  aoConfirmar,
}: {
  card: CardFunil;
  responsaveis: OpcaoResponsavel[];
  usuarioId: string;
  pendente: boolean;
  aoFechar: () => void;
  aoConfirmar: (responsavelComercialId: string) => void;
}) {
  const proprio = responsaveis.find((responsavel) => responsavel.id === usuarioId);
  const [responsavelId, setResponsavelId] = useState(proprio?.id ?? "");
  const campoRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    campoRef.current?.focus();
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
        aria-label={`Mover ${card.nomeFantasia} para Em negociação`}
        className="card"
        style={{ width: "min(480px,100%)", padding: "22px 24px", boxShadow: "var(--shadow-lg)" }}
      >
        <h2 className="h-el" style={{ marginBottom: 6 }}>
          Mover {card.nomeFantasia} para Em negociação
        </h2>
        <p className="cap" style={{ margin: "0 0 14px" }}>
          Em negociação exige responsável comercial designado (RN16): o Comercial assume
          para si; o Gestor pode designar alguém do time.
        </p>
        <div className="field" style={{ marginBottom: 16 }}>
          <label htmlFor="handoff-responsavel">Responsável comercial</label>
          <select
            id="handoff-responsavel"
            ref={campoRef}
            className="select"
            value={responsavelId}
            onChange={(evento) => setResponsavelId(evento.target.value)}
          >
            <option value="">Selecionar…</option>
            {responsaveis.map((responsavel) => (
              <option key={responsavel.id} value={responsavel.id}>
                {responsavel.nome}
                {responsavel.id === usuarioId ? " (você)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-azul"
            disabled={!responsavelId || pendente}
            onClick={() => aoConfirmar(responsavelId)}
          >
            Confirmar handoff
          </button>
        </div>
      </div>
    </div>
  );
}
