import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { kpiVitrineViva, resumoTelemetriaPorOferta } from "@/infra/consultas/telemetria";
import { contadoresPorOferta } from "@/infra/consultas/telemetria-operadora";
import { lerRegua } from "@/infra/configuracao/servico-configuracao";
import { estaAVencer } from "@/dominio/ofertas/regras";

export const metadata: Metadata = {
  title: "Ofertas",
};

const ROTULO_NATUREZA: Record<string, string> = {
  RECOMPENSA: "Recompensa",
  BENEFICIO: "Benefício",
  CUPOM_DESCONTO: "Cupom de desconto",
};

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
  EXPIRADA: "Expirada",
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

  const parametros = await searchParams;
  const hoje = new Date();
  // Régua "vigência a vencer" (15 dias na implantação): alterá-la na T17
  // muda o alerta na próxima visita, sem tocar em nada gravado. Lida antes
  // da lista porque o filtro do cartão de pendência do Dashboard usa a mesma
  // janela — a lista recortada bate com a contagem que levou o usuário aqui.
  const janelaVigencia = await lerRegua("OFERTA_VIGENCIA_A_VENCER_DIAS");
  const filtrarAVencer = parametros.vigencia === "a-vencer";
  const limiteVigencia = new Date(hoje.getTime() + janelaVigencia * 24 * 60 * 60 * 1000);
  const ondeOfertas: Prisma.OfertaWhereInput = filtrarAVencer
    ? {
        status: { in: ["RASCUNHO", "PUBLICADA", "PAUSADA"] },
        vigenciaFim: { not: null, gte: hoje, lte: limiteVigencia },
      }
    : {};

  const [totalOfertas, ofertasPublicadas, pendentesRepublicacao, ofertas, vitrine] =
    await Promise.all([
      prisma.oferta.count(),
      prisma.oferta.count({ where: { status: "PUBLICADA" } }),
      prisma.oferta.count({ where: { pendenteRepublicacao: true } }),
      prisma.oferta.findMany({
        where: ondeOfertas,
        orderBy: { atualizadoEm: "desc" },
        take: 50,
        include: {
          tipoBeneficio: true,
          mecanica: true,
          solucao: { include: { empresa: { select: { id: true, nomeFantasia: true } } } },
        },
      }),
      kpiVitrineViva(),
    ]);

  const [telemetria, contadoresDeCatalogo] = await Promise.all([
    resumoTelemetriaPorOferta(ofertas.map((oferta) => oferta.id)),
    // F20 (RN68) — a OUTRA contagem, pela consulta única da telemetria da
    // operadora. Fica em coluna própria, com a data do retrato no título:
    // as duas nunca se somam nem se apresentam como o mesmo número.
    contadoresPorOferta(ofertas.map((oferta) => oferta.id)),
  ]);
  const percentualVivo =
    vitrine.totalPublicadas > 0
      ? Math.round((vitrine.publicadasComResgate / vitrine.totalPublicadas) * 100)
      : null;

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
            Mostrando <b>ofertas com vigência a vencer</b> (nos próximos {janelaVigencia} dias) —
            filtro vindo do painel de pendências.
          </span>
          {/* Âncora nativa: navegação que só limpa a query (convenção do CLAUDE.md). */}
          <a href="/ofertas" className="chip on" style={{ textDecoration: "none" }}>
            Limpar filtro
          </a>
        </div>
      ) : null}

      {ofertas.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2H2v10l9.3 9.3a1.5 1.5 0 0 0 2.1 0l7.9-7.9a1.5 1.5 0 0 0 0-2.1zM7 7h.01" />
              </svg>
            </span>
            <h2 className="h-el">
              {filtrarAVencer ? "Nenhuma oferta a vencer na janela" : "Nenhuma oferta cadastrada"}
            </h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              Ofertas nascem dentro de uma solução, na ficha do aliado. A carga inicial
              também povoa esta lista.
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
                <th style={{ width: "24%" }}>Título</th>
                <th>Aliado</th>
                <th>Natureza</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Emitidos</th>
                {/*
                  F20 (RN68) — a origem de cada contagem passa a ficar NO
                  cabeçalho. O extrato (evento nominal, telemetria da F4) e
                  o catálogo (contador acumulado da operadora) medem coisas
                  diferentes e divergem hoje; sem o rótulo, duas colunas de
                  "resgates" com números distintos pareceriam defeito.
                */}
                <th style={{ textAlign: "right" }}>Resgatados (extrato)</th>
                <th style={{ textAlign: "right" }}>Compras (extrato)</th>
                <th style={{ textAlign: "right" }}>Resgates (catálogo)</th>
                <th style={{ textAlign: "right" }}>Compras (catálogo)</th>
                <th>Vigência</th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map((oferta) => {
                const resumo = telemetria.get(oferta.id);
                const catalogo = contadoresDeCatalogo.get(oferta.id);
                const retrato = catalogo
                  ? catalogo.dataArquivo
                    ? `Contador acumulado do catálogo da operadora · retrato de ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(catalogo.dataArquivo)}. Nunca somado ao extrato (RN68).`
                    : "Contador acumulado do catálogo da operadora · o arquivo não declarou a data do retrato. Nunca somado ao extrato (RN68)."
                  : "Sem contador do catálogo: nenhum relatório da operadora importado para esta oferta.";
                const foraDaPlataforma = oferta.mecanica.slug === "CHECKOUT_EXTERNO";
                const numero = (valor: number | undefined) =>
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
                      {resumo?.resgateRecente ? (
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
                      {numero(resumo?.emitidos)}
                    </td>
                    <td
                      data-label="Resgatados (extrato)"
                      className="num"
                      style={{ textAlign: "right" }}
                      title={
                        foraDaPlataforma && (resumo?.resgatados ?? 0) > 0
                          ? "Fora da Plataforma: resgate aguardando conciliação mensal (ficha §6)."
                          : undefined
                      }
                    >
                      {numero(resumo?.resgatados)}
                      {foraDaPlataforma && (resumo?.resgatados ?? 0) > 0 ? (
                        <span className="cap" style={{ marginLeft: 4 }}>
                          *
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Compras (extrato)" className="num" style={{ textAlign: "right" }}>
                      {numero(resumo?.comprasConfirmadas)}
                    </td>
                    <td
                      data-label="Resgates (catálogo)"
                      className="num"
                      style={{ textAlign: "right" }}
                      title={retrato}
                    >
                      {catalogo ? catalogo.resgates.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td
                      data-label="Compras (catálogo)"
                      className="num"
                      style={{ textAlign: "right" }}
                      title={retrato}
                    >
                      {catalogo ? catalogo.compras.toLocaleString("pt-BR") : "—"}
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
