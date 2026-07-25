"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { AlvoMapeamento, MapeamentoColunas } from "@/dominio/carga-prospects/mapeamento";
import type { ResumoImportacaoProspects } from "@/infra/casos-de-uso/carga-prospects";
import {
  acaoAplicarMapeamento,
  acaoEfetivarImportacao,
  acaoIniciarImportacao,
  type EstadoUploadLista,
} from "../acoes";

/**
 * T9 — importação de lista em três passos (upload → mapeamento de colunas
 * → resumo com deduplicação). O mapeamento é configuração por importação
 * (o layout real das listas é [A CONFIRMAR]); a deduplicação corre por
 * CNPJ/nome contra o radar e as aliadas.
 */

const ALVOS: Array<{ valor: AlvoMapeamento; rotulo: string }> = [
  { valor: "NOME", rotulo: "→ Nome de exibição" },
  { valor: "SITE", rotulo: "→ Site" },
  { valor: "CNPJ", rotulo: "→ CNPJ" },
  { valor: "CATEGORIA", rotulo: "→ Categoria-alvo" },
  { valor: "IGNORAR", rotulo: "→ ignorar" },
];

function ChipPasso({ numero, rotulo, atual }: { numero: 1 | 2 | 3; rotulo: string; atual: number }) {
  const classe = atual === numero ? "step on" : atual > numero ? "step done" : "step";
  return (
    <span className={classe} aria-current={atual === numero ? "step" : undefined}>
      <span className="n" aria-hidden="true">
        {numero}
      </span>
      {rotulo}
    </span>
  );
}

export function ImportacaoDeLista({ focoInicial }: { focoInicial: boolean }) {
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [mapeamento, setMapeamento] = useState<MapeamentoColunas>({});
  const [resumo, setResumo] = useState<ResumoImportacaoProspects | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [efetivada, setEfetivada] = useState<string | null>(null);
  const [pendente, iniciarTransicao] = useTransition();
  const tituloRef = useRef<HTMLHeadingElement | null>(null);

  const [upload, enviarUpload, uploadPendente] = useActionState(
    async (anterior: EstadoUploadLista, dados: FormData) => {
      const resultado = await acaoIniciarImportacao(anterior, dados);
      if (resultado.importacaoId && resultado.sugestaoMapeamento) {
        setMapeamento(resultado.sugestaoMapeamento);
        setErros([]);
        setResumo(null);
        setEfetivada(null);
        setPasso(2);
      }
      return resultado;
    },
    {} as EstadoUploadLista,
  );

  useEffect(() => {
    if (focoInicial) {
      tituloRef.current?.focus();
    }
  }, [focoInicial]);

  function aplicarMapeamento() {
    if (!upload.importacaoId) return;
    iniciarTransicao(async () => {
      const resultado = await acaoAplicarMapeamento({
        importacaoId: upload.importacaoId!,
        mapeamento,
      });
      if (resultado.erros?.length) {
        setErros(resultado.erros);
        return;
      }
      if (resultado.resumo) {
        setErros([]);
        setResumo(resultado.resumo);
        setPasso(3);
      }
    });
  }

  function efetivar() {
    if (!upload.importacaoId) return;
    iniciarTransicao(async () => {
      const resultado = await acaoEfetivarImportacao({ importacaoId: upload.importacaoId! });
      if (resultado.erros?.length) {
        setErros(resultado.erros);
        return;
      }
      setErros([]);
      setEfetivada(resultado.sucesso ?? "Importação efetivada.");
    });
  }

  return (
    <div className="card" style={{ padding: "22px 24px" }}>
      <h2 className="h-el" style={{ marginBottom: 16 }} tabIndex={-1} ref={tituloRef}>
        Importar lista
      </h2>
      <div style={{ display: "flex", gap: 18, marginBottom: 18, flexWrap: "wrap" }}>
        <ChipPasso numero={1} rotulo="Upload" atual={passo} />
        <ChipPasso numero={2} rotulo="Mapeamento de colunas" atual={passo} />
        <ChipPasso numero={3} rotulo="Resumo e deduplicação" atual={passo} />
      </div>

      {erros.length > 0 || upload.erros?.length ? (
        <div className="aviso-inline" role="alert">
          <span>{[...(erros.length ? erros : []), ...(upload.erros ?? [])].join(" ")}</span>
        </div>
      ) : null}

      {passo === 1 ? (
        <form action={enviarUpload}>
          <div className="dropzone">
            <div style={{ font: "var(--font-body-label-bold)", color: "var(--preto)" }}>
              Arraste o CSV ou XLSX da lista de prospects
            </div>
            <div className="cap" style={{ margin: "6px 0 14px" }}>
              uma linha por empresa · máx. 500 linhas por importação
            </div>
            <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
              Selecionar arquivo
              <input
                type="file"
                name="arquivo"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
                onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
              />
            </label>
            {uploadPendente ? (
              <div className="cap" style={{ marginTop: 10 }} role="status">
                Lendo o arquivo…
              </div>
            ) : null}
          </div>
          <p className="cap" style={{ margin: "10px 0 0" }}>
            O significado de cada coluna é escolhido no próximo passo — o layout real das
            listas existentes é [A CONFIRMAR] e vira configuração, não código.
          </p>
        </form>
      ) : null}

      {passo === 2 && upload.importacaoId ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="cap">
            {upload.nomeArquivo} · {upload.totalLinhas} linha(s)
          </div>
          <div
            className="g-resp"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", alignItems: "center" }}
          >
            {(upload.cabecalhos ?? []).map((cabecalho) => (
              <div style={{ display: "contents" }} key={cabecalho}>
                <label htmlFor={`mapa-${cabecalho}`} style={{ fontSize: 14 }}>
                  Coluna “{cabecalho}”
                </label>
                <select
                  id={`mapa-${cabecalho}`}
                  className="select"
                  value={mapeamento[cabecalho] ?? "IGNORAR"}
                  onChange={(evento) =>
                    setMapeamento((atual) => ({
                      ...atual,
                      [cabecalho]: evento.target.value as AlvoMapeamento,
                    }))
                  }
                >
                  {ALVOS.map((alvo) => (
                    <option key={alvo.valor} value={alvo.valor}>
                      {alvo.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setPasso(1)}>
              ‹ Voltar
            </button>
            <button
              type="button"
              className="btn btn-azul"
              disabled={pendente}
              onClick={aplicarMapeamento}
            >
              {pendente ? "Analisando…" : "Continuar ›"}
            </button>
          </div>
        </div>
      ) : null}

      {passo === 3 && resumo ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            className="num"
            style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 12px", fontSize: 14 }}
          >
            <b>{resumo.lidas}</b>
            <span>linhas lidas</span>
            <b style={{ color: "var(--azul-texto-aaa)" }}>{resumo.novas}</b>
            <span>
              novas — entram como{" "}
              <span className="pill pill-info">
                <i aria-hidden="true" />
                Mapeada
              </span>
            </span>
            <b>{resumo.jaNoRadar}</b>
            <span className="cap" style={{ fontSize: 14 }}>
              já estavam no radar — ignoradas (deduplicação)
            </span>
            <b>{resumo.jaAliadas}</b>
            <span className="cap" style={{ fontSize: 14 }}>
              já são aliadas — ignoradas
            </span>
            {resumo.recusadas.length > 0 ? (
              <>
                <b>{resumo.recusadas.length}</b>
                <span className="cap" style={{ fontSize: 14 }}>
                  em quarentena, com motivo por linha (abaixo)
                </span>
              </>
            ) : null}
          </div>
          {resumo.recusadas.length > 0 ? (
            <ul className="cap" style={{ margin: 0, paddingLeft: 18 }}>
              {resumo.recusadas.map((linha) => (
                <li key={`${linha.linha}-${linha.motivo}`}>
                  linha {linha.linha}: {linha.motivo}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="cap" style={{ margin: 0 }}>
            Deduplicação por CNPJ/nome contra o radar e as aliadas cadastradas.
          </p>
          {efetivada ? (
            <div className="aviso-inline" role="status">
              <span>
                {efetivada} <Link href="/mercado">Ver no funil ›</Link>
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPasso(2)}>
                ‹ Voltar
              </button>
              <button
                type="button"
                className="btn btn-azul"
                disabled={pendente || resumo.novas === 0}
                onClick={efetivar}
              >
                {pendente ? "Efetivando…" : "Efetivar importação"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
