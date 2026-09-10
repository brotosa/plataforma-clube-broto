"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { ComentarioDoFeed, UsuarioMencionavel } from "@/infra/consultas/comentarios";
import { formatarTamanho } from "@/dominio/arquivos/arquivo-enviado";
import {
  FORMATOS_ACEITOS_ROTULO,
  PERFIL_ANEXO_COMENTARIO,
  TIPOS_ACEITOS,
} from "@/dominio/comentarios/anexo";
import {
  acaoAdicionarComentario,
  acaoEditarComentario,
  acaoRemoverComentario,
  acaoResolverPendencia,
  type AlvoComentario,
  type EstadoAcaoComentario,
} from "./acoes";

/** Atributo `accept` do seletor de arquivo, a partir dos tipos aceitos. */
const ACCEPT_ANEXO = TIPOS_ACEITOS.join(",");

/**
 * Painel de atividades de uma ficha — o mesmo componente serve o aliado e o
 * patrocinador (o `alvo` diz qual). Coluna recuável à direita, persistente em
 * todas as abas porque vive no shell da ficha.
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

/**
 * Filtros do feed (melhoria pós-homologação): "só pendências abertas", "que me
 * mencionam" e "resolvidas". O feed inteiro já chega ao cliente de uma vez
 * (conjunto contido por ficha, RN56), então o recorte é em memória — sem
 * querystring, sem novo round-trip e sem tocar a consulta do servidor. É um
 * estado de conveniência por visualização, não um recorte de URL.
 */
type FiltroAtividades = "TUDO" | "PENDENCIAS" | "MENCIONAM" | "RESOLVIDAS";

const ORDEM_FILTRO: ReadonlyArray<FiltroAtividades> = [
  "TUDO",
  "PENDENCIAS",
  "MENCIONAM",
  "RESOLVIDAS",
];

const ROTULO_FILTRO: Record<FiltroAtividades, string> = {
  TUDO: "Todas as atividades",
  PENDENCIAS: "Só pendências abertas",
  MENCIONAM: "Que me mencionam",
  RESOLVIDAS: "Pendências resolvidas",
};

/** Texto de vazio por filtro — específico, nunca o genérico do feed cheio. */
const VAZIO_FILTRO: Record<FiltroAtividades, string> = {
  TUDO: "Nenhum comentário ainda. O que a equipe registrar aqui fica visível em todas as abas da ficha.",
  PENDENCIAS: "Nenhuma pendência aberta neste momento.",
  MENCIONAM: "Nenhum comentário desta ficha menciona você.",
  RESOLVIDAS: "Nenhuma pendência resolvida ainda.",
};

function casaFiltro(
  comentario: ComentarioDoFeed,
  filtro: FiltroAtividades,
  usuarioAtualId: string,
): boolean {
  switch (filtro) {
    case "PENDENCIAS":
      return comentario.ehPendencia && comentario.pendenciaResolvidaEm === null;
    case "MENCIONAM":
      return comentario.mencoes.some((mencao) => mencao.usuarioId === usuarioAtualId);
    case "RESOLVIDAS":
      return comentario.ehPendencia && comentario.pendenciaResolvidaEm !== null;
    default:
      return true;
  }
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
  alvo,
  comentarios,
  usuarios,
  usuarioAtualId,
  podeComentar,
}: {
  alvo: AlvoComentario;
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

  // Rótulo da região conforme a ficha — o e2e do aliado casa "…do aliado".
  const rotuloRegiao =
    alvo.tipo === "patrocinador"
      ? "Painel de atividades do patrocinador"
      : "Painel de atividades do aliado";

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
      alvo={alvo}
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
          aria-label={rotuloRegiao}
          tabIndex={-1}
          className="pa-gaveta"
        >
          {corpo}
        </div>
      </>
    );
  }

  // Largo: rail fixo ao lado do conteúdo.
  return <aside className="pa-rail" aria-label={rotuloRegiao}>{corpo}</aside>;
}

function CorpoPainel({
  alvo,
  comentarios,
  usuarios,
  usuarioAtualId,
  podeComentar,
  abertas,
  aoRecolher,
}: {
  alvo: AlvoComentario;
  comentarios: ComentarioDoFeed[];
  usuarios: UsuarioMencionavel[];
  usuarioAtualId: string;
  podeComentar: boolean;
  abertas: number;
  aoRecolher: () => void;
}) {
  const [toast, setToast] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [filtro, setFiltro] = useState<FiltroAtividades>("TUDO");
  const idFiltro = useId();

  const visiveis =
    filtro === "TUDO"
      ? comentarios
      : comentarios.filter((comentario) => casaFiltro(comentario, filtro, usuarioAtualId));

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
        <Composer alvo={alvo} usuarios={usuarios} usuarioAtualId={usuarioAtualId} aoResultado={aplicar} />
      ) : (
        <p className="cap" style={{ margin: "0 0 10px" }}>
          Seu papel acompanha o histórico da ficha, mas não registra comentários.
        </p>
      )}

      {comentarios.length > 0 ? (
        <div className="pa-filtros">
          <label className="sr-oculto" htmlFor={idFiltro}>
            Filtrar atividades
          </label>
          <select
            id={idFiltro}
            className="select pa-filtro-sel"
            value={filtro}
            onChange={(evento) => setFiltro(evento.target.value as FiltroAtividades)}
          >
            {ORDEM_FILTRO.map((opcao) => (
              <option key={opcao} value={opcao}>
                {ROTULO_FILTRO[opcao]}
              </option>
            ))}
          </select>
          {filtro !== "TUDO" ? (
            <span className="cap pa-filtro-conta" role="status">
              {visiveis.length} de {comentarios.length}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="pa-feed">
        {comentarios.length === 0 ? (
          <p className="cap" style={{ margin: "14px 2px" }}>
            {VAZIO_FILTRO.TUDO}
          </p>
        ) : visiveis.length === 0 ? (
          <p className="cap" style={{ margin: "14px 2px" }}>
            {VAZIO_FILTRO[filtro]}
          </p>
        ) : (
          visiveis.map((comentario) => (
            <ItemComentario
              key={comentario.id}
              alvo={alvo}
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

/** Normaliza para busca: sem acento, minúsculo. */
function normalizarBusca(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Detecta uma menção em digitação: um `@` no início ou após espaço, seguido do
 * que se digitou até o cursor sem espaço. Devolve onde o `@` começa e a
 * consulta, ou `null` quando não há menção ativa sob o cursor.
 */
function detectarMencao(texto: string, cursor: number): { inicio: number; consulta: string } | null {
  const antes = texto.slice(0, cursor);
  const casamento = /(^|\s)@(\S*)$/.exec(antes);
  if (!casamento) return null;
  const consulta = casamento[2] ?? "";
  return { inicio: cursor - consulta.length - 1, consulta };
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
  permitirAnexo,
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
  /** Só o composer (comentário novo) anexa; a edição não mexe no anexo. */
  permitirAnexo?: boolean;
  aoEnviar: (dados: {
    texto: string;
    ehPendencia: boolean;
    mencionados: string[];
    arquivo: File | null;
  }) => void;
  aoCancelar?: () => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [ehPendencia, setEhPendencia] = useState(pendenciaInicial);
  const [mencionados, setMencionados] = useState<string[]>(mencionadosIniciais);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const idBase = useId();
  const idTa = `ta-${idBase}`;
  const idLista = `lb-${idBase}`;
  const idOpcao = (indice: number) => `op-${idBase}-${indice}`;
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Autocomplete de @menção: aberto, o que se digitou após o `@`, onde o `@`
  // começa e qual opção está ativa (navegação por teclado).
  const [sugestaoAberta, setSugestaoAberta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [inicioMencao, setInicioMencao] = useState(0);
  const [ativa, setAtiva] = useState(0);

  const mencionaveis = usuarios.filter((u) => u.id !== usuarioAtualId);
  const selecionados = mencionaveis.filter((u) => mencionados.includes(u.id));

  const opcoes = sugestaoAberta
    ? mencionaveis.filter((u) => normalizarBusca(u.nome).includes(normalizarBusca(consulta)))
    : [];
  // Só mostra quando há de fato o que escolher (evita caixa vazia).
  const mostrando = sugestaoAberta && opcoes.length > 0;
  const indiceAtivo = Math.min(ativa, Math.max(opcoes.length - 1, 0));

  function alternarMencao(id: string) {
    setMencionados((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id],
    );
  }

  /** Recalcula a menção sob o cursor a partir do texto e posição atuais. */
  function reavaliarMencao(valor: string, cursor: number) {
    const achado = detectarMencao(valor, cursor);
    if (achado) {
      setInicioMencao(achado.inicio);
      setConsulta(achado.consulta);
      setSugestaoAberta(true);
      setAtiva(0);
    } else {
      setSugestaoAberta(false);
    }
  }

  /** Escolhe um usuário: troca o trecho `@consulta` por `@Nome ` e registra o id. */
  function escolher(usuario: UsuarioMencionavel) {
    const ta = taRef.current;
    const cursor = ta?.selectionStart ?? texto.length;
    const antes = texto.slice(0, inicioMencao);
    const depois = texto.slice(cursor);
    const trecho = `@${usuario.nome} `;
    const novo = `${antes}${trecho}${depois}`;
    setTexto(novo);
    setMencionados((atuais) => (atuais.includes(usuario.id) ? atuais : [...atuais, usuario.id]));
    setSugestaoAberta(false);
    const posicao = antes.length + trecho.length;
    // Devolve o foco ao campo e posiciona o cursor após a menção inserida.
    requestAnimationFrame(() => {
      const alvo = taRef.current;
      if (!alvo) return;
      alvo.focus();
      alvo.setSelectionRange(posicao, posicao);
    });
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mostrando) return;
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAtiva((i) => (i + 1) % opcoes.length);
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setAtiva((i) => (i - 1 + opcoes.length) % opcoes.length);
    } else if (evento.key === "Enter" || evento.key === "Tab") {
      evento.preventDefault();
      const alvo = opcoes[indiceAtivo];
      if (alvo) escolher(alvo);
    } else if (evento.key === "Escape") {
      evento.preventDefault();
      setSugestaoAberta(false);
    }
  }

  return (
    <div className="pa-editor">
      <label className="sr-oculto" htmlFor={idTa}>
        Texto do comentário
      </label>
      <div className="pa-sug-anc">
        <textarea
          id={idTa}
          ref={taRef}
          className="input pa-ta"
          rows={3}
          placeholder="Escreva um comentário para a equipe…"
          value={texto}
          // Sem role="combobox": a ARIA não permite esse papel em <textarea>
          // (axe: aria-allowed-role). O campo continua textbox e recebe só os
          // atributos que o textbox aceita — aria-autocomplete/activedescendant —
          // mais os globais aria-controls/haspopup, apontando para o listbox.
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={mostrando ? idOpcao(indiceAtivo) : undefined}
          onChange={(evento) => {
            setTexto(evento.target.value);
            reavaliarMencao(evento.target.value, evento.target.selectionStart ?? evento.target.value.length);
          }}
          onKeyDown={aoTeclar}
          onKeyUp={(evento) => {
            if (mostrando && ["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(evento.key)) return;
            const alvo = evento.currentTarget;
            reavaliarMencao(alvo.value, alvo.selectionStart ?? alvo.value.length);
          }}
          onClick={(evento) => {
            const alvo = evento.currentTarget;
            reavaliarMencao(alvo.value, alvo.selectionStart ?? alvo.value.length);
          }}
          onBlur={() => setSugestaoAberta(false)}
        />
        <ul
          id={idLista}
          role="listbox"
          aria-label="Mencionar alguém da equipe"
          className="pa-mencao-lista pa-sug-lista"
          hidden={!mostrando}
        >
          {opcoes.map((usuario, indice) => (
            <li
              key={usuario.id}
              id={idOpcao(indice)}
              role="option"
              aria-selected={indice === indiceAtivo}
              className="pa-mencao-it pa-sug-it"
              // mousedown (não click) para não tirar o foco do campo antes de inserir.
              onMouseDown={(evento) => {
                evento.preventDefault();
                escolher(usuario);
              }}
            >
              ＠{usuario.nome}
            </li>
          ))}
        </ul>
      </div>
      {mencionaveis.length > 0 ? (
        <p className="cap pa-sug-dica">Digite @ para mencionar alguém da equipe.</p>
      ) : null}
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
      </div>
      {permitirAnexo ? (
        <div className="pa-anexo-linha">
          <input
            ref={arquivoRef}
            type="file"
            accept={ACCEPT_ANEXO}
            className="sr-oculto"
            aria-label="Anexar arquivo ao comentário"
            onChange={(evento) => {
              const escolhido = evento.target.files?.[0] ?? null;
              // Pré-conferência de tamanho no cliente — o servidor revalida
              // tipo real e teto de todo jeito (RN55). Aqui é só evitar o
              // envio óbvio grande demais.
              if (escolhido && escolhido.size > PERFIL_ANEXO_COMENTARIO.tamanhoMaximoEmBytes) {
                setErroArquivo(
                  `O anexo tem ${formatarTamanho(escolhido.size)} e o limite é ${formatarTamanho(
                    PERFIL_ANEXO_COMENTARIO.tamanhoMaximoEmBytes,
                  )}. Comprima o arquivo antes de anexar.`,
                );
                setArquivo(null);
                evento.target.value = "";
                return;
              }
              setErroArquivo(null);
              setArquivo(escolhido);
            }}
          />
          {arquivo ? (
            <span className="pa-chip pa-anexo-chip">
              <IconeClipe />
              {arquivo.name} · {formatarTamanho(arquivo.size)}
              <button
                type="button"
                aria-label="Remover anexo"
                onClick={() => {
                  setArquivo(null);
                  setErroArquivo(null);
                  if (arquivoRef.current) arquivoRef.current.value = "";
                }}
              >
                ×
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm pa-anexo-btn"
              onClick={() => arquivoRef.current?.click()}
            >
              <IconeClipe />
              Anexar arquivo
            </button>
          )}
          <span className="cap pa-anexo-dica">
            {FORMATOS_ACEITOS_ROTULO} · até {formatarTamanho(PERFIL_ANEXO_COMENTARIO.tamanhoMaximoEmBytes)}
          </span>
        </div>
      ) : null}
      {erroArquivo ? (
        <p className="pa-anexo-erro" role="alert">
          {erroArquivo}
        </p>
      ) : null}
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
          onClick={() =>
            aoEnviar({ texto, ehPendencia, mencionados, arquivo: permitirAnexo ? arquivo : null })
          }
        >
          {rotuloEnviar}
        </button>
      </div>
    </div>
  );
}

function Composer({
  alvo,
  usuarios,
  usuarioAtualId,
  aoResultado,
}: {
  alvo: AlvoComentario;
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
      permitirAnexo
      aoEnviar={({ texto, ehPendencia, mencionados, arquivo }) =>
        iniciar(async () => {
          const resultado = await acaoAdicionarComentario({
            alvo,
            texto,
            ehPendencia,
            mencionados,
            anexo: arquivo ?? undefined,
          });
          aoResultado(resultado);
          if (!resultado.erros) setChave((c) => c + 1);
        })
      }
    />
  );
}

function ItemComentario({
  alvo,
  comentario,
  usuarios,
  usuarioAtualId,
  podeComentar,
  aoResultado,
}: {
  alvo: AlvoComentario;
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
                alvo,
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
      {comentario.anexo ? (
        <a
          className="pa-anexo-link"
          href={`/api/notas/${comentario.id}/anexo`}
          // A rota já força `attachment`; o hint dá o nome ao download e não
          // navega para fora do painel. O link quebra em linha, não o layout.
          download={comentario.anexo.nomeArquivo}
        >
          <IconeClipe />
          <span className="pa-anexo-nome">{comentario.anexo.nomeArquivo}</span>
          <span className="cap pa-anexo-tam">{formatarTamanho(comentario.anexo.bytes)}</span>
        </a>
      ) : null}
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
                      alvo,
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
                    aoResultado(await acaoRemoverComentario({ alvo, comentarioId: comentario.id })),
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

function IconeClipe() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
