import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { prisma } from "@/infra/prisma/cliente";
import {
  lerRecusasPorCausa,
  TEXTO_DA_CAUSA,
  type CausaDeRecusa,
} from "@/dominio/telemetria-operadora/causas";
import { EnviadorDeRelatorio } from "./enviador";

export const metadata: Metadata = {
  title: "Telemetria da operadora",
};

/**
 * T34 — Telemetria da operadora (ficha da Onda 12 §5).
 *
 * **Não há protótipo para ela**: é tela utilitária, e reusa o padrão das
 * telas de importação que já existem (carga inicial e importação de
 * assinantes) com os componentes do `dseed-admin.css` — `card`, `tbl`,
 * `pill`, `cap`, `aviso-inline`, `kpi-row`/`kpi-cel`. **Nenhuma classe
 * nova foi criada.**
 *
 * Três blocos, na ordem em que se usa a tela: enviar, conferir o que
 * entrou, e ler o que difere do cadastro.
 *
 * **O layout não se escolhe aqui.** É detectado pelo cabeçalho (RN67) —
 * um seletor seria uma chance a mais de gravar no lugar errado. E **nada
 * nesta tela edita dado da operadora**: contador, evento e divergência
 * são somente leitura, porque a correção se faz na origem, sob pena de a
 * próxima importação a desfazer em silêncio.
 *
 * O envio fica em `enviador.tsx`, com estado próprio em vez do
 * `FormularioComEstado` genérico — não é preferência, é a correção de
 * defeito da F17 (ver o comentário de lá e o README).
 */

const ROTULO_DO_LAYOUT: Readonly<Record<string, string>> = {
  USUARIOS: "Base de usuários",
  RESGATES: "Extrato de resgates",
  SELLERS: "Catálogo de sellers",
  OFERTAS: "Catálogo de ofertas",
};

const ROTULO_DA_DIVERGENCIA: Readonly<Record<string, string>> = {
  AUSENTE_NA_OPERADORA: "ativa aqui, ausente lá",
  AUSENTE_NA_PLATAFORMA: "existe lá, desconhecida aqui",
  ATRIBUTO_DIVERGENTE: "atributo divergente",
};

/**
 * Teto da lista. Existe porque um catálogo grande produz centenas de
 * linhas, e a tela precisa abrir. **O corte é declarado abaixo**, nunca
 * silencioso: lista truncada sem aviso se lê como "é só isso".
 */
const LIMITE_DE_DIVERGENCIAS = 100;

/**
 * As divergências da lista, com prioridade EXPLÍCITA por tipo.
 *
 * **Duas consultas, e não um `orderBy` por tipo — isto é correção de um
 * defeito real.** Uma importação grava todas as suas divergências na
 * mesma transação, então `criadoEm` empata entre elas e o desempate fica
 * ao acaso do banco. Medido na primeira execução do e2e: um catálogo com
 * 148 ofertas ativas na plataforma produziu 148 linhas de "ausente na
 * operadora" e **1** de "existe lá, desconhecida aqui" — e foi
 * exatamente essa que caiu fora do corte de 100.
 *
 * A primeira tentativa de conserto foi `orderBy: { tipo: "asc" }`, e ela
 * estava errada: enum do PostgreSQL ordena pela **ordem de declaração**,
 * não pela alfabética, e a declaração começa justamente por
 * `AUSENTE_NA_OPERADORA`. O critério passa a ser declarado aqui, onde se
 * lê, em vez de depender da ordem em que os valores foram escritos no
 * schema — que ninguém vai lembrar de conferir ao acrescentar um tipo.
 *
 * A prioridade: item que a operadora publica e a plataforma desconhece,
 * e atributo divergente, vêm primeiro — são os acionáveis. "Ausente na
 * operadora" costuma ser volume (publicação que ainda não chegou lá) e
 * preenche o que sobrar.
 */
async function divergenciasPriorizadas() {
  const inclusao = {
    importacao: { select: { tipoLayout: true, criadoEm: true } },
  } as const;
  const ordem = [
    { importacao: { criadoEm: "desc" } },
    { identificador: "asc" },
  ] as const;

  const acionaveis = await prisma.divergenciaDeCatalogo.findMany({
    where: { tipo: { in: ["AUSENTE_NA_PLATAFORMA", "ATRIBUTO_DIVERGENTE"] } },
    orderBy: [...ordem],
    take: LIMITE_DE_DIVERGENCIAS,
    include: inclusao,
  });
  if (acionaveis.length >= LIMITE_DE_DIVERGENCIAS) {
    return acionaveis;
  }
  const volume = await prisma.divergenciaDeCatalogo.findMany({
    where: { tipo: "AUSENTE_NA_OPERADORA" },
    orderBy: [...ordem],
    take: LIMITE_DE_DIVERGENCIAS - acionaveis.length,
    include: inclusao,
  });
  return [...acionaveis, ...volume];
}

function dataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

function dataCurta(data: Date | null): string {
  return data
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(data)
    : "não declarada";
}

export default async function PaginaTelemetriaDaOperadora() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeImportar = podeExecutar(papel, "IMPORTAR_TELEMETRIA");

  const [importacoes, divergencias, totalDeDivergencias] = await Promise.all([
    prisma.importacaoTelemetria.findMany({
      orderBy: { criadoEm: "desc" },
      take: 20,
      include: {
        autor: { select: { nome: true } },
        _count: { select: { divergencias: true, contadores: true, eventos: true } },
      },
    }),
    divergenciasPriorizadas(),
    prisma.divergenciaDeCatalogo.count(),
  ]);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1080 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/ofertas">Ofertas</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Telemetria da operadora</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Telemetria da operadora</h1>
        <p className="cap" style={{ marginTop: 4, maxWidth: "82ch" }}>
          Ingestão dos quatro relatórios que a operadora entrega. O tipo é reconhecido pelo
          cabeçalho do arquivo, não pelo nome — o nome traz sufixo que muda a cada geração.
          Os relatórios são acumulados: reenviar o mesmo arquivo não duplica nada nem altera
          contagem. O dado da operadora é somente leitura aqui; correção se faz na origem.
        </p>
      </div>

      {podeImportar ? (
        <div className="card" style={{ padding: "16px 18px", marginBottom: 22, maxWidth: 660 }}>
          <EnviadorDeRelatorio />
          <p className="cap" style={{ margin: "14px 0 6px" }}>
            Na dúvida sobre o formato do relatório de resgates/compras, baixe a referência das
            colunas esperadas (a operadora é quem gera o arquivo — isto não é um formulário a
            preencher):
          </p>
          {/* Route handler que devolve arquivo (não é página): âncora nativa,
              nunca <Link> — prefetch de um download não faz sentido. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/ofertas/telemetria-operadora/modelo"
            className="btn btn-ghost"
            style={{ textDecoration: "none" }}
          >
            Baixar modelo de referência (.csv)
          </a>
        </div>
      ) : (
        <p className="aviso-inline" style={{ marginBottom: 22 }}>
          <span aria-hidden="true">•</span>
          Envio restrito a Gestor e Analista (ficha da Onda 12 §8). O histórico e as
          divergências abaixo são visíveis a todos os papéis.
        </p>
      )}

      <h2 className="h-el" style={{ marginBottom: 10 }}>
        Histórico de importações
      </h2>
      {importacoes.length === 0 ? (
        <p className="cap" style={{ marginBottom: 26 }}>
          Nenhum relatório da operadora importado ainda. Enquanto não houver importação, os
          indicadores de resgate seguem exibindo a espera com o motivo — nunca um número
          aproximado.
        </p>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 26 }}>
          <table className="tbl tbl-resp">
            <caption className="sr-oculto">
              Importações de telemetria da operadora, da mais recente para a mais antiga
            </caption>
            <thead>
              <tr>
                <th scope="col">Relatório</th>
                <th scope="col">Arquivo</th>
                <th scope="col">Enviado</th>
                <th scope="col">Data do retrato</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {importacoes.map((importacao) => {
                const recusas = lerRecusasPorCausa(importacao.recusasPorCausa);
                const causas = Object.entries(recusas) as Array<[CausaDeRecusa, number]>;
                return (
                  <tr key={importacao.id}>
                    <td data-label="Relatório">
                      {ROTULO_DO_LAYOUT[importacao.tipoLayout] ?? importacao.tipoLayout}
                    </td>
                    <td data-label="Arquivo" className="mono" style={{ wordBreak: "break-all" }}>
                      {importacao.nomeArquivo}
                    </td>
                    <td data-label="Enviado">
                      {dataHora(importacao.criadoEm)}
                      <br />
                      <span className="cap">{importacao.autor.nome}</span>
                    </td>
                    <td data-label="Data do retrato">{dataCurta(importacao.dataGeracaoDeclarada)}</td>
                    <td data-label="Resultado">
                      {/*
                        `minWidth: 0` e quebra por palavra: a 380px o
                        `.tbl-resp` transforma a célula em linha flex, e o
                        lado do valor não encolhe por padrão. Sem isto a
                        lista de causas — texto longo por desenho, porque
                        nomeia a causa (RN55) — empurra a tabela para fora
                        da viewport e o axe acusa `scrollable-region-
                        focusable`: um container que rola e o teclado não
                        alcança.
                      */}
                      <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      <span className="pill pill-ok">
                        <i aria-hidden="true" />
                        {importacao.aplicadas} aplicada(s)
                      </span>{" "}
                      {importacao.recusadas > 0 ? (
                        <span className="pill pill-warn">
                          <i aria-hidden="true" />
                          {importacao.recusadas} recusada(s)
                        </span>
                      ) : null}{" "}
                      {importacao._count.divergencias > 0 ? (
                        <span className="pill pill-pendente">
                          <i aria-hidden="true" />
                          {importacao._count.divergencias} divergência(s)
                        </span>
                      ) : null}
                      <div className="cap" style={{ marginTop: 4 }}>
                        {importacao.lidas} linha(s) lida(s)
                      </div>
                      {causas.length > 0 ? (
                        <ul className="cap" style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                          {causas.map(([causa, quantidade]) => (
                            <li key={causa}>
                              {quantidade} — {TEXTO_DA_CAUSA[causa]}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="h-el" style={{ marginBottom: 6 }}>
        Divergências de catálogo
      </h2>
      <p className="cap" style={{ margin: "0 0 10px", maxWidth: "82ch" }}>
        A plataforma é a origem do cadastro; a operadora é o espelho do que está publicado.
        O que difere é <b>relatado aqui e nunca corrigido automaticamente</b> (RN70) — nem o
        nome, nem o status. A correção se faz no módulo de origem, por decisão humana e com
        auditoria.
        {totalDeDivergencias > LIMITE_DE_DIVERGENCIAS ? (
          <>
            {" "}
            Exibindo as {LIMITE_DE_DIVERGENCIAS} primeiras de{" "}
            {totalDeDivergencias.toLocaleString("pt-BR")} — as de item desconhecido na
            plataforma vêm antes, por serem as acionáveis.
          </>
        ) : null}
      </p>
      {divergencias.length === 0 ? (
        <p className="cap">
          Nenhuma divergência registrada. Sem importação de catálogo, esta lista fica vazia
          por não haver o que comparar — o que é diferente de os dois lados concordarem.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl tbl-resp">
            <caption className="sr-oculto">
              Divergências entre o cadastro da plataforma e o catálogo da operadora
            </caption>
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Identificador</th>
                <th scope="col">O que difere</th>
                <th scope="col">Apurada em</th>
              </tr>
            </thead>
            <tbody>
              {divergencias.map((divergencia) => (
                <tr key={divergencia.id}>
                  <td data-label="Tipo">
                    <span className="pill pill-pendente">
                      <i aria-hidden="true" />
                      {ROTULO_DA_DIVERGENCIA[divergencia.tipo] ?? divergencia.tipo}
                    </span>
                  </td>
                  <td data-label="Identificador" className="mono" style={{ wordBreak: "break-all" }}>
                    {divergencia.identificador}
                  </td>
                  <td data-label="O que difere">
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      {divergencia.descricao}
                    </span>
                  </td>
                  <td data-label="Apurada em">{dataHora(divergencia.importacao.criadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
