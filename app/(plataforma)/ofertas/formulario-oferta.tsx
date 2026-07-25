"use client";

import { useActionState, useState } from "react";
import type { AmbientePagamento, NaturezaOferta } from "@prisma/client";
import {
  type MecanicaSlug,
  explicacaoIncompatibilidade,
  mecanicaCompativelComAmbiente,
} from "@/dominio/ofertas/regras";
import type { EstadoFormulario } from "../aliados/acoes";
import { ErrosDoFormulario } from "../aliados/formularios";
import { acaoAtualizarOferta, acaoCriarOferta } from "./acoes";

interface OpcaoTipoBeneficio {
  id: string;
  slug: string;
  nome: string;
}

interface OpcaoMecanica {
  id: string;
  slug: MecanicaSlug;
  nome: string;
}

export interface ValoresOferta {
  ofertaId?: string;
  titulo?: string;
  natureza?: NaturezaOferta;
  tipoBeneficioId?: string;
  precoDe?: string;
  precoPor?: string;
  cupomCodigoRegras?: string | null;
  modalidadePagamento?: string | null;
  mecanicaId?: string;
  urlResgateExterno?: string | null;
  instrucoesResgate?: string | null;
  vigenciaInicio?: string;
  vigenciaFim?: string | null;
  limiteResgates?: number | null;
}

const DESCRICAO_NATUREZA: Record<NaturezaOferta, { titulo: string; texto: string }> = {
  RECOMPENSA: {
    titulo: "Recompensa",
    texto: "Produto/serviço gratuito para o assinante testar ou experimentar. Não comissiona.",
  },
  BENEFICIO: {
    titulo: "Benefício",
    texto: "Adquirido com desconto, vantagem ou condição especial. Comissiona sobre o valor pago.",
  },
  CUPOM_DESCONTO: {
    titulo: "Cupom de desconto",
    texto: "Resgate materializa código de desconto para uso no canal do aliado. Comissão em confirmação.",
  },
};

/**
 * T5 — Cadastro/edição de oferta. Natureza condiciona preços e campos;
 * mecânicas incompatíveis com os ambientes do bloco comercial ficam
 * desabilitadas com explicação (RN11); pré-visualização do card ao vivo.
 */
export function FormularioOferta({
  solucaoId,
  contexto,
  tiposBeneficio,
  mecanicas,
  valores,
}: {
  solucaoId: string;
  contexto: {
    aliadoNome: string;
    solucaoNome: string;
    categoriaNome: string | null;
    ambientes: AmbientePagamento | null;
  };
  tiposBeneficio: OpcaoTipoBeneficio[];
  mecanicas: OpcaoMecanica[];
  valores?: ValoresOferta;
}) {
  const edicao = Boolean(valores?.ofertaId);
  const [estado, despachar, pendente] = useActionState<EstadoFormulario, FormData>(
    edicao ? acaoAtualizarOferta : acaoCriarOferta,
    {},
  );

  const [titulo, definirTitulo] = useState(valores?.titulo ?? "");
  const [natureza, definirNatureza] = useState<NaturezaOferta>(valores?.natureza ?? "BENEFICIO");
  const [tipoBeneficioId, definirTipoBeneficioId] = useState(valores?.tipoBeneficioId ?? "");
  const [precoDe, definirPrecoDe] = useState(valores?.precoDe ?? "");
  const [precoPor, definirPrecoPor] = useState(valores?.precoPor ?? "");
  const [mecanicaId, definirMecanicaId] = useState(valores?.mecanicaId ?? "");

  const tipoSelecionado = tiposBeneficio.find((tipo) => tipo.id === tipoBeneficioId);
  const mecanicaSelecionada = mecanicas.find((mecanica) => mecanica.id === mecanicaId);

  function aoMudarNatureza(nova: NaturezaOferta) {
    definirNatureza(nova);
    if (nova === "RECOMPENSA") {
      // Recompensa é gratuidade (definição contratual): preços zerados.
      definirPrecoDe("");
      definirPrecoPor("");
      const gratuidade = tiposBeneficio.find((tipo) => tipo.slug === "GRATUIDADE");
      if (gratuidade) definirTipoBeneficioId(gratuidade.id);
      const recompensaGratuita = mecanicas.find((mecanica) => mecanica.slug === "RECOMPENSA_GRATUITA");
      if (recompensaGratuita) definirMecanicaId(recompensaGratuita.id);
    } else if (tipoSelecionado?.slug === "GRATUIDADE") {
      definirTipoBeneficioId("");
    }
  }

  const exigePrecos =
    natureza === "BENEFICIO" &&
    (tipoSelecionado?.slug === "PCT_DESCONTO" || tipoSelecionado?.slug === "VALOR_FIXO");

  return (
    <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
      <form action={despachar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ErrosDoFormulario erros={estado.erros} />
        <input type="hidden" name="solucaoId" value={solucaoId} />
        {edicao ? <input type="hidden" name="ofertaId" value={valores!.ofertaId} /> : null}

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Oferta
          </h2>
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="campo-of-titulo">Título comercial</label>
            <input
              id="campo-of-titulo"
              className="input"
              name="titulo"
              required
              placeholder='Ex.: "15% de desconto na pós-graduação em…"'
              value={titulo}
              onChange={(evento) => definirTitulo(evento.target.value)}
            />
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ font: "var(--font-body-label-bold)", marginBottom: 8 }}>
              Natureza (vocabulário contratual)
            </legend>
            <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {(Object.keys(DESCRICAO_NATUREZA) as NaturezaOferta[]).map((opcao) => (
                <label
                  key={opcao}
                  className={natureza === opcao ? "radio-card on" : "radio-card"}
                >
                  <input
                    type="radio"
                    name="natureza"
                    value={opcao}
                    checked={natureza === opcao}
                    onChange={() => aoMudarNatureza(opcao)}
                  />
                  <span>
                    <b style={{ display: "block", fontSize: 14 }}>{DESCRICAO_NATUREZA[opcao].titulo}</b>
                    <span className="cap">{DESCRICAO_NATUREZA[opcao].texto}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Benefício e preços
          </h2>
          <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label htmlFor="campo-of-tipo">Tipo de benefício</label>
              <select
                id="campo-of-tipo"
                className="select"
                name="tipoBeneficioId"
                required
                value={tipoBeneficioId}
                onChange={(evento) => definirTipoBeneficioId(evento.target.value)}
              >
                <option value="">Selecionar…</option>
                {tiposBeneficio.map((tipo) => {
                  const bloqueado =
                    (natureza === "RECOMPENSA" && tipo.slug !== "GRATUIDADE") ||
                    (natureza !== "RECOMPENSA" && tipo.slug === "GRATUIDADE");
                  return (
                    <option key={tipo.id} value={tipo.id} disabled={bloqueado}>
                      {tipo.nome}
                      {bloqueado ? " — incompatível com a natureza" : ""}
                    </option>
                  );
                })}
              </select>
              <span className="hint">Gratuidade ⇒ natureza Recompensa (ficha §3.3).</span>
            </div>
            {natureza === "BENEFICIO" ? (
              <div className="field">
                <label htmlFor="campo-of-modalidade">Modalidade de pagamento</label>
                <select
                  id="campo-of-modalidade"
                  className="select"
                  name="modalidadePagamento"
                  defaultValue={valores?.modalidadePagamento ?? ""}
                >
                  <option value="">—</option>
                  <option value="UNICA">Única</option>
                  <option value="RECORRENTE">Recorrente (prestação continuada)</option>
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="campo-of-preco-de">Preço de (R$)</label>
              <input
                id="campo-of-preco-de"
                className="input"
                name="precoDe"
                inputMode="decimal"
                disabled={natureza === "RECOMPENSA"}
                value={precoDe}
                onChange={(evento) => definirPrecoDe(evento.target.value)}
              />
              {natureza === "RECOMPENSA" ? (
                <span className="hint">Recompensa é gratuidade — preços ficam zerados.</span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="campo-of-preco-por">Preço por (R$)</label>
              <input
                id="campo-of-preco-por"
                className="input"
                name="precoPor"
                inputMode="decimal"
                disabled={natureza === "RECOMPENSA"}
                required={exigePrecos}
                value={precoPor}
                onChange={(evento) => definirPrecoPor(evento.target.value)}
              />
            </div>
            {natureza === "CUPOM_DESCONTO" ? (
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="campo-of-cupom">Código/regras do cupom</label>
                <textarea
                  id="campo-of-cupom"
                  className="textarea"
                  name="cupomCodigoRegras"
                  rows={2}
                  required
                  defaultValue={valores?.cupomCodigoRegras ?? ""}
                />
                <span className="hint">
                  A comissão do cupom está em confirmação de negócio — nenhum cálculo de
                  receita é feito para cupom (COMISSAO_CUPOM: EM_CONFIRMACAO).
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Mecânica de resgate
          </h2>
          <p className="cap" style={{ margin: "0 0 12px" }}>
            Toda mecânica emite voucher. Compatibilidade com os ambientes de pagamento do
            bloco comercial (RN11).
          </p>
          <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {mecanicas.map((mecanica) => {
              const compativel = mecanicaCompativelComAmbiente(mecanica.slug, contexto.ambientes);
              const selecionada = mecanicaId === mecanica.id;
              return (
                <label
                  key={mecanica.id}
                  className={
                    !compativel ? "radio-card off" : selecionada ? "radio-card on" : "radio-card"
                  }
                  title={!compativel ? explicacaoIncompatibilidade(mecanica.slug) : undefined}
                >
                  <input
                    type="radio"
                    name="mecanicaId"
                    value={mecanica.id}
                    checked={selecionada}
                    disabled={!compativel}
                    onChange={() => definirMecanicaId(mecanica.id)}
                  />
                  <span>
                    <b style={{ display: "block", fontSize: 14 }}>{mecanica.nome}</b>
                    {!compativel ? (
                      <span className="cap" style={{ color: "var(--erro-texto-aaa)" }}>
                        {explicacaoIncompatibilidade(mecanica.slug)}
                      </span>
                    ) : (
                      <span className="cap">
                        {mecanica.slug === "CHECKOUT_CLUBE"
                          ? "Pagamento dentro da Plataforma."
                          : mecanica.slug === "CHECKOUT_EXTERNO"
                            ? "Pagamento fora da Plataforma."
                            : "Sem pagamento — emissão direta do voucher."}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {mecanicaSelecionada?.slug === "CHECKOUT_EXTERNO" ? (
            <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginTop: 14 }}>
              <div className="field">
                <label htmlFor="campo-of-url">URL de resgate externo</label>
                <input
                  id="campo-of-url"
                  className="input"
                  name="urlResgateExterno"
                  type="url"
                  defaultValue={valores?.urlResgateExterno ?? ""}
                />
                <span className="hint">Obrigatória quando o resgate é por link.</span>
              </div>
            </div>
          ) : null}
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="campo-of-instrucoes">Instruções de resgate pós-voucher</label>
            <textarea
              id="campo-of-instrucoes"
              className="textarea"
              name="instrucoesResgate"
              rows={2}
              placeholder="Fluxo quando o resgate não é automático (contato, lead direcionado ao aliado)…"
              defaultValue={valores?.instrucoesResgate ?? ""}
            />
            <span className="hint">Recomendado para checkout externo (previsto no contrato).</span>
          </div>
        </div>

        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Vigência e limites
          </h2>
          <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div className="field">
              <label htmlFor="campo-of-inicio">Vigência início</label>
              <input
                id="campo-of-inicio"
                className="input"
                name="vigenciaInicio"
                type="date"
                required
                defaultValue={valores?.vigenciaInicio ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="campo-of-fim">Vigência fim</label>
              <input
                id="campo-of-fim"
                className="input"
                name="vigenciaFim"
                type="date"
                defaultValue={valores?.vigenciaFim ?? ""}
              />
              <span className="hint">Vazio = prazo indeterminado; fim &lt; hoje expira (RN03).</span>
            </div>
            <div className="field">
              <label htmlFor="campo-of-limite">Limite de resgates</label>
              <input
                id="campo-of-limite"
                className="input"
                name="limiteResgates"
                inputMode="numeric"
                defaultValue={valores?.limiteResgates ?? ""}
              />
              <span className="hint">
                [A CONFIRMAR] suporte da Minutrade — por ora o campo é interno (alerta ao atingir).
              </span>
            </div>
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-azul" disabled={pendente}>
            {pendente ? "Salvando…" : edicao ? "Salvar alterações" : "Criar oferta (rascunho)"}
          </button>
        </div>
      </form>

      <aside aria-label="Pré-visualização do card" style={{ position: "sticky", top: 16 }}>
        <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, marginBottom: 8 }}>
          Pré-visualização do card
        </div>
        <div className="vcard">
          <div className="img">
            <span className="tipo">
              {natureza === "RECOMPENSA"
                ? "Recompensa"
                : natureza === "CUPOM_DESCONTO"
                  ? "Cupom de desconto"
                  : "Oferta"}
            </span>
          </div>
          <div className="corpo">
            <span className="cat">{contexto.categoriaNome ?? "Categoria pendente"}</span>
            <p className="tit">{titulo || contexto.solucaoNome}</p>
            <span className="vend">
              Oferecido por <b>{contexto.aliadoNome}</b>
            </span>
            {natureza === "RECOMPENSA" ? (
              <span className="gratis">Gratuito para assinantes</span>
            ) : natureza === "CUPOM_DESCONTO" ? (
              <span className="cupom">
                <b>CUPOM</b>
                <span className="cap">código exibido após o resgate do voucher</span>
              </span>
            ) : (
              <>
                {precoDe ? <span className="de">R$ {precoDe}</span> : null}
                <span className="por">
                  {precoPor ? `R$ ${precoPor}` : "—"}
                  {tipoSelecionado?.slug === "CONDICAO_ESPECIAL" ? (
                    <small>condição especial</small>
                  ) : null}
                </span>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
