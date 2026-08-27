"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PoliticaImportacao } from "@prisma/client";
import type { ResumoCargaNucleo } from "@/dominio/assinantes/importacao";
import { CAMPOS_NUCLEO, ROTULOS_CAMPO_NUCLEO } from "@/dominio/assinantes/importacao";
import type { ResumoCargaEnriquecimento } from "@/dominio/assinantes/enriquecimento";
import {
  acaoConfirmarImportacao,
  acaoDryRunEnriquecimento,
  acaoDryRunNucleo,
  acaoPrepararImportacao,
} from "../acoes";

/**
 * T20 — os cinco passos do protótipo v6.1: 1 Família · 2 Arquivo ·
 * 3 Mapeamento · 4 Política · 5 Resumo. O dry-run acontece ao aplicar o
 * mapeamento (nada muta no cadastro); a foto completa mostra QUANTOS
 * sairiam e só processa com o texto FOTO COMPLETA digitado (RN29).
 */

type Familia = "ASSINANTES_NUCLEO" | "ASSINANTES_ENRIQUECIMENTO";

interface Preparo {
  importacaoId: string;
  colunas: string[];
  totalLinhas: number;
  sugestaoMapeamento: Record<string, string | null>;
  previa: Array<{ numero: number; valores: Record<string, string> }>;
}

interface LinhaHistorico {
  id: string;
  arquivo: string;
  familia: string;
  politica: string;
  autor: string;
  data: string;
  resultado: string;
  temErros: boolean;
}

// Derivado do domínio (CAMPOS_NUCLEO/ROTULOS) para não divergir do
// mapeador do servidor — inclui `Perfil de assinatura` e `Patrocinador`
// (Onda 12), que a UI não expunha e por isso não podiam ser mapeados.
const CAMPOS_NUCLEO_T20 = [
  ...CAMPOS_NUCLEO.map((campo) => ({ valor: campo, rotulo: ROTULOS_CAMPO_NUCLEO[campo] })),
  { valor: "nao_importar", rotulo: "— não importar" },
];

const PASSOS = [
  ["1", "Família"],
  ["2", "Arquivo"],
  ["3", "Mapeamento"],
  ["4", "Política"],
  ["5", "Resumo"],
] as const;

function IconeAviso() {
  return (
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
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function Importador({
  podeImportar,
  historico,
}: {
  podeImportar: boolean;
  historico: LinhaHistorico[];
}) {
  const roteador = useRouter();
  const [passo, setPasso] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [familia, setFamilia] = useState<Familia>("ASSINANTES_NUCLEO");
  const [preparo, setPreparo] = useState<Preparo | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, string | null>>({});
  const [politica, setPolitica] = useState<PoliticaImportacao>("INCREMENTAL");
  const [confirmacao, setConfirmacao] = useState("");
  const [dryRunNucleo, setDryRunNucleo] = useState<ResumoCargaNucleo | null>(null);
  const [dryRunEnriq, setDryRunEnriq] = useState<ResumoCargaEnriquecimento | null>(null);
  const [resumoFinal, setResumoFinal] = useState<
    ResumoCargaNucleo | ResumoCargaEnriquecimento | null
  >(null);
  const [erros, setErros] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);

  const rotuloFamilia =
    familia === "ASSINANTES_NUCLEO" ? "Base de assinantes" : "Enriquecimento";

  const enviarArquivo = async () => {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) {
      setErros(["Escolha um arquivo CSV ou XLSX."]);
      return;
    }
    setOcupado(true);
    setErros([]);
    const dados = new FormData();
    dados.set("familia", familia);
    dados.set("arquivo", arquivo);
    const resultado = await acaoPrepararImportacao(dados);
    setOcupado(false);
    if (!resultado.ok) {
      setErros(resultado.erros);
      return;
    }
    setPreparo(resultado.preparo);
    setNomeArquivo(arquivo.name);
    if (familia === "ASSINANTES_NUCLEO") {
      setMapeamento(resultado.preparo.sugestaoMapeamento);
    } else {
      // Enriquecimento: CPF pela sugestão; demais colunas viram atributos
      // com o próprio cabeçalho como nome (editável no de/para).
      const inicial: Record<string, string | null> = {};
      for (const coluna of resultado.preparo.colunas) {
        inicial[coluna] =
          resultado.preparo.sugestaoMapeamento[coluna] === "cpf" ? "cpf" : coluna;
      }
      setMapeamento(inicial);
    }
    setPasso(3);
  };

  const aplicarMapeamento = async (proximaPolitica?: PoliticaImportacao) => {
    if (!preparo) return;
    setOcupado(true);
    setErros([]);
    if (familia === "ASSINANTES_NUCLEO") {
      const resultado = await acaoDryRunNucleo({
        importacaoId: preparo.importacaoId,
        mapeamento: mapeamento as never,
        politica: proximaPolitica ?? politica,
      });
      setOcupado(false);
      if (!resultado.ok) {
        setErros(resultado.erros);
        return false;
      }
      setDryRunNucleo(resultado.resumo);
      return true;
    }
    const resultado = await acaoDryRunEnriquecimento({
      importacaoId: preparo.importacaoId,
      mapeamento,
    });
    setOcupado(false);
    if (!resultado.ok) {
      setErros(resultado.erros);
      return false;
    }
    setDryRunEnriq(resultado.resumo);
    return true;
  };

  const irParaPolitica = async () => {
    const ok = await aplicarMapeamento();
    if (ok) setPasso(4);
  };

  const mudarPolitica = async (nova: PoliticaImportacao) => {
    setPolitica(nova);
    setConfirmacao("");
    if (familia === "ASSINANTES_NUCLEO") {
      await aplicarMapeamento(nova);
    }
  };

  const processarCarga = async () => {
    if (!preparo) return;
    setOcupado(true);
    setErros([]);
    const resultado = await acaoConfirmarImportacao({
      importacaoId: preparo.importacaoId,
      familia,
      confirmacaoFotoCompleta: confirmacao,
    });
    setOcupado(false);
    if (!resultado.ok) {
      setErros(resultado.erros);
      return;
    }
    setResumoFinal(resultado.resumo);
    setPasso(5);
    roteador.refresh();
  };

  const bloqueadaFotoCompleta =
    familia === "ASSINANTES_NUCLEO" &&
    politica === "FOTO_COMPLETA" &&
    confirmacao.trim().toUpperCase() !== "FOTO COMPLETA";

  const numeroBr = (valor: number | null | undefined) =>
    (valor ?? 0).toLocaleString("pt-BR");

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1080 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/assinantes">Assinantes</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Importações</b>
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
          <h1 className="h-page">Importações</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            Upsert idempotente por CPF · quarentena com motivo · nunca tudo-ou-nada
            (RN29, RN31)
          </div>
        </div>
      </div>

      {!podeImportar ? (
        <div className="aviso-inline">
          <IconeAviso />
          <span>
            Seu papel não importa cargas — a permissão de importar assinantes é de
            Gestor e Analista (ficha §2). O histórico abaixo segue consultável.
          </span>
        </div>
      ) : (
        <>
          <div className="passos" role="list" aria-label="Passos da importação">
            {PASSOS.map(([numero, rotulo]) => (
              <span
                key={numero}
                role="listitem"
                className={`passo${passo === Number(numero) ? " on" : passo > Number(numero) ? " feito" : ""}`}
              >
                <span className="num">{numero}</span>
                {rotulo}
              </span>
            ))}
          </div>

          {erros.length > 0 ? (
            <div
              className="aviso-inline"
              role="alert"
              style={{
                background: "var(--erro-claro)",
                borderColor: "var(--erro)",
                margin: "0 0 14px",
              }}
            >
              <IconeAviso />
              <span>{erros.join(" ")}</span>
            </div>
          ) : null}

          {passo === 1 ? (
            <div className="card" style={{ padding: "20px 22px", maxWidth: 760 }}>
              <h2 className="h-el" style={{ marginBottom: 12 }}>
                Que família de dados você vai carregar?
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label className={familia === "ASSINANTES_NUCLEO" ? "radio-card on" : "radio-card"}>
                  <input
                    type="radio"
                    name="familia"
                    value="ASSINANTES_NUCLEO"
                    checked={familia === "ASSINANTES_NUCLEO"}
                    onChange={() => setFamilia("ASSINANTES_NUCLEO")}
                  />
                  <span>
                    <b>Base de assinantes</b>
                    <span className="cap" style={{ display: "block" }}>
                      Núcleo cadastral do arquivo do comprador — CPF, nome, endereço,
                      e-mail, telefone e preferência. Cria e atualiza assinantes.
                    </span>
                  </span>
                </label>
                <label
                  className={familia === "ASSINANTES_ENRIQUECIMENTO" ? "radio-card on" : "radio-card"}
                >
                  <input
                    type="radio"
                    name="familia"
                    value="ASSINANTES_ENRIQUECIMENTO"
                    checked={familia === "ASSINANTES_ENRIQUECIMENTO"}
                    onChange={() => setFamilia("ASSINANTES_ENRIQUECIMENTO")}
                  />
                  <span>
                    <b>Enriquecimento</b>
                    <span className="cap" style={{ display: "block" }}>
                      Atributos adicionais casados por CPF, com proveniência por
                      atributo. Nunca sobrescreve o núcleo — divergências ficam
                      registradas.
                    </span>
                  </span>
                </label>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button type="button" className="btn btn-azul" onClick={() => setPasso(2)}>
                  Continuar
                </button>
              </div>
            </div>
          ) : null}

          {passo === 2 ? (
            <div className="card" style={{ padding: "20px 22px", maxWidth: 760 }}>
              <h2 className="h-el" style={{ marginBottom: 4 }}>
                Arquivo — {rotuloFamilia}
              </h2>
              <p className="cap" style={{ margin: "0 0 14px" }}>
                CSV ou XLSX. O dicionário real do arquivo está{" "}
                <span className="selo">a confirmar</span> — o mapeador do passo 3 absorve
                variações de coluna.
              </p>
              {familia === "ASSINANTES_NUCLEO" ? (
                <p className="cap" style={{ margin: "0 0 14px" }}>
                  Na dúvida sobre as colunas, baixe o modelo de referência (traz também
                  Perfil de assinatura e Patrocinador):{" "}
                  {/* Route handler que devolve arquivo: âncora nativa, não <Link>. */}
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a href="/assinantes/importacoes/modelo" style={{ fontWeight: 700 }}>
                    Baixar modelo (.csv)
                  </a>
                </p>
              ) : null}
              <div className="drop">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M7 10l5-5 5 5" />
                  <path d="M12 5v12" />
                </svg>
                <label htmlFor="arquivo-carga" style={{ font: "var(--font-body-label-bold)" }}>
                  Escolher arquivo
                </label>
                <input
                  id="arquivo-carga"
                  ref={arquivoRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(evento) =>
                    setNomeArquivo(evento.target.files?.[0]?.name ?? null)
                  }
                />
                <div className="cap">
                  {nomeArquivo ?? "nenhum arquivo selecionado"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-azul"
                  disabled={ocupado}
                  onClick={() => void enviarArquivo()}
                >
                  {ocupado ? "Lendo arquivo…" : "Mapear colunas"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPasso(1)}>
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {passo === 3 && preparo ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ padding: "20px 22px" }}>
                <h2 className="h-el" style={{ marginBottom: 4 }}>
                  De/para das colunas
                </h2>
                <p className="cap" style={{ margin: "0 0 14px" }}>
                  {nomeArquivo} · {numeroBr(preparo.totalLinhas)} linhas ·{" "}
                  {preparo.colunas.length} colunas reconhecidas. Cada coluna do arquivo
                  aponta para um campo do modelo
                  {familia === "ASSINANTES_ENRIQUECIMENTO"
                    ? " — ou vira um atributo do catálogo com o nome indicado"
                    : ""}
                  . Colunas sem correspondência ficam de fora e aparecem no resumo.
                </p>
                <div
                  style={{ overflowX: "auto" }}
                  tabIndex={0}
                  role="region"
                  aria-label="De/para das colunas do arquivo"
                >
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th style={{ width: "34%" }}>Coluna do arquivo</th>
                        <th style={{ width: "34%" }}>
                          {familia === "ASSINANTES_NUCLEO"
                            ? "Campo do modelo"
                            : "Destino (CPF ou atributo)"}
                        </th>
                        <th>Amostra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preparo.colunas.map((coluna) => (
                        <tr key={coluna}>
                          <td>
                            <span className="num" style={{ fontWeight: 600 }}>
                              {coluna}
                            </span>
                          </td>
                          <td>
                            {familia === "ASSINANTES_NUCLEO" ? (
                              <select
                                className="select"
                                aria-label={`Campo do modelo para ${coluna}`}
                                value={mapeamento[coluna] ?? "nao_importar"}
                                onChange={(evento) =>
                                  setMapeamento((atual) => ({
                                    ...atual,
                                    [coluna]:
                                      evento.target.value === "nao_importar"
                                        ? "nao_importar"
                                        : evento.target.value,
                                  }))
                                }
                              >
                                {CAMPOS_NUCLEO_T20.map((campo) => (
                                  <option key={campo.valor} value={campo.valor}>
                                    {campo.rotulo}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <select
                                  className="select"
                                  style={{ width: 150 }}
                                  aria-label={`Tipo de destino para ${coluna}`}
                                  value={mapeamento[coluna] === "cpf" ? "cpf" : mapeamento[coluna] === "nao_importar" ? "nao_importar" : "atributo"}
                                  onChange={(evento) =>
                                    setMapeamento((atual) => ({
                                      ...atual,
                                      [coluna]:
                                        evento.target.value === "atributo"
                                          ? coluna
                                          : evento.target.value,
                                    }))
                                  }
                                >
                                  <option value="cpf">CPF</option>
                                  <option value="atributo">Atributo</option>
                                  <option value="nao_importar">— não importar</option>
                                </select>
                                {mapeamento[coluna] !== "cpf" &&
                                mapeamento[coluna] !== "nao_importar" ? (
                                  <input
                                    className="input"
                                    aria-label={`Nome do atributo para ${coluna}`}
                                    value={mapeamento[coluna] ?? ""}
                                    onChange={(evento) =>
                                      setMapeamento((atual) => ({
                                        ...atual,
                                        [coluna]: evento.target.value,
                                      }))
                                    }
                                  />
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td className="cap num">
                            {preparo.previa[0]?.valores[coluna] ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card" style={{ padding: "20px 22px" }}>
                <h2 className="h-el" style={{ marginBottom: 12 }}>
                  Pré-visualização — 5 primeiras linhas
                </h2>
                <div
                  style={{ overflowX: "auto" }}
                  tabIndex={0}
                  role="region"
                  aria-label="Pré-visualização das 5 primeiras linhas"
                >
                  <table className="tbl">
                    <thead>
                      <tr>
                        {preparo.colunas.map((coluna) => (
                          <th key={coluna}>{coluna}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preparo.previa.map((linha) => (
                        <tr key={linha.numero}>
                          {preparo.colunas.map((coluna) => (
                            <td className="num" key={coluna}>
                              {linha.valores[coluna] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="cap" style={{ margin: "12px 0 0" }}>
                  Pré-visualização com os dados como vieram no arquivo — nada foi gravado
                  no cadastro ainda.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-azul"
                  disabled={ocupado}
                  onClick={() => void irParaPolitica()}
                >
                  {ocupado
                    ? "Conferindo…"
                    : familia === "ASSINANTES_NUCLEO"
                      ? "Escolher política"
                      : "Conferir carga"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPasso(2)}>
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {passo === 4 ? (
            <div className="card" style={{ padding: "20px 22px", maxWidth: 760 }}>
              {familia === "ASSINANTES_NUCLEO" ? (
                <>
                  <h2 className="h-el" style={{ marginBottom: 4 }}>
                    Política desta carga
                  </h2>
                  <p className="cap" style={{ margin: "0 0 14px" }}>
                    A ausência de um CPF no arquivo não inativa ninguém por padrão
                    (RN29).
                  </p>
                  {dryRunNucleo ? (
                    <p className="cap" style={{ margin: "0 0 14px" }}>
                      Conferência do arquivo: {numeroBr(dryRunNucleo.novos)} novos ·{" "}
                      {numeroBr(dryRunNucleo.atualizados)} atualizados ·{" "}
                      {numeroBr(dryRunNucleo.quarentena)} em quarentena.
                    </p>
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label className={politica === "INCREMENTAL" ? "radio-card on" : "radio-card"}>
                      <input
                        type="radio"
                        name="politica"
                        value="INCREMENTAL"
                        checked={politica === "INCREMENTAL"}
                        onChange={() => void mudarPolitica("INCREMENTAL")}
                      />
                      <span>
                        <b>Incremental</b>
                        <span className="cap" style={{ display: "block" }}>
                          Apenas acrescenta e atualiza — quem não está no arquivo
                          permanece como está.
                        </span>
                      </span>
                    </label>
                    <label className={politica === "FOTO_COMPLETA" ? "radio-card on" : "radio-card"}>
                      <input
                        type="radio"
                        name="politica"
                        value="FOTO_COMPLETA"
                        checked={politica === "FOTO_COMPLETA"}
                        onChange={() => void mudarPolitica("FOTO_COMPLETA")}
                      />
                      <span>
                        <b>Foto completa</b>
                        <span className="cap" style={{ display: "block" }}>
                          O arquivo é a base inteira — ausentes são marcados como “fora
                          da base”, com confirmação explícita.
                        </span>
                      </span>
                    </label>
                  </div>
                  {politica === "FOTO_COMPLETA" ? (
                    <>
                      <div
                        className="aviso-inline"
                        style={{
                          background: "var(--alerta-claro)",
                          borderColor: "var(--alerta)",
                          margin: "14px 0 0",
                        }}
                      >
                        <IconeAviso />
                        <span>
                          <b>
                            {numeroBr(dryRunNucleo?.foraDaBase)} assinante(s)
                          </b>{" "}
                          da base atual não constam neste arquivo e seriam marcados como
                          “fora da base”. Confirme abaixo digitando <b>FOTO COMPLETA</b>.
                        </span>
                      </div>
                      <div className="field" style={{ marginTop: 12, maxWidth: 280 }}>
                        <label htmlFor="imp-conf">Confirmação</label>
                        <input
                          id="imp-conf"
                          className="input"
                          value={confirmacao}
                          onChange={(evento) => setConfirmacao(evento.target.value)}
                          placeholder="FOTO COMPLETA"
                        />
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <h2 className="h-el" style={{ marginBottom: 4 }}>
                    Conferência da carga de enriquecimento
                  </h2>
                  <p className="cap" style={{ margin: "0 0 14px" }}>
                    Política não se aplica ao enriquecimento: ele nunca inativa nem
                    sobrescreve o núcleo — apenas acrescenta atributos com proveniência
                    (RN35).
                  </p>
                  {dryRunEnriq ? (
                    <p className="cap" style={{ margin: "0 0 14px" }}>
                      Conferência do arquivo: {numeroBr(dryRunEnriq.assinantesEnriquecidos)}{" "}
                      assinantes casados por CPF · {numeroBr(dryRunEnriq.naoEncontrados)}{" "}
                      não localizados · {numeroBr(dryRunEnriq.quarentena)} em quarentena.
                    </p>
                  ) : null}
                </>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn btn-azul"
                  disabled={ocupado || bloqueadaFotoCompleta}
                  onClick={() => void processarCarga()}
                >
                  {ocupado ? "Processando…" : "Processar carga"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setPasso(3)}>
                  Voltar
                </button>
              </div>
            </div>
          ) : null}

          {passo === 5 && resumoFinal ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="contadores">
                {"novos" in resumoFinal ? (
                  <>
                    <Contador titulo="Linhas lidas" valor={numeroBr(resumoFinal.linhasLidas)} legenda={nomeArquivo ?? ""} />
                    <Contador titulo="Novos" valor={numeroBr(resumoFinal.novos)} legenda="assinantes criados" />
                    <Contador titulo="Atualizados" valor={numeroBr(resumoFinal.atualizados)} legenda="núcleo atualizado por CPF" />
                    <Contador
                      titulo="Quarentena"
                      valor={numeroBr(resumoFinal.quarentena)}
                      legenda="linhas com motivo"
                      destaqueErro={resumoFinal.quarentena > 0}
                    />
                  </>
                ) : (
                  <>
                    <Contador titulo="Linhas lidas" valor={numeroBr(resumoFinal.linhasLidas)} legenda={nomeArquivo ?? ""} />
                    <Contador titulo="Enriquecidos" valor={numeroBr(resumoFinal.assinantesEnriquecidos)} legenda="casados por CPF" />
                    <Contador titulo="Divergências" valor={numeroBr(resumoFinal.divergencias)} legenda="núcleo preservado (RN35)" />
                    <Contador
                      titulo="Quarentena"
                      valor={numeroBr(resumoFinal.quarentena)}
                      legenda="linhas com motivo"
                      destaqueErro={resumoFinal.quarentena > 0}
                    />
                  </>
                )}
              </div>
              {"foraDaBase" in resumoFinal && resumoFinal.foraDaBase != null ? (
                <div
                  className="aviso-inline"
                  style={{ background: "var(--alerta-claro)", borderColor: "var(--alerta)" }}
                >
                  <IconeAviso />
                  <span>
                    Foto completa confirmada: {numeroBr(resumoFinal.foraDaBase)}{" "}
                    assinante(s) marcados como “fora da base”, com evento de auditoria
                    individual.
                  </span>
                </div>
              ) : null}
              <div className="card" style={{ padding: "20px 22px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h2 className="h-el">Quarentena</h2>
                    <p className="cap" style={{ margin: "4px 0 0" }}>
                      Nenhuma linha válida foi descartada por causa destas — a carga não
                      é tudo-ou-nada.
                    </p>
                  </div>
                  <div style={{ flex: 1 }} />
                  {preparo && resumoFinal.quarentena > 0 ? (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`/api/assinantes/importacoes/${preparo.importacaoId}/erros`}
                    >
                      Baixar erros (CSV)
                    </a>
                  ) : null}
                </div>
                <p className="cap" style={{ margin: 0 }}>
                  {resumoFinal.quarentena > 0
                    ? "O detalhe (linha e motivo) está no arquivo de erros e no histórico da carga."
                    : "Nenhuma linha em quarentena nesta carga."}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Link className="btn btn-azul" href="/assinantes">
                  Ver carteira
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPasso(1);
                    setPreparo(null);
                    setResumoFinal(null);
                    setDryRunNucleo(null);
                    setDryRunEnriq(null);
                    setConfirmacao("");
                    setNomeArquivo(null);
                  }}
                >
                  Nova importação
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <div className="card" style={{ padding: "20px 22px", marginTop: 16 }}>
        <h2 className="h-el" style={{ marginBottom: 12 }}>
          Histórico de cargas
        </h2>
        {historico.length === 0 ? (
          <p className="cap" style={{ margin: 0 }}>
            Nenhuma carga ainda — a base nasce da primeira importação.
          </p>
        ) : (
          <div
            style={{ overflowX: "auto" }}
            tabIndex={0}
            role="region"
            aria-label="Histórico de cargas"
          >
            <table className="tbl">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Família</th>
                  <th>Política</th>
                  <th>Autor</th>
                  <th>Data</th>
                  <th style={{ textAlign: "right" }}>Resultado</th>
                  <th style={{ width: 120 }}>
                    <span className="sr-oculto">Ações da carga</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {historico.map((carga) => (
                  <tr key={carga.id}>
                    <td className="num">{carga.arquivo}</td>
                    <td>{carga.familia}</td>
                    <td>
                      <span className="pill pill-neutra">{carga.politica}</span>
                    </td>
                    <td>{carga.autor}</td>
                    <td className="num">{carga.data}</td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {carga.resultado}
                    </td>
                    <td>
                      {carga.temErros ? (
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`/api/assinantes/importacoes/${carga.id}/erros`}
                        >
                          Baixar erros
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Contador({
  titulo,
  valor,
  legenda,
  destaqueErro = false,
}: {
  titulo: string;
  valor: string;
  legenda: string;
  destaqueErro?: boolean;
}) {
  return (
    <div className="c">
      <div
        className="cap"
        style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}
      >
        {titulo}
      </div>
      <div
        className="kpi-n"
        style={{ marginTop: 6, ...(destaqueErro ? { color: "var(--erro-texto-aaa)" } : {}) }}
      >
        {valor}
      </div>
      <div className="cap" style={{ marginTop: 2 }}>
        {legenda}
      </div>
    </div>
  );
}
