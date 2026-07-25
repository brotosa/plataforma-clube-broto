import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { historicoPublicacoes } from "@/infra/casos-de-uso/publicacao";
import { FormularioComEstado } from "../../aliados/formularios";
import { acaoPublicarCatalogo } from "./acoes";

export const metadata: Metadata = {
  title: "Publicar catálogo",
};

function dataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

/**
 * Publicação (export batch), ficha §6 — F4. O Gestor gera o pacote dos itens
 * publicáveis pelo ExportAdapter (GenericJsonCsvAdapter até o layout Minutrade
 * [A CONFIRMAR]); cada publicação registra diff (RN10) e despublicações em
 * cascata (RN04). O histórico permite baixar os arquivos gerados.
 */
export default async function PaginaPublicacao() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeGerarExport = podeExecutar(papel, "GERAR_EXPORTACAO");

  const [publicaveis, pendentes, historico] = await Promise.all([
    prisma.oferta.count({ where: { status: "PUBLICADA" } }),
    prisma.oferta.count({ where: { pendenteRepublicacao: true } }),
    historicoPublicacoes(20),
  ]);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1080 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/ofertas">Ofertas</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Publicar catálogo</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Publicar catálogo</h1>
        <div className="cap" style={{ marginTop: 4, maxWidth: "80ch" }}>
          Gera o pacote com as ofertas publicáveis no formato de importação da operadora.
          O layout real da Minutrade está <span className="selo">A CONFIRMAR</span> — até lá
          o pacote sai como JSON/CSV genérico, atrás do <code>ExportAdapter</code>.
        </div>
      </div>

      <div className="contadores" style={{ marginBottom: 18 }}>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Publicáveis agora
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>{publicaveis}</div>
          <div className="cap" style={{ marginTop: 2 }}>ofertas em status Publicada</div>
        </div>
        <div className="c">
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Pendentes de republicação
          </div>
          <div className="kpi-n num" style={{ marginTop: 6 }}>{pendentes}</div>
          <div className="cap" style={{ marginTop: 2 }}>serão limpas neste export (RN10)</div>
        </div>
      </div>

      {podeGerarExport ? (
        <div className="card" style={{ padding: "16px 18px", marginBottom: 22, maxWidth: 560 }}>
          <FormularioComEstado
            acao={acaoPublicarCatalogo}
            rotuloEnviar="Gerar pacote de publicação"
            confirmacao="Gerar um novo pacote de publicação para a operadora?"
          >
            <p className="cap" style={{ margin: "0 0 12px", maxWidth: "60ch" }}>
              A ação registra a publicação (autor, data, pacote e diff), limpa as flags de
              republicação e inclui as despublicações em cascata (RN04).
            </p>
          </FormularioComEstado>
        </div>
      ) : (
        <p className="cap" style={{ marginBottom: 22 }}>
          Geração de exportação restrita ao Gestor (ficha §2). Você pode consultar o histórico.
        </p>
      )}

      <h2 className="h-el" style={{ marginBottom: 10 }}>Histórico de publicações</h2>
      {historico.length === 0 ? (
        <p className="cap">Nenhuma publicação gerada ainda.</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl tbl-resp">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Autor</th>
                <th>Adapter</th>
                <th style={{ textAlign: "right" }}>Publicados</th>
                <th style={{ textAlign: "right" }}>Despublicados</th>
                <th>Diff</th>
                <th>Arquivos</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((publicacao) => (
                <tr key={publicacao.id}>
                  <td data-label="Quando" className="num cap">{dataHora(publicacao.criadoEm)}</td>
                  <td data-label="Autor">{publicacao.autor}</td>
                  <td data-label="Adapter" className="mono cap">{publicacao.adapter}</td>
                  <td data-label="Publicados" className="num" style={{ textAlign: "right" }}>
                    {publicacao.publicados}
                  </td>
                  <td data-label="Despublicados" className="num" style={{ textAlign: "right" }}>
                    {publicacao.despublicados}
                  </td>
                  <td data-label="Diff" className="cap">
                    {publicacao.diff
                      ? `+${publicacao.diff.adicionadas.length} ~${publicacao.diff.alteradas.length} −${publicacao.diff.removidas.length}`
                      : "—"}
                  </td>
                  <td data-label="Arquivos">
                    <a href={`/ofertas/publicacao/${publicacao.id}/download?formato=json`}>JSON</a>
                    {" · "}
                    <a href={`/ofertas/publicacao/${publicacao.id}/download?formato=csv`}>CSV</a>
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
