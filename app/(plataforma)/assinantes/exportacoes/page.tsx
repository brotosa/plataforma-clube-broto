import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { listarExportacoesRecentes } from "@/infra/consultas/assinantes";
import { AcoesExportacao } from "./acoes-exportacao";

/**
 * T18 (histórico) — "Minhas exportações recentes": a trilha pessoal das
 * exportações de lista de contato (RN34), da mais recente para a mais antiga.
 *
 * A exportação carrega PII plena e é restrita a Gestor/Administrador
 * (EXPORTAR_LISTAS_CONTATO); esta página herda a mesma cerca — quem não
 * exporta não tem histórico a ver — e mostra só a trilha do próprio autor.
 * Cada linha oferece **baixar de novo** (o snapshot guardado) e **reexecutar
 * com a mesma finalidade** (um snapshot novo, recalculado sobre a base de
 * agora). O conteúdo do CSV não muda: reexecutar passa pelo mesmo caminho
 * auditado de `exportarLista`.
 */
export default async function PaginaExportacoes() {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  if (!podeExecutar(sessao.user.papel, "EXPORTAR_LISTAS_CONTATO")) {
    // Sem a permissão de exportar não há trilha pessoal a exibir (ficha §2).
    redirect("/assinantes");
  }

  const exportacoes = await listarExportacoesRecentes(sessao.user.id);
  const formatarQuando = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/assinantes">Assinantes</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Minhas exportações recentes</b>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">Minhas exportações recentes</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            As últimas 20 exportações de lista que você gerou · finalidade, contagem e data
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Link className="btn btn-azul" href="/assinantes">
          Ir para a carteira
        </Link>
      </div>

      <div className="aviso-inline">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ flex: "none" }}
        >
          <path d="M12 8v4l3 3" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        <span>
          Reexecutar gera um snapshot novo, recalculado sobre a base de hoje — a contagem
          pode diferir da original, e cada geração é auditada.
        </span>
      </div>

      {exportacoes.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="vazio">
            <h2 className="h-el">Você ainda não exportou nenhuma lista</h2>
            <p className="cap" style={{ maxWidth: "46ch", margin: 0 }}>
              Monte um filtro na carteira, informe a finalidade e exporte — a exportação
              passa a aparecer aqui para baixar de novo ou reexecutar.
            </p>
            <Link className="btn btn-azul" style={{ marginTop: 8 }} href="/assinantes">
              Ir para a carteira
            </Link>
          </div>
        </div>
      ) : (
        <div className="pm-grid" style={{ marginTop: 16 }}>
          {exportacoes.map((exportacao) => (
            <div className="pm-card" key={exportacao.id}>
              <div className="pm-secao">Exportação de lista</div>
              <h2 className="h-el" style={{ fontSize: 16, marginTop: 6 }}>
                {exportacao.finalidade}
              </h2>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
                <span className="kpi-n num" style={{ fontSize: 26 }}>
                  {exportacao.contagem.toLocaleString("pt-BR")}
                </span>
                <span className="cap">linhas no snapshot</span>
              </div>
              <div className="cap" style={{ marginTop: 6 }}>
                {formatarQuando.format(exportacao.criadoEm)}
                {exportacao.segmentoNome ? ` · segmento “${exportacao.segmentoNome}”` : ""}
              </div>
              <AcoesExportacao exportacaoId={exportacao.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
