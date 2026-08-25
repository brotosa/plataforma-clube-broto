"use client";

import { useActionState, useState } from "react";
import type { AmbientePagamento, DestinacaoOferta, NaturezaOferta } from "@prisma/client";
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
  /** Benefício com Tipo = Percentual de desconto: inteiro 1–100, como texto. */
  percentualDesconto?: string | null;
  cupomCodigoRegras?: string | null;
  modalidadePagamento?: string | null;
  mecanicaId?: string;
  urlResgateExterno?: string | null;
  instrucoesResgate?: string | null;
  vigenciaInicio?: string;
  vigenciaFim?: string | null;
  limiteResgates?: number | null;
  /** Onda 4 (ficha §3): destinação e vínculo opcional. */
  destinacao?: DestinacaoOferta;
  destinacaoCampanhaId?: string | null;
  destinacaoCestaId?: string | null;
}

/** Campanhas e cestas disponíveis para vincular (Onda 4). */
export interface OpcaoDestino {
  id: string;
  nome: string;
  /** Vigência da campanha, sugerida à oferta quando vinculada. */
  vigencia?: string | null;
}

const DESCRICAO_NATUREZA: Record<NaturezaOferta, { titulo: string; texto: string }> = {
  RECOMPENSA: {
    titulo: "Recompensa",
    texto: "Produto/serviço gratuito para o assinante testar ou experimentar. Não comissiona.",
  },
  BENEFICIO: {
    titulo: "Benefício (Checkout Broto)",
    texto: "Adquirido dentro do Clube, com valor fixo ou condição especial. Comissiona sobre o valor pago.",
  },
  CUPOM_DESCONTO: {
    titulo: "Desconto (Checkout Externo)",
    texto: "Desconto percentual para uso no canal do aliado. Informe o percentual; a comissão fica em confirmação.",
  },
};

/**
 * Tipos de benefício válidos por natureza (24/08):
 * - Recompensa: só Gratuidade.
 * - Benefício (Checkout Broto): Valor fixo e Condição especial (valor).
 * - Desconto (Checkout Externo): só "% desconto" (o campo de percentual).
 */
function tipoBloqueado(slug: string, natureza: NaturezaOferta): boolean {
  if (natureza === "RECOMPENSA") return slug !== "GRATUIDADE";
  if (natureza === "BENEFICIO") return slug === "GRATUIDADE" || slug === "PCT_DESCONTO";
  // CUPOM_DESCONTO = Desconto (Checkout Externo): só percentual.
  return slug !== "PCT_DESCONTO";
}

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
  campanhas = [],
  cestas = [],
}: {
  solucaoId: string;
  contexto: {
    aliadoNome: string;
    solucaoNome: string;
    categoriaNome: string | null;
    ambientes: AmbientePagamento | null;
    /**
     * F17 (RN60) — id da solução, quando ela tem imagem do card. A oferta
     * apresenta a solução, então é a imagem dela que o card mostra. `null`
     * mantém o tratamento neutro que já existia.
     */
    solucaoComImagem: string | null;
  };
  tiposBeneficio: OpcaoTipoBeneficio[];
  mecanicas: OpcaoMecanica[];
  valores?: ValoresOferta;
  campanhas?: ReadonlyArray<OpcaoDestino>;
  cestas?: ReadonlyArray<OpcaoDestino>;
}) {
  const edicao = Boolean(valores?.ofertaId);
  const [estado, despachar, pendente] = useActionState<EstadoFormulario, FormData>(
    edicao ? acaoAtualizarOferta : acaoCriarOferta,
    {},
  );

  const [titulo, definirTitulo] = useState(valores?.titulo ?? "");
  const [natureza, definirNatureza] = useState<NaturezaOferta>(valores?.natureza ?? "BENEFICIO");
  // Se a oferta carregada tem um tipo que passou a ser inválido para a
  // natureza (ex.: Benefício com "% desconto", legado do ajuste anterior),
  // começa vazio — a régua nova não deixa salvar sem trocar (decisão de 24/08).
  const slugTipoInicial = tiposBeneficio.find((t) => t.id === valores?.tipoBeneficioId)?.slug;
  const tipoInicialValido =
    Boolean(valores?.tipoBeneficioId) &&
    slugTipoInicial !== undefined &&
    !tipoBloqueado(slugTipoInicial, valores?.natureza ?? "BENEFICIO");
  const [tipoBeneficioId, definirTipoBeneficioId] = useState(
    tipoInicialValido ? (valores?.tipoBeneficioId ?? "") : "",
  );
  const [precoDe, definirPrecoDe] = useState(valores?.precoDe ?? "");
  const [precoPor, definirPrecoPor] = useState(valores?.precoPor ?? "");
  const [percentualDesconto, definirPercentualDesconto] = useState(
    valores?.percentualDesconto ?? "",
  );
  const [mecanicaId, definirMecanicaId] = useState(valores?.mecanicaId ?? "");
  const [destinacao, definirDestinacao] = useState<DestinacaoOferta>(
    valores?.destinacao ?? "VITRINE",
  );
  const [destinoId, definirDestinoId] = useState(
    valores?.destinacaoCampanhaId ?? valores?.destinacaoCestaId ?? "",
  );

  const tipoSelecionado = tiposBeneficio.find((tipo) => tipo.id === tipoBeneficioId);
  const mecanicaSelecionada = mecanicas.find((mecanica) => mecanica.id === mecanicaId);
  // Vigência SUGERIDA (ficha §3): o formulário informa, o usuário decide —
  // nada é preenchido por trás, a data continua editável.
  const vigenciaSugerida =
    destinacao === "CAMPANHA"
      ? (campanhas.find((campanha) => campanha.id === destinoId)?.vigencia ?? null)
      : null;

  function aoMudarNatureza(nova: NaturezaOferta) {
    definirNatureza(nova);
    if (nova === "RECOMPENSA") {
      // Recompensa é gratuidade (definição contratual): preços zerados.
      definirPrecoDe("");
      definirPrecoPor("");
      definirPercentualDesconto("");
      const gratuidade = tiposBeneficio.find((tipo) => tipo.slug === "GRATUIDADE");
      if (gratuidade) definirTipoBeneficioId(gratuidade.id);
      const recompensaGratuita = mecanicas.find((mecanica) => mecanica.slug === "RECOMPENSA_GRATUITA");
      if (recompensaGratuita) definirMecanicaId(recompensaGratuita.id);
    } else if (nova === "CUPOM_DESCONTO") {
      // Desconto (Checkout Externo): só percentual — seleciona o tipo e limpa preços.
      definirPrecoDe("");
      definirPrecoPor("");
      const pct = tiposBeneficio.find((tipo) => tipo.slug === "PCT_DESCONTO");
      if (pct) definirTipoBeneficioId(pct.id);
    } else {
      // Benefício (Checkout Broto): sem percentual; se o tipo atual ficou
      // inválido para esta natureza, reseta para forçar nova escolha.
      definirPercentualDesconto("");
      if (
        tipoSelecionado?.slug === "GRATUIDADE" ||
        tipoSelecionado?.slug === "PCT_DESCONTO"
      ) {
        definirTipoBeneficioId("");
      }
    }
  }

  // Percentual substitui preço de/por: só existe sob a natureza Desconto.
  const exigePercentual = tipoSelecionado?.slug === "PCT_DESCONTO";
  const exigePrecos = natureza === "BENEFICIO" && tipoSelecionado?.slug === "VALOR_FIXO";

  function aoMudarTipo(novoId: string) {
    definirTipoBeneficioId(novoId);
    const novoTipo = tiposBeneficio.find((tipo) => tipo.id === novoId);
    if (novoTipo?.slug === "PCT_DESCONTO") {
      // Percentual não usa preço: limpa os campos que somem da tela.
      definirPrecoDe("");
      definirPrecoPor("");
    } else {
      // Qualquer outro tipo não usa percentual.
      definirPercentualDesconto("");
    }
  }

  return (
    <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
      <form action={despachar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <ErrosDoFormulario erros={estado.erros} />
        <input type="hidden" name="solucaoId" value={solucaoId} />
        {edicao ? <input type="hidden" name="ofertaId" value={valores!.ofertaId} /> : null}
        {/* Código/regras saiu da tela (Desconto usa só %). Preserva o valor
            legado por campo oculto para a edição não apagá-lo em silêncio. */}
        <input type="hidden" name="cupomCodigoRegras" value={valores?.cupomCodigoRegras ?? ""} />

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
                onChange={(evento) => aoMudarTipo(evento.target.value)}
              >
                <option value="">Selecionar…</option>
                {tiposBeneficio.map((tipo) => {
                  const bloqueado = tipoBloqueado(tipo.slug, natureza);
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
            {exigePercentual ? (
              <div className="field">
                <label htmlFor="campo-of-percentual">Percentual de desconto (%)</label>
                <input
                  id="campo-of-percentual"
                  className="input"
                  name="percentualDesconto"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  value={percentualDesconto}
                  onChange={(evento) => definirPercentualDesconto(evento.target.value)}
                />
                <span className="hint">Número inteiro de 1 a 100. Substitui preço de/por.</span>
              </div>
            ) : (
              <>
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
              </>
            )}
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

        {/* Onda 4 (ficha §3, extensão retroativa): a destinação entra como
            cartão próprio, na posição do protótipo v7.1 — entre a mecânica e
            a vigência —, sem reorganizar o formulário existente. */}
        <div className="card" style={{ padding: "20px 22px" }}>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Destinação
          </h2>
          <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="field">
              <label htmlFor="campo-of-destinacao">Onde esta oferta vive</label>
              <select
                id="campo-of-destinacao"
                className="select"
                name="destinacao"
                value={destinacao}
                onChange={(evento) => definirDestinacao(evento.target.value as DestinacaoOferta)}
              >
                <option value="VITRINE">Vitrine — permanente</option>
                <option value="CAMPANHA">Criada para uma campanha</option>
                <option value="CESTA">Criada para uma cesta</option>
              </select>
              <span className="hint">
                A vitrine é uma só — o vínculo serve à gestão e à medição, não muda a publicação.
              </span>
            </div>
            {destinacao === "CAMPANHA" ? (
              <div className="field">
                <label htmlFor="campo-of-campanha">Campanha</label>
                <select
                  id="campo-of-campanha"
                  className="select"
                  name="destinacaoCampanhaId"
                  value={destinoId}
                  onChange={(evento) => definirDestinoId(evento.target.value)}
                >
                  <option value="">Selecionar…</option>
                  {campanhas.map((campanha) => (
                    <option value={campanha.id} key={campanha.id}>
                      {campanha.nome}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  {vigenciaSugerida
                    ? `Vigência sugerida igual à da campanha (editável): ${vigenciaSugerida}`
                    : "Vigência sugerida igual à da campanha (editável)."}
                </span>
              </div>
            ) : null}
            {destinacao === "CESTA" ? (
              <div className="field">
                <label htmlFor="campo-of-cesta">Cesta</label>
                <select
                  id="campo-of-cesta"
                  className="select"
                  name="destinacaoCestaId"
                  value={destinoId}
                  onChange={(evento) => definirDestinoId(evento.target.value)}
                >
                  <option value="">Selecionar…</option>
                  {cestas.map((cesta) => (
                    <option value={cesta.id} key={cesta.id}>
                      {cesta.nome}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  A cesta só entra em campanha com todas as ofertas publicadas (RN41).
                </span>
              </div>
            ) : null}
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
            {contexto.solucaoComImagem ? (
              /* Servida por rota própria com ETag pelo hash (RN60). */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/solucoes/${contexto.solucaoComImagem}/imagem`}
                alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : null}
            <span className="tipo">
              {natureza === "RECOMPENSA"
                ? "Recompensa"
                : natureza === "CUPOM_DESCONTO"
                  ? "Desconto"
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
            ) : exigePercentual ? (
              <span className="por">
                {percentualDesconto ? `${percentualDesconto}% de desconto` : "—"}
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
