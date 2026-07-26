import type { NivelAtribuicao, TipoMetaCampanha } from "@prisma/client";

/**
 * RN43/RN44 — medição da campanha em DOIS NÍVEIS, com o nível declarado
 * em cada número:
 *
 * - POR_OFERTA: vouchers e compras das ofertas da campanha dentro da
 *   vigência. Disponível desde já, com os agregados da F4.
 * - POR_PUBLICO: cruzamento do snapshot congelado com a telemetria por
 *   CPF (`cpf_hash`). Só existe quando a Minutrade entregar essa
 *   granularidade — [A CONFIRMAR], a mesma pendência da RN36.
 *
 * Os dois nunca se misturam sem rótulo. Conversão % exige o nível público
 * (RN44): sem ele o painel responde "indisponível", jamais um número
 * aproximado a partir do que existe.
 */

export const ROTULOS_NIVEL: Readonly<Record<NivelAtribuicao, string>> = {
  POR_OFERTA: "por oferta",
  POR_PUBLICO: "por público",
};

export const ROTULOS_META: Readonly<Record<TipoMetaCampanha, string>> = {
  RESGATES: "Resgates",
  CONVERSAO_PCT: "Conversão %",
  ALIADOS_PARTICIPANTES: "Aliados participantes",
  OFERTAS_ATIVAS: "Ofertas ativas",
};

/** Mensagem única da indisponibilidade (RN44) — texto do protótipo v7.1. */
export const INDISPONIVEL_AGUARDA_CPF = "indisponível — aguarda telemetria por CPF";

/**
 * Nível exigido por tipo de meta. Só a conversão % depende do público:
 * as demais se medem com os agregados por oferta que já existem.
 */
export const NIVEL_EXIGIDO: Readonly<Record<TipoMetaCampanha, NivelAtribuicao>> = {
  RESGATES: "POR_OFERTA",
  CONVERSAO_PCT: "POR_PUBLICO",
  ALIADOS_PARTICIPANTES: "POR_OFERTA",
  OFERTAS_ATIVAS: "POR_OFERTA",
};

/** Números disponíveis para a campanha, cada um na sua origem. */
export interface DadosMedicao {
  /** Nível por oferta (F4): eventos das ofertas da campanha na vigência. */
  resgatesNaVigencia: number;
  aliadosParticipantes: number;
  ofertasAtivas: number;
  /** Tamanho do público congelado no snapshot da ativação. */
  publicoCongelado: number;
  /**
   * Nível por público: assinantes do snapshot com resgate na vigência,
   * pelo join via cpf_hash. `null` = granularidade ainda não existe.
   */
  assinantesDoPublicoComResgate: number | null;
}

/** Um número do painel, sempre com o nível de atribuição junto (RN43). */
export interface RealizadoDaMeta {
  tipo: TipoMetaCampanha;
  alvo: number;
  disponivel: boolean;
  /** Valor realizado; null quando indisponível (RN44). */
  valor: number | null;
  /** Nível do número; null quando não há número. */
  nivel: NivelAtribuicao | null;
  /** Explicação exibida sob o número — motivo da indisponibilidade inclusive. */
  nota: string;
  atingida: boolean;
}

/** A telemetria por CPF chegou? É o que habilita o nível por público. */
export function nivelPublicoDisponivel(dados: DadosMedicao): boolean {
  return dados.assinantesDoPublicoComResgate !== null;
}

/**
 * RN43/RN44 — realizado de uma meta no nível disponível. A conversão %
 * é a razão entre assinantes do público congelado com resgate na vigência
 * e o tamanho do público: sem o nível por público ela fica indisponível,
 * nunca aproximada pelos resgates por oferta.
 */
export function realizadoDaMeta(
  tipo: TipoMetaCampanha,
  alvo: number,
  dados: DadosMedicao,
): RealizadoDaMeta {
  const nivelExigido = NIVEL_EXIGIDO[tipo];

  if (nivelExigido === "POR_PUBLICO" && !nivelPublicoDisponivel(dados)) {
    return {
      tipo,
      alvo,
      disponivel: false,
      valor: null,
      nivel: null,
      nota: INDISPONIVEL_AGUARDA_CPF,
      atingida: false,
    };
  }

  let valor: number;
  let nota: string;

  switch (tipo) {
    case "RESGATES":
      valor = dados.resgatesNaVigencia;
      nota = "vouchers resgatados das ofertas da campanha dentro da vigência";
      break;
    case "ALIADOS_PARTICIPANTES":
      valor = dados.aliadosParticipantes;
      nota = "aliados com ao menos uma oferta na campanha";
      break;
    case "OFERTAS_ATIVAS":
      valor = dados.ofertasAtivas;
      nota = "ofertas publicadas vinculadas à campanha";
      break;
    case "CONVERSAO_PCT": {
      const comResgate = dados.assinantesDoPublicoComResgate ?? 0;
      valor =
        dados.publicoCongelado > 0
          ? Math.round((comResgate / dados.publicoCongelado) * 1000) / 10
          : 0;
      nota = "assinantes do público congelado com resgate na vigência";
      break;
    }
  }

  return {
    tipo,
    alvo,
    disponivel: true,
    valor,
    nivel: nivelExigido,
    nota,
    atingida: valor >= alvo,
  };
}

/** Realizado de todas as metas da campanha, na ordem recebida. */
export function realizadoDasMetas(
  metas: ReadonlyArray<{ tipo: TipoMetaCampanha; alvo: number }>,
  dados: DadosMedicao,
): RealizadoDaMeta[] {
  return metas.map((meta) => realizadoDaMeta(meta.tipo, meta.alvo, dados));
}

/**
 * Resumo "metas × realizado" da T22, com o nível etiquetado. Sem metas, a
 * lista mostra o traço — a campanha pode existir sem meta (são opcionais).
 */
export function resumoMetas(realizados: ReadonlyArray<RealizadoDaMeta>): {
  texto: string;
  nivel: string;
} {
  if (realizados.length === 0) {
    return { texto: "—", nivel: "sem metas" };
  }
  const atingidas = realizados.filter((r) => r.atingida).length;
  const indisponiveis = realizados.filter((r) => !r.disponivel).length;
  const niveis = new Set(
    realizados.filter((r) => r.nivel).map((r) => ROTULOS_NIVEL[r.nivel as NivelAtribuicao]),
  );

  const texto =
    indisponiveis > 0
      ? `${atingidas}/${realizados.length} atingidas · ${indisponiveis} indisponível(is)`
      : `${atingidas}/${realizados.length} atingidas`;

  return {
    texto,
    nivel: niveis.size > 0 ? [...niveis].join(" e ") : INDISPONIVEL_AGUARDA_CPF,
  };
}
