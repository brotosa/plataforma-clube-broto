"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NaturezaOferta, NaturezaPublico, PorteProdutor } from "@prisma/client";
import { completudeM1, type DadosM1, MAXIMO_DE_DIFERENCIAIS, percentualM1 } from "@/dominio/ficha-cadastral/m1";
import {
  acaoAdicionarOfertaPretendida,
  acaoRegistrarDeclaracao,
  acaoRemoverOfertaPretendida,
  acaoSalvarIdentificacao,
  type EstadoAcaoM1,
} from "./acoes-m1";

/**
 * Formulário M1 da Ficha Cadastral do Aliado v1 (T12, estágio *Em
 * negociação*). Seis seções com a régua da obrigatoriedade progressiva no
 * topo: o formulário mostra o que falta para M1 sem bloquear a gravação —
 * a negociação preenche aos poucos, e a régua de promoção (M2) continua
 * sendo a da Onda 1.
 */

const PORTES: ReadonlyArray<{ valor: PorteProdutor; rotulo: string }> = [
  { valor: "PEQUENO", rotulo: "Pequeno" },
  { valor: "MEDIO", rotulo: "Médio" },
  { valor: "GRANDE", rotulo: "Grande" },
];

const NATUREZAS_PUBLICO: ReadonlyArray<{ valor: NaturezaPublico; rotulo: string }> = [
  { valor: "PF", rotulo: "Pessoa física" },
  { valor: "PJ", rotulo: "Pessoa jurídica" },
  { valor: "AMBAS", rotulo: "Ambas" },
];

export interface OfertaPretendidaDaTela {
  id: string;
  natureza: NaturezaOferta;
  titulo: string;
  precoDe: number | null;
  precoPor: number | null;
  instrucoesResgate: string | null;
  status: "RASCUNHO" | "CONVERTIDA";
}

export function FormularioM1({
  empresa,
  dadosDaRegua,
  ofertasPretendidas,
  tiposBeneficio,
  mecanicas,
}: {
  empresa: {
    id: string;
    razaoSocial: string | null;
    nomeFantasia: string;
    site: string | null;
    descricaoInstitucional: string | null;
    diferenciais: string[];
    modeloNegocio: string | null;
    publicoPorte: PorteProdutor[];
    publicoNatureza: NaturezaPublico | null;
  };
  dadosDaRegua: DadosM1;
  ofertasPretendidas: OfertaPretendidaDaTela[];
  tiposBeneficio: Array<{ id: string; nome: string }>;
  mecanicas: Array<{ id: string; nome: string }>;
}) {
  const roteador = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [estado, setEstado] = useState<EstadoAcaoM1 | null>(null);

  const [identificacao, setIdentificacao] = useState({
    razaoSocial: empresa.razaoSocial ?? "",
    nomeFantasia: empresa.nomeFantasia,
    site: empresa.site ?? "",
    descricaoInstitucional: empresa.descricaoInstitucional ?? "",
    diferenciais: empresa.diferenciais.join("\n"),
    modeloNegocio: empresa.modeloNegocio ?? "",
    publicoPorte: empresa.publicoPorte,
    publicoNatureza: empresa.publicoNatureza,
  });

  const [declaracao, setDeclaracao] = useState({
    dataDeclaracao: new Date().toISOString().slice(0, 10),
    ticketMedio: "",
    nps: "",
    churnMensalPct: "",
    numeroClientes: "",
    anoFundacao: "",
  });

  const [oferta, setOferta] = useState({
    natureza: "BENEFICIO" as NaturezaOferta,
    titulo: "",
    descricao: "",
    tipoBeneficioId: "",
    mecanicaId: "",
    precoDe: "",
    precoPor: "",
    instrucoesResgate: "",
    vigenciaInicio: "",
    vigenciaFim: "",
  });

  const secoes = completudeM1(dadosDaRegua);
  const percentual = percentualM1(secoes);

  function executar(acao: () => Promise<EstadoAcaoM1>) {
    iniciarTransicao(async () => {
      const resultado = await acao();
      setEstado(resultado);
      roteador.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      <div className="card" style={{ padding: "18px 20px" }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
        >
          <h2 className="h-el">Ficha Cadastral · M1 — Pré-onboarding</h2>
          <span className="num" style={{ font: "var(--font-body-label-bold)" }}>
            {percentual}% das seções de M1
          </span>
        </div>
        <div
          className="dim-bar"
          style={{ marginTop: 10, height: 10 }}
          role="img"
          aria-label={`${percentual}% das seções de M1 completas`}
        >
          <i style={{ width: `${percentual}%` }} />
        </div>
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13.5 }}>
          {secoes.map((secao) => (
            <li key={secao.secao}>
              <b>
                {secao.secao} · {secao.titulo}
              </b>{" "}
              {secao.completa ? (
                <span className="pill pill-ok">
                  <i />
                  completa
                </span>
              ) : (
                <span className="cap">— falta: {secao.pendencias.join("; ")}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="cap" style={{ margin: "10px 0 0", maxWidth: "72ch" }}>
          Obrigatoriedade progressiva: M1 é a régua da negociação. CNPJ, endereço completo e
          contrato assinado seguem sendo exigidos só na promoção a Aliada ativa (M2).
        </p>
      </div>

      {estado ? (
        <div
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
            <span style={{ fontSize: 13.5 }}>{estado.sucesso}</span>
          )}
        </div>
      ) : null}

      {/* Seções A e B */}
      <div className="card" style={{ padding: "20px 22px" }}>
        <h3 className="h-el" style={{ marginBottom: 12 }}>
          A · Identificação e B · Classificação
        </h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="field">
            <label htmlFor="m1-nome">Nome fantasia (exibição na vitrine)</label>
            <input
              id="m1-nome"
              className="input"
              value={identificacao.nomeFantasia}
              onChange={(evento) =>
                setIdentificacao({ ...identificacao, nomeFantasia: evento.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="m1-razao">Razão social</label>
            <input
              id="m1-razao"
              className="input"
              value={identificacao.razaoSocial}
              onChange={(evento) =>
                setIdentificacao({ ...identificacao, razaoSocial: evento.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="m1-site">Site</label>
            <input
              id="m1-site"
              className="input"
              value={identificacao.site}
              onChange={(evento) => setIdentificacao({ ...identificacao, site: evento.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="m1-apresentacao">Apresentação institucional (texto do card)</label>
            <textarea
              id="m1-apresentacao"
              className="input"
              rows={3}
              maxLength={400}
              value={identificacao.descricaoInstitucional}
              onChange={(evento) =>
                setIdentificacao({ ...identificacao, descricaoInstitucional: evento.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="m1-diferenciais">
              Diferenciais (um por linha, até {MAXIMO_DE_DIFERENCIAIS})
            </label>
            <textarea
              id="m1-diferenciais"
              className="input"
              rows={3}
              value={identificacao.diferenciais}
              onChange={(evento) =>
                setIdentificacao({ ...identificacao, diferenciais: evento.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="m1-modelo">Modelo de negócio</label>
            <input
              id="m1-modelo"
              className="input"
              placeholder="SaaS, serviço, contrato a prazo, marketplace…"
              value={identificacao.modeloNegocio}
              onChange={(evento) =>
                setIdentificacao({ ...identificacao, modeloNegocio: evento.target.value })
              }
            />
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="cap">Público-alvo · porte do produtor</legend>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
              {PORTES.map((porte) => (
                <label key={porte.valor} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={identificacao.publicoPorte.includes(porte.valor)}
                    onChange={(evento) =>
                      setIdentificacao({
                        ...identificacao,
                        publicoPorte: evento.target.checked
                          ? [...identificacao.publicoPorte, porte.valor]
                          : identificacao.publicoPorte.filter((atual) => atual !== porte.valor),
                      })
                    }
                  />
                  {porte.rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="m1-natureza">Público-alvo · natureza</label>
            <select
              id="m1-natureza"
              className="select"
              value={identificacao.publicoNatureza ?? ""}
              onChange={(evento) =>
                setIdentificacao({
                  ...identificacao,
                  publicoNatureza: (evento.target.value || null) as NaturezaPublico | null,
                })
              }
            >
              <option value="">Selecionar…</option>
              {NATUREZAS_PUBLICO.map((natureza) => (
                <option key={natureza.valor} value={natureza.valor}>
                  {natureza.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div>
            <button
              type="button"
              className="btn btn-azul"
              disabled={pendente}
              onClick={() =>
                executar(() =>
                  acaoSalvarIdentificacao({ empresaId: empresa.id, ...identificacao }),
                )
              }
            >
              Salvar seções A e B
            </button>
          </div>
        </div>
      </div>

      {/* Seção D */}
      <div className="card" style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h3 className="h-el">D · Indicadores declarados</h3>
          <span className="selo">autodeclarado</span>
        </div>
        <p className="cap" style={{ margin: "4px 0 12px", maxWidth: "70ch" }}>
          Cada envio registra uma declaração datada — o histórico fica, porque o número de um ano
          não corrige o do ano anterior. Vão para a aba Scouting, nunca para o card público.
        </p>
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}
        >
          <div className="field">
            <label htmlFor="m1-data">Data da declaração</label>
            <input
              id="m1-data"
              type="date"
              className="input"
              value={declaracao.dataDeclaracao}
              onChange={(evento) =>
                setDeclaracao({ ...declaracao, dataDeclaracao: evento.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="m1-ticket">Ticket médio (R$)</label>
            <input
              id="m1-ticket"
              className="input num"
              inputMode="decimal"
              value={declaracao.ticketMedio}
              onChange={(evento) => setDeclaracao({ ...declaracao, ticketMedio: evento.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="m1-nps">NPS (-100 a 100)</label>
            <input
              id="m1-nps"
              className="input num"
              inputMode="numeric"
              value={declaracao.nps}
              onChange={(evento) => setDeclaracao({ ...declaracao, nps: evento.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="m1-churn">Churn mensal (%)</label>
            <input
              id="m1-churn"
              className="input num"
              inputMode="decimal"
              value={declaracao.churnMensalPct}
              onChange={(evento) =>
                setDeclaracao({ ...declaracao, churnMensalPct: evento.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="m1-clientes">Nº de clientes</label>
            <input
              id="m1-clientes"
              className="input num"
              inputMode="numeric"
              value={declaracao.numeroClientes}
              onChange={(evento) =>
                setDeclaracao({ ...declaracao, numeroClientes: evento.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="m1-fundacao">Ano de fundação</label>
            <input
              id="m1-fundacao"
              className="input num"
              inputMode="numeric"
              value={declaracao.anoFundacao}
              onChange={(evento) => setDeclaracao({ ...declaracao, anoFundacao: evento.target.value })}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pendente}
            onClick={() =>
              executar(() => acaoRegistrarDeclaracao({ empresaId: empresa.id, ...declaracao }))
            }
          >
            Registrar declaração
          </button>
        </div>
      </div>

      {/* Seção F */}
      <div className="card" style={{ padding: "20px 22px" }}>
        <h3 className="h-el" style={{ marginBottom: 4 }}>
          F · Ofertas pretendidas
        </h3>
        <p className="cap" style={{ margin: "0 0 12px", maxWidth: "72ch" }}>
          <b>Recompensa</b> é gratuidade para experimentar; <b>Benefício</b> é desconto ou
          condição paga (definição contratual). Ao promover a empresa, cada linha vira um rascunho
          de Solução + Oferta pendente de curadoria.
        </p>

        {ofertasPretendidas.length > 0 ? (
          <div
            style={{ overflowX: "auto", marginBottom: 14 }}
            tabIndex={0}
            role="group"
            aria-label="Ofertas pretendidas (tabela rolável)"
          >
            <table className="tbl tbl-resp">
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Natureza</th>
                  <th scope="col">Valores</th>
                  <th scope="col">Situação</th>
                  <th scope="col">
                    <span className="sr-oculto">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ofertasPretendidas.map((pretendida) => (
                  <tr key={pretendida.id}>
                    <td data-label="Título">{pretendida.titulo}</td>
                    <td data-label="Natureza">{pretendida.natureza}</td>
                    <td data-label="Valores" className="num">
                      {pretendida.precoDe === null && pretendida.precoPor === null
                        ? "gratuita"
                        : `${pretendida.precoDe ?? "—"} → ${pretendida.precoPor ?? "—"}`}
                    </td>
                    <td data-label="Situação">
                      {pretendida.status === "CONVERTIDA" ? (
                        <span className="pill pill-ok">
                          <i />
                          virou rascunho de oferta
                        </span>
                      ) : (
                        <span className="pill pill-pendente">pretendida</span>
                      )}
                    </td>
                    <td data-label="Ações">
                      {pretendida.status === "RASCUNHO" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={pendente}
                          onClick={() =>
                            executar(() =>
                              acaoRemoverOfertaPretendida({
                                empresaId: empresa.id,
                                ofertaPretendidaId: pretendida.id,
                              }),
                            )
                          }
                        >
                          Remover
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 12 }}>
          <div className="field">
            <label htmlFor="m1-of-titulo">Título da oferta pretendida</label>
            <input
              id="m1-of-titulo"
              className="input"
              value={oferta.titulo}
              onChange={(evento) => setOferta({ ...oferta, titulo: evento.target.value })}
            />
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}
          >
            <div className="field">
              <label htmlFor="m1-of-natureza">Natureza</label>
              <select
                id="m1-of-natureza"
                className="select"
                value={oferta.natureza}
                onChange={(evento) =>
                  setOferta({ ...oferta, natureza: evento.target.value as NaturezaOferta })
                }
              >
                <option value="BENEFICIO">Benefício (desconto ou condição paga)</option>
                <option value="RECOMPENSA">Recompensa (gratuidade)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="m1-of-tipo">Tipo de benefício</label>
              <select
                id="m1-of-tipo"
                className="select"
                value={oferta.tipoBeneficioId}
                onChange={(evento) => setOferta({ ...oferta, tipoBeneficioId: evento.target.value })}
              >
                <option value="">A definir</option>
                {tiposBeneficio.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m1-of-mecanica">Mecânica de resgate</label>
              <select
                id="m1-of-mecanica"
                className="select"
                value={oferta.mecanicaId}
                onChange={(evento) => setOferta({ ...oferta, mecanicaId: evento.target.value })}
              >
                <option value="">A definir</option>
                {mecanicas.map((mecanica) => (
                  <option key={mecanica.id} value={mecanica.id}>
                    {mecanica.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m1-of-de">Preço de (R$)</label>
              <input
                id="m1-of-de"
                className="input num"
                inputMode="decimal"
                disabled={oferta.natureza === "RECOMPENSA"}
                value={oferta.precoDe}
                onChange={(evento) => setOferta({ ...oferta, precoDe: evento.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="m1-of-por">Preço por (R$)</label>
              <input
                id="m1-of-por"
                className="input num"
                inputMode="decimal"
                disabled={oferta.natureza === "RECOMPENSA"}
                value={oferta.precoPor}
                onChange={(evento) => setOferta({ ...oferta, precoPor: evento.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="m1-of-instrucoes">Instruções de resgate pós-voucher</label>
            <textarea
              id="m1-of-instrucoes"
              className="input"
              rows={2}
              placeholder="URL de ativação, ou o fluxo de contato (ex.: voucher direciona ao administrador comercial do aliado)"
              value={oferta.instrucoesResgate}
              onChange={(evento) => setOferta({ ...oferta, instrucoesResgate: evento.target.value })}
            />
          </div>
          <div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pendente}
              onClick={() =>
                executar(async () => {
                  const resultado = await acaoAdicionarOfertaPretendida({
                    empresaId: empresa.id,
                    ...oferta,
                  });
                  if (!resultado.erros?.length) {
                    setOferta({
                      natureza: "BENEFICIO",
                      titulo: "",
                      descricao: "",
                      tipoBeneficioId: "",
                      mecanicaId: "",
                      precoDe: "",
                      precoPor: "",
                      instrucoesResgate: "",
                      vigenciaInicio: "",
                      vigenciaFim: "",
                    });
                  }
                  return resultado;
                })
              }
            >
              Adicionar oferta pretendida
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
