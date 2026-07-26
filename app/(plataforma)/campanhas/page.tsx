import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { ROTULOS_ESTADO_CAMPANHA } from "@/dominio/campanhas/regras";
import { listarCampanhas, type LinhaCampanha } from "@/infra/consultas/campanhas";
import { NovaCampanha } from "./nova-campanha";

/**
 * T22 — Lista de campanhas (protótipo v7.1): estado, vigência, tamanho
 * do público congelado, metas × realizado COM o nível de atribuição e a
 * versão do kit. Rascunho abre a modelagem; ativa ou encerrada abre o
 * painel.
 */

export const dynamic = "force-dynamic";

function classeDoEstado(estado: string): string {
  if (estado === "ATIVA") return "pill pill-ok";
  if (estado === "ENCERRADA") return "pill pill-neutra";
  return "pill pill-pendente";
}

function periodo(inicio: Date | null, fim: Date | null): string {
  const formatar = (data: Date | null) =>
    data ? data.toISOString().slice(0, 10).split("-").reverse().join("/") : null;
  const de = formatar(inicio);
  const ate = formatar(fim);
  if (!de) return "—";
  return ate ? `${de} → ${ate}` : `${de} → sem fim`;
}

function LinhaDaCampanha({ campanha }: { campanha: LinhaCampanha }) {
  const destino =
    campanha.estado === "RASCUNHO"
      ? `/campanhas/${campanha.id}`
      : `/campanhas/${campanha.id}/painel`;
  return (
    <tr>
      <td data-label="Campanha">
        <Link href={destino} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 600 }}>{campanha.nome}</span>
          <span className="cap">{campanha.objetivo ?? "sem objetivo declarado"}</span>
        </Link>
      </td>
      <td data-label="Estado">
        <span className={classeDoEstado(campanha.estado)}>
          <i />
          {ROTULOS_ESTADO_CAMPANHA[campanha.estado as keyof typeof ROTULOS_ESTADO_CAMPANHA]}
        </span>
      </td>
      <td data-label="Vigência" className="num" style={{ color: "var(--paragrafo-aaa)" }}>
        {periodo(campanha.vigenciaInicio, campanha.vigenciaFim)}
      </td>
      <td data-label="Público congelado" className="num" style={{ textAlign: "right" }}>
        {campanha.publicoCongelado === null
          ? "—"
          : campanha.publicoCongelado.toLocaleString("pt-BR")}
      </td>
      <td data-label="Metas × realizado">
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span className="num">{campanha.resumo.texto}</span>
          <span className="pill pill-neutra" style={{ width: "max-content" }}>
            {campanha.resumo.nivel}
          </span>
        </div>
      </td>
      <td data-label="Kit">
        {campanha.versaoKit ? (
          <span className="pill pill-ok">
            <i />v{campanha.versaoKit}
          </span>
        ) : (
          <span className="pill pill-pendente">
            <i />
            sem kit
          </span>
        )}
      </td>
    </tr>
  );
}

export default async function PaginaCampanhas() {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const podeModelar = podeExecutar(sessao.user.papel, "MODELAR_CAMPANHA");

  let campanhas: LinhaCampanha[] = [];
  let erroConsulta = false;
  try {
    campanhas = await listarCampanhas();
  } catch {
    erroConsulta = true;
  }

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
          <h1 className="h-page">Campanhas</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            A plataforma modela e entrega o kit · a Minutrade executa o disparo
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Link className="btn btn-ghost" href="/campanhas/cestas">
          Cestas
        </Link>
        {podeModelar ? <NovaCampanha /> : null}
      </div>

      {erroConsulta ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Não foi possível carregar as campanhas</h2>
            <p className="cap" style={{ maxWidth: "44ch", margin: 0 }}>
              Os kits ativos seguem valendo — só a listagem falhou.
            </p>
          </div>
        </div>
      ) : campanhas.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <h2 className="h-el">Nenhuma campanha ainda</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              Uma campanha nasce de um público, de ofertas ou cestas, das peças e das metas — o
              kit é gerado na ativação.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp">
              <caption className="sr-oculto">
                Campanhas com estado, vigência, público congelado, metas × realizado e versão do
                kit
              </caption>
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Campanha</th>
                  <th>Estado</th>
                  <th>Vigência</th>
                  <th style={{ textAlign: "right" }}>Público congelado</th>
                  <th>Metas × realizado</th>
                  <th>Kit</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((campanha) => (
                  <LinhaDaCampanha campanha={campanha} key={campanha.id} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="cap" style={{ margin: "10px 0 0" }}>
            Rascunho abre a modelagem; campanha ativa ou encerrada abre o painel com atribuição
            declarada.
          </p>
        </>
      )}
    </div>
  );
}
