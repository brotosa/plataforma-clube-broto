import type { Metadata } from "next";
import Link from "next/link";
import type { OrigemEmpresa } from "@prisma/client";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import {
  contarAliadasAtivas,
  type FaixaScore,
  funilDeMercado,
  responsaveisComerciaisDisponiveis,
} from "@/infra/consultas/funil";
import { ROTULOS_ORIGEM } from "@/dominio/funil/regras";
import { mapaDeCobertura, painelDeMetas } from "@/infra/consultas/cobertura-metas";
import { KanbanFunil } from "./kanban";
import { MapaDeCobertura } from "./mapa-cobertura";
import {
  SegmentadoDaSecao,
  VISOES_DE_MERCADO,
} from "@/app/(plataforma)/segmentado-secao";
import { PainelDeMetas } from "./painel-metas";

export const metadata: Metadata = {
  title: "Mercado & Scout",
};

const ORIGENS_VALIDAS: ReadonlyArray<OrigemEmpresa> = [
  "SCOUTING_ATIVO",
  "INDICACAO",
  "PROCURA_ESPONTANEA",
  "LISTA_IMPORTADA",
];

const FAIXAS_VALIDAS: ReadonlyArray<FaixaScore> = ["80_100", "60_79", "40_59", "ABAIXO_40"];

const ROTULOS_FAIXA: Readonly<Record<FaixaScore, string>> = {
  "80_100": "80–100",
  "60_79": "60–79",
  "40_59": "40–59",
  ABAIXO_40: "< 40",
};

/** T8 — Funil de mercado (ficha Onda 2 §5). */
export default async function PaginaMercado({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  const usuarioId = sessao?.user?.id ?? "";
  const parametros = await searchParams;

  // Abas da T8 no protótipo v6.1: Funil · Cobertura (T13) · Metas (T14).
  const aba =
    parametros.aba === "cobertura" || parametros.aba === "metas"
      ? (parametros.aba as "cobertura" | "metas")
      : ("funil" as const);
  const visao = parametros.visao === "tabela" ? ("tabela" as const) : ("kanban" as const);
  const origem =
    typeof parametros.origem === "string" &&
    ORIGENS_VALIDAS.includes(parametros.origem as OrigemEmpresa)
      ? (parametros.origem as OrigemEmpresa)
      : undefined;
  const faixaScore =
    typeof parametros.score === "string" &&
    FAIXAS_VALIDAS.includes(parametros.score as FaixaScore)
      ? (parametros.score as FaixaScore)
      : undefined;
  const categoriaId = typeof parametros.categoria === "string" ? parametros.categoria : "";
  const minhasEmpresas = parametros.minhas === "empresas";
  const minhasNegociacoes = parametros.minhas === "negociacoes";

  const [
    { lanes, tabela, contadores, regua },
    aliadasAtivas,
    motivosDescarte,
    responsaveis,
    categorias,
  ] =
    await Promise.all([
      funilDeMercado({
        categoriaId: categoriaId || undefined,
        origem,
        faixaScore,
        minhasEmpresasDe: minhasEmpresas ? usuarioId : undefined,
        minhasNegociacoesDe: minhasNegociacoes ? usuarioId : undefined,
      }),
      contarAliadasAtivas(),
      prisma.motivoDescarte.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
      responsaveisComerciaisDisponiveis(),
      prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    ]);

  const cobertura = aba === "cobertura" ? await mapaDeCobertura() : null;
  const metas = aba === "metas" ? await painelDeMetas() : null;

  const categoriaFiltrada = categorias.find((categoria) => categoria.id === categoriaId);
  const temFiltros = Boolean(origem || faixaScore || categoriaId || minhasEmpresas || minhasNegociacoes);
  const totalVisivel = contadores.identificadas;

  const parametrosBase = new URLSearchParams();
  if (aba !== "funil") parametrosBase.set("aba", aba);
  if (visao === "tabela") parametrosBase.set("visao", "tabela");
  if (origem) parametrosBase.set("origem", origem);
  if (faixaScore) parametrosBase.set("score", faixaScore);
  if (categoriaId) parametrosBase.set("categoria", categoriaId);
  if (minhasEmpresas) parametrosBase.set("minhas", "empresas");
  if (minhasNegociacoes) parametrosBase.set("minhas", "negociacoes");
  const urlCom = (ajustes: Record<string, string | null>) => {
    const query = new URLSearchParams(parametrosBase);
    for (const [chave, valor] of Object.entries(ajustes)) {
      if (valor === null) query.delete(chave);
      else query.set(chave, valor);
    }
    const texto = query.toString();
    return texto ? `/mercado?${texto}` : "/mercado";
  };

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1400 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        {/* `flex: 1 1 0` + `minWidth: 0` no lugar do antigo espaçador.
            Com `flex-wrap: wrap`, item que não cabe QUEBRA em vez de
            encolher — e o subtítulo longo desta seção (o mais longo do
            produto) empurrava "+ Incluir empresa" para uma segunda linha
            assim que o segmentado entrou na faixa. Com base flexível zero, o
            título entra na conta como 0 e depois cresce no espaço que sobra:
            a linha fecha, e quem cede é o subtítulo, que passa a ocupar duas
            linhas. A ação nunca desce de nível. */}
        <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <h1 className="h-page">
            {aba === "cobertura" ? "Mapa de cobertura" : aba === "metas" ? "Metas" : "Funil de mercado"}
          </h1>
          <div className="cap" style={{ marginTop: 4, textWrap: "pretty" }}>
            Mercado &amp; Scout · radar de até 100 empresas/mês · 2 scouts · comercial de 8 pessoas
          </div>
        </div>
        {/* Acabamento pós-Onda 7: o segmentado sobe para a linha do cabeçalho,
            à esquerda dos botões de ação — o mesmo lugar que ele ocupa em
            Aliados & Soluções. Duas seções com o mesmo padrão em posições
            diferentes obrigam quem usa a reaprender a tela a cada módulo. */}
        <SegmentadoDaSecao
          nome="Visões do Mercado &amp; Scout"
          visoes={VISOES_DE_MERCADO}
          ativa={aba}
        />
        <Link
          href="/mercado/radar?importar=1"
          className="btn btn-ghost"
          style={{ textDecoration: "none" }}
        >
          Importar lista
        </Link>
        <Link href="/mercado/radar" className="btn btn-azul" style={{ textDecoration: "none" }}>
          + Incluir empresa
        </Link>
      </div>


      {aba === "cobertura" && cobertura ? <MapaDeCobertura cobertura={cobertura} /> : null}
      {aba === "metas" && metas ? <PainelDeMetas metas={metas} /> : null}
      {aba === "cobertura" || aba === "metas" ? (
        // A T13 e a T14 LEEM o que a T17 escreve — inclusive a meta: é uma
        // tabela só (`metas_periodo`), não uma cópia. O link fecha o
        // caminho de quem olha o número e quer mudá-lo.
        <p className="cap" style={{ margin: "12px 0 0", maxWidth: "80ch" }}>
          {aba === "metas"
            ? "As metas exibidas aqui são as mesmas que o Administrador da Plataforma define no "
            : "As listas que recortam esta cobertura (categorias e abrangência) são mantidas no "}
          <Link href={aba === "metas" ? "/parametrizador/valores" : "/parametrizador"}>
            {aba === "metas" ? "Parametrizador › Valores de regra" : "Parametrizador"}
          </Link>
          . Toda alteração vale a partir da mudança, sem recalcular período fechado (RN25).
        </p>
      ) : null}

      {aba === "funil" ? (
      <>
      <div className="contadores" style={{ marginBottom: 14 }}>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Identificadas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {contadores.identificadas}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            radar completo, inclui descartadas
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            No funil
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {contadores.noFunil}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            Mapeada → Em aprovação
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Avaliadas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {contadores.avaliadas}
          </div>
          <div className="cap" style={{ marginTop: 2 }}>
            com score ScoutCB
          </div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Descartadas
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>
            {contadores.descartadas}
          </div>
          <div style={{ marginTop: 2 }}>
            <a href={urlCom({ visao: "tabela" })} className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
              ver na tabela
            </a>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        {/* Âncoras: alternar visão muda apenas a querystring. */}
        <div className="seg">
          <a
            href={urlCom({ visao: null })}
            className={visao === "kanban" ? "on" : ""}
            aria-current={visao === "kanban" ? "true" : undefined}
            style={{ textDecoration: "none" }}
          >
            Kanban
          </a>
          <a
            href={urlCom({ visao: "tabela" })}
            className={visao === "tabela" ? "on" : ""}
            aria-current={visao === "tabela" ? "true" : undefined}
            style={{ textDecoration: "none" }}
          >
            Tabela
          </a>
        </div>
        <form method="GET" action="/mercado" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {visao === "tabela" ? <input type="hidden" name="visao" value="tabela" /> : null}
          {categoriaId ? <input type="hidden" name="categoria" value={categoriaId} /> : null}
          {minhasEmpresas ? <input type="hidden" name="minhas" value="empresas" /> : null}
          {minhasNegociacoes ? <input type="hidden" name="minhas" value="negociacoes" /> : null}
          <select className="select" style={{ width: 170 }} aria-label="Origem" name="origem" defaultValue={origem ?? ""}>
            <option value="">Origem</option>
            {ORIGENS_VALIDAS.map((valor) => (
              <option key={valor} value={valor}>
                {ROTULOS_ORIGEM[valor]}
              </option>
            ))}
          </select>
          <select className="select" style={{ width: 150 }} aria-label="Faixa de score" name="score" defaultValue={faixaScore ?? ""}>
            <option value="">Faixa de score</option>
            {FAIXAS_VALIDAS.map((faixa) => (
              <option key={faixa} value={faixa}>
                {ROTULOS_FAIXA[faixa]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost btn-sm">
            Filtrar
          </button>
        </form>
        <a
          href={urlCom({ minhas: minhasEmpresas ? null : "empresas" })}
          className={minhasEmpresas ? "chip on" : "chip"}
          style={{ textDecoration: "none" }}
        >
          Minhas empresas
          {minhasEmpresas ? <span className="sr-oculto"> (filtro ativo — remover)</span> : null}
        </a>
        <a
          href={urlCom({ minhas: minhasNegociacoes ? null : "negociacoes" })}
          className={minhasNegociacoes ? "chip on" : "chip"}
          style={{ textDecoration: "none" }}
        >
          Minhas negociações
          {minhasNegociacoes ? <span className="sr-oculto"> (filtro ativo — remover)</span> : null}
        </a>
        {categoriaFiltrada ? (
          <a href={urlCom({ categoria: null })} className="chip on" style={{ textDecoration: "none" }}>
            Categoria: {categoriaFiltrada.nome} ✕
          </a>
        ) : null}
        <div style={{ flex: 1 }} />
        <Link href="/aliados?estagio=ALIADA_ATIVA" style={{ font: "var(--font-body-label-bold)" }}>
          Aliada ativa · {aliadasAtivas} ›
        </Link>
      </div>

      {totalVisivel === 0 && !temFiltros ? (
        <div className="card">
          <div className="vazio">
            <div className="ic">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <h2 className="h-el">O radar ainda está vazio</h2>
            <p className="cap" style={{ maxWidth: "46ch", margin: 0 }}>
              Inclua a primeira empresa pelo formulário mínimo ou importe uma lista de
              prospects — a carga real virá das listas existentes.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Link href="/mercado/radar" className="btn btn-azul" style={{ textDecoration: "none" }}>
                + Incluir empresa
              </Link>
              <Link href="/mercado/radar?importar=1" className="btn btn-ghost" style={{ textDecoration: "none" }}>
                Importar lista
              </Link>
            </div>
          </div>
        </div>
      ) : totalVisivel === 0 ? (
        <div className="card">
          <div className="vazio">
            <div className="ic">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
                <path d="M8 11h6" />
              </svg>
            </div>
            <h2 className="h-el">Nenhuma empresa neste filtro</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              {categoriaFiltrada
                ? `Nenhuma empresa em prospecção para ${categoriaFiltrada.nome}. É um vazio de funil: a categoria não tem ninguém caminhando para preenchê-la.`
                : "Limpe os filtros aplicados ou inclua uma nova empresa no radar."}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              {/* F14 (ficha Onda 7 §2/RN51): quem chega aqui pelo "Buscar no
                  radar" da T29 veio verificar antes de prospectar e encontrou
                  o vazio. O caminho natural é entrar no radar AGORA, com a
                  categoria já preenchida — sem esse atalho, o gesto termina
                  num beco e a verificação vira atrito em vez de economia. */}
              {categoriaFiltrada ? (
                <Link
                  href={`/mercado/radar?categoria=${categoriaFiltrada.id}`}
                  className="btn btn-azul"
                  style={{ textDecoration: "none" }}
                >
                  + Entrar no radar
                </Link>
              ) : null}
              <Link href="/mercado" className="btn btn-ghost" style={{ textDecoration: "none" }}>
                Limpar filtros
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <KanbanFunil
          lanes={lanes}
          tabela={tabela}
          visao={visao}
          motivosDescarte={motivosDescarte}
          responsaveisComerciais={responsaveis}
          usuarioId={usuarioId}
        />
      )}

      <p className="cap" style={{ margin: "10px 0 0", maxWidth: "80ch" }}>
        Envelhecimento por estágio: leve ≥ {regua.leveDias} dias, forte ≥ {regua.forteDias}{" "}
        (régua vigente no Parametrizador). Mover registra autor e data na
        auditoria; descartar exige motivo tipificado (RN17); priorizar exige avaliação fechada
        (RN15) — avalie pelo menu do card. Score vem da avaliação ScoutCB (T10); valores
        ausentes aparecem como “—”, nunca estimados.
      </p>
      </>
      ) : null}
    </div>
  );
}
