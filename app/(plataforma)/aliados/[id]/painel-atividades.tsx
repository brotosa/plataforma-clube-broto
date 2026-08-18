"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ComentarioDoFeed, UsuarioMencionavel } from "@/infra/consultas/comentarios";
import {
  acaoAdicionarComentario,
  acaoEditarComentario,
  acaoRemoverComentario,
  acaoResolverPendencia,
  type EstadoAcaoComentario,
} from "./acoes-comentarios";

/**
 * Painel de atividades da ficha do aliado (pós-homologação). Coluna recuável
 * à direita, persistente em todas as abas porque vive no shell da ficha.
 *
 * - Larga (≥1100px): rail fixo ao lado do conteúdo, recolhível numa faixa
 *   fina com o contador; o estado é lembrado por usuário (localStorage).
 * - Estreita (<1100px): a faixa abre uma gaveta sobreposta (não encolhe o
 *   conteúdo), no mesmo padrão da gaveta de histórico do Scouting.
 *
 * Comentar/editar/apagar/pendência passam pelos casos de uso com RBAC e
 * auditoria; aqui é só a interface. Leitura só lê (`podeComentar` = false).
 */

const CHAVE_ABERTO = "painel-atividades-aberto";

// Dois limites, de propósito:
// • LARGURA_RAIL (1280): quando ABERTA, a coluna é rail em linha (≥1280) ou
//   gaveta sobreposta (<1280). No rail o conteúdo aperta, então as tabelas de
//   texto da ficha viram regiões roláveis focáveis por teclado (senão o axe
//   reprova scrollable-region-focusable ao estreitar).
// • LARGURA_GRANDE (1600): só em tela grande a coluna **abre sozinha** e a
//   faixa recolhida fica no fluxo. No laptop (1280–1599) ela nasce recolhida
//   numa aba flutuante que não come conteúdo — e vira coluna quando o usuário
//   abre. O estado escolhido é lembrado por usuário.
const LARGURA_RAIL = 1280;
const LARGURA_GRANDE = 1600;
const MQ_ESTREITO = `(max-width: ${LARGURA_RAIL - 1}px)`;
const MQ_GRANDE = `(min-width: ${LARGURA_GRANDE}px)`;

function formatarQuando(valor: Date | string): string {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Acompanha uma media query (após montar, para não divergir do SSR). */
function useMediaQuery(query: string): boolean {
  const [combina, setCombina] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const aplicar = () => setCombina(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [query]);
  return combina;
}

export function PainelAtividades({
  empresaId,
  comentarios,
  usuarios,
  usuarioAtualId,
  podeComentar,
}: {
  empresaId: string;
  comentarios: ComentarioDoFeed[];
  usuarios: UsuarioMencionavel[];
  usuarioAtualId: string;
  podeComentar: boolean;
}) {
  const estreito = useMediaQuery(MQ_ESTREITO);
  const grande = useMediaQuery(MQ_GRANDE);
  // Nasce recolhido; só abre sozinho em tela grande (≥1600). No laptop fica
  // recolhido até o usuário abrir. Depois de montar, respeita a última escolha.
  const [aberto, setAberto] = useState(false);
  const gavetaRef = useRef<HTMLDivElement | null>(null);
  const gatilhoRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE_ABERTO);
    if (salvo === "0") setAberto(false);
    else if (salvo === "1") setAberto(true);
    else setAberto(window.matchMedia(MQ_GRANDE).matches);
  }, []);

  function definirAberto(valor: boolean) {
    setAberto(valor);
    window.localStorage.setItem(CHAVE_ABERTO, valor ? "1" : "0");
  }

  // Na gaveta (estreito), Escape fecha e o foco entra no painel.
  useEffect(() => {
    if (!estreito || !aberto) return;
    const aoTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") definirAberto(false);
    };
    document.addEventListener("keydown", aoTecla);
    gavetaRef.current?.focus();
    return () => document.removeEventListener("keydown", aoTecla);
  }, [estreito, aberto]);

  const abertas = comentarios.filter(
    (comentario) => comentario.ehPendencia && comentario.pendenciaResolvidaEm === null,
  ).length;

  // Recolhido: faixa fina com o gatilho e os contadores.
  if (!aberto) {
    return (
      <aside
        className={grande ? "pa-strip" : "pa-strip pa-strip-flutuante"}
        aria-label="Painel de atividades (recolhido)"
      >
        <button
          ref={gatilhoRef}
          type="button"
          className="pa-strip-btn"
          aria-expanded={false}
          onClick={() => definirAberto(true)}
          title="Abrir atividades"
        >
          <IconeBalao />
          <span className="pa-strip-n">{comentarios.length}</span>
          {abertas > 0 ? <span className="pa-strip-dot" aria-hidden="true" /> : null}
          <span className="pa-strip-txt">Atividades</span>
        </button>
      </aside>
    );
  }

  const corpo = (
    <CorpoPainel
      empresaId={empresaId}
      comentarios={comentarios}
      usuarios={usuarios}
      usuarioAtualId={usuarioAtualId}
      podeComentar={podeComentar}
      abertas={abertas}
      aoRecolher={() => {
        definirAberto(false);
        gatilhoRef.current?.focus();
      }}
    />
  );

  // Estreito: gaveta sobreposta (não encolhe o conteúdo).
  if (estreito) {
    return (
      <>
        <div className="pa-scrim" aria-hidden="true" onClick={() => definirAberto(false)} />
        <div
          ref={gavetaRef}
          role="dialog"
          aria-modal="true"
          aria-label="Painel de atividades do aliado"
          tabIndex={-1}
          className="pa-gaveta"
        >
          {corpo}
        </div>
      </>
    );
  }

  // Largo: rail fixo ao lado do conteúdo.
  return <aside className="pa-rail" aria-label="Painel de atividades do aliado">{corpo}</aside>;
}

function CorpoPainel({
  empresaId,
  comentarios,
  usuarios,
  usuarioAtualId,
  podeComentar,
  abertas,
  aoRecolher,
}: {
  empresaId: string;
  comentarios: ComentarioDoFeed[];
  usuarios: UsuarioMencionavel[];
  usuarioAtualId: string;
  podeComentar: boolean;
  abertas: number;
  aoRecolher: () => void;
}) {
  const [toast, setToast] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function aplicar(resultado: EstadoAcaoComentario) {
    if (resultado.erros?.length) setToast({ tipo: "erro", texto: resultado.erros.join(" ") });
    else if (resultado.sucesso) setToast({ tipo: "ok", texto: resultado.sucesso });
  }

  return (
    <div className="pa-corpo">
      <header className="pa-h">
        <h2 className="h-el" style={{ margin: 0, fontSize: 15 }}>
          Atividades
        </h2>
        {abertas > 0 ? (
          <span className="pill pill-warn" title="Pendências abertas">
            <i aria-hidden="true" />
            {abertas} pendência{abertas > 1 ? "s" : ""}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={aoRecolher}
          aria-label="Recolher atividades"
          title="Recolher"
        >
          Recolher
        </button>
      </header>

      {podeComentar ? (
        <Composer empresaId={empresaId} usuarios={usuarios} usuarioAtualId={usuarioAtualId} aoResultado={aplicar} />
      ) : (
        <p className="cap" style={{ margin: "0 0 10px" }}>
          Seu papel acompanha o histórico da ficha, mas não registra comentários.
        </p>
      )}

      <div className="pa-feed">
        {comentarios.length === 0 ? (
          <p className="cap" style={{ margin: "14px 2px" }}>
            Nenhum comentário ainda. O que a equipe registrar aqui fica visível em todas as abas
            da ficha.
          </p>
        ) : (
          comentarios.map((comentario) => (
            <ItemComentario
              key={comentario.id}
              empresaId={empresaId}
              comentario={comentario}
              usuarios={usuarios}
              usuarioAtualId={usuarioAtualId}
              podeComentar={podeComentar}
              aoResultado={aplicar}
            />
          ))
        )}
      </div>

      {toast ? (
        <div className={`pa-toast ${toast.tipo === "erro" ? "erro" : ""}`} role="status">
          {toast.texto}
        </div>
      ) : null}
    </div>
  );
}

/** Editor de comentário — reusado pelo composer e pela edição inline. */
function EditorComentario({
  textoInicial,
  pendenciaInicial,
  mencionadosIniciais,
  usuarios,
  usuarioAtualId,
  rotuloEnviar,
  pendente,
  aoEnviar,
  aoCancelar,
}: {
  textoInicial: string;
  pendenciaInicial: boolean;
  mencionadosIniciais: string[];
  usuarios: UsuarioMencionavel[];
  usuarioAtualId: string;
  rotuloEnviar: string;
  pendente: boolean;
  aoEnviar: (dados: { texto: string; ehPendencia: boolean; mencionados: string[] }) => void;
  aoCancelar?: () => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [ehPendencia, setEhPendencia] = useState(pendenciaInicial);
  const [mencionados, setMencionados] = useState<string[]>(mencionadosIniciais);
  const idPend = useMemo(() => `pend-${Math.round(texto.length)}-${rotuloEnviar}`, [rotuloEnviar, texto.length]);

  const mencionaveis = usuarios.filter((u) => u.id !== usuarioAtualId);
  const selecionados = mencionaveis.filter((u) => mencionados.includes(u.id));

  function alternarMencao(id: string) {
    setMencionados((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id],
    );
  }

  return (
    <div className="pa-editor">
      <label className="sr-oculto" htmlFor={`ta-${idPend}`}>
        Texto do comentário
      </label>
      <textarea
        id={`ta-${idPend}`}
        className="input pa-ta"
        rows={3}
        placeholder="Escreva um comentário para a equipe…"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
      />
      <div className="pa-editor-linha">
        <label className="pa-check">
          <input
            type="checkbox"
            checked={ehPendencia}
            onChange={(evento) => setEhPendencia(evento.target.checked)}
            style={{ accentColor: "var(--azul)" }}
          />
          Marcar como pendência
        </label>
        {mencionaveis.length > 0 ? (
          <details className="pa-mencao">
            <summary className="btn btn-ghost btn-sm">
              ＠ Mencionar{selecionados.length > 0 ? ` (${selecionados.length})` : ""}
            </summary>
            <div className="pa-mencao-lista" role="group" aria-label="Mencionar usuários">
              {mencionaveis.map((usuario) => (
                <label key={usuario.id} className="pa-mencao-it">
                  <input
                    type="checkbox"
                    checked={mencionados.includes(usuario.id)}
                    onChange={() => alternarMencao(usuario.id)}
                    style={{ accentColor: "var(--azul)" }}
                  />
                  {usuario.nome}
                </label>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      {selecionados.length > 0 ? (
        <div className="pa-chips">
          {selecionados.map((usuario) => (
            <span key={usuario.id} className="pa-chip">
              ＠{usuario.nome}
              <button
                type="button"
                aria-label={`Remover menção a ${usuario.nome}`}
                onClick={() => alternarMencao(usuario.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="pa-editor-acoes">
        {aoCancelar ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={aoCancelar} disabled={pendente}>
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-azul btn-sm"
          disabled={pendente || texto.trim().length === 0}
          onClick={() => aoEnviar({ texto, ehPendencia, mencionados })}
        >
          {rotuloEnviar}
        </button>
      </div>
    </div>
  );
}

function Composer({
  empresaId,
  usuarios,
  usuarioAtualId,
  aoResultado,
}: {
  empresaId: string;
  usuarios: UsuarioMencionavel[];
  usuarioAtualId: string;
  aoResultado: (resultado: EstadoAcaoComentario) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [chave, setChave] = useState(0); // reset do editor após enviar

  return (
    <EditorComentario
      key={chave}
      textoInicial=""
      pendenciaInicial={false}
      mencionadosIniciais={[]}
      usuarios={usuarios}
      usuarioAtualId={usuarioAtualId}
      rotuloEnviar="Comentar"
      pendente={pendente}
      aoEnviar={({ texto, ehPendencia, mencionados }) =>
        iniciar(async () => {
          const resultado = await acaoAdicionarComentario({
            empresaId,
            texto,
            ehPendencia,
            mencionados,
          });
          aoResultado(resultado);
          if (!resultado.erros) setChave((c) => c + 1);
        })
      }
    />
  );
}

function ItemComentario({
  empresaId,
  comentario,
  usuarios,
  usuarioAtualId,
  podeComentar,
  aoResultado,
}: {
  empresaId: string;
  comentario: ComentarioDoFeed;
  usuarios: UsuarioMencionavel[];
  usuarioAtualId: string;
  podeComentar: boolean;
  aoResultado: (resultado: EstadoAcaoComentario) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);
  const souAutor = comentario.autorId === usuarioAtualId;
  const pendenciaAberta = comentario.ehPendencia && comentario.pendenciaResolvidaEm === null;
  const mencionaMim = comentario.mencoes.some((m) => m.usuarioId === usuarioAtualId);

  if (editando) {
    return (
      <div className="pa-item">
        <EditorComentario
          textoInicial={comentario.texto}
          pendenciaInicial={comentario.ehPendencia}
          mencionadosIniciais={comentario.mencoes.map((m) => m.usuarioId)}
          usuarios={usuarios}
          usuarioAtualId={usuarioAtualId}
          rotuloEnviar="Salvar"
          pendente={pendente}
          aoCancelar={() => setEditando(false)}
          aoEnviar={({ texto, ehPendencia, mencionados }) =>
            iniciar(async () => {
              const resultado = await acaoEditarComentario({
                empresaId,
                comentarioId: comentario.id,
                texto,
                ehPendencia,
                mencionados,
              });
              aoResultado(resultado);
              if (!resultado.erros) setEditando(false);
            })
          }
        />
      </div>
    );
  }

  return (
    <div className={`pa-item${mencionaMim ? " pa-mim" : ""}`}>
      <div className="pa-item-h">
        <b className="pa-autor">{comentario.autorNome}</b>
        <span className="cap pa-quando">
          {formatarQuando(comentario.criadoEm)}
          {comentario.editadoEm ? " · editado" : ""}
        </span>
        {comentario.ehPendencia ? (
          pendenciaAberta ? (
            <span className="pill pill-warn"><i aria-hidden="true" />pendência</span>
          ) : (
            <span className="pill pill-ok"><i aria-hidden="true" />resolvida</span>
          )
        ) : null}
      </div>
      <p className="pa-texto">{comentario.texto}</p>
      {comentario.mencoes.length > 0 ? (
        <div className="pa-mencoes-lidas">
          {comentario.mencoes.map((mencao) => (
            <span key={mencao.usuarioId} className={`pa-tag-mencao${mencao.usuarioId === usuarioAtualId ? " eu" : ""}`}>
              ＠{mencao.nome}
            </span>
          ))}
        </div>
      ) : null}
      {podeComentar ? (
        <div className="pa-item-acoes">
          {comentario.ehPendencia ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pendente}
              onClick={() =>
                iniciar(async () =>
                  aoResultado(
                    await acaoResolverPendencia({
                      empresaId,
                      comentarioId: comentario.id,
                      resolvida: pendenciaAberta,
                    }),
                  ),
                )
              }
            >
              {pendenciaAberta ? "Resolver" : "Reabrir"}
            </button>
          ) : null}
          {souAutor ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(true)} disabled={pendente}>
                Editar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm pa-apagar"
                disabled={pendente}
                onClick={() => {
                  if (!window.confirm("Apagar este comentário? Ele some do painel, mas fica na auditoria.")) return;
                  iniciar(async () =>
                    aoResultado(await acaoRemoverComentario({ empresaId, comentarioId: comentario.id })),
                  );
                }}
              >
                Apagar
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconeBalao() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
