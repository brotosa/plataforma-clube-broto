import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatarBrl } from "@/dominio/dossie/custo";
import { telaDossie } from "@/infra/consultas/dossies";
import { LeituraDoDossie } from "./leitura-dossie";
import { PainelDossie } from "./painel-dossie";

export const metadata: Metadata = {
  title: "Dossiê de due diligence",
};

/**
 * T11 — Dossiê (ficha Onda 2 §5): geração assíncrona sob demanda com
 * status, ou inserção manual; leitura nas dez seções com fontes; ação
 * "marcar como revisado" (RN19). Layout do protótipo v6.1, onde a tela
 * aparece como a aba "Dossiê" da ficha da empresa — a F9 monta essa aba na
 * T12 reaproveitando os componentes daqui.
 */

function duracao(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  return `${minutos} min ${String(segundos % 60).padStart(2, "0")} s`;
}

function numero(valor: number | null): string {
  return valor === null ? "—" : valor.toLocaleString("pt-BR");
}

export default async function PaginaDossie({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const tela = await telaDossie(empresaId);
  if (!tela) {
    notFound();
  }
  const { empresa, dossie, geracaoAutomatica, anteriores } = tela;

  const resumoOrcamento = geracaoAutomatica.disponivel
    ? `Consumo do mês: ${geracaoAutomatica.orcamento.gastoNoMesFormatado} de ${geracaoAutomatica.orcamento.tetoMensalFormatado} (teto por dossiê: ${formatarBrl(geracaoAutomatica.orcamento.tetos.unitarioBrl)}).`
    : null;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1300 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/mercado">Mercado &amp; Scout</Link> / {empresa.nomeFantasia} /{" "}
        <b style={{ color: "var(--preto)" }}>Dossiê</b>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          <h1 className="h-page" style={{ fontSize: 24, lineHeight: "30px" }}>
            {empresa.nomeFantasia}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {empresa.categorias.map((categoria) => (
              <span key={categoria} className="tag-cat">
                {categoria}
              </span>
            ))}
            <span className="pill pill-info">{empresa.rotuloEstagio}</span>
          </div>
          {empresa.site ? (
            <div className="cap" style={{ marginTop: 6 }}>
              <a href={empresa.site} target="_blank" rel="noreferrer noopener">
                {empresa.site}
              </a>
            </div>
          ) : null}
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            className="cap"
            style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}
          >
            Score de scouting
          </div>
          <span className="kpi-n" style={{ fontSize: 22 }}>
            {empresa.scoreScouting ?? "—"}
          </span>
          {empresa.scoreScouting === null ? (
            <div>
              <span className="selo">avaliação pendente</span>
            </div>
          ) : null}
          <div className="cap">resp.: {empresa.responsavelScout ?? "—"}</div>
          <div className="cap" style={{ marginTop: 6 }}>
            <Link href={`/mercado/${empresa.id}/avaliacao`}>Ir para a avaliação</Link>
          </div>
        </div>
      </div>

      <PainelDossie
        empresaId={empresa.id}
        dossie={dossie}
        estagioAceitaDossie={tela.estagioAceitaDossie}
        geracaoDisponivel={geracaoAutomatica.disponivel}
        mensagemIndisponivel={
          geracaoAutomatica.disponivel ? null : geracaoAutomatica.mensagem
        }
        resumoOrcamento={resumoOrcamento}
        promptParaCopiar={tela.promptParaCopiar}
      />

      {dossie?.conteudo ? (
        <div style={{ marginTop: 14 }}>
          <LeituraDoDossie conteudo={dossie.conteudo} />
        </div>
      ) : null}

      {dossie && dossie.execucoes.length > 0 ? (
        <div className="card" style={{ padding: "18px 20px", marginTop: 14 }}>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Execuções
          </h2>
          <p className="cap" style={{ margin: "0 0 10px" }}>
            Custo e duração são registrados por execução, inclusive nas tentativas que falham.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl-resp">
              <thead>
                <tr>
                  <th scope="col">Tentativa</th>
                  <th scope="col">Início</th>
                  <th scope="col">Duração</th>
                  <th scope="col">Provedor</th>
                  <th scope="col">Tokens (entrada/saída)</th>
                  <th scope="col">Buscas</th>
                  <th scope="col">Custo</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {dossie.execucoes.map((execucao) => (
                  <tr key={execucao.tentativa}>
                    <td data-label="Tentativa">{execucao.tentativa}</td>
                    <td data-label="Início">
                      {new Date(execucao.iniciadaEm).toLocaleString("pt-BR")}
                    </td>
                    <td data-label="Duração">{duracao(execucao.duracaoMs)}</td>
                    <td data-label="Provedor">
                      {execucao.provedor}
                      {execucao.modelo ? ` · ${execucao.modelo}` : ""}
                    </td>
                    <td data-label="Tokens (entrada/saída)">
                      {numero(execucao.tokensEntrada)} / {numero(execucao.tokensSaida)}
                    </td>
                    <td data-label="Buscas">{numero(execucao.buscasWeb)}</td>
                    <td data-label="Custo">
                      {execucao.custoBrl === null ? "—" : formatarBrl(execucao.custoBrl)}
                    </td>
                    <td data-label="Resultado">
                      {execucao.sucesso ? (
                        <span className="pill pill-ok">
                          <i />
                          concluída
                        </span>
                      ) : (
                        <span className="pill pill-erro">
                          <i />
                          falhou
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {anteriores.length > 0 ? (
        <div className="card" style={{ padding: "18px 20px", marginTop: 14 }}>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Dossiês anteriores
          </h2>
          <p className="cap" style={{ margin: "0 0 10px" }}>
            O dossiê vigente é o mais recente; os anteriores ficam no histórico da empresa.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {anteriores.map((anterior) => (
              <li key={anterior.id} className="cap">
                {new Date(anterior.criadoEm).toLocaleString("pt-BR")} · {anterior.status}
                {anterior.revisado ? " · revisado" : " · não revisado"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
