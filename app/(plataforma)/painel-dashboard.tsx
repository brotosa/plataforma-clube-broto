"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type CelulaPanorama,
  FAIXA_SEM_PENDENCIA,
  type IndicadorApurado,
  type PendenciaApurada,
  ROTULOS_BLOCO,
  TEXTOS_INDISPONIBILIDADE,
  etiquetaDeAtribuicao,
  faixaEstaZerada,
  pendenciasAcionaveis,
} from "@/dominio/dashboard/indicadores";
import {
  PERIODOS_DASHBOARD,
  type PeriodoDashboard,
  ROTULOS_PERIODO,
} from "@/dominio/dashboard/periodo";

/**
 * T26 — Dashboard (HOME). Fiel ao protótipo v8.1 FINAL: faixa editorial no
 * azul da marca com o destaque da vitrine viva, cartões de "exige ação
 * hoje" e os quatro blocos por domínio.
 *
 * Os títulos dos blocos e dos indicadores são os DA FICHA §2 — a referência
 * visual encurtou alguns, e em conflito a ficha vence.
 *
 * Componente de cliente só por causa do seletor de período (navegação por
 * querystring); todo número chega pronto do servidor.
 */

const FORMATO_NUMERO = new Intl.NumberFormat("pt-BR");
const FORMATO_REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatarValor(indicador: IndicadorApurado): string {
  if (indicador.resultado.estado !== "DISPONIVEL") {
    return TEXTOS_INDISPONIBILIDADE[indicador.resultado.motivo];
  }
  const { valor, base } = indicador.resultado;
  switch (indicador.unidade) {
    case "PERCENTUAL":
      return base
        ? `${FORMATO_NUMERO.format(valor)}% (${FORMATO_NUMERO.format(base.parte)} de ${FORMATO_NUMERO.format(base.total)})`
        : `${FORMATO_NUMERO.format(valor)}%`;
    case "DIAS":
      return valor === 1 ? "1 dia" : `${FORMATO_NUMERO.format(valor)} dias`;
    case "REAIS":
      return FORMATO_REAIS.format(valor);
    case "DISTRIBUICAO":
      return indicador.resultado.fatias && indicador.resultado.fatias.length > 0
        ? indicador.resultado.fatias
            .slice(0, 3)
            .map((fatia) => `${fatia.rotulo} ${FORMATO_NUMERO.format(fatia.valor)}`)
            .join(" · ")
        : FORMATO_NUMERO.format(valor);
    default:
      return base
        ? `${FORMATO_NUMERO.format(valor)} de ${FORMATO_NUMERO.format(base.total)}`
        : FORMATO_NUMERO.format(valor);
  }
}

/**
 * Número de uma célula do panorama.
 *
 * Célula sem base exibe o motivo, jamais zero nem aproximação (RN53) — e o
 * valor indisponível não entra em soma alguma, incluindo a contagem do sino.
 */
function textoDaCelula(celula: CelulaPanorama): string {
  if (celula.resultado.estado !== "DISPONIVEL") {
    return TEXTOS_INDISPONIBILIDADE[celula.resultado.motivo];
  }
  const { valor, base } = celula.resultado;
  return base
    ? `${FORMATO_NUMERO.format(valor)} de ${FORMATO_NUMERO.format(base.total)}`
    : FORMATO_NUMERO.format(valor);
}

function LinhaIndicador({ indicador }: { indicador: IndicadorApurado }) {
  const indisponivel = indicador.resultado.estado === "INDISPONIVEL";
  const etiqueta =
    indicador.resultado.estado === "DISPONIVEL" && indicador.resultado.nivelAtribuicao
      ? etiquetaDeAtribuicao(indicador.resultado.nivelAtribuicao)
      : null;

  return (
    <div className="kit-lin" style={{ alignItems: "baseline" }}>
      <span className="cap" style={{ minWidth: 0 }}>
        {indicador.rotulo}
        {indicador.ressalva ? (
          <span className="cap" style={{ display: "block", opacity: 0.85 }}>
            {indicador.ressalva}
          </span>
        ) : null}
      </span>
      <span style={{ textAlign: "right", minWidth: 0 }}>
        {indisponivel ? (
          <span className="indisp">{formatarValor(indicador)}</span>
        ) : (
          <>
            <b className="num" style={{ fontSize: 16 }}>
              {formatarValor(indicador)}
            </b>
            {etiqueta ? (
              <>
                {" "}
                <span className="pill pill-neutra" style={{ fontSize: 10 }}>
                  {etiqueta}
                </span>
              </>
            ) : null}
          </>
        )}
      </span>
    </div>
  );
}

export function PainelDashboard({
  periodo,
  hoje,
  pendencias,
  panorama,
  blocos,
  destaque,
  meta,
  janelaVitrineEmDias,
}: {
  periodo: PeriodoDashboard;
  /** Data já formatada no servidor — evita divergência de fuso na hidratação. */
  hoje: string;
  pendencias: ReadonlyArray<PendenciaApurada>;
  panorama: ReadonlyArray<CelulaPanorama>;
  blocos: ReadonlyArray<{ bloco: keyof typeof ROTULOS_BLOCO; indicadores: IndicadorApurado[] }>;
  destaque: IndicadorApurado;
  meta: { alvo: number; realizado: number; rotuloPeriodo: string | null } | null;
  janelaVitrineEmDias: number;
}) {
  const router = useRouter();
  const emDia = faixaEstaZerada(pendencias);
  // Mesma função que o sino usa para montar suas linhas: cartões e sino não
  // podem discordar sobre o que é pendência (Onda 7 §7).
  const comPendencia = pendenciasAcionaveis(pendencias);

  const vitrine = destaque.resultado;
  const destaqueDisponivel = vitrine.estado === "DISPONIVEL";
  const percentualVitrine =
    vitrine.estado === "DISPONIVEL"
      ? `${FORMATO_NUMERO.format(vitrine.valor)}%`
      : TEXTOS_INDISPONIBILIDADE[vitrine.motivo];
  const baseVitrine =
    vitrine.estado === "DISPONIVEL" && vitrine.base
      ? `${FORMATO_NUMERO.format(vitrine.base.parte)} das ${FORMATO_NUMERO.format(vitrine.base.total)} ofertas publicadas com resgate em ${janelaVitrineEmDias} dias — a tese do Clube em métrica`
      : `sem oferta publicada para medir na janela de ${janelaVitrineEmDias} dias`;

  const percentualMeta =
    meta && meta.alvo > 0 ? Math.min(100, Math.round((meta.realizado / meta.alvo) * 100)) : 0;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="dash-hero">
        {/* Marca d'água decorativa do protótipo v9.1 — o símbolo do Broto
            sangrando no canto inferior direito do cartão azul, a 14% de
            opacidade. A F13 trouxe o CSS (`.dash-marca`) e esqueceu o
            elemento.

            Três cuidados que a fazem decoração e não conteúdo:
            • `alt=""` + `aria-hidden` a tiram da árvore de acessibilidade, e
              <img> não entra na ordem de foco — o leitor de tela não anuncia
              nada, e o teclado não para aqui;
            • vem PRIMEIRA no DOM, antes dos dois blocos de conteúdo, que são
              `position:relative` e portanto pintam por cima;
            • as células do panorama têm fundo opaco, então a marca não passa
              sob texto algum — o contraste medido do hero não muda, e o axe
              AAA continua limpo (verificado em teste). */}
        <Image
          className="dash-marca"
          src="/logos/logo-broto-simbolo-amarelo.svg"
          alt=""
          aria-hidden="true"
          width={490}
          height={280}
          priority={false}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            flexWrap: "wrap",
            position: "relative",
          }}
        >
          <div>
            <h1 className="h-page" style={{ color: "#fff" }}>
              O Clube hoje
            </h1>
            <div className="dash-cap" style={{ marginTop: 4 }}>
              {hoje} · agregados visíveis a todos os papéis — nenhum dado pessoal
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div
            className="field"
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <label
              htmlFor="dash-periodo"
              className="dash-cap"
              style={{
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".06em",
                fontSize: 11,
              }}
            >
              Período
            </label>
            <select
              id="dash-periodo"
              className="select"
              style={{ width: 172, borderColor: "transparent" }}
              value={periodo}
              onChange={(evento) => router.push(`/?periodo=${evento.target.value}`)}
            >
              {PERIODOS_DASHBOARD.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {ROTULOS_PERIODO[opcao]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="dash-main">
          <Link
            className="dash-star"
            href="/ofertas"
            style={{ textDecoration: "none" }}
          >
            <span className="dash-lab">Vitrine viva</span>
            <span className={destaqueDisponivel ? "dash-big num" : "dash-cap"}>
              {percentualVitrine}
            </span>
            <span className="dash-cap">
              {baseVitrine} ·{" "}
              <b style={{ color: "var(--amarelo)" }}>{etiquetaDeAtribuicao("POR_OFERTA")}</b>
            </span>
          </Link>
          {/* Camada 1 (Onda 7 §6): o panorama de oito células. Antes da F14
              estas células exibiam as pendências — a ficha da Onda 6 §2 não
              enumerou o hero, e a implementação seguiu a ficha. As pendências
              descem para a camada 2, como cartões próprios. */}
          <div className="dash-stats">
            {panorama.map((celula) => (
              <Link
                key={celula.chave}
                className="dash-stat"
                href={celula.destino}
                style={{ textDecoration: "none" }}
              >
                <span className="dash-lab">{celula.rotulo}</span>
                <span className={celula.resultado.estado === "DISPONIVEL" ? "dash-n num" : "dash-cap"}>
                  {textoDaCelula(celula)}
                </span>
                <span className="dash-cap">{celula.nota}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <h2 className="h-el" style={{ marginBottom: 10 }}>
        Pendências{" "}
        <span className="cap" style={{ fontWeight: 400 }}>
          · exige ação hoje
        </span>
      </h2>
      {emDia ? (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="vazio" style={{ padding: "26px 10px" }}>
            <div
              className="ic"
              style={{
                background: "var(--verde-claro)",
                borderColor: "var(--verde)",
                color: "var(--preto)",
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h3 className="h-el">Nenhuma ação pendente</h3>
            <p className="cap" style={{ maxWidth: "46ch", margin: 0 }}>
              {FAIXA_SEM_PENDENCIA} As réguas do Parametrizador seguem vigiando.
            </p>
          </div>
        </div>
      ) : (
        <div className="acao-grid" style={{ marginBottom: 22 }}>
          {comPendencia.map((pendencia) => (
            <Link
              key={pendencia.chave}
              className="acao-card"
              href={pendencia.destino}
              style={{ textDecoration: "none" }}
            >
              <span className="acao-n alerta">{FORMATO_NUMERO.format(pendencia.contagem)}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", font: "var(--font-body-label-bold)" }}>
                  {pendencia.rotulo}
                </span>
                <span className="cap" style={{ display: "block", marginTop: 2 }}>
                  {pendencia.fonte}
                </span>
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ flex: "none", marginLeft: "auto", color: "var(--paragrafo-aaa)" }}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      <div
        className="g-resp"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
          gap: 16,
        }}
      >
        {blocos.map(({ bloco, indicadores }) => (
          <div key={bloco} className="card" style={{ padding: "20px 22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <h2 className="h-el">{ROTULOS_BLOCO[bloco]}</h2>
              <span className="cap">{ROTULOS_PERIODO[periodo].toLowerCase()}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {indicadores.map((indicador) => (
                <LinhaIndicador key={indicador.chave} indicador={indicador} />
              ))}
            </div>
            {bloco === "MERCADO_E_FUNIL" && meta ? (
              <div
                style={{
                  borderTop: "1px solid var(--borda)",
                  marginTop: 4,
                  paddingTop: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "baseline",
                  }}
                >
                  <span className="cap">
                    Meta de novos aliados — {meta.rotuloPeriodo ?? "período vigente"}
                  </span>
                  <b className="num">
                    {FORMATO_NUMERO.format(meta.realizado)} de {FORMATO_NUMERO.format(meta.alvo)}
                  </b>
                </div>
                <div className="compl" style={{ marginTop: 8, width: "100%" }}>
                  <span className="trk" style={{ flex: 1 }}>
                    <span className="fill" style={{ width: `${percentualMeta}%` }} />
                  </span>
                </div>
                <div className="cap" style={{ marginTop: 6 }}>
                  realizado = promoções efetivadas no período · meta definida no Parametrizador
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="cap" style={{ margin: "14px 0 0" }}>
        Todos os indicadores vêm das fichas validadas das Ondas 1–5 (RN50). Indicador sem fonte
        sustentada aparece como indisponível, nunca aproximado.
      </p>
    </div>
  );
}
