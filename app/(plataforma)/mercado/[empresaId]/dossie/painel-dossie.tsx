"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DossieDaTela } from "@/infra/consultas/dossies";
import { MARCA_REQUER_REVISAO, ROTULOS_ORIGEM_DOSSIE } from "@/dominio/dossie/regras";
import {
  acaoGerarDossie,
  acaoInserirManualmente,
  acaoMarcarComoRevisado,
  acaoTentarNovamente,
  type EstadoAcaoDossie,
} from "./acoes";

/**
 * T11 — ações e estados do dossiê (client), conforme o protótipo v6.1:
 * vazio com "Gerar dossiê"/"Inserir manualmente", "gerando…" com esqueleto,
 * tarja de alerta "Gerado automaticamente — requer revisão" com a ação de
 * revisão, e o selo de revisado. O estado de falha e a nova tentativa não
 * existem no protótipo e seguem a ficha §3.4 (status gerando · pronto ·
 * falha) usando os mesmos tokens visuais.
 */

const RELOGIO_DE_ATUALIZACAO_MS = 5_000;

function dataHora(valor: Date | string): string {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dataCurta(valor: Date | string): string {
  return new Date(valor).toLocaleDateString("pt-BR");
}

export function PainelDossie({
  empresaId,
  dossie,
  geracaoDisponivel,
  mensagemIndisponivel,
  resumoOrcamento,
  estagioAceitaDossie,
  promptParaCopiar,
}: {
  empresaId: string;
  dossie: DossieDaTela | null;
  geracaoDisponivel: boolean;
  mensagemIndisponivel: string | null;
  resumoOrcamento: string | null;
  estagioAceitaDossie: boolean;
  promptParaCopiar: { sistema: string; usuario: string; versao: string };
}) {
  const roteador = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [estado, setEstado] = useState<EstadoAcaoDossie | null>(null);
  const [contexto, setContexto] = useState("");
  const [colado, setColado] = useState("");
  const [manualAberto, setManualAberto] = useState(false);
  const regiaoDeAviso = useRef<HTMLDivElement | null>(null);

  const gerando = dossie?.status === "GERANDO";

  // Enquanto gera, a tela se atualiza sozinha: a pesquisa roda fora do
  // ciclo da resposta e o analista pode ficar olhando ou sair.
  useEffect(() => {
    if (!gerando) return;
    const relogio = setInterval(() => roteador.refresh(), RELOGIO_DE_ATUALIZACAO_MS);
    return () => clearInterval(relogio);
  }, [gerando, roteador]);

  function executar(acao: () => Promise<EstadoAcaoDossie>) {
    iniciarTransicao(async () => {
      const resultado = await acao();
      setEstado(resultado);
      roteador.refresh();
      regiaoDeAviso.current?.focus();
    });
  }

  const avisoDeEstado = estado ? (
    <div
      ref={regiaoDeAviso}
      tabIndex={-1}
      role="status"
      className="card"
      style={{
        padding: "12px 16px",
        borderColor: estado.erros?.length ? "var(--erro)" : "var(--verde)",
      }}
    >
      {estado.erros?.length ? (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {estado.erros.map((erro) => (
            <li key={erro} style={{ fontSize: 13.5 }}>
              {erro}
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ fontSize: 13.5 }}>{estado.sucesso}</div>
      )}
      {estado.avisos?.length ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {estado.avisos.map((aviso) => (
            <li key={aviso} className="cap">
              {aviso}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;

  const formularioManual = (
    <div className="card" style={{ padding: "18px 20px" }}>
      <h2 className="h-el" style={{ marginBottom: 4 }}>
        Inserir dossiê manualmente
      </h2>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "70ch" }}>
        Cole o JSON no formato do template versionado ({promptParaCopiar.versao}). O prompt
        abaixo é o mesmo que a geração automática usa — copie para produzir o dossiê em outra
        ferramenta e traga o resultado para cá.
      </p>

      <details style={{ marginBottom: 12 }}>
        <summary className="cap" style={{ cursor: "pointer" }}>
          Ver o prompt do template
        </summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <label className="cap" htmlFor="prompt-sistema">
            Prompt de sistema
          </label>
          <textarea
            id="prompt-sistema"
            className="input"
            readOnly
            rows={4}
            value={promptParaCopiar.sistema}
          />
          <label className="cap" htmlFor="prompt-usuario">
            Prompt de usuário
          </label>
          <textarea
            id="prompt-usuario"
            className="input"
            readOnly
            rows={8}
            value={promptParaCopiar.usuario}
          />
        </div>
      </details>

      <label className="cap" htmlFor="conteudo-colado">
        Conteúdo do dossiê (JSON)
      </label>
      <textarea
        id="conteudo-colado"
        className="input"
        rows={10}
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12.5 }}
        value={colado}
        onChange={(evento) => setColado(evento.target.value)}
        placeholder='{"resumo_executivo": "…", "perfil": [ … ], … }'
      />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-azul"
          disabled={pendente || colado.trim().length === 0}
          onClick={() =>
            executar(async () => {
              const resultado = await acaoInserirManualmente({
                empresaId,
                conteudoColado: colado,
                contextoAdicional: contexto,
              });
              if (!resultado.erros?.length) {
                setColado("");
                setManualAberto(false);
              }
              return resultado;
            })
          }
        >
          Salvar dossiê
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pendente}
          onClick={() => setManualAberto(false)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  if (!estagioAceitaDossie) {
    return (
      <div className="card">
        <div className="vazio">
          <h2 className="h-el">Dossiê indisponível neste estágio</h2>
          <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
            A aba fica ativa nos estágios pré-aliança e na aliada ativa. Um caso parado no motor
            de aprovação não muda embaixo do aprovador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {avisoDeEstado}

      {mensagemIndisponivel ? (
        <div className="card" role="note" style={{ padding: "12px 16px" }}>
          <span className="pill pill-pendente">geração automática indisponível</span>{" "}
          <span className="cap">{mensagemIndisponivel}</span>
        </div>
      ) : null}

      {/* Vazio (protótipo): nunca houve dossiê para esta empresa. */}
      {!dossie ? (
        <div className="card">
          <div className="vazio">
            <div className="ic" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="26"
                height="26"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              </svg>
            </div>
            <h2 className="h-el">Dossiê público ainda não gerado</h2>
            <p className="cap" style={{ maxWidth: "48ch", margin: 0 }}>
              A geração é assíncrona, consulta apenas fontes públicas e nasce marcada “requer
              revisão”.
            </p>
            <div style={{ display: "grid", gap: 8, width: "min(420px, 100%)", marginTop: 4 }}>
              <label className="cap" htmlFor="contexto-analista" style={{ textAlign: "left" }}>
                Contexto do analista (opcional)
              </label>
              <textarea
                id="contexto-analista"
                className="input"
                rows={2}
                value={contexto}
                onChange={(evento) => setContexto(evento.target.value)}
                placeholder="O que a pesquisa precisa observar nesta empresa"
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-azul"
                disabled={pendente || !geracaoDisponivel}
                title={geracaoDisponivel ? undefined : (mensagemIndisponivel ?? undefined)}
                onClick={() =>
                  executar(() => acaoGerarDossie({ empresaId, contextoAdicional: contexto }))
                }
              >
                Gerar dossiê
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pendente}
                onClick={() => setManualAberto(true)}
              >
                Inserir manualmente
              </button>
            </div>
            {resumoOrcamento ? <span className="cap">{resumoOrcamento}</span> : null}
          </div>
        </div>
      ) : null}

      {/* Carregando (protótipo): pill "gerando…" e esqueleto. */}
      {dossie?.status === "GERANDO" ? (
        <div className="card" style={{ padding: "20px 22px" }} role="status" aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="pill pill-info">gerando…</span>
            <span className="cap">
              consultando fontes públicas — você pode sair desta tela; avisamos quando ficar
              pronto.
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}
            aria-hidden="true"
          >
            <span className="skel" style={{ height: 12, width: "70%" }} />
            <span className="skel" style={{ height: 12, width: "90%" }} />
            <span className="skel" style={{ height: 12, width: "55%" }} />
          </div>
        </div>
      ) : null}

      {/* Falha (ficha §3.4): mensagem e nova tentativa. */}
      {dossie?.status === "FALHA" ? (
        <div className="card" style={{ padding: "18px 20px" }} role="alert">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="pill pill-erro">
              <i />
              falha
            </span>
            <span style={{ fontSize: 13.5, flex: 1 }}>
              {dossie.erro ?? "A geração não foi concluída."}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-azul"
              disabled={pendente || !geracaoDisponivel}
              title={geracaoDisponivel ? undefined : (mensagemIndisponivel ?? undefined)}
              onClick={() => executar(() => acaoTentarNovamente({ empresaId, dossieId: dossie.id }))}
            >
              Tentar novamente
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pendente}
              onClick={() => setManualAberto(true)}
            >
              Inserir manualmente
            </button>
          </div>
        </div>
      ) : null}

      {/* RN19 — tarja enquanto não revisado; selo depois de revisado. */}
      {dossie?.status === "PRONTO" && !dossie.revisado ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "var(--alerta-claro)",
            border: "1px solid var(--alerta)",
            borderRadius: "var(--r-md)",
            padding: "12px 14px",
            flexWrap: "wrap",
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="var(--preto)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flex: "none" }}
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <span style={{ fontSize: 13.5, flex: 1, minWidth: "24ch" }}>
            <b>{MARCA_REQUER_REVISAO}.</b> Verifique as fontes antes de usar na decisão. O dossiê
            é evidência: nenhum campo dele preenche nota de indicador.
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pendente}
            onClick={() =>
              executar(() => acaoMarcarComoRevisado({ empresaId, dossieId: dossie.id }))
            }
          >
            Marcar como revisado
          </button>
        </div>
      ) : null}

      {dossie?.status === "PRONTO" && dossie.revisado ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="pill pill-ok">
            <i />
            revisado por {dossie.revisorNome ?? "—"}
            {dossie.revisadoEm ? ` · ${dataCurta(dossie.revisadoEm)}` : null}
          </span>
          <span className="cap">a pontuação segue humana: o dossiê não preenche indicador.</span>
        </div>
      ) : null}

      {/* Metadados do dossiê vigente. */}
      {dossie ? (
        <div className="cap" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>origem: {ROTULOS_ORIGEM_DOSSIE[dossie.origem]}</span>
          <span>pedido por {dossie.solicitanteNome}</span>
          <span>em {dataHora(dossie.criadoEm)}</span>
          {dossie.versaoTemplate ? <span>template {dossie.versaoTemplate}</span> : null}
        </div>
      ) : null}

      {dossie?.conteudoInvalido?.length ? (
        <div className="card" role="alert" style={{ padding: "12px 16px", borderColor: "var(--erro)" }}>
          <b style={{ fontSize: 13.5 }}>
            O conteúdo gravado não segue o schema vigente do template e não é exibido.
          </b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {dossie.conteudoInvalido.map((erro) => (
              <li key={erro} className="cap">
                {erro}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Dossiê já existente: gerar de novo é decisão explícita do analista. */}
      {dossie && dossie.status !== "GERANDO" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {dossie.status === "PRONTO" ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pendente || !geracaoDisponivel}
              title={geracaoDisponivel ? undefined : (mensagemIndisponivel ?? undefined)}
              onClick={() =>
                executar(() => acaoGerarDossie({ empresaId, contextoAdicional: contexto }))
              }
            >
              Gerar novo dossiê
            </button>
          ) : null}
          {!manualAberto ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pendente}
              onClick={() => setManualAberto(true)}
            >
              Inserir outro manualmente
            </button>
          ) : null}
        </div>
      ) : null}

      {manualAberto ? formularioManual : null}
    </div>
  );
}
