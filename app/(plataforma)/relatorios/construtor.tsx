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
import { ROTULOS_DE_FORMATO, type FormatoDeSaida } from "@/dominio/relatorios/saida";
import {
  AJUSTES_DO_TIPO,
  ROTULOS_DE_VISUALIZACAO,
  TIPOS_DE_VISUALIZACAO,
  type AjustesDeVisualizacao,
  type Visualizacao,
  formaDoResultado,
  tipoEfetivo,
  tiposDisponiveis,
} from "@/dominio/relatorios/visualizacao";
import { GraficoDoRelatorio } from "./grafico";
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
  /** Ausente = tabela. Todo relatório salvo antes da Onda 17 cai aqui. */
  visualizacao?: Visualizacao;
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
  const [menuAberto, setMenuAberto] = useState(false);
  /** O TSV quando o navegador recusa a área de transferência (ficha §7.2). */
  const [textoParaCopiar, setTextoParaCopiar] = useState<string | null>(null);
  /*
   * RN78 — a finalidade de quem consulta dado pessoal.
   *
   * Vive aqui e não no caso de uso porque o caso de uso já a EXIGE desde a
   * F24: ele recusa a execução sem ela, com a mensagem certa. O que faltava
   * era o lugar de declará-la — sem este campo, os assuntos de dado pessoal
   * montavam, travavam no erro e não ofereciam saída nenhuma.
   */
  const [finalidade, setFinalidade] = useState("");
  /*
   * RN80 — o tipo ESCOLHIDO, que não é necessariamente o exibido. Quando a
   * forma do resultado deixa de comportá-lo, a tela mostra tabela e guarda a
   * escolha: ela volta assim que a forma comportar de novo. Ver `tipoEfetivo`.
   */
  const [visual, setVisual] = useState<Visualizacao>(
    inicial?.visualizacao ?? { tipo: "TABELA", ajustes: {} },
  );

  const idNome = useId();
  const idFinalidade = useId();
  const exigeFinalidade = assunto.contemDadoPessoal;
  const finalidadePendente = exigeFinalidade && finalidade.trim().length === 0;
  const camposPorSlug = useMemo(
    () => new Map(assunto.campos.map((campo) => [campo.slug, campo])),
    [assunto.campos],
  );

  /*
   * A visualização entra na definição para ser SALVA junto, e fica de fora do
   * gatilho da prévia: trocar de barras para rosca não muda uma vírgula do
   * SQL, e recalcular a consulta a cada clique no alternador castigaria o
   * banco por uma decisão que é só de desenho.
   */
  const definicao = useMemo(
    () => ({ assunto: assunto.slug, linhas, colunas, valores, filtros }),
    [assunto.slug, linhas, colunas, valores, filtros],
  );
  const definicaoParaSalvar = useMemo(
    () => ({ ...definicao, visualizacao: visual }),
    [definicao, visual],
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
    /*
     * Sem finalidade declarada a prévia nem sai — e isso é desenho, não
     * atalho. Deixá-la disparar produziria a recusa do servidor a cada campo
     * arrastado: a pessoa veria uma mensagem de erro vermelha enquanto monta,
     * aprenderia a ignorá-la, e a exigência viraria ruído. O estado correto
     * aqui não é erro, é "falta um passo".
     */
    if (finalidadePendente) {
      setPrevia({ carregando: false });
      return;
    }
    const meu = ++serial.current;
    setPrevia((atual) => ({ ...atual, carregando: true }));
    const relogio = setTimeout(async () => {
      const resposta = await preverRelatorio(definicao, finalidade.trim() || undefined);
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
  }, [definicao, vazio, finalidade, finalidadePendente]);

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
    const resposta = await salvarRelatorioAction({
      nome,
      definicao: definicaoParaSalvar,
      visibilidade,
    });
    setAviso(
      resposta.ok
        ? `Relatório "${nome}" salvo em ${visibilidade === "TIME" ? "Do time" : "Meus relatórios"}.`
        : (resposta.erro ?? "Não foi possível salvar."),
    );
  }

  /**
   * RN83 — a saída, em qualquer formato, **pela mesma rota**.
   *
   * O que muda entre um item do menu e outro é o valor de `formato` e o que
   * se faz com a resposta. Nenhum formato ganha caminho próprio até o dado:
   * permissão, finalidade, teto e trilha continuam sendo do caso de uso.
   */
  async function aoSair(formato: FormatoDeSaida) {
    setAviso(null);
    setMenuAberto(false);
    setExportando(true);
    try {
      const resposta = await fetch("/relatorios/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A mesma finalidade da prévia: um texto só, declarado uma vez, que
        // acompanha tanto o que aparece na tela quanto o que sai em arquivo.
        body: JSON.stringify({
          definicao,
          relatorioId: relatorioAberto?.id,
          finalidade: finalidade.trim() || undefined,
          formato,
          nome: relatorioAberto?.nome,
          // O desenho que está na tela, para o documento levá-lo junto. Só no
          // HTML: o XLSX não embute SVG, e o CSV é dado, não desenho.
          svg: formato === "HTML" ? svgDoGrafico() : undefined,
        }),
      });
      if (!resposta.ok) {
        setAviso(await resposta.text());
        return;
      }

      const cortado = resposta.headers.get("X-Relatorio-Truncado") === "true";
      const linhas = resposta.headers.get("X-Relatorio-Linhas");

      if (formato === "AREA_TRANSFERENCIA") {
        await copiar(await resposta.text(), linhas);
      } else if (formato === "HTML") {
        abrirParaImpressao(await resposta.text());
      } else {
        baixar(await resposta.blob(), resposta.headers.get("Content-Disposition"));
      }

      if (cortado) {
        setAviso(
          `A saída teve ${linhas} linhas e foi cortada no teto deste formato. Estreite um filtro para levar tudo.`,
        );
      }
    } finally {
      setExportando(false);
    }
  }

  /**
   * O SVG do gráfico, lido do DOM.
   *
   * Lido, e não remontado: o desenho que a pessoa está vendo é o que deve ir
   * ao documento. Remontá-lo aqui abriria a chance de o arquivo sair
   * diferente da tela — que é o defeito mais difícil de perceber, porque o
   * arquivo é conferido longe de onde foi pedido.
   */
  function svgDoGrafico(): string | undefined {
    const elemento = document.querySelector(".rel-grafico svg");
    return elemento?.outerHTML;
  }

  async function copiar(texto: string, linhas: string | null) {
    /*
     * A API de área de transferência exige contexto seguro e, em alguns
     * navegadores, gesto do usuário. Falhar em silêncio seria o pior
     * resultado: a pessoa colaria o conteúdo anterior sem perceber.
     *
     * Na recusa, o texto vai para um campo selecionável — ela copia à mão, e
     * a saída já está registrada na trilha de qualquer jeito (RN84).
     */
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(`${linhas ?? ""} linhas copiadas. Cole numa planilha para ver em colunas.`.trim());
    } catch {
      setTextoParaCopiar(texto);
      setAviso(
        "Seu navegador não liberou a área de transferência. O conteúdo está no campo abaixo — selecione e copie.",
      );
    }
  }

  function abrirParaImpressao(html: string) {
    /*
     * Blob e `noopener`, não `document.write`.
     *
     * O documento carrega o gráfico que veio da tela, e abri-lo numa janela
     * que compartilha origem com a plataforma o deixaria alcançar esta
     * sessão. Blob dá a ele uma origem própria, e `noopener` corta o
     * `window.opener` — mesmo com o SVG já higienizado no servidor, não há
     * motivo para depender de uma proteção só.
     */
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const janela = window.open(url, "_blank", "noopener");
    if (!janela) {
      setAviso(
        "O navegador bloqueou a janela do documento. Libere as janelas para este endereço e peça de novo.",
      );
    }
    // Tarde o bastante para a janela ter lido, cedo o bastante para não vazar.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function baixar(blob: Blob, disposicao: string | null) {
    const nomeArquivo = /filename="([^"]+)"/.exec(disposicao ?? "")?.[1] ?? "relatorio";
    const url = URL.createObjectURL(blob);
    const ancora = document.createElement("a");
    ancora.href = url;
    ancora.download = nomeArquivo;
    ancora.click();
    URL.revokeObjectURL(url);
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
              <MenuDeSaida
                aberto={menuAberto}
                aoAlternar={setMenuAberto}
                aoEscolher={aoSair}
                ocupado={exportando}
                desabilitado={vazio}
              />
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
            {/*
              RN78 — o campo da finalidade, acima do resultado e só nos
              assuntos que alcançam dado pessoal. Ele fica DENTRO do painel de
              prévia, e não no topo da tela, porque é o que destrava o número:
              o lugar onde a pessoa procura quando a tabela não vem.

              O texto declarado viaja com a execução e fica na trilha
              operacional — é o mesmo caminho da exportação de listas da RN35,
              reusado e não duplicado.
            */}
            {exigeFinalidade ? (
              <div className="rel-finalidade">
                <label className="cap" htmlFor={idFinalidade}>
                  Finalidade da consulta
                </label>
                <input
                  id={idFinalidade}
                  className="input"
                  value={finalidade}
                  onChange={(evento) => setFinalidade(evento.target.value)}
                  placeholder="Ex.: dimensionar a campanha de renovação do 2º semestre"
                  aria-describedby={`${idFinalidade}-ajuda`}
                />
                <p id={`${idFinalidade}-ajuda`} className="cap" style={{ margin: 0 }}>
                  Este assunto alcança dado pessoal. A finalidade fica registrada na trilha
                  junto de quem consultou e quando (RN78).
                </p>
              </div>
            ) : null}
            {aviso ? (
              <p className="aviso-inline" role="status">
                {aviso}
              </p>
            ) : null}
            {textoParaCopiar !== null ? (
              /*
               * O recuo da cópia (ficha da Onda 20 §7.2).
               *
               * A API de área de transferência exige contexto seguro e, em
               * alguns navegadores, gesto do usuário. Sem este campo, a
               * recusa seria silenciosa e a pessoa colaria o conteúdo
               * anterior sem perceber — que é pior que não copiar (RN55).
               */
              <label className="rel-copiar">
                <span className="sr-oculto">Conteúdo para copiar</span>
                <textarea
                  id="rel-texto-para-copiar"
                  readOnly
                  rows={4}
                  value={textoParaCopiar}
                  onFocus={(evento) => evento.currentTarget.select()}
                />
              </label>
            ) : null}
            <Resultado
              previa={previa}
              vazio={vazio}
              finalidadePendente={finalidadePendente}
              visual={visual}
              aoTrocarVisual={setVisual}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * O menu de saída (RN83, RN84).
 *
 * ## Menu, e não quatro botões
 *
 * Quatro botões lado a lado dariam o mesmo peso visual a quatro coisas que
 * não têm a mesma frequência, e empurrariam "Salvar" e "Apagar" para fora da
 * linha em tela estreita. O menu mantém uma entrada só e ordena por uso.
 *
 * ## `<details>` nativo, e não um popover de mão
 *
 * Abre e fecha por teclado, fecha com Esc e anuncia o estado ao leitor de
 * tela sem uma linha de JavaScript. Um popover escrito à mão precisaria
 * reimplementar as três coisas, e é onde acessibilidade costuma se perder.
 *
 * ## A ordem dos itens é o que muda em relação à F24
 *
 * O CSV deixa de ser o único e vira o último — continua ali, com o mesmo
 * comportamento, para quem já o usa. Na frente vêm os que respondem ao que
 * se pediu: o documento que se imprime e a planilha de verdade.
 */
function MenuDeSaida({
  aberto,
  aoAlternar,
  aoEscolher,
  ocupado,
  desabilitado,
}: {
  aberto: boolean;
  aoAlternar: (aberto: boolean) => void;
  aoEscolher: (formato: FormatoDeSaida) => void;
  ocupado: boolean;
  desabilitado: boolean;
}) {
  // A ordem de uso, não a de declaração: o documento e a planilha na frente.
  const ordem: ReadonlyArray<FormatoDeSaida> = [
    "HTML",
    "XLSX",
    "AREA_TRANSFERENCIA",
    "CSV",
  ];

  return (
    <details
      className="rel-saida"
      open={aberto && !desabilitado}
      onToggle={(evento) => aoAlternar((evento.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        className="btn btn-ghost btn-sm btn-xs"
        aria-disabled={desabilitado || ocupado}
        // `tabIndex` negativo tira do caminho do teclado quando não há o que
        // exportar — `<summary>` não honra `disabled`, que é de `<button>`.
        tabIndex={desabilitado ? -1 : 0}
      >
        {ocupado ? "Gerando…" : "Exportar"}
      </summary>
      <div className="rel-saida-itens" role="menu">
        {ordem.map((formato) => (
          <button
            key={formato}
            type="button"
            role="menuitem"
            className="rel-saida-it"
            disabled={desabilitado || ocupado}
            onClick={() => aoEscolher(formato)}
          >
            {ROTULOS_DE_FORMATO[formato]}
          </button>
        ))}
      </div>
    </details>
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
  finalidadePendente,
  visual,
  aoTrocarVisual,
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
  finalidadePendente: boolean;
  visual: Visualizacao;
  aoTrocarVisual: (visual: Visualizacao) => void;
}) {
  if (vazio) {
    return (
      <p className="rel-gaveta-vazia">
        Ponha um campo em Linhas, Colunas ou Valores para ver o resultado.
      </p>
    );
  }
  /*
   * RN78 — falta um passo, e não deu erro. A distinção importa: erro ensina
   * a pessoa que ela fez algo errado; aqui ela não fez. O texto aponta para
   * o campo que resolve, e a prévia espera.
   */
  if (finalidadePendente) {
    return (
      <p className="rel-gaveta-vazia">
        Este assunto alcança dado pessoal. Declare a finalidade da consulta, no campo acima,
        para ver o resultado.
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

  /*
   * RN80 — a forma do RESULTADO decide, não a definição. Duas dimensões cujo
   * cruzamento devolveu uma coluna só não são, na prática, um cruzamento.
   */
  const forma = formaDoResultado(tabela, { truncado: previa.truncado });
  const disponiveis = tiposDisponiveis(forma);
  const exibido = tipoEfetivo(visual.tipo, forma);
  const recusa = disponiveis.find((item) => item.tipo === visual.tipo && !item.disponivel);

  return (
    <>
      <div className="rel-tipos" role="group" aria-label="Tipo de visualização">
        {TIPOS_DE_VISUALIZACAO.map((tipo) => {
          const item = disponiveis.find((candidato) => candidato.tipo === tipo)!;
          return (
            <button
              key={tipo}
              type="button"
              className="rel-tipo"
              aria-pressed={visual.tipo === tipo}
              disabled={!item.disponivel}
              /* O motivo fica no `title` E no bloco abaixo quando é o tipo
                 escolhido: no `title` para quem passa o mouse decidindo, no
                 bloco para quem já escolheu e não entendeu por que veio
                 tabela. */
              title={item.motivo ?? ROTULOS_DE_VISUALIZACAO[tipo]}
              onClick={() => aoTrocarVisual({ tipo, ajustes: {} })}
            >
              {ROTULOS_DE_VISUALIZACAO[tipo]}
            </button>
          );
        })}
      </div>

      {recusa ? (
        <p className="rel-recusa" role="status">
          <strong>{ROTULOS_DE_VISUALIZACAO[visual.tipo]}</strong> não serve para o que está
          montado: {recusa.motivo} A tabela continua abaixo.
        </p>
      ) : null}

      {exibido !== "TABELA" ? (
        <>
          <GraficoDoRelatorio
            tabela={tabela}
            visual={{ ...visual, tipo: exibido }}
            rotularCategoria={(linha) =>
              linha.chaves
                .map((chave, posicao) =>
                  rotularDimensao(chave, tabela.dimensoes[posicao]?.rotulosDeValor),
                )
                .join(" · ")
            }
          />
          <Ajustes
            visual={{ ...visual, tipo: exibido }}
            aoTrocar={(ajustes) => aoTrocarVisual({ ...visual, ajustes })}
          />
        </>
      ) : null}

      {/*
       * O contêiner rola (`overflow:auto` com teto de altura), e região que
       * rola precisa receber foco: sem `tabindex`, quem navega por teclado
       * não alcança as linhas abaixo do corte — só o mouse chega lá.
       *
       * O defeito é da F24 e esteve em produção desde então. Ele não aparecia
       * porque as três varreduras axe anteriores escaneiam o construtor
       * **vazio**: sem prévia carregada não há tabela, sem tabela não há
       * rolagem, e sem rolagem a regra não se aplica. A primeira varredura com
       * resultado na tela é a da F27, e foi ela que o encontrou.
       *
       * `role="region"` com nome existe para o leitor de tela anunciar onde o
       * foco parou — um `<div>` focalizável e mudo é pior que nenhum.
       */}
      <div
        className="rel-resultado"
        aria-busy={previa.carregando}
        tabIndex={0}
        role="region"
        aria-label="Resultado do relatório — role para ver as demais linhas"
      >
        <table>
          <caption className="sr-oculto">
            {exibido === "TABELA"
              ? "Prévia do relatório, sobre uma amostra dos registros"
              : "Os mesmos números do gráfico acima, em tabela"}
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

/**
 * Os ajustes do tipo escolhido (RN80).
 *
 * Cada tipo mostra só os seus — `AJUSTES_DO_TIPO` é a fonte, e o painel não
 * tem lista própria. Sem isso, acrescentar um ajuste a um tipo exigiria
 * lembrar de mexer em dois lugares, e o segundo é o que se esquece.
 */
function Ajustes({
  visual,
  aoTrocar,
}: {
  visual: Visualizacao;
  aoTrocar: (ajustes: AjustesDeVisualizacao) => void;
}) {
  const admitidos = AJUSTES_DO_TIPO[visual.tipo];
  if (admitidos.length === 0) return null;
  const atual = visual.ajustes;
  const trocar = (parcial: AjustesDeVisualizacao) => aoTrocar({ ...atual, ...parcial });

  return (
    <div className="rel-ajustes">
      {admitidos.includes("ordenar") ? (
        <label className="rel-ajuste">
          Ordenar por
          <select
            value={atual.ordenar ?? "MAIOR"}
            onChange={(evento) =>
              trocar({ ordenar: evento.target.value as AjustesDeVisualizacao["ordenar"] })
            }
          >
            <option value="MAIOR">maior valor</option>
            <option value="MENOR">menor valor</option>
            <option value="ROTULO">ordem do resultado</option>
          </select>
        </label>
      ) : null}

      {admitidos.includes("limite") ? (
        <label className="rel-ajuste">
          Mostrar até
          <input
            type="number"
            min={1}
            max={50}
            value={atual.limite ?? ""}
            placeholder="todas"
            onChange={(evento) => {
              const bruto = Number(evento.target.value);
              // Campo vazio tira o limite; fora da faixa não vira borda.
              trocar({
                limite: Number.isFinite(bruto) && bruto >= 1 && bruto <= 50 ? bruto : undefined,
              });
            }}
          />
          categorias
        </label>
      ) : null}

      {admitidos.includes("empilhamento") ? (
        <label className="rel-ajuste">
          Séries
          <select
            value={atual.empilhamento ?? "AGRUPADO"}
            onChange={(evento) =>
              trocar({
                empilhamento: evento.target.value as AjustesDeVisualizacao["empilhamento"],
              })
            }
          >
            <option value="AGRUPADO">lado a lado</option>
            <option value="EMPILHADO">empilhadas</option>
            <option value="CEM_POR_CENTO">empilhadas em 100%</option>
          </select>
        </label>
      ) : null}

      {admitidos.includes("rotulosDeDado") ? (
        <label className="rel-ajuste">
          <input
            type="checkbox"
            checked={atual.rotulosDeDado !== false}
            onChange={(evento) => trocar({ rotulosDeDado: evento.target.checked })}
          />
          Mostrar os valores
        </label>
      ) : null}

      {admitidos.includes("marcadores") ? (
        <label className="rel-ajuste">
          <input
            type="checkbox"
            checked={atual.marcadores !== false}
            onChange={(evento) => trocar({ marcadores: evento.target.checked })}
          />
          Marcar os pontos
        </label>
      ) : null}
    </div>
  );
}
