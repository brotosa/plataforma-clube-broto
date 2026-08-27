"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  type CampoConstrutor,
  ConstrutorFiltros,
  formatarContagem,
  type RegraConstrutor,
  resumoDasRegras,
  useContagemViva,
} from "./construtor-filtros";
import {
  acaoAtualizarSegmento,
  acaoExportarLista,
  acaoSalvarSegmento,
} from "./acoes";

/**
 * T18 — casca interativa da carteira: o construtor isolado dirige a URL
 * (a lista é sempre consulta paginada no servidor) e a contagem viva; os
 * modais de salvar segmento e exportar lista seguem o protótipo v6.1.
 */

/**
 * Onda 12 (RN63) — rótulo humano do perfil, com o de-para da fonte
 * declarado na ficha §4. O enum do banco não vai à tela: "PROMOCIONAL_BROTO"
 * é nome de constante, não texto de produto.
 */
const ROTULO_PERFIL: Readonly<Record<string, string>> = {
  PATROCINADA: "Patrocinada",
  PROMOCIONAL_BROTO: "Promocional Broto",
  AUTOASSINATURA: "Autoassinatura",
};

export interface LinhaCarteira {
  id: string;
  nome: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
  uf: string | null;
  municipio: string | null;
  preferencia: string | null;
  unidadesProdutivas: string[];
  culturas: string[];
  vencimento: string | null;
  janelaVencimento: number | null;
  marcaSintetico: boolean;
  /**
   * Onda 12 (RN63). `null` é o estado honesto e o mais comum hoje: o
   * perfil vem da coluna nativa `Patrocinador` do relatório da operadora,
   * que só a F20 ingere. A coluna diz isso, não finge um valor.
   */
  perfilAssinatura: string | null;
  /** Patrocinadores com vínculo VIGENTE. Vazio = não patrocinado hoje. */
  patrocinadores: string[];
}

export interface DadosCarteira {
  status: "OK" | "AGUARDANDO_TELEMETRIA";
  motivo: string | null;
  linhas: LinhaCarteira[];
  total: number | null;
  pagina: number;
  tamanhoPagina: number;
}

function IconeAviso() {
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

/** Colunas ordenáveis da T18 (espelha a allowlist da consulta). */
export type OrdenarPor = "nome" | "perfil" | "uf";
export interface Ordenacao {
  por: OrdenarPor;
  direcao: "asc" | "desc";
}

/**
 * Régua de números de página com janela em torno da atual: sempre a 1ª e a
 * última, mais as vizinhas da atual; `null` marca a elipse. Evita imprimir
 * 137 botões quando a base é grande.
 */
function numerosDePagina(atual: number, total: number): Array<number | null> {
  const paginas = new Set<number>([1, total, atual, atual - 1, atual + 1]);
  const ordenadas = [...paginas].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const resultado: Array<number | null> = [];
  let anterior = 0;
  for (const numero of ordenadas) {
    if (numero - anterior > 1) resultado.push(null);
    resultado.push(numero);
    anterior = numero;
  }
  return resultado;
}

/** `aria-sort` do `<th>` (onde o atributo é válido), a partir da ordenação. */
function ariaSort(
  coluna: OrdenarPor,
  ordenacao: Ordenacao,
): "ascending" | "descending" | "none" {
  if (ordenacao.por !== coluna) return "none";
  return ordenacao.direcao === "asc" ? "ascending" : "descending";
}

/**
 * Cabeçalho de coluna ordenável (T18): um botão dentro do `<th>` que
 * navega por query. A seta indica a direção; a coluna ativa fica em
 * destaque. Colunas sem botão continuam sendo texto simples.
 */
function BotaoOrdenar({
  coluna,
  rotulo,
  ordenacao,
  aoOrdenar,
}: {
  coluna: OrdenarPor;
  rotulo: string;
  ordenacao: Ordenacao;
  aoOrdenar: (coluna: OrdenarPor) => void;
}) {
  const ativo = ordenacao.por === coluna;
  const seta = !ativo ? "↕" : ordenacao.direcao === "asc" ? "↑" : "↓";
  return (
    <button
      type="button"
      className="th-ordenar"
      onClick={() => aoOrdenar(coluna)}
      aria-label={`Ordenar por ${rotulo}${ativo ? (ordenacao.direcao === "asc" ? ", ascendente" : ", descendente") : ""}`}
    >
      <span>{rotulo}</span>
      <span aria-hidden="true" className={ativo ? "seta-ativa" : "seta"}>
        {seta}
      </span>
    </button>
  );
}

export function CarteiraAssinantes({
  campos,
  regrasIniciais,
  busca,
  carteira,
  ordenacao,
  erroConsulta,
  temBase,
  dadosPlenos,
  podePlenos,
  podeExportar,
  podeGerirSegmentos,
  segmentoEdicaoId,
}: {
  campos: CampoConstrutor[];
  regrasIniciais: RegraConstrutor[];
  busca: string;
  carteira: DadosCarteira | null;
  ordenacao: Ordenacao;
  erroConsulta: boolean;
  temBase: boolean;
  dadosPlenos: boolean;
  podePlenos: boolean;
  podeExportar: boolean;
  podeGerirSegmentos: boolean;
  segmentoEdicaoId: string | null;
}) {
  const roteador = useRouter();
  const rota = usePathname();
  const [, iniciarTransicao] = useTransition();
  const [regras, setRegras] = useState<RegraConstrutor[]>(regrasIniciais);
  const [textoBusca, setTextoBusca] = useState(busca);
  const contagem = useContagemViva(regras);

  const [modalSegmento, setModalSegmento] = useState(false);
  const [nomeSegmento, setNomeSegmento] = useState("");
  const [modalExportar, setModalExportar] = useState(false);
  const [finalidade, setFinalidade] = useState("");
  const [mensagens, setMensagens] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const primeiraRenderizacao = useRef(true);

  // Regras/busca dirigem a URL (consulta no servidor), com debounce.
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    const temporizador = setTimeout(() => {
      // Trocar filtro/busca volta para a página 1 (não preserva `pagina`),
      // mas PRESERVA a ordenação escolhida.
      iniciarTransicao(() => {
        roteador.replace(consultaComoUrl({ ordenar: true }));
      });
    }, 400);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regras, textoBusca, dadosPlenos, ordenacao.por, ordenacao.direcao, rota, roteador]);

  /**
   * Monta a URL da carteira a partir do estado atual (regras, busca,
   * plenos) e, opcionalmente, da ordenação e da página. Fonte única das
   * navegações por query desta tela — evita as três montagens repetidas que
   * existiam nos botões de paginação.
   */
  function consultaComoUrl(opcoes: { ordenar?: boolean; pagina?: number } = {}): string {
    const consulta = new URLSearchParams();
    if (regras.length > 0) consulta.set("regras", JSON.stringify(regras));
    if (textoBusca.trim()) consulta.set("busca", textoBusca.trim());
    if (dadosPlenos) consulta.set("plenos", "1");
    if (opcoes.ordenar && ordenacao.por !== "nome") consulta.set("ordenar", ordenacao.por);
    if (opcoes.ordenar && ordenacao.direcao === "desc") consulta.set("direcao", "desc");
    if (opcoes.pagina && opcoes.pagina > 1) consulta.set("pagina", String(opcoes.pagina));
    return `${rota}${consulta.size > 0 ? `?${consulta}` : ""}`;
  }

  const irParaPagina = (numero: number) => {
    roteador.replace(consultaComoUrl({ ordenar: true, pagina: numero }));
  };

  /**
   * Clique no cabeçalho: alterna a direção se já ordena por aquela coluna,
   * senão passa a ordenar por ela (ascendente). Sempre volta à página 1.
   */
  const ordenarPor = (coluna: OrdenarPor) => {
    const proximaDirecao = ordenacao.por === coluna && ordenacao.direcao === "asc" ? "desc" : "asc";
    const consulta = new URLSearchParams();
    if (regras.length > 0) consulta.set("regras", JSON.stringify(regras));
    if (textoBusca.trim()) consulta.set("busca", textoBusca.trim());
    if (dadosPlenos) consulta.set("plenos", "1");
    if (coluna !== "nome") consulta.set("ordenar", coluna);
    if (proximaDirecao === "desc") consulta.set("direcao", "desc");
    roteador.replace(`${rota}${consulta.size > 0 ? `?${consulta}` : ""}`);
  };

  /**
   * Filtros rápidos: escrevem uma REGRA no construtor (caminho único, RN33),
   * então a contagem viva e a exportação continuam coerentes. Só um valor
   * por campo — selecionar troca a regra daquele campo; "todos" a remove.
   */
  const definirFiltroRapido = (campoSlug: string, valor: string) => {
    setRegras((atuais) => {
      const semCampo = atuais.filter((regra) => !(regra.campo === campoSlug && regra.operador === "e"));
      if (valor === "") return semCampo;
      return [...semCampo, { campo: campoSlug, operador: "e" as const, valor }];
    });
  };
  const valorFiltroRapido = (campoSlug: string): string =>
    regras.find((regra) => regra.campo === campoSlug && regra.operador === "e")?.valor ?? "";

  const alternarPlenos = () => {
    const consulta = new URLSearchParams();
    if (regras.length > 0) consulta.set("regras", JSON.stringify(regras));
    if (textoBusca.trim()) consulta.set("busca", textoBusca.trim());
    if (ordenacao.por !== "nome") consulta.set("ordenar", ordenacao.por);
    if (ordenacao.direcao === "desc") consulta.set("direcao", "desc");
    if (!dadosPlenos) consulta.set("plenos", "1");
    roteador.replace(`${rota}${consulta.size > 0 ? `?${consulta}` : ""}`);
  };

  const salvarSegmento = async () => {
    const resultado = await acaoSalvarSegmento({ nome: nomeSegmento, regras });
    if (resultado.ok) {
      setModalSegmento(false);
      setNomeSegmento("");
      setMensagens([]);
      setAviso("Segmento salvo — disponível em Segmentos salvos");
    } else {
      setMensagens(resultado.erros);
    }
  };

  const atualizarSegmentoEmEdicao = async () => {
    if (!segmentoEdicaoId) return;
    const resultado = await acaoAtualizarSegmento({
      segmentoId: segmentoEdicaoId,
      regras,
    });
    if (resultado.ok) {
      setAviso("Segmento atualizado — a regra declarativa foi substituída");
    } else {
      setMensagens(resultado.erros);
      setModalSegmento(true);
    }
  };

  const exportarLista = async () => {
    const resultado = await acaoExportarLista({ regras, finalidade });
    if (resultado.ok) {
      setModalExportar(false);
      setFinalidade("");
      setMensagens([]);
      setAviso(
        `Lista exportada (${formatarContagem(resultado.contagem)} assinantes) — snapshot auditável gravado`,
      );
      window.location.assign(`/api/assinantes/exportacoes/${resultado.exportacaoId}`);
    } else {
      setMensagens(resultado.erros);
    }
  };

  const linhas = carteira?.linhas ?? [];
  const totalPaginas =
    carteira?.total != null
      ? Math.max(1, Math.ceil(carteira.total / carteira.tamanhoPagina))
      : 1;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1280 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Carteira de assinantes</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Base patrocinada · segmentação declarativa com contagem viva
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn btn-ghost" href="/assinantes/segmentos">
            Segmentos salvos
          </Link>
          <Link className="btn btn-ghost" href="/assinantes/importacoes">
            Importar lista
          </Link>
        </div>
        {podeExportar ? (
          <button
            type="button"
            className="btn btn-azul"
            onClick={() => {
              setMensagens([]);
              setModalExportar(true);
            }}
          >
            Exportar lista
          </button>
        ) : null}
      </div>

      <ConstrutorFiltros
        campos={campos}
        regras={regras}
        aoMudar={setRegras}
        contagem={contagem}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          className="input"
          style={{ width: 260 }}
          placeholder="Buscar por nome ou CPF…"
          aria-label="Buscar assinante"
          value={textoBusca}
          onChange={(evento) => setTextoBusca(evento.target.value)}
        />
        <div style={{ flex: 1 }} />
        {dadosPlenos ? (
          <span className="pill pill-warn">
            <i />
            exibindo dados plenos — acesso auditado
          </span>
        ) : null}
        {podePlenos ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={alternarPlenos}>
            {dadosPlenos ? "Mascarar dados" : "Exibir dados plenos"}
          </button>
        ) : (
          <span className="cap">
            Exibição plena de CPF e contato depende da permissão “visualizar dados
            pessoais plenos”.
          </span>
        )}
      </div>

      {(() => {
        const campoPerfil = campos.find((c) => c.slug === "perfil-assinatura");
        const campoUf = campos.find((c) => c.slug === "uf");
        const campoPatrocinador = campos.find((c) => c.slug === "patrocinador");
        if (!campoPerfil && !campoUf && !campoPatrocinador) return null;
        return (
          <div className="filtros-rapidos" role="group" aria-label="Filtros rápidos">
            <span className="cap" style={{ fontWeight: 700 }}>
              Filtros rápidos:
            </span>
            {campoPerfil && campoPerfil.valores ? (
              <div className="fr-chips" role="group" aria-label="Filtrar por perfil">
                {campoPerfil.valores.map((opcao) => {
                  const ativo = valorFiltroRapido("perfil-assinatura") === opcao.valor;
                  return (
                    <button
                      key={opcao.valor}
                      type="button"
                      className={ativo ? "fr-chip on" : "fr-chip"}
                      aria-pressed={ativo}
                      onClick={() =>
                        definirFiltroRapido("perfil-assinatura", ativo ? "" : opcao.valor)
                      }
                    >
                      {opcao.rotulo}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {campoUf && campoUf.valores && campoUf.valores.length > 0 ? (
              <select
                className="select select-sm"
                aria-label="Filtrar por UF"
                value={valorFiltroRapido("uf")}
                onChange={(evento) => definirFiltroRapido("uf", evento.target.value)}
              >
                <option value="">UF: todas</option>
                {campoUf.valores.map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            ) : null}
            {campoPatrocinador && campoPatrocinador.valores && campoPatrocinador.valores.length > 0 ? (
              <select
                className="select select-sm"
                aria-label="Filtrar por patrocinador"
                value={valorFiltroRapido("patrocinador")}
                onChange={(evento) => definirFiltroRapido("patrocinador", evento.target.value)}
              >
                <option value="">Patrocinador: todos</option>
                {campoPatrocinador.valores.map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        );
      })()}

      {erroConsulta ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Não foi possível carregar a carteira</h2>
            <p className="cap" style={{ maxWidth: "44ch", margin: 0 }}>
              Os filtros seguem salvos — só a consulta falhou.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 8 }}
              onClick={() => roteador.refresh()}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : !temBase ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">A base de assinantes ainda não foi importada</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              A carteira nasce da importação do arquivo do comprador. O construtor de
              filtros já está pronto para operar sobre ela.
            </p>
            <Link className="btn btn-azul" style={{ marginTop: 8 }} href="/assinantes/importacoes">
              Importar base de assinantes
            </Link>
          </div>
        </div>
      ) : carteira?.status === "AGUARDANDO_TELEMETRIA" ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Lista indisponível com a regra de uso</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              {carteira.motivo}
            </p>
          </div>
        </div>
      ) : linhas.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Nenhum assinante corresponde aos filtros</h2>
            <p className="cap" style={{ maxWidth: "44ch", margin: 0 }}>
              Afrouxe uma regra ou troque um combinador E por OU.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: 8 }}
              onClick={() => setRegras([])}
            >
              Limpar filtros
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="card"
            style={{ overflowX: "auto" }}
            tabIndex={0}
            role="region"
            aria-label="Tabela da carteira de assinantes"
          >
            <table className="tbl tbl-resp">
              <thead>
                <tr>
                  <th style={{ width: "22%" }} aria-sort={ariaSort("nome", ordenacao)}>
                    <BotaoOrdenar coluna="nome" rotulo="Assinante" ordenacao={ordenacao} aoOrdenar={ordenarPor} />
                  </th>
                  <th>Contato</th>
                  <th aria-sort={ariaSort("uf", ordenacao)}>
                    <BotaoOrdenar
                      coluna="uf"
                      rotulo="Unidades produtivas"
                      ordenacao={ordenacao}
                      aoOrdenar={ordenarPor}
                    />
                  </th>
                  <th>Preferência</th>
                  <th aria-sort={ariaSort("perfil", ordenacao)}>
                    <BotaoOrdenar coluna="perfil" rotulo="Perfil" ordenacao={ordenacao} aoOrdenar={ordenarPor} />
                  </th>
                  <th>Patrocinador</th>
                  <th>Cultura</th>
                  <th>Uso 90 d</th>
                  <th style={{ width: 34 }}>
                    <span className="sr-oculto">Abrir perfil</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr
                    key={linha.id}
                    className="click"
                    tabIndex={0}
                    onClick={() => roteador.push(`/assinantes/${linha.id}`)}
                    onKeyDown={(evento) => {
                      if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        roteador.push(`/assinantes/${linha.id}`);
                      }
                    }}
                  >
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{linha.nome}</span>
                        <span className="cap num">CPF {linha.cpf}</span>
                      </div>
                    </td>
                    <td data-label="Contato">
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span className="num">{linha.telefone ?? "—"}</span>
                        <span className="num">{linha.email ?? "—"}</span>
                      </div>
                    </td>
                    <td data-label="Unidades produtivas">
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {linha.unidadesProdutivas.length > 0
                          ? linha.unidadesProdutivas.map((unidade) => (
                              <span className="num" key={unidade}>
                                {unidade}
                              </span>
                            ))
                          : [
                              <span className="cap" key="local">
                                {linha.municipio && linha.uf
                                  ? `${linha.uf} · ${linha.municipio}`
                                  : linha.uf ?? "não derivado"}
                              </span>,
                            ]}
                      </div>
                    </td>
                    <td data-label="Preferência">
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          alignItems: "flex-start",
                        }}
                      >
                        {linha.preferencia === "ambos" ? (
                          <>
                            <span className="pill pill-neutra">agricultura</span>
                            <span className="pill pill-neutra">pecuária</span>
                          </>
                        ) : linha.preferencia ? (
                          <span className="pill pill-neutra">
                            {linha.preferencia === "pecuaria" ? "pecuária" : linha.preferencia}
                          </span>
                        ) : (
                          <span className="cap">—</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Perfil">
                      {linha.perfilAssinatura ? (
                        <span>{ROTULO_PERFIL[linha.perfilAssinatura] ?? linha.perfilAssinatura}</span>
                      ) : (
                        <span className="cap">aguarda a fonte</span>
                      )}
                    </td>
                    <td data-label="Patrocinador">
                      {linha.patrocinadores.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {linha.patrocinadores.map((patrocinador) => (
                            <span key={patrocinador}>{patrocinador}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="cap">—</span>
                      )}
                    </td>
                    <td data-label="Cultura">
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {linha.culturas.length > 0 ? (
                          linha.culturas.map((cultura) => <span key={cultura}>{cultura}</span>)
                        ) : (
                          <span className="cap">—</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Uso 90 d">
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span className="num" style={{ color: "var(--paragrafo-aaa)" }}>
                          — acessos · — resgates
                        </span>
                        <span className="selo">aguardando telemetria</span>
                      </div>
                    </td>
                    <td className="chev" style={{ color: "var(--paragrafo-aaa)" }}>
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <span className="cap">
              {linhas.some((linha) => linha.marcaSintetico)
                ? "Dados ilustrativos — nomes e CPFs sintéticos; a base real entra pela importação."
                : "Valores ausentes aparecem como “—”, nunca estimados."}
            </span>
            <span className="cap num">
              {(carteira!.pagina - 1) * carteira!.tamanhoPagina + 1}–
              {Math.min(carteira!.pagina * carteira!.tamanhoPagina, carteira!.total ?? 0)} de{" "}
              {formatarContagem(carteira!.total ?? 0)} · consulta paginada no servidor
            </span>
          </div>
          {totalPaginas > 1 ? (
            <nav
              aria-label="Paginação da carteira"
              style={{
                display: "flex",
                gap: 6,
                justifyContent: "flex-end",
                alignItems: "center",
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={carteira!.pagina <= 1}
                onClick={() => irParaPagina(carteira!.pagina - 1)}
              >
                ‹ Anterior
              </button>
              {numerosDePagina(carteira!.pagina, totalPaginas).map((numero, indice) =>
                numero === null ? (
                  <span key={`gap-${indice}`} className="cap" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={numero}
                    type="button"
                    className={numero === carteira!.pagina ? "btn btn-azul btn-sm" : "btn btn-ghost btn-sm"}
                    aria-current={numero === carteira!.pagina ? "page" : undefined}
                    onClick={() => irParaPagina(numero)}
                  >
                    {numero}
                  </button>
                ),
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={carteira!.pagina >= totalPaginas}
                onClick={() => irParaPagina(carteira!.pagina + 1)}
              >
                Próxima ›
              </button>
            </nav>
          ) : null}
        </>
      )}

      {podeGerirSegmentos && !modalSegmento && !modalExportar ? (
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {segmentoEdicaoId ? (
            <button
              type="button"
              className="btn btn-azul btn-sm"
              onClick={() => void atualizarSegmentoEmEdicao()}
            >
              Atualizar segmento em edição
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setMensagens([]);
              setModalSegmento(true);
            }}
          >
            {segmentoEdicaoId ? "Salvar como novo segmento" : "Salvar como segmento"}
          </button>
        </div>
      ) : null}

      {modalSegmento ? (
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
            if (evento.key === "Escape") setModalSegmento(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Salvar segmento"
            className="card"
            style={{ width: "min(500px,100%)", padding: "22px 24px", boxShadow: "var(--shadow-lg)" }}
          >
            <h2 className="h-el" style={{ marginBottom: 6 }}>
              Salvar segmento
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              {resumoDasRegras(regras, campos)}
              {contagem.status === "OK"
                ? ` · ${formatarContagem(contagem.total)} assinantes hoje`
                : ""}
            </p>
            {mensagens.length > 0 ? (
              <div className="aviso-inline" role="alert" style={{ margin: "0 0 12px" }}>
                <IconeAviso />
                <span>{mensagens.join(" ")}</span>
              </div>
            ) : null}
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="seg-nome">Nome do segmento</label>
              <input
                id="seg-nome"
                className="input"
                value={nomeSegmento}
                autoFocus
                onChange={(evento) => setNomeSegmento(evento.target.value)}
                placeholder="Ex.: Sudeste · agricultura · vence em 60 dias"
              />
              <span className="hint">
                O segmento guarda a regra, não a lista — a contagem é recalculada a cada
                consulta.
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModalSegmento(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-azul"
                disabled={!nomeSegmento.trim()}
                onClick={() => void salvarSegmento()}
              >
                Salvar segmento
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalExportar ? (
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
            if (evento.key === "Escape") setModalExportar(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Exportar lista de assinantes"
            className="card"
            style={{ width: "min(520px,100%)", padding: "22px 24px", boxShadow: "var(--shadow-lg)" }}
          >
            <h2 className="h-el" style={{ marginBottom: 6 }}>
              Exportar{" "}
              {contagem.status === "OK" ? formatarContagem(contagem.total) : "—"} assinantes
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              {resumoDasRegras(regras, campos)}
            </p>
            <div
              className="aviso-inline"
              style={{
                background: "var(--alerta-claro)",
                borderColor: "var(--alerta)",
                margin: "0 0 14px",
              }}
            >
              <IconeAviso />
              <span>
                A exportação materializa um snapshot com autor, data, contagem, a regra
                que gerou a lista e a finalidade declarada — tudo registrado na auditoria
                (RN34).
              </span>
            </div>
            {mensagens.length > 0 ? (
              <div className="aviso-inline" role="alert" style={{ margin: "0 0 12px" }}>
                <IconeAviso />
                <span>{mensagens.join(" ")}</span>
              </div>
            ) : null}
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="exp-fin">
                Finalidade da exportação{" "}
                <span className="cap" style={{ fontWeight: 400 }}>
                  · obrigatória
                </span>
              </label>
              <textarea
                id="exp-fin"
                className="textarea"
                rows={2}
                value={finalidade}
                autoFocus
                onChange={(evento) => setFinalidade(evento.target.value)}
                placeholder="Ex.: convite para o evento de colheita — lista entregue ao time de relacionamento"
              />
              <span className="hint">Fica gravada junto ao snapshot e é auditável.</span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModalExportar(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-azul"
                disabled={!finalidade.trim()}
                onClick={() => void exportarLista()}
              >
                Exportar lista
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {aviso ? (
        <div className="toast" role="status">
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
          {aviso}
        </div>
      ) : null}
    </div>
  );
}
