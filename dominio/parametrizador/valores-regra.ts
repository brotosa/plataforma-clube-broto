import type { TipoValorRegra } from "@prisma/client";

/**
 * Catálogo dos valores de regra do Parametrizador (Onda 3, ficha §3.2).
 *
 * É a única lista que o produto conhece: o seed grava exatamente estas
 * linhas, a T17 as agrupa e o Serviço de Configuração as lê. O código de
 * negócio referencia a CHAVE — nunca o número —, e é isso que faz uma
 * régua alterada valer sem deploy.
 *
 * Os valores iniciais não são escolhas deste módulo: são as réguas já
 * vigentes nas Ondas 1 e 2 e as decisões de negócio de 24/07 registradas
 * na ficha §3.2. Onde o negócio não fechou (tetos do dossiê, ficha §8),
 * o valor inicial é NULO — pendência declarada, não número plausível.
 */

export type ChaveValorRegra =
  | "FUNIL_ENVELHECIMENTO_LEVE_DIAS"
  | "FUNIL_ENVELHECIMENTO_FORTE_DIAS"
  | "OFERTA_SEM_RESGATE_DIAS"
  | "OFERTA_VIGENCIA_A_VENCER_DIAS"
  | "REAVALIACAO_MESES"
  | "COMISSAO_PADRAO_PCT"
  | "DOSSIE_TETO_MENSAL_BRL"
  | "DOSSIE_CUSTO_MAXIMO_UNITARIO_BRL";

/** Agrupamento visual da T17 (protótipo v6.1: três cartões + metas). */
export type GrupoValorRegra = "REGUAS" | "COMISSAO" | "TETOS_DOSSIE";

export interface DefinicaoValorRegra {
  chave: ChaveValorRegra;
  grupo: GrupoValorRegra;
  rotulo: string;
  /** "Onde isto aparece" — texto exibido sob o rótulo na T17. */
  descricao: string;
  tipo: TipoValorRegra;
  /** NULO = nunca definido; a UI mostra o campo vazio com a pendência. */
  valorInicial: number | null;
  /** RN27 — pertence à família sensível. */
  sensivel: boolean;
  ordem: number;
}

export const CATALOGO_VALORES_REGRA: ReadonlyArray<DefinicaoValorRegra> = [
  {
    chave: "FUNIL_ENVELHECIMENTO_LEVE_DIAS",
    grupo: "REGUAS",
    rotulo: "Envelhecimento do funil — grau leve",
    descricao: "Card do funil ganha marcação leve",
    tipo: "DIAS",
    valorInicial: 14,
    sensivel: false,
    ordem: 1,
  },
  {
    chave: "FUNIL_ENVELHECIMENTO_FORTE_DIAS",
    grupo: "REGUAS",
    rotulo: "Envelhecimento do funil — grau forte",
    descricao: "Card do funil ganha marcação forte",
    tipo: "DIAS",
    valorInicial: 30,
    sensivel: false,
    ordem: 2,
  },
  {
    chave: "OFERTA_SEM_RESGATE_DIAS",
    grupo: "REGUAS",
    rotulo: "Oferta sem resgate",
    descricao: "Alerta na lista de ofertas e no card do aliado",
    tipo: "DIAS",
    valorInicial: 90,
    sensivel: false,
    ordem: 3,
  },
  {
    chave: "OFERTA_VIGENCIA_A_VENCER_DIAS",
    grupo: "REGUAS",
    rotulo: "Vigência a vencer",
    descricao: "Alerta de vigência na vitrine e no sino",
    tipo: "DIAS",
    valorInicial: 15,
    sensivel: false,
    ordem: 4,
  },
  {
    chave: "REAVALIACAO_MESES",
    grupo: "REGUAS",
    rotulo: "Alerta de reavaliação",
    descricao: "Empresa avaliada volta à fila do scout",
    tipo: "MESES",
    valorInicial: 12,
    sensivel: false,
    ordem: 5,
  },
  {
    // Confirmada como padrão em 24/07 (ficha §3.2). Não confundir com a
    // regra de comissão do Cupom de desconto, que segue pendente desde a
    // Onda 1 em dominio/receita/comissao.ts (COMISSAO_CUPOM).
    chave: "COMISSAO_PADRAO_PCT",
    grupo: "COMISSAO",
    rotulo: "Comissão-padrão",
    descricao: "Aplicada às ofertas pagas · padrão do contrato-modelo",
    tipo: "PERCENTUAL",
    valorInicial: 5,
    sensivel: true,
    ordem: 6,
  },
  {
    // Ficha §8: [A CONFIRMAR] pela TI. Nasce sem valor de propósito.
    chave: "DOSSIE_TETO_MENSAL_BRL",
    grupo: "TETOS_DOSSIE",
    rotulo: "Teto mensal",
    descricao: "Ao atingir, a geração pausa e avisa o Administrador",
    tipo: "MONETARIO",
    valorInicial: null,
    sensivel: true,
    ordem: 7,
  },
  {
    chave: "DOSSIE_CUSTO_MAXIMO_UNITARIO_BRL",
    grupo: "TETOS_DOSSIE",
    rotulo: "Custo máximo por dossiê",
    descricao: "Limite de custo de uma geração individual",
    tipo: "MONETARIO",
    valorInicial: null,
    sensivel: true,
    ordem: 8,
  },
];

const POR_CHAVE: ReadonlyMap<ChaveValorRegra, DefinicaoValorRegra> = new Map(
  CATALOGO_VALORES_REGRA.map((d) => [d.chave, d]),
);

export function definicaoDe(chave: ChaveValorRegra): DefinicaoValorRegra {
  const definicao = POR_CHAVE.get(chave);
  if (!definicao) {
    throw new Error(`Chave de valor de regra desconhecida: ${chave}.`);
  }
  return definicao;
}

/** Unidade exibida ao lado do campo na T17. */
export const UNIDADE_POR_TIPO: Readonly<Record<TipoValorRegra, string>> = {
  DIAS: "dias",
  MESES: "meses",
  PERCENTUAL: "%",
  MONETARIO: "R$",
};

/**
 * Validação por natureza do valor. Réguas são contagens inteiras e
 * positivas — zero dia de envelhecimento não é régua, é ruído; percentual
 * vive entre 0 e 100; valor monetário não é negativo.
 * Retorna a lista de erros — vazia quando o valor é aceitável.
 */
export function validarValorRegra(
  chave: ChaveValorRegra,
  valor: number | null,
): string[] {
  const definicao = definicaoDe(chave);
  if (valor === null) {
    return [];
  }
  if (!Number.isFinite(valor)) {
    return [`${definicao.rotulo}: informe um número.`];
  }
  switch (definicao.tipo) {
    case "DIAS":
    case "MESES": {
      if (!Number.isInteger(valor) || valor < 1) {
        return [
          `${definicao.rotulo}: a régua é uma contagem inteira de ${UNIDADE_POR_TIPO[definicao.tipo]} a partir de 1.`,
        ];
      }
      return [];
    }
    case "PERCENTUAL": {
      if (valor < 0 || valor > 100) {
        return [`${definicao.rotulo}: o percentual vai de 0 a 100.`];
      }
      return [];
    }
    case "MONETARIO": {
      if (valor < 0) {
        return [`${definicao.rotulo}: valor em reais não pode ser negativo.`];
      }
      return [];
    }
  }
}

/**
 * Coerência entre as duas pontas da régua de envelhecimento: o grau forte
 * vem depois do leve. É a única relação entre valores de regra — as demais
 * são independentes entre si.
 */
export function validarCoerenciaDasReguas(
  valores: Partial<Record<ChaveValorRegra, number | null>>,
): string[] {
  const leve = valores.FUNIL_ENVELHECIMENTO_LEVE_DIAS;
  const forte = valores.FUNIL_ENVELHECIMENTO_FORTE_DIAS;
  if (
    typeof leve === "number" &&
    typeof forte === "number" &&
    forte <= leve
  ) {
    return [
      "O grau forte do envelhecimento precisa ser maior que o leve — o alerta forte vem depois do leve, nunca antes.",
    ];
  }
  return [];
}
