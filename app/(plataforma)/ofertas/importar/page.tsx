import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { conferenciaImportacaoOfertas } from "@/infra/casos-de-uso/importar-ofertas";
import { ROTULO_MODALIDADE, ROTULO_NATUREZA } from "@/dominio/importacao-catalogo/ofertas";
import { FormularioComEstado } from "../../aliados/formularios";
import { acaoImportarOfertas } from "./acoes";
import { Conferencia } from "./conferencia";

export const metadata: Metadata = {
  title: "Importar ofertas",
};

/**
 * Importador self-service de ofertas (planilha → conferência → efetivação).
 * A oferta aponta a solução por ID; a efetivação reusa criarOferta
 * (rascunho) / atualizarOferta. Mesmo caminho do manual, em lote.
 */
export default async function PaginaImportarOfertas({
  searchParams,
}: {
  searchParams: Promise<{ lote?: string; feito?: string; criadas?: string; enriquecidas?: string }>;
}) {
  const { lote, feito, criadas, enriquecidas } = await searchParams;
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeImportar = podeExecutar(papel, "CRIAR_EDITAR");

  const cabecalho = (
    <div className="cap" style={{ marginBottom: 14 }}>
      <Link href="/ofertas">Ofertas</Link> /{" "}
      <b style={{ color: "var(--preto)" }}>Importar ofertas</b>
    </div>
  );

  if (feito) {
    return (
      <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 720 }}>
        {cabecalho}
        <h1 className="h-page">Importação concluída</h1>
        <div className="card" style={{ padding: "18px 20px", marginTop: 16 }}>
          <p className="cap" style={{ margin: 0 }}>
            <b className="num">{criadas ?? 0}</b> oferta(s) criada(s) como rascunho e{" "}
            <b className="num">{enriquecidas ?? 0}</b> atualizada(s). Tudo auditado; publicar segue
            o fluxo normal.
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Link href="/ofertas" className="btn btn-azul" style={{ textDecoration: "none" }}>
              Voltar às ofertas
            </Link>
            <Link href="/ofertas/importar" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              Importar outra planilha
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (lote) {
    const conferencia = await conferenciaImportacaoOfertas(lote);
    if (!conferencia) {
      return (
        <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 720 }}>
          {cabecalho}
          <h1 className="h-page">Lote não encontrado</h1>
          <p className="cap" style={{ marginTop: 8 }}>
            Este lote de importação não existe (ou já foi efetivado).{" "}
            <Link href="/ofertas/importar">Começar de novo</Link>.
          </p>
        </div>
      );
    }
    const [tipos, mecanicas] = await Promise.all([
      prisma.tipoBeneficio.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
      prisma.mecanica.findMany({ orderBy: { nome: "asc" }, select: { nome: true } }),
    ]);
    const listas = {
      naturezas: Object.values(ROTULO_NATUREZA),
      tipos: tipos.map((t) => t.nome),
      mecanicas: mecanicas.map((m) => m.nome),
      modalidades: Object.values(ROTULO_MODALIDADE),
    };

    return (
      <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1100 }}>
        {cabecalho}
        <h1 className="h-page">Conferência da importação</h1>
        <div className="cap" style={{ marginTop: 4, marginBottom: 18, maxWidth: "82ch" }}>
          Revise as linhas antes de gravar. Ações: <b>criar</b> (rascunho) ou <b>enriquecer</b>{" "}
          (oferta existente, quando o `ID Oferta` vem preenchido).
        </div>
        <Conferencia conferencia={conferencia} listas={listas} />
      </div>
    );
  }

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 820 }}>
      {cabecalho}
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Importar ofertas</h1>
        <div className="cap" style={{ marginTop: 4, maxWidth: "82ch" }}>
          Cria ou atualiza ofertas em massa a partir de uma planilha. Cada oferta aponta uma{" "}
          <b>solução existente</b> pelo ID (que vem no modelo). Ofertas novas entram como{" "}
          <b>rascunho</b>. Baixe o modelo, ajuste e envie — você confere antes de gravar.
        </div>
      </div>

      {podeImportar ? (
        <>
          <div className="card" style={{ padding: "16px 18px", marginBottom: 18, maxWidth: 560 }}>
            <h2 className="h-el" style={{ margin: "0 0 6px", fontSize: 15 }}>
              1. Baixe o modelo
            </h2>
            <p className="cap" style={{ margin: "0 0 12px" }}>
              `.xlsx` com as ofertas atuais, a aba de referência das soluções (ID Solução) e os
              menus do Parametrizador.
            </p>
            {/* Route handler que devolve arquivo (não é página): âncora nativa. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/ofertas/importar/modelo" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              Baixar modelo (.xlsx)
            </a>
          </div>

          <div className="card" style={{ padding: "16px 18px", maxWidth: 560 }}>
            <h2 className="h-el" style={{ margin: "0 0 6px", fontSize: 15 }}>
              2. Envie a planilha
            </h2>
            <FormularioComEstado acao={acaoImportarOfertas} rotuloEnviar="Enviar e conferir">
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="arquivo-ofertas">Planilha de ofertas (.xlsx ou .csv)</label>
                <input
                  id="arquivo-ofertas"
                  className="input"
                  type="file"
                  name="arquivo"
                  accept=".xlsx,.csv,text/csv"
                  required
                />
                <span className="hint">
                  A oferta aponta a solução pelo ID Solução; deixe ID Oferta em branco para criar.
                </span>
              </div>
            </FormularioComEstado>
          </div>
        </>
      ) : (
        <p className="cap">Importar ofertas é restrito a Gestor e Analista (ficha §2).</p>
      )}
    </div>
  );
}
