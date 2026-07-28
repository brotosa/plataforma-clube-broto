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
import { FormularioComEstado } from "../../aliados/formularios";
import { acaoImportarRelatorio } from "./acoes";

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

  const [importacoes, divergencias] = await Promise.all([
    prisma.importacaoTelemetria.findMany({
      orderBy: { criadoEm: "desc" },
      take: 20,
      include: {
        autor: { select: { nome: true } },
        _count: { select: { divergencias: true, contadores: true, eventos: true } },
      },
    }),
    prisma.divergenciaDeCatalogo.findMany({
      orderBy: { criadoEm: "desc" },
      take: 100,
      include: { importacao: { select: { tipoLayout: true, criadoEm: true } } },
    }),
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
          <FormularioComEstado
            acao={acaoImportarRelatorio}
            rotuloEnviar="Enviar relatório"
          >
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="arquivo-telemetria-operadora">
                Arquivo do relatório (CSV ou XLSX)
              </label>
              <input
                id="arquivo-telemetria-operadora"
                className="input"
                type="file"
                name="arquivo"
                accept=".csv,.xlsx,text/csv"
                required
              />
              <span className="hint" id="dica-arquivo-telemetria">
                Aceita os quatro layouts: catálogo de sellers, catálogo de ofertas, base de
                usuários e extrato de resgates. Os dois primeiros produzem os contadores por
                oferta; os dois últimos ligam base e eventos ao assinante pelo CPF. Arquivo
                sem a coluna de CPF é aceito, e cada linha é recusada com a causa nomeada.
              </span>
            </div>
          </FormularioComEstado>
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
          <table className="tbl">
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
                    <td>{ROTULO_DO_LAYOUT[importacao.tipoLayout] ?? importacao.tipoLayout}</td>
                    <td className="mono" style={{ wordBreak: "break-all" }}>
                      {importacao.nomeArquivo}
                    </td>
                    <td>
                      {dataHora(importacao.criadoEm)}
                      <br />
                      <span className="cap">{importacao.autor.nome}</span>
                    </td>
                    <td>{dataCurta(importacao.dataGeracaoDeclarada)}</td>
                    <td>
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
      </p>
      {divergencias.length === 0 ? (
        <p className="cap">
          Nenhuma divergência registrada. Sem importação de catálogo, esta lista fica vazia
          por não haver o que comparar — o que é diferente de os dois lados concordarem.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
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
                  <td>
                    <span className="pill pill-pendente">
                      <i aria-hidden="true" />
                      {ROTULO_DA_DIVERGENCIA[divergencia.tipo] ?? divergencia.tipo}
                    </span>
                  </td>
                  <td className="mono" style={{ wordBreak: "break-all" }}>
                    {divergencia.identificador}
                  </td>
                  <td>{divergencia.descricao}</td>
                  <td>{dataHora(divergencia.importacao.criadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
