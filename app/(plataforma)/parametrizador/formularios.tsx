"use client";

import { useState } from "react";
import type { PeriodoMeta, TipoValorRegra } from "@prisma/client";
import {
  conflitoDeMeta,
  intervaloDoPeriodo,
  mensagemDeConflito,
  ROTULOS_PERIODO,
  rotuloDoIntervalo,
} from "@/dominio/parametrizador/metas";
import { UNIDADE_POR_TIPO } from "@/dominio/parametrizador/valores-regra";
import { FormularioComEstado } from "../aliados/formularios";
import {
  acaoAlterarValorDeRegra,
  acaoCriarItemDeLista,
  acaoCriarMeta,
  acaoDefinirEstadoDoItem,
  acaoSalvarItemDeLista,
} from "./acoes";

/**
 * Formulários das telas T16 e T17. A validação de negócio vive no domínio
 * e é aplicada nos casos de uso; o que estes componentes fazem é antecipar
 * o que a regra dirá — a RN28, sobretudo — para que a pessoa não descubra
 * o conflito só depois de enviar.
 */

// ---------------------------------------------------------------------
// T17 — valores de regra
// ---------------------------------------------------------------------

export function FormularioValor({
  chave,
  rotulo,
  descricao,
  tipo,
  valor,
  sensivel,
  historico,
  somenteLeitura,
}: {
  chave: string;
  rotulo: string;
  descricao: string;
  tipo: TipoValorRegra;
  valor: number | null;
  sensivel: boolean;
  historico: string;
  somenteLeitura: boolean;
}) {
  const idCampo = `valor-${chave}`;
  const monetario = tipo === "MONETARIO";
  return (
    <div className="pm-val">
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "var(--font-body-label-bold)" }}>{rotulo}</div>
        <div className="cap" style={{ marginTop: 3 }}>
          {descricao}
          {valor === null ? <span className="selo"> valor definitivo com a TI</span> : null}
        </div>
      </div>
      {somenteLeitura ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
          {monetario ? <span className="cap">R$</span> : null}
          <span className="num" style={{ font: "var(--font-body-label-bold)" }}>
            {valor === null ? "—" : valor}
          </span>
          {monetario ? null : (
            <span className="cap" style={{ width: 54 }}>
              {UNIDADE_POR_TIPO[tipo]}
            </span>
          )}
        </div>
      ) : (
        <FormularioComEstado
          acao={acaoAlterarValorDeRegra}
          rotuloEnviar="Salvar"
          classeBotao="btn btn-ghost btn-sm"
          estiloFormulario={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}
        >
          <input type="hidden" name="chave" value={chave} />
          <label className="cap" htmlFor={idCampo} style={{ position: "absolute", left: -9999 }}>
            {rotulo}
          </label>
          {monetario ? <span className="cap">R$</span> : null}
          <input
            id={idCampo}
            className="input num"
            name="valor"
            inputMode="decimal"
            defaultValue={valor === null ? "" : String(valor)}
            placeholder={valor === null ? "[A CONFIRMAR]" : undefined}
            style={{ width: monetario ? 110 : 88, textAlign: "right" }}
          />
          {monetario ? null : (
            <span className="cap" style={{ width: 54 }}>
              {UNIDADE_POR_TIPO[tipo]}
            </span>
          )}
        </FormularioComEstado>
      )}
      <div className="cap pm-hist">
        {historico}
        {sensivel ? " · família sensível (RN27)" : ""}
      </div>
    </div>
  );
}

export interface MetaParaConflito {
  id: string;
  periodo: PeriodoMeta;
  inicio: string;
  fim: string;
  categoriaId: string | null;
}

/**
 * Formulário de nova meta com a RN28 visível: o conflito é calculado na
 * digitação, com a mesma função que o serviço usará, e o botão fica
 * desabilitado enquanto ele existir.
 */
export function FormularioNovaMeta({
  categorias,
  existentes,
  hojeIso,
}: {
  categorias: ReadonlyArray<{ id: string; nome: string }>;
  existentes: ReadonlyArray<MetaParaConflito>;
  hojeIso: string;
}) {
  const [periodo, setPeriodo] = useState<PeriodoMeta>("ANUAL");
  const [escopo, setEscopo] = useState<"geral" | "categoria">("geral");
  const [categoriaId, setCategoriaId] = useState("");
  const [referencia, setReferencia] = useState(hojeIso);

  const referenciaValida = /^\d{4}-\d{2}-\d{2}$/.test(referencia);
  const intervalo = referenciaValida
    ? intervaloDoPeriodo(periodo, new Date(`${referencia}T00:00:00.000Z`))
    : null;
  const escopoId = escopo === "geral" ? null : categoriaId || null;
  const conflito =
    intervalo === null
      ? null
      : conflitoDeMeta(
          { periodo, inicio: intervalo.inicio, fim: intervalo.fim, categoriaId: escopoId, valor: 1 },
          existentes.map((meta) => ({
            id: meta.id,
            periodo: meta.periodo,
            inicio: new Date(meta.inicio),
            fim: new Date(meta.fim),
            categoriaId: meta.categoriaId,
          })),
        );
  const nomeCategoria = categorias.find((c) => c.id === escopoId)?.nome ?? null;
  const escopoIncompleto = escopo === "categoria" && !categoriaId;

  return (
    <div style={{ borderTop: "1px solid var(--borda)", marginTop: 16, paddingTop: 16 }}>
      <div
        className="cap"
        style={{
          textTransform: "uppercase",
          letterSpacing: ".06em",
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        Nova meta
      </div>
      <FormularioComEstado acao={acaoCriarMeta} rotuloEnviar="Criar meta">
        <input type="hidden" name="periodo" value={periodo} />
        <input type="hidden" name="categoriaId" value={escopoId ?? ""} />
        <div
          className="g-resp"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}
        >
          <div className="field">
            <label htmlFor="mt-per">Período</label>
            <select
              id="mt-per"
              className="select"
              value={periodo}
              onChange={(evento) => setPeriodo(evento.target.value as PeriodoMeta)}
            >
              {(["MENSAL", "TRIMESTRAL", "ANUAL"] as const).map((opcao) => (
                <option key={opcao} value={opcao}>
                  {ROTULOS_PERIODO[opcao]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mt-esc">Escopo</label>
            <select
              id="mt-esc"
              className="select"
              value={escopo}
              onChange={(evento) => {
                const novo = evento.target.value as "geral" | "categoria";
                setEscopo(novo);
                if (novo === "geral") setCategoriaId("");
              }}
            >
              <option value="geral">Geral</option>
              <option value="categoria">Por categoria</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="mt-cat">Categoria</label>
            <select
              id="mt-cat"
              className="select"
              value={categoriaId}
              disabled={escopo === "geral"}
              onChange={(evento) => setCategoriaId(evento.target.value)}
            >
              <option value="">Selecionar…</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mt-val">Novos aliados no período</label>
            <input id="mt-val" className="input num" name="valor" inputMode="numeric" placeholder="Ex.: 12" />
          </div>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label htmlFor="mt-ref">Período de referência</label>
            <input
              id="mt-ref"
              className="input"
              type="date"
              name="referencia"
              value={referencia}
              onChange={(evento) => setReferencia(evento.target.value)}
            />
            <span className="hint">
              Qualquer dia dentro do período desejado — a meta é gravada colada às bordas do
              calendário.
              {intervalo
                ? ` Vai valer para ${rotuloDoIntervalo(periodo, intervalo.inicio)}.`
                : ""}
            </span>
          </div>
        </div>

        {conflito ? (
          <div
            className="aviso-inline"
            role="alert"
            style={{
              background: "var(--alerta-claro)",
              borderColor: "var(--alerta)",
              margin: "14px 0 0",
            }}
          >
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
            <span>{mensagemDeConflito(conflito, nomeCategoria)}</span>
          </div>
        ) : null}

        <p className="cap" style={{ margin: "14px 0 0" }}>
          A meta vale a partir do período escolhido — períodos fechados não mudam.
          {escopoIncompleto ? " Escolha a categoria para continuar." : ""}
        </p>
      </FormularioComEstado>
    </div>
  );
}

// ---------------------------------------------------------------------
// T16 — listas de domínio
// ---------------------------------------------------------------------

export interface ItemParaEditor {
  id: string;
  nome: string;
  ativo: boolean;
  grupo?: string;
  dimensao?: string;
  peso?: number;
  textoDeUso: string;
  ultimoAjuste: string;
}

/** Detalhe do item selecionado (lista + detalhe da T16). */
export function DetalheDoItem({
  familia,
  item,
  ehIndicador,
  dimensoes,
  somenteLeitura,
}: {
  familia: string;
  item: ItemParaEditor;
  ehIndicador: boolean;
  dimensoes: ReadonlyArray<string>;
  somenteLeitura: boolean;
}) {
  return (
    <div className="card" style={{ padding: "20px 22px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 className="h-el">{item.nome}</h2>
          <div className="cap" style={{ marginTop: 4 }}>
            {item.textoDeUso}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {item.ativo ? (
          <span className="pill pill-ok">
            <i />
            ativo
          </span>
        ) : (
          <span className="pill pill-neutra">inativo</span>
        )}
      </div>

      <FormularioComEstado
        acao={acaoSalvarItemDeLista}
        rotuloEnviar="Salvar alterações"
        classeBotao={somenteLeitura ? "btn btn-ghost" : "btn btn-azul"}
      >
        <input type="hidden" name="familia" value={familia} />
        <input type="hidden" name="itemId" value={item.id} />
        <div
          className="g-resp"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
        >
          <div className="field" style={{ gridColumn: "1/-1" }}>
            <label htmlFor="pm-nome">Nome</label>
            <input
              id="pm-nome"
              className="input"
              name="nome"
              defaultValue={item.nome}
              disabled={somenteLeitura}
            />
            <span className="hint">
              Renomear altera o nome em todos os usos — registros históricos passam a exibir o
              nome novo.
            </span>
          </div>
          {ehIndicador ? (
            <>
              <div className="field">
                <label htmlFor="pm-grupo">Grupo</label>
                <select
                  id="pm-grupo"
                  className="select"
                  name="grupo"
                  defaultValue={item.grupo ?? "EMPRESA"}
                  disabled={somenteLeitura}
                >
                  <option value="EMPRESA">Empresa</option>
                  <option value="PRODUTO">Produto</option>
                </select>
                <span className="hint">Tabela do ScoutCB a que o indicador pertence</span>
              </div>
              <div className="field">
                <label htmlFor="pm-dim">Dimensão de medição</label>
                <select
                  id="pm-dim"
                  className="select"
                  name="dimensao"
                  defaultValue={item.dimensao ?? dimensoes[0]}
                  disabled={somenteLeitura}
                >
                  {dimensoes.map((dimensao) => (
                    <option key={dimensao} value={dimensao}>
                      {dimensao}
                    </option>
                  ))}
                </select>
                <span className="hint">A escala da nota é estrutural — alterá-la é release (RN26)</span>
              </div>
              <div className="field">
                <label htmlFor="pm-peso">Peso</label>
                <input
                  id="pm-peso"
                  className="input num"
                  name="peso"
                  inputMode="decimal"
                  defaultValue={item.peso === undefined ? "" : String(item.peso)}
                  disabled={somenteLeitura}
                />
                <span className="hint">
                  v1 = 1× para todos. Mudar o peso não re-pontua avaliações fechadas (RN25).
                </span>
              </div>
            </>
          ) : null}
          <div
            style={{ gridColumn: "1/-1", borderTop: "1px solid var(--borda)", paddingTop: 12 }}
          >
            <div
              className="cap"
              style={{
                textTransform: "uppercase",
                letterSpacing: ".06em",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Histórico
            </div>
            <div className="cap">{item.ultimoAjuste}</div>
          </div>
        </div>
      </FormularioComEstado>

      {somenteLeitura ? null : (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            borderTop: "1px solid var(--borda)",
            paddingTop: 16,
            marginTop: 16,
            alignItems: "center",
          }}
        >
          <FormularioComEstado
            acao={acaoDefinirEstadoDoItem}
            rotuloEnviar={item.ativo ? "Inativar item" : "Reativar item"}
            classeBotao="btn btn-ghost"
            confirmacao={
              item.ativo
                ? `${item.textoDeUso} Inativar tira o item das seleções novas e o mantém nos registros históricos. Confirmar?`
                : undefined
            }
          >
            <input type="hidden" name="familia" value={familia} />
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="ativo" value={item.ativo ? "false" : "true"} />
          </FormularioComEstado>
          <div style={{ flex: 1 }} />
          <span className="cap">Excluir não existe nesta plataforma.</span>
        </div>
      )}
    </div>
  );
}

/** Criação de item — some nas listas que reproduzem fato fechado. */
export function FormularioNovoItem({
  familia,
  ehIndicador,
  dimensoes,
}: {
  familia: string;
  ehIndicador: boolean;
  dimensoes: ReadonlyArray<string>;
}) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <button type="button" className="btn btn-azul" onClick={() => setAberto(true)}>
        + Novo item
      </button>
    );
  }
  return (
    <div className="card" style={{ padding: "18px 20px", marginBottom: 16 }}>
      <h2 className="h-el" style={{ marginBottom: 12 }}>
        Novo item
      </h2>
      <FormularioComEstado acao={acaoCriarItemDeLista} rotuloEnviar="Criar item">
        <input type="hidden" name="familia" value={familia} />
        <div
          className="g-resp"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}
        >
          <div className="field" style={{ gridColumn: "1/-1" }}>
            <label htmlFor="novo-nome">Nome</label>
            <input id="novo-nome" className="input" name="nome" required />
          </div>
          {ehIndicador ? (
            <>
              <div className="field">
                <label htmlFor="novo-grupo">Grupo</label>
                <select id="novo-grupo" className="select" name="grupo" defaultValue="EMPRESA">
                  <option value="EMPRESA">Empresa</option>
                  <option value="PRODUTO">Produto</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="novo-dim">Dimensão de medição</label>
                <select id="novo-dim" className="select" name="dimensao" defaultValue={dimensoes[0]}>
                  {dimensoes.map((dimensao) => (
                    <option key={dimensao} value={dimensao}>
                      {dimensao}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="novo-peso">Peso</label>
                <input id="novo-peso" className="input num" name="peso" inputMode="decimal" defaultValue="1" />
              </div>
              <div className="field">
                <label htmlFor="novo-desc">O que mede</label>
                <input id="novo-desc" className="input" name="descricao" />
              </div>
            </>
          ) : null}
        </div>
      </FormularioComEstado>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 10 }}
        onClick={() => setAberto(false)}
      >
        Cancelar
      </button>
    </div>
  );
}
