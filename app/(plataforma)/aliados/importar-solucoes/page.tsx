import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { COLUNAS_SOLUCAO } from "@/dominio/importacao-catalogo/solucoes";
import { FormularioComEstado } from "../formularios";
import { acaoImportarSolucoes } from "./acoes";

export const metadata: Metadata = {
  title: "Importar soluções",
};

const COLUNAS_DO_MODELO = Object.values(COLUNAS_SOLUCAO).join(" · ");

/**
 * Importador self-service de soluções (planilha → conferência → efetivação).
 * O aliado é identificado pelo CNPJ; a efetivação reusa criarSolucao/
 * atualizarSolucao (RN01 + auditoria). Sem tela nova de cadastro: é o mesmo
 * caminho de sempre, só que em lote.
 */
export default async function PaginaImportarSolucoes({
  searchParams,
}: {
  searchParams: Promise<{ feito?: string; criadas?: string; enriquecidas?: string }>;
}) {
  const { feito, criadas, enriquecidas } = await searchParams;
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeImportar = podeExecutar(papel, "CRIAR_EDITAR");

  const cabecalho = (
    <div className="cap" style={{ marginBottom: 14 }}>
      <Link href="/aliados">Aliados &amp; Soluções</Link> /{" "}
      <b style={{ color: "var(--preto)" }}>Importar soluções</b>
    </div>
  );

  // Tela de sucesso pós-efetivação.
  if (feito) {
    return (
      <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 720 }}>
        {cabecalho}
        <h1 className="h-page">Importação concluída</h1>
        <div className="card" style={{ padding: "18px 20px", marginTop: 16 }}>
          <p className="cap" style={{ margin: 0 }}>
            <b className="num">{criadas ?? 0}</b> solução(ões) criada(s) e{" "}
            <b className="num">{enriquecidas ?? 0}</b> enriquecida(s). Tudo registrado na
            auditoria.
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Link href="/aliados" className="btn btn-azul" style={{ textDecoration: "none" }}>
              Voltar aos aliados
            </Link>
            <Link
              href="/aliados/importar-solucoes"
              className="btn btn-ghost"
              style={{ textDecoration: "none" }}
            >
              Importar outra planilha
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Passo inicial: upload + baixar modelo.
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 820 }}>
      {cabecalho}
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Importar soluções</h1>
        <div className="cap" style={{ marginTop: 4, maxWidth: "82ch" }}>
          Cria ou enriquece soluções em massa a partir de uma planilha. O aliado é identificado
          pelo <b>CNPJ</b> e só aliados ativos recebem solução (RN01). Baixe o modelo já
          preenchido com o catálogo atual, ajuste e envie — você confere antes de gravar.
        </div>
      </div>

      {podeImportar ? (
        <>
          <div className="card" style={{ padding: "16px 18px", marginBottom: 18, maxWidth: 560 }}>
            <h2 className="h-el" style={{ margin: "0 0 6px", fontSize: 15 }}>
              1. Baixe o modelo
            </h2>
            <p className="cap" style={{ margin: "0 0 12px" }}>
              Planilha `.xlsx` com o catálogo atual, o menu de categorias e as colunas prontas.
            </p>
            {/* Route handler que devolve arquivo (não é página): âncora nativa,
                nunca <Link> — prefetch de um download não faz sentido. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/aliados/importar-solucoes/modelo"
              className="btn btn-ghost"
              style={{ textDecoration: "none" }}
            >
              Baixar modelo (.xlsx)
            </a>
          </div>

          <div className="card" style={{ padding: "16px 18px", maxWidth: 560 }}>
            <h2 className="h-el" style={{ margin: "0 0 6px", fontSize: 15 }}>
              2. Envie a planilha
            </h2>
            <FormularioComEstado acao={acaoImportarSolucoes} rotuloEnviar="Enviar e conferir">
              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="arquivo-solucoes">Planilha de soluções (.xlsx ou .csv)</label>
                <input
                  id="arquivo-solucoes"
                  className="input"
                  type="file"
                  name="arquivo"
                  accept=".xlsx,.csv,text/csv"
                  required
                />
                <span className="hint">Colunas: {COLUNAS_DO_MODELO}.</span>
              </div>
            </FormularioComEstado>
          </div>
        </>
      ) : (
        <p className="cap">
          Importar soluções é restrito a Gestor e Analista (ficha §2).
        </p>
      )}
    </div>
  );
}
