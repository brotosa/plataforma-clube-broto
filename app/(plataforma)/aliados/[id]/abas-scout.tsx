import Link from "next/link";
import type { EstagioEmpresa, Papel } from "@prisma/client";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { podeAvaliarNoEstagio } from "@/dominio/avaliacao/regras";
import { ROTULOS_ORIGEM_DOSSIE, ROTULOS_STATUS_DOSSIE } from "@/dominio/dossie/regras";
import { telaAvaliacao } from "@/infra/consultas/avaliacoes";
import { telaDossie } from "@/infra/consultas/dossies";
import { prisma } from "@/infra/prisma/cliente";
import { CartoesDaAvaliacaoFechada } from "../../mercado/[empresaId]/avaliacao/cartoes-avaliacao";
import { LeituraDoDossie } from "../../mercado/[empresaId]/dossie/leitura-dossie";
import { AcoesEHistoricoAvaliacao } from "./historico-avaliacao";

/**
 * T12 — abas Scouting e Dossiê da ficha da empresa (F9). Ambas
 * **reaproveitam** os componentes das telas de origem: o cartão de score
 * da T10 e a leitura das dez seções da T11. A ficha é uma segunda porta
 * para a mesma informação, não uma segunda implementação dela.
 */

function data(valor: Date | null | undefined): string {
  return valor ? new Date(valor).toLocaleDateString("pt-BR") : "—";
}

/** Aba Scouting: score explicado + indicadores autodeclarados (seção D do M1). */
export async function AbaScouting({
  empresaId,
  papel,
  estagio,
}: {
  empresaId: string;
  papel: Papel;
  estagio: EstagioEmpresa;
}) {
  const [tela, declaracoes] = await Promise.all([
    telaAvaliacao(empresaId),
    prisma.indicadorDeclarado.findMany({
      where: { empresaId },
      orderBy: { dataDeclaracao: "desc" },
      include: { registradoPor: { select: { nome: true } } },
    }),
  ]);

  const ultimaFechada = tela?.fechadas[0] ?? null;
  // Reavaliar abre nova versão (RN18/RN21): só quem avalia, e só em estágio
  // avaliável (inclui Aliada ativa — reavaliação anual). O botão não decide
  // nada: leva à T10, que é onde a nova versão nasce, com as mesmas guardas.
  const podeReavaliar =
    podeExecutar(papel, "ASSUMIR_E_AVALIAR") && podeAvaliarNoEstagio(estagio);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      {ultimaFechada && tela ? (
        <>
          <CartoesDaAvaliacaoFechada
            ultimaFechada={ultimaFechada}
            fechadas={tela.fechadas}
            ocultarHistorico
          />
          <AcoesEHistoricoAvaliacao
            empresaId={empresaId}
            podeReavaliar={podeReavaliar}
            versoes={tela.fechadas.map((versao) => ({
              id: versao.id,
              versao: versao.versao,
              total: versao.total,
              fechadaEm: versao.fechadaEm,
              avaliadorNome: versao.avaliadorNome,
              subtotais: versao.subtotais,
            }))}
          />
        </>
      ) : (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Avaliação de scout pendente</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              O score do ScoutCB aparece aqui quando a primeira avaliação for concluída — nota
              1–5 por indicador, agrupada por dimensão de medição.
            </p>
            <Link
              href={`/mercado/${empresaId}/avaliacao`}
              className="btn btn-ghost"
              style={{ marginTop: 8, textDecoration: "none" }}
            >
              Abrir avaliação (T10)
            </Link>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: "20px 22px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          <h2 className="h-el">Indicadores declarados pelo aliado</h2>
          <span className="selo">autodeclarado</span>
        </div>
        <p className="cap" style={{ margin: "0 0 12px", maxWidth: "70ch" }}>
          Seção D da Ficha Cadastral: números informados pelo próprio aliado na negociação, com a
          data da declaração. Grau de confiança distinto do apurado em pesquisa — e, como todo o
          resto, não preenchem nota de indicador.
        </p>

        {declaracoes.length === 0 ? (
          <p className="cap" style={{ margin: 0 }}>
            Nenhuma declaração registrada. O preenchimento é feito na aba Ficha M1.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp">
              <thead>
                <tr>
                  <th scope="col">Declarado em</th>
                  <th scope="col">Ticket médio</th>
                  <th scope="col">NPS</th>
                  <th scope="col">Churn mensal</th>
                  <th scope="col">Clientes</th>
                  <th scope="col">Fundação</th>
                  <th scope="col">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {declaracoes.map((declaracao) => (
                  <tr key={declaracao.id}>
                    <td data-label="Declarado em">{data(declaracao.dataDeclaracao)}</td>
                    <td data-label="Ticket médio" className="num">
                      {declaracao.ticketMedio === null
                        ? "—"
                        : Number(declaracao.ticketMedio).toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                    </td>
                    <td data-label="NPS" className="num">
                      {declaracao.nps ?? "—"}
                    </td>
                    <td data-label="Churn mensal" className="num">
                      {declaracao.churnMensalPct === null
                        ? "—"
                        : `${Number(declaracao.churnMensalPct)}%`}
                    </td>
                    <td data-label="Clientes" className="num">
                      {declaracao.numeroClientes?.toLocaleString("pt-BR") ?? "—"}
                    </td>
                    <td data-label="Fundação" className="num">
                      {declaracao.anoFundacao ?? "—"}
                    </td>
                    <td data-label="Registrado por">{declaracao.registradoPor.nome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Aba Dossiê: leitura completa reaproveitada da T11. */
export async function AbaDossie({ empresaId }: { empresaId: string }) {
  const tela = await telaDossie(empresaId);
  const dossie = tela?.dossie ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 900 }}>
      {dossie ? (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {dossie.status === "PRONTO" ? (
              dossie.revisado ? (
                <span className="pill pill-ok">
                  <i />
                  revisado por {dossie.revisorNome ?? "—"} · {data(dossie.revisadoEm)}
                </span>
              ) : (
                <span className="pill pill-warn">
                  <i />
                  requer revisão
                </span>
              )
            ) : (
              <span className={dossie.status === "FALHA" ? "pill pill-erro" : "pill pill-info"}>
                <i />
                {ROTULOS_STATUS_DOSSIE[dossie.status]}
              </span>
            )}
            <span className="cap">
              {ROTULOS_ORIGEM_DOSSIE[dossie.origem]} · {data(dossie.criadoEm)}
            </span>
            <span style={{ flex: 1 }} />
            <Link href={`/mercado/${empresaId}/dossie`} className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }}>
              Abrir a T11 (gerar, revisar)
            </Link>
          </div>
          {dossie.conteudo ? (
            <LeituraDoDossie conteudo={dossie.conteudo} />
          ) : (
            <div className="card">
              <div className="vazio">
                <h2 className="h-el">
                  {dossie.status === "GERANDO"
                    ? "Dossiê em geração"
                    : "A última geração não foi concluída"}
                </h2>
                <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
                  {dossie.erro ??
                    "A pesquisa está consultando fontes públicas — o resultado aparece aqui quando ficar pronto."}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Dossiê público ainda não gerado</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              A due diligence pública é gerada sob demanda ou inserida manualmente, e nasce
              marcada “requer revisão”.
            </p>
            <Link
              href={`/mercado/${empresaId}/dossie`}
              className="btn btn-azul"
              style={{ marginTop: 8, textDecoration: "none" }}
            >
              Abrir dossiê (T11)
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
