"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { VisibilidadeRelatorio } from "@prisma/client";

import {
  ARIDADE_OPERADOR,
  type Agregacao,
  type CampoRelatorio,
  type OperadorRelatorio,
  ROTULOS_AGREGACAO,
  ROTULOS_OPERADOR,
  agregacaoNatural,
} from "@/dominio/relatorios/catalogo";
import type { TabelaPivotada } from "@/dominio/relatorios/pivo";
import { rotularDimensao } from "@/dominio/relatorios/pivo";
import { ErrosDoFormulario } from "../aliados/formularios";
import {
  apagarRelatorioAction,
  preverRelatorio,
  salvarRelatorioAction,
} from "./acoes";

/**
 * T36 — o construtor.
 *
 * ## A promessa da tela, e o que ela custa
 *
 * A pessoa escolhe um assunto, põe campos em três gavetas e vê o resultado.
 * Nada aqui pede que ela saiba o que é `GROUP BY`, `AVG` ou junção — e é por
 * isso que a agregação se escolhe sozinha ao soltar um campo em Valores
 * (número vira média, registro vira quantos), com a troca à mão de quem
 * quiser.
 *
 * ## Arrastar não é o único caminho, e isso não é acessibilidade de enfeite
 *
 * Cada campo traz três botões — **L**, **C**, **V** — que fazem exatamente o
 * que o arrasto faz. É a disciplina que a RN57 fixou no funil: arrastar é
 * conforto, não caminho exclusivo, e **nenhuma função existe só no arrasto**.
 * Aqui há uma razão a mais: arrasto por toque é ruim numa lista que rola, e
 * a tela precisa funcionar no tablet da diretoria.
 *
 * Os botões ficam sempre no DOM, e não aparecem no hover: quem navega por
 * teclado não tem hover, e esconder o caminho até o foco chegar tiraria dele
 * a descoberta de que o caminho existe.
 *
 * ## A prévia é amostra, e ela diz isso
 *
 * Recalcula a cada mudança, com debounce, e roda no servidor pelo mesmo caso
 * de uso da execução completa — não há um caminho "rápido" que pule
 * permissão ou trilha. O número no rodapé é o da amostra, e o texto o diz;
 * fingir que é o total seria mentir por omissão a cada relatório montado.
 */

const ATRASO_PREVIA_MS = 400;

export interface CampoSerializado {
  slug: string;
  rotulo: string;
  grupo: string;
  tipo: CampoRelatorio["tipo"];
  operadores: ReadonlyArray<OperadorRelatorio>;
  agregacoes: ReadonlyArray<Agregacao>;
  valores?: ReadonlyArray<{ valor: string; rotulo: string }>;
  indisponivel?: string;
}

export interface ModeloSerializado {
  slug: string;
  nome: string;
  descricao: string;
  definicao: {
    linhas: ReadonlyArray<string>;
    colunas: ReadonlyArray<string>;
    valores: ReadonlyArray<{ campo: string; agregacao: Agregacao }>;
    filtros: ReadonlyArray<{
      campo: string;
      operador: OperadorRelatorio;
      valores: ReadonlyArray<string>;
    }>;
  };
}

export interface AssuntoSerializado {
  slug: string;
  rotulo: string;
  descricao: string;
  contemDadoPessoal: boolean;
  campos: ReadonlyArray<CampoSerializado>;
  modelos: ReadonlyArray<ModeloSerializado>;
}

interface ValorEscolhido {
  campo: string;
  agregacao: Agregacao;
}

interface FiltroEscolhido {
  campo: string;
  operador: OperadorRelatorio;
  valores: string[];
}

type Gaveta = "linhas" | "colunas" | "valores";

const ROTULO_GAVETA: Record<Gaveta, string> = {
  linhas: "Linhas",
  colunas: "Colunas",
  valores: "Valores",
};

const INICIAL_GAVETA: Record<Gaveta, string> = {
  linhas: "L",
  colunas: "C",
  valores: "V",
};

export interface DefinicaoInicial {
  linhas: ReadonlyArray<string>;
  colunas: ReadonlyArray<string>;
  valores: ReadonlyArray<ValorEscolhido>;
  filtros: ReadonlyArray<FiltroEscolhido>;
}

export function Construtor({
  assunto,
  inicial,
  relatorioAberto,
}: {
  assunto: AssuntoSerializado;
  inicial?: DefinicaoInicial;
  relatorioAberto?: { id: string; nome: string; meu: boolean };
}) {
  const [linhas, setLinhas] = useState<string[]>([...(inicial?.linhas ?? [])]);
  const [colunas, setColunas] = useState<string[]>([...(inicial?.colunas ?? [])]);
  const [valores, setValores] = useState<ValorEscolhido[]>([...(inicial?.valores ?? [])]);
  const [filtros, setFiltros] = useState<FiltroEscolhido[]>(
    (inicial?.filtros ?? []).map((filtro) => ({ ...filtro, valores: [...filtro.valores] })),
  );
  const [previa, setPrevia] = useState<{
    carregando: boolean;
    erro?: string;
    tabela?: TabelaPivotada;
    total?: number;
    truncado?: boolean;
    duracaoMs?: number;
  }>({ carregando: false });
  const [recebendo, setRecebendo] = useState<Gaveta | null>(null);
  const [nome, setNome] = useState(relatorioAberto?.nome ?? "");
  const [visibilidade, setVisibilidade] = useState<VisibilidadeRelatorio>("PRIVADO");
  const [aviso, setAviso] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const idNome = useId();
  const camposPorSlug = useMemo(
    () => new Map(assunto.campos.map((campo) => [campo.slug, campo])),
    [assunto.campos],
  );

  const definicao = useMemo(
    () => ({ assunto: assunto.slug, linhas, colunas, valores, filtros }),
    [assunto.slug, linhas, colunas, valores, filtros],
  );

  const vazio = linhas.length === 0 && colunas.length === 0 && valores.length === 0;

  /*
   * A prévia é disparada por efeito sobre a definição, com debounce. O
   * `serial` guarda a ordem: uma resposta lenta de uma definição antiga não
   * pode sobrescrever a de uma definição mais nova — sem isso, arrastar dois
   * campos em sequência pode terminar exibindo o resultado do primeiro, e a
   * tela fica mostrando algo que não corresponde às gavetas.
   */
  const serial = useRef(0);
  useEffect(() => {
    if (vazio) {
      setPrevia({ carregando: false });
      return;
    }
    const meu = ++serial.current;
    setPrevia((atual) => ({ ...atual, carregando: true }));
    const relogio = setTimeout(async () => {
      const resposta = await preverRelatorio(definicao);
      if (meu !== serial.current) return;
      if (!resposta.ok) {
        setPrevia({ carregando: false, erro: resposta.erro });
        return;
      }
      setPrevia({
        carregando: false,
        tabela: resposta.tabela,
        total: resposta.total,
        truncado: resposta.truncado,
        duracaoMs: resposta.duracaoMs,
      });
    }, ATRASO_PREVIA_MS);
    return () => clearTimeout(relogio);
  }, [definicao, vazio]);

  const jaUsado = useCallback(
    (slug: string) =>
      linhas.includes(slug) ||
      colunas.includes(slug) ||
      valores.some((valor) => valor.campo === slug),
    [linhas, colunas, valores],
  );

  const adicionar = useCallback(
    (slug: string, gaveta: Gaveta) => {
      const campo = camposPorSlug.get(slug);
      if (!campo || campo.indisponivel) return;
      if (gaveta === "valores") {
        if (campo.agregacoes.length === 0) return;
        const natural = agregacaoNatural(campo.tipo);
        const agregacao = campo.agregacoes.includes(natural) ? natural : campo.agregacoes[0]!;
        setValores((atual) =>
          atual.some((valor) => valor.campo === slug) ? atual : [...atual, { campo: slug, agregacao }],
        );
        return;
      }
      const setar = gaveta === "linhas" ? setLinhas : setColunas;
      setar((atual) => (atual.includes(slug) ? atual : [...atual, slug]));
      // Linhas e Colunas são exclusivas entre si: o mesmo campo nos dois é
      // recusado pelo compilador, e deixar a tela permitir só para receber a
      // recusa depois seria fazer a pessoa errar de propósito.
      const outro = gaveta === "linhas" ? setColunas : setLinhas;
      outro((atual) => atual.filter((chave) => chave !== slug));
    },
    [camposPorSlug],
  );

  const remover = useCallback((slug: string, gaveta: Gaveta) => {
    if (gaveta === "linhas") setLinhas((atual) => atual.filter((chave) => chave !== slug));
    else if (gaveta === "colunas") setColunas((atual) => atual.filter((chave) => chave !== slug));
    else setValores((atual) => atual.filter((valor) => valor.campo !== slug));
  }, []);

  const aplicarModelo = useCallback((modelo: ModeloSerializado) => {
    setLinhas([...modelo.definicao.linhas]);
    setColunas([...modelo.definicao.colunas]);
    setValores(modelo.definicao.valores.map((valor) => ({ ...valor })));
    setFiltros(modelo.definicao.filtros.map((filtro) => ({ ...filtro, valores: [...filtro.valores] })));
    setAviso(null);
  }, []);

  async function aoSalvar() {
    setAviso(null);
    const resposta = await salvarRelatorioAction({ nome, definicao, visibilidade });
    setAviso(
      resposta.ok
        ? `Relatório "${nome}" salvo em ${visibilidade === "TIME" ? "Do time" : "Meus relatórios"}.`
        : (resposta.erro ?? "Não foi possível salvar."),
    );
  }

  async function aoExportar() {
    setAviso(null);
    setExportando(true);
    try {
      const resposta = await fetch("/relatorios/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definicao, relatorioId: relatorioAberto?.id }),
      });
      if (!resposta.ok) {
        setAviso(await resposta.text());
        return;
      }
      const nomeArquivo =
        /filename="([^"]+)"/.exec(resposta.headers.get("Content-Disposition") ?? "")?.[1] ??
        "relatorio.csv";
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const ancora = document.createElement("a");
      ancora.href = url;
      ancora.download = nomeArquivo;
      ancora.click();
      URL.revokeObjectURL(url);
      if (resposta.headers.get("X-Relatorio-Truncado") === "true") {
        setAviso(
          `O arquivo saiu com ${resposta.headers.get("X-Relatorio-Linhas")} linhas e foi cortado no teto. Estreite um filtro para levar tudo.`,
        );
      }
    } finally {
      setExportando(false);
    }
  }

  const grupos = useMemo(() => {
    const mapa = new Map<string, CampoSerializado[]>();
    assunto.campos.forEach((campo) => {
      const lista = mapa.get(campo.grupo) ?? [];
      lista.push(campo);
      mapa.set(campo.grupo, lista);
    });
    return [...mapa.entries()];
  }, [assunto.campos]);

  return (
    <div className="rel-grid">
      <section className="card" aria-labelledby="titulo-campos">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "14px 16px", borderBottom: "1px solid var(--borda)" }}>
          <h2 id="titulo-campos" className="h-el" style={{ margin: 0 }}>
            Campos
          </h2>
        </div>
        <div className="rel-campos">
          {grupos.map(([grupo, campos]) => (
            <div key={grupo}>
              <p className="rel-grupo">{grupo}</p>
              {campos.map((campo) => (
                <div
                  key={campo.slug}
                  className="rel-campo"
                  data-indisponivel={campo.indisponivel ? "sim" : "nao"}
                  draggable={!campo.indisponivel}
                  onDragStart={(evento) => {
                    evento.dataTransfer.setData("text/plain", campo.slug);
                    evento.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <span className="rel-campo-nome">
                    <strong>{campo.rotulo}</strong>
                    <span className="rel-campo-tipo">
                      {campo.indisponivel ?? campo.tipo.toLowerCase()}
                    </span>
                  </span>
                  {campo.indisponivel ? null : (
                    <span className="rel-destinos">
                      {(["linhas", "colunas", "valores"] as const).map((gaveta) => (
                        <button
                          key={gaveta}
                          type="button"
                          className="rel-destino"
                          disabled={
                            jaUsado(campo.slug) ||
                            (gaveta === "valores" && campo.agregacoes.length === 0)
                          }
                          onClick={() => adicionar(campo.slug, gaveta)}
                          title={`Pôr "${campo.rotulo}" em ${ROTULO_GAVETA[gaveta]}`}
                          aria-label={`Pôr ${campo.rotulo} em ${ROTULO_GAVETA[gaveta]}`}
                        >
                          {INICIAL_GAVETA[gaveta]}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <section className="card" aria-labelledby="titulo-montagem">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "14px 16px", borderBottom: "1px solid var(--borda)" }}>
            <h2 id="titulo-montagem" className="h-el" style={{ margin: 0 }}>
              Montagem
            </h2>
            {assunto.modelos.length > 0 ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {assunto.modelos.map((modelo) => (
                  <button
                    key={modelo.slug}
                    type="button"
                    className="btn btn-ghost btn-sm btn-xs"
                    onClick={() => aplicarModelo(modelo)}
                    title={modelo.descricao}
                  >
                    {modelo.nome}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ padding: "16px" }}>
            <div className="rel-gavetas">
              {(["linhas", "colunas", "valores"] as const).map((gaveta) => {
                const conteudo =
                  gaveta === "valores" ? valores.map((valor) => valor.campo) : gaveta === "linhas" ? linhas : colunas;
                return (
                  <div
                    key={gaveta}
                    className="rel-gaveta"
                    data-recebendo={recebendo === gaveta ? "sim" : "nao"}
                    onDragOver={(evento) => {
                      evento.preventDefault();
                      setRecebendo(gaveta);
                    }}
                    onDragLeave={() => setRecebendo((atual) => (atual === gaveta ? null : atual))}
                    onDrop={(evento) => {
                      evento.preventDefault();
                      setRecebendo(null);
                      const slug = evento.dataTransfer.getData("text/plain");
                      if (slug) adicionar(slug, gaveta);
                    }}
                  >
                    <h3>{ROTULO_GAVETA[gaveta]}</h3>
                    {conteudo.length === 0 ? (
                      <p className="rel-gaveta-vazia">
                        Arraste um campo, ou use o botão <strong>{INICIAL_GAVETA[gaveta]}</strong>.
                      </p>
                    ) : (
                      <div className="rel-chips">
                        {conteudo.map((slug) => {
                          const campo = camposPorSlug.get(slug);
                          const escolhido = valores.find((valor) => valor.campo === slug);
                          return (
                            <span key={slug} className="rel-chip">
                              <strong>{campo?.rotulo ?? slug}</strong>
                              {gaveta === "valores" && campo && escolhido ? (
                                <select
                                  aria-label={`Medida de ${campo.rotulo}`}
                                  value={escolhido.agregacao}
                                  onChange={(evento) =>
                                    setValores((atual) =>
                                      atual.map((valor) =>
                                        valor.campo === slug
                                          ? { ...valor, agregacao: evento.target.value as Agregacao }
                                          : valor,
                                      ),
                                    )
                                  }
                                >
                                  {campo.agregacoes.map((agregacao) => (
                                    <option key={agregacao} value={agregacao}>
                                      {ROTULOS_AGREGACAO[agregacao]}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                              <button
                                type="button"
                                className="rel-chip-sair"
                                onClick={() => remover(slug, gaveta)}
                                aria-label={`Tirar ${campo?.rotulo ?? slug} de ${ROTULO_GAVETA[gaveta]}`}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <h3 className="rel-grupo" style={{ padding: 0 }}>
                  Filtros
                </h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-xs"
                  onClick={() => {
                    const campo = assunto.campos.find(
                      (item) => !item.indisponivel && item.operadores.length > 0,
                    );
                    if (!campo) return;
                    const operador = campo.operadores[0]!;
                    setFiltros((atual) => [
                      ...atual,
                      {
                        campo: campo.slug,
                        operador,
                        valores: Array.from(
                          { length: ARIDADE_OPERADOR[operador] },
                          () => campo.valores?.[0]?.valor ?? "",
                        ),
                      },
                    ]);
                  }}
                >
                  Acrescentar filtro
                </button>
              </div>
              {filtros.length === 0 ? (
                <p className="rel-gaveta-vazia" style={{ paddingTop: 6 }}>
                  Sem filtro — o relatório cobre tudo o que o assunto alcança.
                </p>
              ) : (
                filtros.map((filtro, indice) => (
                  <LinhaDeFiltro
                    key={`${filtro.campo}-${indice}`}
                    campos={assunto.campos}
                    filtro={filtro}
                    aoMudar={(novo) =>
                      setFiltros((atual) =>
                        atual.map((item, posicao) => (posicao === indice ? novo : item)),
                      )
                    }
                    aoTirar={() =>
                      setFiltros((atual) => atual.filter((_, posicao) => posicao !== indice))
                    }
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="titulo-resultado">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "14px 16px", borderBottom: "1px solid var(--borda)" }}>
            <h2 id="titulo-resultado" className="h-el" style={{ margin: 0 }}>
              Prévia
            </h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {/* "Nome do relatório", e não só "Nome": o painel de campos
                  ao lado tem um campo chamado "Nome fantasia", e dois
                  rótulos que começam igual confundem leitor de tela tanto
                  quanto confundiram o teste que os localizava. */}
              <label className="cap" htmlFor={idNome}>
                Nome do relatório
              </label>
              <input
                id={idNome}
                className="rel-filtro-valor"
                style={{
                  height: 32,
                  padding: "0 8px",
                  border: "1px solid var(--borda)",
                  borderRadius: "var(--r-xs)",
                }}
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                placeholder="Ex.: Ofertas a vencer"
              />
              <select
                aria-label="Quem vê este relatório"
                style={{
                  height: 32,
                  padding: "0 8px",
                  border: "1px solid var(--borda)",
                  borderRadius: "var(--r-xs)",
                }}
                value={visibilidade}
                onChange={(evento) =>
                  setVisibilidade(evento.target.value as VisibilidadeRelatorio)
                }
              >
                <option value="PRIVADO">Só eu</option>
                <option value="TIME">Do time</option>
              </select>
              <button
                type="button"
                className="btn btn-sm btn-xs"
                onClick={aoSalvar}
                disabled={vazio || nome.trim().length < 3}
              >
                Salvar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-xs"
                onClick={aoExportar}
                disabled={vazio || exportando}
              >
                {exportando ? "Exportando…" : "Exportar (CSV)"}
              </button>
              {relatorioAberto?.meu ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-xs"
                  onClick={async () => {
                    const resposta = await apagarRelatorioAction(relatorioAberto.id);
                    setAviso(resposta.ok ? "Relatório apagado." : (resposta.erro ?? ""));
                  }}
                >
                  Apagar
                </button>
              ) : null}
            </div>
          </div>
          <div style={{ padding: "16px" }}>
            {aviso ? (
              <p className="aviso-inline" role="status">
                {aviso}
              </p>
            ) : null}
            <Resultado previa={previa} vazio={vazio} />
          </div>
        </section>
      </div>
    </div>
  );
}

function LinhaDeFiltro({
  campos,
  filtro,
  aoMudar,
  aoTirar,
}: {
  campos: ReadonlyArray<CampoSerializado>;
  filtro: FiltroEscolhido;
  aoMudar: (filtro: FiltroEscolhido) => void;
  aoTirar: () => void;
}) {
  const campo = campos.find((item) => item.slug === filtro.campo);
  const aridade = ARIDADE_OPERADOR[filtro.operador] ?? 1;

  return (
    <div className="rel-filtro">
      <select
        className="rel-filtro-campo"
        aria-label="Campo do filtro"
        value={filtro.campo}
        onChange={(evento) => {
          const novo = campos.find((item) => item.slug === evento.target.value);
          if (!novo) return;
          const operador = novo.operadores[0]!;
          aoMudar({
            campo: novo.slug,
            operador,
            valores: Array.from(
              { length: ARIDADE_OPERADOR[operador] },
              () => novo.valores?.[0]?.valor ?? "",
            ),
          });
        }}
      >
        {campos
          .filter((item) => !item.indisponivel && item.operadores.length > 0)
          .map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.rotulo}
            </option>
          ))}
      </select>

      <select
        aria-label="Operador do filtro"
        value={filtro.operador}
        onChange={(evento) => {
          const operador = evento.target.value as OperadorRelatorio;
          aoMudar({
            ...filtro,
            operador,
            valores: Array.from(
              { length: ARIDADE_OPERADOR[operador] },
              (_, indice) => filtro.valores[indice] ?? campo?.valores?.[0]?.valor ?? "",
            ),
          });
        }}
      >
        {(campo?.operadores ?? []).map((operador) => (
          <option key={operador} value={operador}>
            {ROTULOS_OPERADOR[operador]}
          </option>
        ))}
      </select>

      {Array.from({ length: aridade }, (_, indice) =>
        campo?.valores ? (
          <select
            key={indice}
            className="rel-filtro-valor"
            aria-label={`Valor ${aridade > 1 ? indice + 1 : ""} do filtro`.trim()}
            value={filtro.valores[indice] ?? ""}
            onChange={(evento) =>
              aoMudar({
                ...filtro,
                valores: filtro.valores.map((valor, posicao) =>
                  posicao === indice ? evento.target.value : valor,
                ),
              })
            }
          >
            {campo.valores.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={indice}
            className="rel-filtro-valor"
            aria-label={`Valor ${aridade > 1 ? indice + 1 : ""} do filtro`.trim()}
            type={campo?.tipo === "DATA" ? "date" : campo?.tipo === "NUMERO" || campo?.tipo === "DINHEIRO" ? "number" : "text"}
            value={filtro.valores[indice] ?? ""}
            onChange={(evento) =>
              aoMudar({
                ...filtro,
                valores: filtro.valores.map((valor, posicao) =>
                  posicao === indice ? evento.target.value : valor,
                ),
              })
            }
          />
        ),
      )}

      <button
        type="button"
        className="btn btn-ghost btn-sm btn-xs"
        onClick={aoTirar}
        aria-label={`Tirar o filtro de ${campo?.rotulo ?? filtro.campo}`}
      >
        Tirar
      </button>
    </div>
  );
}

function Resultado({
  previa,
  vazio,
}: {
  previa: {
    carregando: boolean;
    erro?: string;
    tabela?: TabelaPivotada;
    total?: number;
    truncado?: boolean;
    duracaoMs?: number;
  };
  vazio: boolean;
}) {
  if (vazio) {
    return (
      <p className="rel-gaveta-vazia">
        Ponha um campo em Linhas, Colunas ou Valores para ver o resultado.
      </p>
    );
  }
  if (previa.erro) {
    // A mensagem vem do compilador e é instrutiva de propósito (RN55): ela
    // diz qual campo, qual operador e o que fazer.
    return <ErrosDoFormulario erros={[previa.erro]} />;
  }
  if (!previa.tabela) {
    return <p className="rel-gaveta-vazia">Calculando…</p>;
  }
  const { tabela } = previa;
  if (tabela.linhas.length === 0) {
    return <p className="rel-gaveta-vazia">Nenhum registro atende a estes filtros.</p>;
  }

  return (
    <>
      <div className="rel-resultado" aria-busy={previa.carregando}>
        <table>
          <caption className="sr-oculto">
            Prévia do relatório, sobre uma amostra dos registros
          </caption>
          <thead>
            <tr>
              {tabela.dimensoes.map((dimensao) => (
                <th key={dimensao.chave} scope="col">
                  {dimensao.rotulo}
                </th>
              ))}
              {tabela.medidas.map((medida) => (
                <th key={medida.chave} scope="col">
                  {medida.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabela.linhas.map((linha, indice) => (
              <tr key={indice}>
                {linha.chaves.map((chave, posicao) => (
                  <td key={posicao} className={chave === null ? "rel-vazia" : undefined}>
                    {/* Rótulo do catálogo, nunca o valor cru do banco:
                        "Publicada", e não "PUBLICADA". */}
                    {rotularDimensao(chave, tabela.dimensoes[posicao]?.rotulosDeValor)}
                  </td>
                ))}
                {tabela.medidas.map((medida) => {
                  const celula = linha.celulas[medida.chave] ?? null;
                  return (
                    <td
                      key={medida.chave}
                      className={celula === null ? "num rel-vazia" : "num"}
                    >
                      {/* Traço, nunca zero: a célula sem cruzamento não teve
                          o que medir, e zero afirmaria o contrário (RN53). */}
                      {celula === null
                        ? "—"
                        : typeof celula === "number"
                          ? celula.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                          : String(celula)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap" style={{ marginTop: 10 }}>
        {previa.truncado
          ? `Amostra de ${previa.total} linhas — há mais no resultado completo. Exporte em CSV para levar tudo.`
          : `${previa.total} linha${previa.total === 1 ? "" : "s"} nesta amostra.`}
        {previa.duracaoMs !== undefined ? ` Consulta em ${previa.duracaoMs} ms.` : ""}
      </p>
    </>
  );
}
