import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { formatarCnpj } from "@/dominio/empresas/cnpj";
import { FormularioDecisao } from "./formulario-decisao";

export const metadata: Metadata = {
  title: "Aprovações",
};

const ROTULO_TIPO: Record<string, string> = {
  PROMOCAO_ALIADA_ATIVA: "Promoção a Aliada ativa",
  PUBLICACAO_OFERTA: "Publicação de oferta",
};

function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

/** T6 — Fila de aprovação com dossiê resumido expansível e histórico. */
export default async function PaginaAprovacoes() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeDecidir = podeExecutar(papel, "APROVAR_DEVOLVER");
  const podeConfigurar = podeExecutar(papel, "CONFIGURAR_REGRAS_APROVACAO");

  const [pendentes, historico] = await Promise.all([
    prisma.aprovacaoSolicitacao.findMany({
      where: { estado: "SOLICITADA" },
      orderBy: { criadoEm: "asc" },
      include: { solicitante: { select: { id: true, nome: true } } },
    }),
    prisma.aprovacaoSolicitacao.findMany({
      where: { estado: { in: ["APROVADA", "DEVOLVIDA"] } },
      orderBy: { decididoEm: "desc" },
      take: 20,
      include: {
        solicitante: { select: { nome: true } },
        aprovador: { select: { nome: true } },
      },
    }),
  ]);

  // Dossiês resumidos das pendências
  const empresas = await prisma.empresa.findMany({
    where: {
      id: {
        in: pendentes
          .filter((solicitacao) => solicitacao.tipoEntidade === "PROMOCAO_ALIADA_ATIVA")
          .map((solicitacao) => solicitacao.entidadeId),
      },
    },
    include: {
      contatos: { select: { id: true } },
      contratos: { where: { status: "VIGENTE" } },
      categorias: { include: { categoria: true } },
    },
  });
  const ofertas = await prisma.oferta.findMany({
    where: {
      id: {
        in: pendentes
          .filter((solicitacao) => solicitacao.tipoEntidade === "PUBLICACAO_OFERTA")
          .map((solicitacao) => solicitacao.entidadeId),
      },
    },
    include: {
      tipoBeneficio: true,
      mecanica: true,
      solucao: { include: { empresa: { select: { id: true, nomeFantasia: true } } } },
    },
  });

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 className="h-page">Aprovações</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Fila de pendências do motor de aprovação (RN06) — quem solicita não aprova o
            próprio item
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeConfigurar ? (
          <Link href="/aprovacoes/regras" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Regras de aprovação (T7)
          </Link>
        ) : null}
      </div>

      <h2 className="h-el" style={{ marginBottom: 12 }}>
        Pendências ({pendentes.length})
      </h2>
      {pendentes.length === 0 ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="vazio">
            <span className="ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.1V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" />
              </svg>
            </span>
            <h3 className="h-el">Nenhuma pendência de aprovação</h3>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              Solicitações de promoção a Aliada ativa (e de publicação de oferta, quando a
              regra estiver ligada em T7) entram nesta fila.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {pendentes.map((solicitacao) => {
            const empresa =
              solicitacao.tipoEntidade === "PROMOCAO_ALIADA_ATIVA"
                ? empresas.find((candidata) => candidata.id === solicitacao.entidadeId)
                : undefined;
            const oferta =
              solicitacao.tipoEntidade === "PUBLICACAO_OFERTA"
                ? ofertas.find((candidata) => candidata.id === solicitacao.entidadeId)
                : undefined;
            return (
              <details key={solicitacao.id} className="card" style={{ padding: 0 }}>
                <summary
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    cursor: "pointer",
                    flexWrap: "wrap",
                  }}
                >
                  <span className="pill pill-info">
                    <i aria-hidden="true" />
                    {ROTULO_TIPO[solicitacao.tipoEntidade]}
                  </span>
                  <b>
                    {empresa?.nomeFantasia ?? oferta?.titulo ?? solicitacao.entidadeId}
                  </b>
                  <span className="cap">
                    solicitado por {solicitacao.solicitante.nome} em{" "}
                    {formatarDataHora(solicitacao.criadoEm)}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span className="cap">dossiê ▾</span>
                </summary>
                <div style={{ borderTop: "1px solid var(--borda)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {empresa ? (
                    <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "8px 16px", fontSize: 14 }}>
                      <span className="cap">CNPJ</span>
                      <span className="num">{empresa.cnpj ? formatarCnpj(empresa.cnpj) : "—"}</span>
                      <span className="cap">Categorias</span>
                      <span>
                        {empresa.categorias.length > 0
                          ? empresa.categorias.map((vinculo) => vinculo.categoria.nome).join(", ")
                          : "—"}
                      </span>
                      <span className="cap">Contatos</span>
                      <span className="num">{empresa.contatos.length}</span>
                      <span className="cap">Contrato vigente</span>
                      <span>
                        {empresa.contratos[0]
                          ? `Comissão ${String(empresa.contratos[0].comissaoPct ?? "—")}% · ambientes: ${empresa.contratos[0].ambientesPagamento}`
                          : "—"}
                      </span>
                      <span className="cap">Ficha completa</span>
                      <span>
                        <Link href={`/aliados/${empresa.id}`}>abrir ficha do aliado</Link>
                      </span>
                    </div>
                  ) : null}
                  {oferta ? (
                    <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "8px 16px", fontSize: 14 }}>
                      <span className="cap">Aliado</span>
                      <span>{oferta.solucao.empresa.nomeFantasia}</span>
                      <span className="cap">Solução</span>
                      <span>{oferta.solucao.nome}</span>
                      <span className="cap">Natureza / benefício</span>
                      <span>
                        {oferta.natureza} · {oferta.tipoBeneficio.nome} · {oferta.mecanica.nome}
                      </span>
                      <span className="cap">Detalhe completo</span>
                      <span>
                        <Link href={`/ofertas/${oferta.id}`}>abrir oferta</Link>
                      </span>
                    </div>
                  ) : null}
                  {podeDecidir ? (
                    solicitacao.solicitante.id === sessao?.user?.id ? (
                      <p className="cap" style={{ margin: 0 }}>
                        Você é o solicitante deste item — a decisão cabe a outra pessoa
                        (RN06, segregação de funções).
                      </p>
                    ) : (
                      <FormularioDecisao solicitacaoId={solicitacao.id} />
                    )
                  ) : (
                    <p className="cap" style={{ margin: 0 }}>
                      Seu papel não decide aprovações (ficha §2).
                    </p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      <h2 className="h-el" style={{ marginBottom: 12 }}>
        Histórico
      </h2>
      {historico.length === 0 ? (
        <p className="cap">Nenhuma decisão registrada ainda.</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl tbl-resp">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Solicitante</th>
                <th>Decisão</th>
                <th>Decisor</th>
                <th>Comentário</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((solicitacao) => (
                <tr key={solicitacao.id}>
                  <td className="cap">{ROTULO_TIPO[solicitacao.tipoEntidade]}</td>
                  <td data-label="Solicitante" className="cap">{solicitacao.solicitante.nome}</td>
                  <td data-label="Decisão">
                    {solicitacao.estado === "APROVADA" ? (
                      <span className="pill pill-ok"><i aria-hidden="true" />Aprovada</span>
                    ) : (
                      <span className="pill pill-warn"><i aria-hidden="true" />Devolvida</span>
                    )}
                  </td>
                  <td data-label="Decisor" className="cap">{solicitacao.aprovador?.nome ?? "—"}</td>
                  <td data-label="Comentário" className="cap">{solicitacao.comentario ?? "—"}</td>
                  <td data-label="Quando" className="num cap">
                    {solicitacao.decididoEm ? formatarDataHora(solicitacao.decididoEm) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
