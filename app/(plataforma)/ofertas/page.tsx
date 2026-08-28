import type { Metadata } from "next";
import type { NaturezaOferta, Prisma, StatusOferta } from "@prisma/client";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { kpiVitrineViva, resumoTelemetriaPorOferta } from "@/infra/consultas/telemetria";
import { contadoresPorOferta } from "@/infra/consultas/telemetria-operadora";
import { lerRegua } from "@/infra/configuracao/servico-configuracao";
import { estaAVencer } from "@/dominio/ofertas/regras";
import {
  FILTROS_TELEMETRIA,
  ORDENS_LISTA,
  ordenarLista,
  passaFiltroTelemetria,
  type FiltroTelemetria,
  type LinhaOrdenavel,
  type OrdemLista,
} from "@/dominio/ofertas/ordenacao-lista";
import { PublicarTodasElegiveis } from "./publicar-todas";

export const metadata: Metadata = {
  title: "Ofertas",
};

const ROTULO_NATUREZA: Record<string, string> = {
  RECOMPENSA: "Recompensa",
  BENEFICIO: "Benefício (Checkout Broto)",
  CUPOM_DESCONTO: "Desconto (Checkout Externo)",
};

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
  EXPIRADA: "Expirada",
};

/** Recorte por vigência — todos por querystring, validados contra esta lista. */
const VIGENCIAS = ["a-vencer", "vigente", "encerrada", "indeterminada"] as const;
type Vigencia = (typeof VIGENCIAS)[number];
const ROTULO_VIGENCIA: Record<Vigencia, string> = {
  "a-vencer": "A vencer",
  vigente: "Vigente",
  encerrada: "Encerrada",
  indeterminada: "Sem prazo (indeterminada)",
};

const ROTULO_TELEMETRIA: Record<FiltroTelemetria, string> = {
  "com-emissao": "Com emissão",
  "com-resg-extrato": "Com resgate (extrato)",
  "com-compra-extrato": "Com compra (extrato)",
  "com-resg-catalogo": "Com resgate (catálogo)",
  "com-compra-catalogo": "Com compra (catálogo)",
  "sem-telemetria": "Sem telemetria",
};

function formatarData(data: Date | null): string {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(data);
}

/**
 * T4 — Lista transversal de ofertas com telemetria por oferta (F4): vouchers
 * emitidos/resgatados, compras confirmadas, KPI "vitrine viva" (resgate em
 * 90 d) e a distinção fora-da-Plataforma (resgate aguardando conciliação) ×
 * compra confirmada. Ações de publicação e importação no topo (por papel).
 *
 * **Filtro e ordenação por TODAS as colunas.** As colunas de negócio
 * (título, aliado, natureza, status, vigência) filtram no banco; as de
 * telemetria vivem em outras tabelas (RN68), então o conjunto é anotado em
 * memória e o filtro "com/sem telemetria" e a ordenação por qualquer coluna
 * numérica acontecem sobre ele, pela lógica pura de `ordenacao-lista.ts`. O
 * catálogo de ofertas é conjunto contido (196 na base) — anotar o conjunto
 * inteiro é barato e mantém a ordenação correta; a lista exibe as 50
 * primeiras e a contagem filtrada acompanha.
 */
export default async function PaginaOfertas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeGerarExport = podeExecutar(papel, "GERAR_EXPORTACAO");
  const podeImportar = podeExecutar(papel, "IMPORTAR_TELEMETRIA");
  const podePublicar = podeExecutar(papel, "PUBLICAR_PAUSAR_ENCERRAR_OFERTA");

  const parametros = await searchParams;
  const hoje = new Date();
  // Régua "vigência a vencer" (15 dias na implantação): alterá-la na T17
  // muda o alerta na próxima visita, sem tocar em nada gravado. Lida antes
  // da lista porque o filtro do cartão de pendência do Dashboard usa a mesma
  // janela — a lista recortada bate com a contagem que levou o usuário aqui.
  const janelaVigencia = await lerRegua("OFERTA_VIGENCIA_A_VENCER_DIAS");
  const limiteVigencia = new Date(hoje.getTime() + janelaVigencia * 24 * 60 * 60 * 1000);

  // Filtros da lista, todos por querystring (entrada de usuário → validada
  // contra a allowlist de cada enum; lixo cai no "sem filtro"). A busca casa
  // título OU nome do aliado.
  const NATUREZAS: ReadonlyArray<NaturezaOferta> = ["RECOMPENSA", "BENEFICIO", "CUPOM_DESCONTO"];
  const STATUSES: ReadonlyArray<StatusOferta> = [
    "RASCUNHO",
    "PUBLICADA",
    "PAUSADA",
    "ENCERRADA",
    "EXPIRADA",
  ];
  const paramTexto = (valor: string | string[] | undefined) =>
    typeof valor === "string" ? valor.trim() : "";
  const busca = paramTexto(parametros.busca);
  const naturezaSel = NATUREZAS.find((n) => n === parametros.natureza) ?? null;
  const statusSel = STATUSES.find((s) => s === parametros.status) ?? null;
  const vigenciaSel = VIGENCIAS.find((v) => v === parametros.vigencia) ?? null;
  const telemetriaSel = FILTROS_TELEMETRIA.find((t) => t === parametros.tel) ?? null;
  const ordemSel = ORDENS_LISTA.find((o) => o === parametros.ordem) ?? null;
  const direcao: "asc" | "desc" = parametros.dir === "desc" ? "desc" : "asc";
  const filtrarAVencer = vigenciaSel === "a-vencer";
  const temFiltro =
    busca !== "" ||
    naturezaSel !== null ||
    statusSel !== null ||
    vigenciaSel !== null ||
    telemetriaSel !== null;

  // O recorte por vigência entra num AND próprio para conviver com o filtro
  // de status sem se sobrepor. O preset "a-vencer" vem do painel de
  // pendências e restringe status quando o usuário não escolheu um.
  const clausulasVigencia: Prisma.OfertaWhereInput[] = [];
  if (vigenciaSel === "a-vencer") {
    if (!statusSel) clausulasVigencia.push({ status: { in: ["RASCUNHO", "PUBLICADA", "PAUSADA"] } });
    clausulasVigencia.push({ vigenciaFim: { not: null, gte: hoje, lte: limiteVigencia } });
  } else if (vigenciaSel === "vigente") {
    // Início sempre existe (coluna obrigatória); só o fim pode ser nulo.
    clausulasVigencia.push({ vigenciaInicio: { lte: hoje } });
    clausulasVigencia.push({ OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: hoje } }] });
  } else if (vigenciaSel === "encerrada") {
    clausulasVigencia.push({ vigenciaFim: { not: null, lt: hoje } });
  } else if (vigenciaSel === "indeterminada") {
    clausulasVigencia.push({ vigenciaFim: null });
  }

  const ondeOfertas: Prisma.OfertaWhereInput = {
    ...(busca === ""
      ? {}
      : {
          OR: [
            { titulo: { contains: busca, mode: "insensitive" as const } },
            {
              solucao: {
                empresa: { nomeFantasia: { contains: busca, mode: "insensitive" as const } },
              },
            },
          ],
        }),
    ...(naturezaSel ? { natureza: naturezaSel } : {}),
    ...(statusSel ? { status: statusSel } : {}),
    ...(clausulasVigencia.length ? { AND: clausulasVigencia } : {}),
  };

  const [totalOfertas, ofertasPublicadas, pendentesRepublicacao, candidatasAPublicar, ofertasTodas, vitrine] =
    await Promise.all([
      prisma.oferta.count(),
      prisma.oferta.count({ where: { status: "PUBLICADA" } }),
      prisma.oferta.count({ where: { pendenteRepublicacao: true } }),
      // Elegíveis à publicação em massa: rascunho ou pausada. (A contagem é
      // do universo; a elegibilidade fina — RN02/RN09/RN11 — é por oferta.)
      podePublicar
        ? prisma.oferta.count({ where: { status: { in: ["RASCUNHO", "PAUSADA"] } } })
        : Promise.resolve(0),
      // Conjunto contido: buscamos TODAS as ofertas que casam o filtro de
      // banco (busca/natureza/status/vigência) para poder ordenar e filtrar
      // por telemetria em memória. A lista exibe só as 50 primeiras.
      prisma.oferta.findMany({
        where: ondeOfertas,
        orderBy: { atualizadoEm: "desc" },
        include: {
          tipoBeneficio: true,
          mecanica: true,
          solucao: { include: { empresa: { select: { id: true, nomeFantasia: true } } } },
        },
      }),
      kpiVitrineViva(),
    ]);

  const idsTodas = ofertasTodas.map((oferta) => oferta.id);
  const [telemetria, contadoresDeCatalogo] = await Promise.all([
    resumoTelemetriaPorOferta(idsTodas),
    // F20 (RN68) — a OUTRA contagem, pela consulta única da telemetria da
    // operadora. Fica em coluna própria, com a data do retrato no título:
    // as duas nunca se somam nem se apresentam como o mesmo número.
    contadoresPorOferta(idsTodas),
  ]);

  // Conjunto anotado: cada oferta com as cinco medidas de telemetria já
  // resolvidas. O catálogo distingue ausência (sem import) de zero medido —
  // `resgCatalogo`/`comprasCatalogo` são `null` na ausência, e ordenam/filtram
  // como tal (RN53).
  type Linha = {
    oferta: (typeof ofertasTodas)[number];
    emitidos: number;
    resgExtrato: number;
    comprasExtrato: number;
    resgCatalogo: number | null;
    comprasCatalogo: number | null;
    temCatalogo: boolean;
    catalogoData: Date | null;
    resgateRecente: boolean;
  };
  const linhas: Linha[] = ofertasTodas.map((oferta) => {
    const resumo = telemetria.get(oferta.id);
    const catalogo = contadoresDeCatalogo.get(oferta.id);
    return {
      oferta,
      emitidos: resumo?.emitidos ?? 0,
      resgExtrato: resumo?.resgatados ?? 0,
      comprasExtrato: resumo?.comprasConfirmadas ?? 0,
      resgCatalogo: catalogo ? catalogo.resgates : null,
      comprasCatalogo: catalogo ? catalogo.compras : null,
      temCatalogo: Boolean(catalogo),
      catalogoData: catalogo?.dataArquivo ?? null,
      resgateRecente: resumo?.resgateRecente ?? false,
    };
  });

  // Projeção para a lógica pura de ordenação/filtro (desacoplada do Prisma).
  const projetar = (linha: Linha): LinhaOrdenavel => ({
    titulo: linha.oferta.titulo,
    aliadoNome: linha.oferta.solucao.empresa.nomeFantasia,
    naturezaRotulo: ROTULO_NATUREZA[linha.oferta.natureza] ?? "",
    statusRotulo: ROTULO_STATUS[linha.oferta.status] ?? "",
    emitidos: linha.emitidos,
    resgExtrato: linha.resgExtrato,
    comprasExtrato: linha.comprasExtrato,
    resgCatalogo: linha.resgCatalogo,
    comprasCatalogo: linha.comprasCatalogo,
    temCatalogo: linha.temCatalogo,
    vigenciaFimMs: linha.oferta.vigenciaFim?.getTime() ?? null,
    atualizadoEmMs: linha.oferta.atualizadoEm.getTime(),
  });

  const linhasFiltradas =
    telemetriaSel === null
      ? linhas
      : linhas.filter((linha) => passaFiltroTelemetria(projetar(linha), telemetriaSel));
  // Sem `ordem` explícita mantém a ordem do banco (mais recentes primeiro).
  const ordenadas =
    ordemSel === null
      ? linhasFiltradas
      : ordenarLista(linhasFiltradas, projetar, ordemSel, direcao);

  const totalFiltrado = ordenadas.length;
  const exibidas = ordenadas.slice(0, 50);

  const percentualVivo =
    vitrine.totalPublicadas > 0
      ? Math.round((vitrine.publicadasComResgate / vitrine.totalPublicadas) * 100)
      : null;

  // Base de parâmetros preservada nas âncoras de ordenação (só a query muda).
  const filtrosBase: Record<string, string> = {};
  if (busca) filtrosBase.busca = busca;
  if (naturezaSel) filtrosBase.natureza = naturezaSel;
  if (statusSel) filtrosBase.status = statusSel;
  if (vigenciaSel) filtrosBase.vigencia = vigenciaSel;
  if (telemetriaSel) filtrosBase.tel = telemetriaSel;

  function urlDeOrdem(coluna: OrdemLista): string {
    // Clicar na coluna ativa inverte a direção; nas demais começa ascendente.
    const proximaDir = ordemSel === coluna && direcao === "asc" ? "desc" : "asc";
    const query = new URLSearchParams(filtrosBase);
    query.set("ordem", coluna);
    query.set("dir", proximaDir);
    return `/ofertas?${query.toString()}`;
  }

  function cabecalhoOrdenavel(
    coluna: OrdemLista,
    rotulo: string,
    opcoes: { largura?: string; direita?: boolean } = {},
  ) {
    const ativo = ordemSel === coluna;
    const seta = !ativo ? "↕" : direcao === "asc" ? "↑" : "↓";
    return (
      <th
        style={{ width: opcoes.largura, textAlign: opcoes.direita ? "right" : undefined }}
        aria-sort={ativo ? (direcao === "asc" ? "ascending" : "descending") : "none"}
      >
        {/* Âncora nativa: navegação que só troca a query (convenção do
            CLAUDE.md — o Router Cache descartava o payload RSC com <Link>). */}
        <a
          href={urlDeOrdem(coluna)}
          className="th-ordenar"
          style={{ textDecoration: "none" }}
          aria-label={`Ordenar por ${rotulo}${
            ativo ? (direcao === "asc" ? ", ascendente" : ", descendente") : ""
          }`}
        >
          <span>{rotulo}</span>
          <span aria-hidden="true" className={ativo ? "seta-ativa" : "seta"}>
            {seta}
          </span>
        </a>
      </th>
    );
  }

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 className="h-page">Ofertas</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Visão transversal da vitrine, com telemetria por oferta, vigências e status
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podePublicar ? <PublicarTodasElegiveis candidatas={candidatasAPublicar} /> : null}
        {podeGerarExport ? (
          <Link href="/ofertas/publicacao" className="btn btn-azul" style={{ textDecoration: "none" }}>
            Publicar catálogo
          </Link>
        ) : null}
        <Link
          href="/ofertas/telemetria-operadora"
          className="btn btn-ghost"
          style={{ textDecoration: "none" }}
        >
          Telemetria da operadora
        </Link>
        {podeImportar ? (
          <Link href="/ofertas/telemetria" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Importar telemetria
          </Link>
        ) : null}
        {podeExecutar(papel, "CRIAR_EDITAR") ? (
          <Link href="/ofertas/importar" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Importar ofertas
          </Link>
        ) : null}
      </div>

      <div className="contadores" style={{ marginBottom: 18 }}>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Total de ofertas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {totalOfertas}
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Publicadas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {ofertasPublicadas}
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Pendentes de republicação
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {pendentesRepublicacao}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            limpas no próximo export (RN10)
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Vitrine viva (resgate em {vitrine.janelaEmDias} d)
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {percentualVivo === null ? "—" : `${percentualVivo}%`}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            {vitrine.publicadasComResgate} de {vitrine.totalPublicadas} publicadas
          </div>
        </div>
      </div>

      {filtrarAVencer ? (
        <div
          className="aviso-inline"
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}
        >
          <span>
            Mostrando <b>ofertas com vigência a vencer</b> (nos próximos {janelaVigencia} dias).
          </span>
          {/* Âncora nativa: navegação que só limpa a query (convenção do
              CLAUDE.md). O lint pede <Link> para páginas internas; a convenção
              medida vence, e a exceção fica declarada aqui. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/ofertas" className="chip on" style={{ textDecoration: "none" }}>
            Limpar filtro
          </a>
        </div>
      ) : null}

      {/* Filtros por querystring: um <form method="get"> é navegação nativa
          (full navigation), então não esbarra no Router Cache que a cerca
          `navegacao-por-query.test.ts` documenta — nem precisa de <Link>. Os
          campos ocultos preservam a ordenação ao reenviar o filtro. */}
      <form
        method="get"
        action="/ofertas"
        className="g-resp"
        style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}
      >
        <div className="field" style={{ flex: "1 1 240px", margin: 0 }}>
          <label htmlFor="filtro-oferta-busca">Buscar por título ou aliado</label>
          <input
            id="filtro-oferta-busca"
            name="busca"
            className="input"
            type="search"
            placeholder="Título da oferta ou nome do aliado…"
            defaultValue={busca}
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="filtro-oferta-natureza">Natureza</label>
          <select
            id="filtro-oferta-natureza"
            name="natureza"
            className="select"
            defaultValue={naturezaSel ?? ""}
          >
            <option value="">Todas</option>
            {NATUREZAS.map((natureza) => (
              <option key={natureza} value={natureza}>
                {ROTULO_NATUREZA[natureza]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="filtro-oferta-status">Status</label>
          <select
            id="filtro-oferta-status"
            name="status"
            className="select"
            defaultValue={statusSel ?? ""}
          >
            <option value="">Todos</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {ROTULO_STATUS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="filtro-oferta-vigencia">Vigência</label>
          <select
            id="filtro-oferta-vigencia"
            name="vigencia"
            className="select"
            defaultValue={vigenciaSel ?? ""}
          >
            <option value="">Todas</option>
            {VIGENCIAS.map((vigencia) => (
              <option key={vigencia} value={vigencia}>
                {ROTULO_VIGENCIA[vigencia]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="filtro-oferta-telemetria">Telemetria</label>
          <select
            id="filtro-oferta-telemetria"
            name="tel"
            className="select"
            defaultValue={telemetriaSel ?? ""}
          >
            <option value="">Qualquer</option>
            {FILTROS_TELEMETRIA.map((tel) => (
              <option key={tel} value={tel}>
                {ROTULO_TELEMETRIA[tel]}
              </option>
            ))}
          </select>
        </div>
        {ordemSel ? <input type="hidden" name="ordem" value={ordemSel} /> : null}
        {ordemSel ? <input type="hidden" name="dir" value={direcao} /> : null}
        <button type="submit" className="btn btn-azul">
          Filtrar
        </button>
        {temFiltro ? (
          // Âncora nativa: só limpa a query (convenção do CLAUDE.md).
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/ofertas" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Limpar filtros
          </a>
        ) : null}
      </form>

      <div className="cap" style={{ marginBottom: 10 }} aria-live="polite">
        {temFiltro
          ? `${totalFiltrado} oferta(s) no filtro`
          : `${totalFiltrado} oferta(s)`}
        {totalFiltrado > 50 ? " · mostrando as 50 primeiras" : ""}
      </div>

      {exibidas.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2H2v10l9.3 9.3a1.5 1.5 0 0 0 2.1 0l7.9-7.9a1.5 1.5 0 0 0 0-2.1zM7 7h.01" />
              </svg>
            </span>
            <h2 className="h-el">
              {temFiltro
                ? "Nenhuma oferta corresponde aos filtros"
                : "Nenhuma oferta cadastrada"}
            </h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              {temFiltro
                ? "Ajuste a busca, a natureza, o status, a vigência ou a telemetria para ver mais ofertas."
                : "Ofertas nascem dentro de uma solução, na ficha do aliado. A carga inicial também povoa esta lista."}
            </p>
            <Link href="/aliados" className="btn btn-ghost" style={{ marginTop: 8, textDecoration: "none" }}>
              Ir para Aliados
            </Link>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl tbl-resp">
            <thead>
              <tr>
                {cabecalhoOrdenavel("titulo", "Título", { largura: "24%" })}
                {cabecalhoOrdenavel("aliado", "Aliado")}
                {cabecalhoOrdenavel("natureza", "Natureza")}
                {cabecalhoOrdenavel("status", "Status")}
                {cabecalhoOrdenavel("emitidos", "Emitidos", { direita: true })}
                {/*
                  F20 (RN68) — a origem de cada contagem fica NO cabeçalho. O
                  extrato (evento nominal, telemetria da F4) e o catálogo
                  (contador acumulado da operadora) medem coisas diferentes e
                  divergem hoje; sem o rótulo, duas colunas de "resgates" com
                  números distintos pareceriam defeito.
                */}
                {cabecalhoOrdenavel("resg-extrato", "Resgatados (extrato)", { direita: true })}
                {cabecalhoOrdenavel("compra-extrato", "Compras (extrato)", { direita: true })}
                {cabecalhoOrdenavel("resg-catalogo", "Resgates (catálogo)", { direita: true })}
                {cabecalhoOrdenavel("compra-catalogo", "Compras (catálogo)", { direita: true })}
                {cabecalhoOrdenavel("vigencia", "Vigência")}
              </tr>
            </thead>
            <tbody>
              {exibidas.map((linha) => {
                const { oferta } = linha;
                const retrato = linha.temCatalogo
                  ? linha.catalogoData
                    ? `Contador acumulado do catálogo da operadora · retrato de ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(linha.catalogoData)}. Nunca somado ao extrato (RN68).`
                    : "Contador acumulado do catálogo da operadora · o arquivo não declarou a data do retrato. Nunca somado ao extrato (RN68)."
                  : "Sem contador do catálogo: nenhum relatório da operadora importado para esta oferta.";
                const foraDaPlataforma = oferta.mecanica.slug === "CHECKOUT_EXTERNO";
                const numero = (valor: number | null | undefined) =>
                  valor && valor > 0 ? valor.toLocaleString("pt-BR") : "—";
                return (
                  <tr key={oferta.id} className="click">
                    <td data-label="Título">
                      <Link href={`/ofertas/${oferta.id}`} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
                        {oferta.titulo}
                      </Link>
                      {oferta.pendenteRepublicacao ? (
                        <span className="pill pill-warn" style={{ marginLeft: 8 }}>
                          <i aria-hidden="true" />
                          republicar
                        </span>
                      ) : null}
                      {linha.resgateRecente ? (
                        <span className="pill pill-ok" style={{ marginLeft: 8 }}>
                          <i aria-hidden="true" />
                          viva
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Aliado">
                      <Link href={`/aliados/${oferta.solucao.empresa.id}`} style={{ color: "inherit" }}>
                        {oferta.solucao.empresa.nomeFantasia}
                      </Link>
                    </td>
                    <td data-label="Natureza" className="cap">
                      {ROTULO_NATUREZA[oferta.natureza]}
                    </td>
                    <td data-label="Status">
                      <span className={oferta.status === "PUBLICADA" ? "pill pill-ok" : "pill pill-neutra"}>
                        <i aria-hidden="true" />
                        {ROTULO_STATUS[oferta.status]}
                      </span>
                    </td>
                    <td data-label="Emitidos" className="num" style={{ textAlign: "right" }}>
                      {numero(linha.emitidos)}
                    </td>
                    <td
                      data-label="Resgatados (extrato)"
                      className="num"
                      style={{ textAlign: "right" }}
                      title={
                        foraDaPlataforma && linha.resgExtrato > 0
                          ? "Fora da Plataforma: resgate aguardando conciliação mensal (ficha §6)."
                          : undefined
                      }
                    >
                      {numero(linha.resgExtrato)}
                      {foraDaPlataforma && linha.resgExtrato > 0 ? (
                        <span className="cap" style={{ marginLeft: 4 }}>
                          *
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Compras (extrato)" className="num" style={{ textAlign: "right" }}>
                      {numero(linha.comprasExtrato)}
                    </td>
                    <td
                      data-label="Resgates (catálogo)"
                      className="num"
                      style={{ textAlign: "right" }}
                      title={retrato}
                    >
                      {linha.temCatalogo ? numero(linha.resgCatalogo) : "—"}
                    </td>
                    <td
                      data-label="Compras (catálogo)"
                      className="num"
                      style={{ textAlign: "right" }}
                      title={retrato}
                    >
                      {linha.temCatalogo ? numero(linha.comprasCatalogo) : "—"}
                    </td>
                    <td data-label="Vigência" className="num cap">
                      {formatarData(oferta.vigenciaInicio)} –{" "}
                      {oferta.vigenciaFim ? formatarData(oferta.vigenciaFim) : "indeterminado"}
                      {oferta.status === "PUBLICADA" &&
                      estaAVencer(oferta.vigenciaFim, hoje, janelaVigencia) ? (
                        <span
                          className="pill pill-pendente"
                          style={{ marginLeft: 6 }}
                          title={`Vigência termina em até ${janelaVigencia} dias (régua vigente no Parametrizador).`}
                        >
                          a vencer
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="cap" style={{ marginTop: 10, maxWidth: "80ch" }}>
        Telemetria por oferta deriva exclusivamente dos eventos importados (RN07); ofertas
        sem eventos aparecem como “—”, nunca estimadas. <b>*</b> resgates fora da Plataforma
        aguardam conciliação mensal — distintos de compra confirmada (ficha §6).
      </p>
    </div>
  );
}
