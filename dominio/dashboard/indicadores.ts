/**
 * RN50 — honestidade estrutural do Dashboard (Onda 6, ficha §2).
 *
 * Duas garantias, ambas verificadas por teste:
 *
 * 1. **Nenhum indicador sem ficha.** O catálogo abaixo é fechado e cada
 *    entrada declara a ficha e a seção de onde veio. Indicador novo entra
 *    aqui só depois de entrar numa ficha validada — não é uma convenção de
 *    revisão, é o tipo `ChaveIndicador` que impede a query de devolver
 *    qualquer outra coisa.
 * 2. **Indisponibilidade é estado de primeira classe.** Um indicador cuja
 *    fonte não sustenta o número devolve INDISPONIVEL com motivo, jamais um
 *    valor aproximado. O vocabulário é o mesmo que a Onda 4 já usa em
 *    dominio/campanhas/atribuicao.ts (RN44) — a plataforma diz
 *    "indisponível" de um jeito só.
 */

import type { NivelAtribuicao } from "@prisma/client";
import { ROTULOS_NIVEL } from "@/dominio/campanhas/atribuicao";

// ---------------------------------------------------------------------
// Catálogo fechado (ficha §2)
// ---------------------------------------------------------------------

export type BlocoDashboard =
  | "REDE_E_ALIADOS"
  | "MERCADO_E_FUNIL"
  | "ASSINANTES_E_USO"
  | "CAMPANHAS";

export const ROTULOS_BLOCO: Readonly<Record<BlocoDashboard, string>> = {
  REDE_E_ALIADOS: "Rede e Aliados",
  MERCADO_E_FUNIL: "Mercado e Funil",
  ASSINANTES_E_USO: "Assinantes e Uso",
  CAMPANHAS: "Campanhas",
};

/** Unidade do número — decide a formatação, não o cálculo. */
export type UnidadeIndicador = "PERCENTUAL" | "CONTAGEM" | "DIAS" | "REAIS" | "DISTRIBUICAO";

export interface DefinicaoIndicador {
  chave: ChaveIndicador;
  bloco: BlocoDashboard;
  rotulo: string;
  unidade: UnidadeIndicador;
  /** Ficha e seção de origem — a prova documental exigida pela RN50. */
  fonte: string;
  /** Nota de rodapé exibida sob o número, quando a ficha a exige. */
  ressalva?: string;
}

/**
 * As 19 métricas das fichas validadas, na ordem da tabela da ficha §2.
 * A ordem importa: é a ordem em que a T26 as apresenta.
 */
export const CATALOGO_INDICADORES = [
  // ---- Rede e Aliados (ficha Onda 1 §8) ----
  {
    chave: "ALIADOS_CADASTRO_COMPLETO_PCT",
    bloco: "REDE_E_ALIADOS",
    rotulo: "Aliados com cadastro completo",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda1 §8",
  },
  {
    chave: "TEMPO_MEDIANO_RASCUNHO_PUBLICACAO",
    bloco: "REDE_E_ALIADOS",
    rotulo: "Tempo mediano rascunho → publicação",
    unidade: "DIAS",
    fonte: "ficha-onda1 §8",
  },
  {
    chave: "VITRINE_VIVA_PCT",
    bloco: "REDE_E_ALIADOS",
    rotulo: "Ofertas ativas com resgate em 90 dias",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda1 §8 (vitrine viva)",
  },
  {
    chave: "COBERTURA_CATEGORIAS",
    bloco: "REDE_E_ALIADOS",
    rotulo: "Cobertura de categorias",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda1 §8",
  },
  {
    chave: "RECEITA_COMISSAO_ESTIMADA",
    bloco: "REDE_E_ALIADOS",
    rotulo: "Receita de comissão estimada",
    unidade: "REAIS",
    fonte: "ficha-onda1 §8",
    ressalva:
      "valor pago × comissão %, apenas ofertas de Benefício; cupom excluído até a regra ser definida",
  },
  // ---- Mercado e Funil (ficha Onda 2 §8) ----
  {
    chave: "TEMPO_MEDIANO_RADAR_DECISAO",
    bloco: "MERCADO_E_FUNIL",
    rotulo: "Tempo mediano radar → decisão",
    unidade: "DIAS",
    fonte: "ficha-onda2 §8",
  },
  {
    chave: "FUNIL_AVALIADO_PCT",
    bloco: "MERCADO_E_FUNIL",
    rotulo: "Funil avaliado",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda2 §8",
  },
  {
    chave: "ENVELHECIMENTO_POR_ESTAGIO",
    bloco: "MERCADO_E_FUNIL",
    rotulo: "Envelhecimento por estágio",
    unidade: "DISTRIBUICAO",
    fonte: "ficha-onda2 §8",
  },
  {
    chave: "CONVERSAO_RADAR_ALIADA_PCT",
    bloco: "MERCADO_E_FUNIL",
    rotulo: "Conversão radar → aliada",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda2 §8",
  },
  {
    chave: "GAPS_DE_COBERTURA",
    bloco: "MERCADO_E_FUNIL",
    rotulo: "Gaps de cobertura",
    unidade: "CONTAGEM",
    fonte: "ficha-onda2 §8",
  },
  {
    chave: "META_X_REALIZADO",
    bloco: "MERCADO_E_FUNIL",
    rotulo: "Meta × realizado (novos aliados)",
    unidade: "CONTAGEM",
    fonte: "ficha-onda2 §8 · alvo lido do Parametrizador (RN23)",
  },
  // ---- Assinantes e Uso (ficha Onda 5 §8) ----
  {
    chave: "BASE_COM_CONTATO_VALIDO_PCT",
    bloco: "ASSINANTES_E_USO",
    rotulo: "Base com contato válido",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda5 §8",
  },
  {
    chave: "COBERTURA_ENRIQUECIMENTO_PCT",
    bloco: "ASSINANTES_E_USO",
    rotulo: "Cobertura de enriquecimento",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda5 §8",
  },
  {
    chave: "ASSINANTES_COM_USO_90D_PCT",
    bloco: "ASSINANTES_E_USO",
    rotulo: "Assinantes com uso em 90 dias",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda5 §8",
    ressalva: "depende de telemetria por CPF (RN36)",
  },
  {
    chave: "DISTRIBUICAO_UF_PREFERENCIA",
    bloco: "ASSINANTES_E_USO",
    rotulo: "Distribuição por UF e preferência",
    unidade: "DISTRIBUICAO",
    fonte: "ficha-onda5 §8",
  },
  {
    chave: "VENCIMENTOS_30_60_90",
    bloco: "ASSINANTES_E_USO",
    rotulo: "Vencimentos em 30/60/90 dias",
    unidade: "DISTRIBUICAO",
    fonte: "ficha-onda5 §8 (RN37)",
  },
  // ---- Campanhas (ficha Onda 4 §7) ----
  {
    chave: "CAMPANHAS_ATIVAS",
    bloco: "CAMPANHAS",
    rotulo: "Campanhas ativas",
    unidade: "CONTAGEM",
    fonte: "ficha-onda4 §7",
  },
  {
    chave: "TAXA_METAS_ATINGIDAS_PCT",
    bloco: "CAMPANHAS",
    rotulo: "Taxa de metas atingidas",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda4 §7",
  },
  {
    chave: "OFERTAS_CAMPANHA_COM_RESGATE_PCT",
    bloco: "CAMPANHAS",
    rotulo: "Ofertas de campanha com resgate na vigência",
    unidade: "PERCENTUAL",
    fonte: "ficha-onda4 §7",
  },
] as const satisfies ReadonlyArray<Omit<DefinicaoIndicador, "chave"> & { chave: string }>;

/** Chaves possíveis — o tipo que fecha o catálogo (RN50). */
export type ChaveIndicador = (typeof CATALOGO_INDICADORES)[number]["chave"];

export function definicaoDoIndicador(chave: ChaveIndicador): DefinicaoIndicador {
  const definicao = CATALOGO_INDICADORES.find((d) => d.chave === chave);
  if (!definicao) {
    // Inalcançável pelo tipo; existe para a base de código falhar alto se
    // alguém contornar o tipo com um cast.
    throw new Error(`Indicador ${chave} não consta de ficha validada (RN50).`);
  }
  return definicao as DefinicaoIndicador;
}

export function indicadoresDoBloco(bloco: BlocoDashboard): ReadonlyArray<DefinicaoIndicador> {
  return CATALOGO_INDICADORES.filter((d) => d.bloco === bloco) as ReadonlyArray<DefinicaoIndicador>;
}

// ---------------------------------------------------------------------
// Estado do indicador (RN50)
// ---------------------------------------------------------------------

/**
 * Por que um indicador pode não existir. Cada motivo tem texto próprio: a
 * ficha exige o estado "aguarda telemetria por assinante" nomeado, e
 * "ainda não há dado" é coisa diferente de "a fonte não entrega".
 */
export type MotivoIndisponibilidade =
  | "AGUARDA_TELEMETRIA_ASSINANTE"
  | "SEM_BASE_DE_CALCULO"
  | "PARAMETRO_NAO_DEFINIDO";

export const TEXTOS_INDISPONIBILIDADE: Readonly<Record<MotivoIndisponibilidade, string>> = {
  // Texto exigido pela ficha §2, palavra por palavra.
  AGUARDA_TELEMETRIA_ASSINANTE: "aguarda telemetria por assinante",
  SEM_BASE_DE_CALCULO: "sem base de cálculo no período",
  PARAMETRO_NAO_DEFINIDO: "parâmetro ainda não definido",
};

/** Uma fatia de um indicador de distribuição (UF, estágio, faixa). */
export interface FatiaDeDistribuicao {
  rotulo: string;
  valor: number;
}

export type ValorIndicador =
  | {
      estado: "DISPONIVEL";
      valor: number;
      /** Numerador/denominador quando o número é uma razão — a T26 os exibe. */
      base?: { parte: number; total: number };
      fatias?: ReadonlyArray<FatiaDeDistribuicao>;
      /** Etiqueta de atribuição (RN43) nos números de campanha. */
      nivelAtribuicao?: NivelAtribuicao;
    }
  | { estado: "INDISPONIVEL"; motivo: MotivoIndisponibilidade };

export interface IndicadorApurado extends DefinicaoIndicador {
  resultado: ValorIndicador;
}

export function disponivel(
  valor: number,
  extras: {
    base?: { parte: number; total: number };
    fatias?: ReadonlyArray<FatiaDeDistribuicao>;
    nivelAtribuicao?: NivelAtribuicao;
  } = {},
): ValorIndicador {
  return { estado: "DISPONIVEL", valor, ...extras };
}

export function indisponivel(motivo: MotivoIndisponibilidade): ValorIndicador {
  return { estado: "INDISPONIVEL", motivo };
}

/**
 * Percentual a partir de parte/total, com o denominador zero tratado como
 * indisponível — não como 0%.
 *
 * É a regra que mais protege a tese comercial: "0% de vitrine viva" acusa
 * uma rede parada; "sem base de cálculo" diz que não há oferta ativa para
 * medir. Arredondar o segundo para o primeiro seria inventar um diagnóstico.
 */
export function percentual(parte: number, total: number): ValorIndicador {
  if (total <= 0) {
    return indisponivel("SEM_BASE_DE_CALCULO");
  }
  return disponivel(Math.round((parte / total) * 1000) / 10, { base: { parte, total } });
}

/** Texto exibido sob um número de campanha (RN43 — etiqueta obrigatória). */
export function etiquetaDeAtribuicao(nivel: NivelAtribuicao): string {
  return `atribuição ${ROTULOS_NIVEL[nivel]}`;
}

/**
 * O indicador de campanha saiu com a etiqueta? A T26 não exibe número de
 * campanha sem nível declarado — este predicado é o que o teste cobra.
 */
export function campanhaEtiquetada(indicador: IndicadorApurado): boolean {
  if (indicador.bloco !== "CAMPANHAS" || indicador.resultado.estado !== "DISPONIVEL") {
    return true;
  }
  return indicador.resultado.nivelAtribuicao !== undefined;
}

// ---------------------------------------------------------------------
// Faixa "Exige ação hoje" (ficha §2)
// ---------------------------------------------------------------------

export type ChaveAcaoHoje =
  | "APROVACOES_PENDENTES"
  | "CADASTROS_INCOMPLETOS"
  | "VIGENCIAS_A_VENCER"
  | "JANELAS_CONTRATUAIS"
  | "REAVALIACOES_VENCIDAS"
  | "IMPORTACOES_EM_QUARENTENA";

export interface DefinicaoAcaoHoje {
  chave: ChaveAcaoHoje;
  rotulo: string;
  /** Rota de origem — o cartão é clicável e leva ao lugar de resolver. */
  destino: string;
  fonte: string;
}

/** As seis pendências da ficha §2, na ordem em que ela as lista. */
export const CATALOGO_ACAO_HOJE: ReadonlyArray<DefinicaoAcaoHoje> = [
  {
    chave: "APROVACOES_PENDENTES",
    rotulo: "Aprovações pendentes",
    destino: "/aprovacoes",
    fonte: "ficha-onda1 §5 (motor de aprovação)",
  },
  {
    chave: "CADASTROS_INCOMPLETOS",
    rotulo: "Cadastros incompletos bloqueando publicação",
    destino: "/aliados?completude=incompletos",
    fonte: "ficha-onda1 RN09",
  },
  {
    chave: "VIGENCIAS_A_VENCER",
    rotulo: "Vigências de oferta a vencer",
    destino: "/ofertas?vigencia=a-vencer",
    fonte: "ficha-onda1 RN03 · régua do Parametrizador",
  },
  {
    chave: "JANELAS_CONTRATUAIS",
    rotulo: "Janelas contratuais de não-renovação",
    destino: "/aliados?contrato=janela",
    fonte: "ficha-onda1 §3.1",
  },
  {
    chave: "REAVALIACOES_VENCIDAS",
    rotulo: "Reavaliações vencidas",
    destino: "/mercado?reavaliacao=vencida",
    fonte: "ficha-onda2 RN21",
  },
  {
    chave: "IMPORTACOES_EM_QUARENTENA",
    rotulo: "Importações com linhas em quarentena",
    destino: "/assinantes/importacoes",
    fonte: "ficha-onda5 §6 · ficha-onda1 §7",
  },
];

export interface PendenciaApurada extends DefinicaoAcaoHoje {
  contagem: number;
}

/** Estado positivo explícito: a faixa zerada não some, ela afirma. */
export const FAIXA_SEM_PENDENCIA =
  "Nada exige ação hoje. Todas as filas estão em dia.";

export function faixaEstaZerada(pendencias: ReadonlyArray<PendenciaApurada>): boolean {
  return pendencias.every((p) => p.contagem === 0);
}
