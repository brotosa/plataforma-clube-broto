import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { conferenciaAtual } from "@/infra/casos-de-uso/carga-inicial";
import { FormularioComEstado } from "../aliados/formularios";
import {
  acaoAprovarTudo,
  acaoDecidirAgrupamento,
  acaoDecidirSeller,
  acaoEfetivarCarga,
  acaoIniciarCarga,
  acaoMoverOferta,
  acaoRenomearAgrupamento,
} from "./acoes";

export const metadata: Metadata = {
  title: "Carga inicial",
};

function formatarData(data: Date | null): string {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(data);
}

function PillEstadoStaging({ estado }: { estado: string }) {
  if (estado === "APROVADA") {
    return <span className="pill pill-ok"><i aria-hidden="true" />Aprovada</span>;
  }
  if (estado === "REJEITADA") {
    return <span className="pill pill-erro"><i aria-hidden="true" />Rejeitada</span>;
  }
  return <span className="pill pill-pendente"><i aria-hidden="true" />Pendente</span>;
}

/** Tela de conferência da carga inicial (ficha §7) — F3. */
export default async function PaginaCargaInicial() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeImportar = podeExecutar(papel, "IMPORTAR_TELEMETRIA");

  const { sellers, agrupamentos, ofertasSemAgrupamento, jaEfetivadas } =
    await conferenciaAtual();
  const importacoes = await prisma.importacao.findMany({
    where: { tipo: { in: ["CARGA_SELLERS", "CARGA_OFERTAS"] } },
    orderBy: { criadoEm: "desc" },
    take: 2,
  });

  const sellersAprovados = sellers.filter((seller) => seller.estado === "APROVADA").length;
  const agrupamentosAprovados = agrupamentos.filter(
    (agrupamento) => agrupamento.estado === "APROVADA",
  ).length;
  const quarentena = [
    ...sellers.filter((seller) => seller.mensagemErro),
    ...agrupamentos.flatMap((agrupamento) =>
      agrupamento.ofertas.filter((oferta) => oferta.mensagemErro),
    ),
    ...ofertasSemAgrupamento.filter((oferta) => oferta.mensagemErro),
  ];

  const agrupamentosPorSeller = new Map<string, typeof agrupamentos>();
  for (const agrupamento of agrupamentos) {
    const idSeller = agrupamento.chaveHeuristica.split("::")[0] ?? "";
    const lista = agrupamentosPorSeller.get(idSeller) ?? [];
    lista.push(agrupamento);
    agrupamentosPorSeller.set(idSeller, lista);
  }
  const nomeSellerPorId = new Map(
    sellers.map((seller) => [seller.idSellerExterno ?? "", seller.nomeSeller ?? "—"]),
  );

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aliados">Aliados</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Carga inicial</b>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="h-page">Carga inicial</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Planilhas reais → staging → conferência → efetivação. Nada entra no
            cadastro-mestre sem passar por aqui; campos ausentes ficam pendentes (RN09).
          </div>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {sellers.length === 0 ? (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="vazio">
            <h2 className="h-el">
              {jaEfetivadas > 0 ? "Carga anterior efetivada" : "Nenhuma carga em conferência"}
            </h2>
            <p className="cap" style={{ maxWidth: "52ch", margin: 0 }}>
              {jaEfetivadas > 0
                ? "O staging anterior foi efetivado — a base real está no cadastro-mestre. Iniciar uma nova leitura recria o staging a partir das planilhas (a efetivação é idempotente por id externo)."
                : "A leitura usa as planilhas reais do repositório: Lista_de_Sellers_1.xlsx e Lista_de_Ofertas_3.xlsx (dados/)."}
            </p>
            {podeImportar ? (
              <div style={{ marginTop: 12, width: "100%", maxWidth: 420 }}>
                <FormularioComEstado
                  acao={acaoIniciarCarga}
                  rotuloEnviar="Iniciar leitura das planilhas"
                >
                  {null}
                </FormularioComEstado>
              </div>
            ) : (
              <p className="cap" style={{ margin: 0 }}>
                Importação restrita a Gestor e Analista (ficha §2).
              </p>
            )}
            {jaEfetivadas > 0 ? (
              <Link href="/aliados" className="btn btn-ghost" style={{ marginTop: 10, textDecoration: "none" }}>
                Ver aliados carregados
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="contadores" style={{ marginBottom: 18 }}>
            <div className="c">
              <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
                Sellers no staging
              </div>
              <div className="kpi-n num" style={{ marginTop: 6 }}>{sellers.length}</div>
              <div className="cap" style={{ marginTop: 2 }}>{sellersAprovados} aprovados</div>
            </div>
            <div className="c">
              <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
                Soluções propostas
              </div>
              <div className="kpi-n num" style={{ marginTop: 6 }}>{agrupamentos.length}</div>
              <div className="cap" style={{ marginTop: 2 }}>
                heurística: mesmo seller + mesmo texto · {agrupamentosAprovados} aprovadas
              </div>
            </div>
            <div className="c">
              <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
                Ofertas no staging
              </div>
              <div className="kpi-n num" style={{ marginTop: 6 }}>
                {agrupamentos.reduce((soma, agrupamento) => soma + agrupamento.ofertas.length, 0)}
              </div>
            </div>
            <div className="c">
              <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
                Quarentena
              </div>
              <div className="kpi-n num" style={{ marginTop: 6 }}>{quarentena.length}</div>
              <div className="cap" style={{ marginTop: 2 }}>linhas com motivo</div>
            </div>
          </div>

          {podeImportar ? (
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
              <form action={acaoAprovarTudo}>
                <button type="submit" className="btn btn-ghost">
                  Aprovar tudo o que está pendente
                </button>
              </form>
              <div style={{ minWidth: 280 }}>
                <FormularioComEstado
                  acao={acaoEfetivarCarga}
                  rotuloEnviar={`Efetivar carga (${sellersAprovados} sellers, ${agrupamentosAprovados} soluções)`}
                >
                  {null}
                </FormularioComEstado>
              </div>
            </div>
          ) : null}

          {quarentena.length > 0 ? (
            <div className="card" style={{ borderColor: "var(--erro)", padding: "16px 18px", marginBottom: 20 }}>
              <h2 className="h-el" style={{ marginBottom: 8 }}>Quarentena</h2>
              <ul className="cap" style={{ margin: 0, paddingLeft: 18 }}>
                {quarentena.map((item) => (
                  <li key={item.id}>
                    Linha {item.linhaOrigem}: {item.mensagemErro}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <h2 className="h-el" style={{ margin: "8px 0 12px" }}>
            Sellers ({sellers.length})
          </h2>
          <div className="card" style={{ overflowX: "auto", marginBottom: 24 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Seller (nome de exibição)</th>
                  <th>Data de entrada</th>
                  <th>Id externo (Minutrade)</th>
                  <th>Estado</th>
                  {podeImportar ? <th><span className="sr-oculto">Ações</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {sellers.map((seller) => (
                  <tr key={seller.id}>
                    <td className="num cap">{seller.linhaOrigem}</td>
                    <td style={{ fontWeight: 600 }}>{seller.nomeSeller ?? "—"}</td>
                    <td className="num cap">{formatarData(seller.dataEntrada)}</td>
                    <td className="mono cap">{(seller.idSellerExterno ?? "").slice(0, 12)}…</td>
                    <td><PillEstadoStaging estado={seller.estado} /></td>
                    {podeImportar ? (
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {seller.estado !== "APROVADA" && !seller.mensagemErro ? (
                            <form action={acaoDecidirSeller}>
                              <input type="hidden" name="id" value={seller.id} />
                              <input type="hidden" name="estado" value="APROVADA" />
                              <button type="submit" className="btn btn-ghost btn-sm">Aprovar</button>
                            </form>
                          ) : null}
                          {seller.estado !== "REJEITADA" ? (
                            <form action={acaoDecidirSeller}>
                              <input type="hidden" name="id" value={seller.id} />
                              <input type="hidden" name="estado" value="REJEITADA" />
                              <button type="submit" className="btn btn-ghost btn-sm">Rejeitar</button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="h-el" style={{ margin: "8px 0 12px" }}>
            Soluções propostas e suas ofertas ({agrupamentos.length})
          </h2>
          <p className="cap" style={{ margin: "0 0 12px", maxWidth: "80ch" }}>
            Revise os agrupamentos propostos pela heurística: ajuste o nome da solução,
            mova ofertas entre agrupamentos do mesmo seller, aprove em lote ou item a item.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {agrupamentos.map((agrupamento) => {
              const idSeller = agrupamento.chaveHeuristica.split("::")[0] ?? "";
              const irmaos = (agrupamentosPorSeller.get(idSeller) ?? []).filter(
                (candidato) => candidato.id !== agrupamento.id,
              );
              return (
                <details key={agrupamento.id} className="card" style={{ padding: 0 }}>
                  <summary
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 16px",
                      cursor: "pointer",
                      flexWrap: "wrap",
                    }}
                  >
                    <b>{agrupamento.nomeSolucaoProposto}</b>
                    <span className="cap">
                      {nomeSellerPorId.get(idSeller) ?? "—"} · {agrupamento.ofertas.length}{" "}
                      oferta(s)
                    </span>
                    <span style={{ flex: 1 }} />
                    <PillEstadoStaging estado={agrupamento.estado} />
                  </summary>
                  <div style={{ borderTop: "1px solid var(--borda)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {podeImportar ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <form action={acaoRenomearAgrupamento} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                          <input type="hidden" name="id" value={agrupamento.id} />
                          <div className="field">
                            <label htmlFor={`nome-${agrupamento.id}`}>Nome da solução</label>
                            <input
                              id={`nome-${agrupamento.id}`}
                              className="input"
                              name="nome"
                              defaultValue={agrupamento.nomeSolucaoProposto}
                              style={{ width: 360 }}
                            />
                          </div>
                          <button type="submit" className="btn btn-ghost btn-sm">Renomear</button>
                        </form>
                        <div style={{ flex: 1 }} />
                        {agrupamento.estado !== "APROVADA" ? (
                          <form action={acaoDecidirAgrupamento}>
                            <input type="hidden" name="id" value={agrupamento.id} />
                            <input type="hidden" name="estado" value="APROVADA" />
                            <button type="submit" className="btn btn-azul btn-sm">Aprovar agrupamento</button>
                          </form>
                        ) : null}
                        {agrupamento.estado !== "REJEITADA" ? (
                          <form action={acaoDecidirAgrupamento}>
                            <input type="hidden" name="id" value={agrupamento.id} />
                            <input type="hidden" name="estado" value="REJEITADA" />
                            <button type="submit" className="btn btn-ghost btn-sm">Rejeitar</button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Linha</th>
                          <th>Oferta (Produto)</th>
                          <th>CheckOut</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Resgates</th>
                          <th style={{ textAlign: "right" }}>Compras</th>
                          {podeImportar && irmaos.length > 0 ? <th>Mover para</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {agrupamento.ofertas.map((oferta) => (
                          <tr key={oferta.id}>
                            <td className="num cap">{oferta.linhaOrigem}</td>
                            <td>{oferta.produto}</td>
                            <td className="cap">{oferta.checkout}</td>
                            <td className="cap">{oferta.statusOferta}</td>
                            <td className="num" style={{ textAlign: "right" }}>{oferta.resgates ?? 0}</td>
                            <td className="num" style={{ textAlign: "right" }}>{oferta.compras ?? 0}</td>
                            {podeImportar && irmaos.length > 0 ? (
                              <td>
                                <form action={acaoMoverOferta} style={{ display: "flex", gap: 6 }}>
                                  <input type="hidden" name="stagingOfertaId" value={oferta.id} />
                                  <select
                                    className="select"
                                    name="agrupamentoDestinoId"
                                    aria-label={`Mover a oferta da linha ${oferta.linhaOrigem} para outra solução`}
                                    defaultValue=""
                                    style={{ width: 220, padding: "5px 30px 5px 10px" }}
                                  >
                                    <option value="">Manter aqui</option>
                                    {irmaos.map((destino) => (
                                      <option key={destino.id} value={destino.id}>
                                        {destino.nomeSolucaoProposto.slice(0, 48)}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="submit" className="btn btn-ghost btn-sm">Mover</button>
                                </form>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>

          <p className="cap" style={{ marginTop: 14, maxWidth: "80ch" }}>
            Campos que não existem na origem (CNPJ, contratos, categorias, imagens…)
            ficam pendentes e viram fila de curadoria com régua visível (RN09). O dump do
            catálogo Minutrade <span className="selo">A CONFIRMAR</span> enriquecerá o
            staging antes da conferência quando disponível.
          </p>
        </>
      )}

      {importacoes.length > 0 ? (
        <div style={{ marginTop: 22 }}>
          <h2 className="h-el" style={{ marginBottom: 10 }}>Últimas leituras</h2>
          <table className="tbl" style={{ maxWidth: 720 }}>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th style={{ textAlign: "right" }}>Linhas OK</th>
                <th style={{ textAlign: "right" }}>Erros</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {importacoes.map((importacao) => (
                <tr key={importacao.id}>
                  <td className="mono cap">{importacao.nomeArquivo}</td>
                  <td className="num" style={{ textAlign: "right" }}>{importacao.linhasOk}</td>
                  <td className="num" style={{ textAlign: "right" }}>{importacao.linhasErro}</td>
                  <td className="num cap">
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(importacao.criadoEm)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
