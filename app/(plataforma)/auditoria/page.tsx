import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import {
  autoresDaTrilha,
  consultarTrilha,
  entidadesDaTrilha,
  TETO_DO_EXTRATO,
} from "@/infra/consultas/auditoria";
import { LinhasAuditoria } from "./linhas-auditoria";
import {
  PERIODOS_AUDITORIA,
  TIPOS_DE_EVENTO,
  filtrosDaQuerystring,
  querystringDosFiltros,
} from "./filtros";

export const metadata: Metadata = {
  title: "Auditoria",
};

/**
 * T28 — Auditoria (Onda 6, ficha §4).
 *
 * Somente leitura para todos os papéis (RN48): a trilha é o contrapeso do
 * RBAC, e esconder a auditoria de quem é auditado esvaziaria a governança
 * que esta onda existe para tornar visível. Só a EXPORTAÇÃO do extrato é
 * restrita a Gestor e Administrador — e ela gera o próprio evento.
 *
 * Os filtros são um formulário GET: a consulta inteira cabe na URL, o que
 * a torna compartilhável com quem for auditar e faz o botão de exportar
 * levar exatamente os mesmos parâmetros que a tela usou.
 */
export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const podeExportar = podeExecutar(sessao.user.papel, "EXPORTAR_EXTRATO_AUDITORIA");

  const parametros = await searchParams;
  const filtros = filtrosDaQuerystring(parametros);
  const querystring = querystringDosFiltros(parametros);

  const [pagina, entidades, autores] = await Promise.all([
    consultarTrilha(filtros),
    entidadesDaTrilha(),
    autoresDaTrilha(),
  ]);

  const valor = (chave: string) =>
    typeof parametros[chave] === "string" ? (parametros[chave] as string) : "";

  const linkDePagina = (numero: number) =>
    `/auditoria?${querystring ? `${querystring}&` : ""}pagina=${numero}`;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
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
          <h1 className="h-page">Auditoria</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Trilha completa desde o dia 1 · somente leitura para todos os papéis · retenção
            integral até definição do jurídico
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeExportar ? (
          <a
            className="btn btn-ghost"
            href={`/auditoria/extrato${querystring ? `?${querystring}` : ""}`}
          >
            Exportar extrato (CSV)
          </a>
        ) : (
          <span className="cap">
            Exportar o extrato exige papel Gestor ou Administrador (RN48).
          </span>
        )}
      </div>

      <form
        method="get"
        action="/auditoria"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label className="sr-oculto" htmlFor="filtro-entidade">
          Filtrar por entidade
        </label>
        <select
          id="filtro-entidade"
          name="entidade"
          className="select"
          style={{ width: 170 }}
          defaultValue={valor("entidade")}
        >
          <option value="">Entidade (todas)</option>
          {entidades.map((entidade) => (
            <option key={entidade} value={entidade}>
              {entidade}
            </option>
          ))}
        </select>

        <label className="sr-oculto" htmlFor="filtro-tipo">
          Filtrar por tipo de evento
        </label>
        <select
          id="filtro-tipo"
          name="tipo"
          className="select"
          style={{ width: 185 }}
          defaultValue={valor("tipo")}
        >
          <option value="">Tipo de evento (todos)</option>
          {TIPOS_DE_EVENTO.map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </select>

        <label className="sr-oculto" htmlFor="filtro-autor">
          Filtrar por autor
        </label>
        <select
          id="filtro-autor"
          name="autor"
          className="select"
          style={{ width: 170 }}
          defaultValue={valor("autor")}
        >
          <option value="">Autor (todos)</option>
          {autores.map((autor) => (
            <option key={autor.id} value={autor.id}>
              {autor.nome}
            </option>
          ))}
        </select>

        <label className="sr-oculto" htmlFor="filtro-registro">
          Filtrar por registro
        </label>
        <input
          id="filtro-registro"
          name="registro"
          className="input"
          style={{ width: 200 }}
          placeholder="Registro ou valor…"
          defaultValue={valor("registro")}
        />

        <label className="sr-oculto" htmlFor="filtro-periodo">
          Período
        </label>
        <select
          id="filtro-periodo"
          name="periodo"
          className="select"
          style={{ width: 160 }}
          defaultValue={valor("periodo") || "30"}
        >
          {PERIODOS_AUDITORIA.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>

        <button type="submit" className="btn btn-azul btn-sm">
          Filtrar
        </button>
        <div style={{ flex: 1 }} />
        <span className="cap">
          <span className="sens-dot" /> evento sensível
        </span>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl tbl-resp">
          <caption className="sr-oculto">Trilha de auditoria da plataforma</caption>
          <thead>
            <tr>
              <th style={{ width: 130 }}>Data · hora</th>
              <th>Usuário</th>
              <th style={{ width: "30%" }}>Transação</th>
              <th>Entidade</th>
              <th>Registro</th>
              <th style={{ width: 34 }}>
                <span className="sr-oculto">Detalhe</span>
              </th>
            </tr>
          </thead>
          {pagina.eventos.length > 0 ? (
            <LinhasAuditoria eventos={pagina.eventos} />
          ) : (
            <tbody>
              <tr>
                <td colSpan={6}>
                  <div className="vazio">
                    <h2 className="h-el">Nenhum evento no filtro</h2>
                    <p className="cap" style={{ maxWidth: "44ch", margin: 0 }}>
                      A trilha não foi apagada — nenhum evento é apagado na v1 (RN49). Amplie o
                      período ou limpe os filtros.
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginTop: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span className="cap">
          Nenhum evento é apagado na v1 (RN49){" "}
          <span className="selo">retenção a confirmar — jurídico</span>
          {pagina.total > TETO_DO_EXTRATO ? (
            <>
              {" "}
              · o extrato exporta no máximo {TETO_DO_EXTRATO.toLocaleString("pt-BR")} linhas por
              vez — estreite o filtro para levar tudo
            </>
          ) : null}
        </span>
        <span className="cap num" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {pagina.total.toLocaleString("pt-BR")} eventos · página {pagina.pagina} de{" "}
          {pagina.paginas}
          {pagina.pagina > 1 ? <Link href={linkDePagina(pagina.pagina - 1)}>Anterior</Link> : null}
          {pagina.pagina < pagina.paginas ? (
            <Link href={linkDePagina(pagina.pagina + 1)}>Próxima</Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
