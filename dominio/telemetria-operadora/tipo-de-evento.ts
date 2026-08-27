import { normalizarNomeDeColuna } from "./layouts";

/**
 * O de-para da coluna `Tipo de Oferta` do extrato nominal — o que separa
 * **resgate** de **compra** dentro do mesmo relatório.
 *
 * **Por que isto existe, e por que não existia antes.** A ficha §3 enumera
 * "tipo de oferta" como campo do evento e não diz quais são os valores; a
 * F20 nasceu, por isso, tratando `Compras` como card sem fonte nominal — o
 * raciocínio estava certo sobre o que a especificação documentava, e a
 * especificação é que estava incompleta. A coluna traz **três** valores:
 * `Recompensa gratuita`, `Checkout no clube` e `Checkout externo`. Com
 * eles, compra e resgate vivem os dois no extrato, e os dois são
 * atribuíveis a patrocinador por CPF, pela mesma consulta.
 *
 * **A RN68 não se aplica aqui.** Ela prende o contador de CATÁLOGO, que é
 * por oferta e não se atribui a patrocinador. O evento nominal é a outra
 * contagem — a que tem CPF —, e é justamente por ter CPF que ela chega ao
 * patrocinador. Confundir as duas foi o erro que esta correção desfaz.
 *
 * **`[A CONFIRMAR — Minutrade]` — é o item 4 da requisição de 27/07.** Os
 * três valores foram observados na coluna, mas o dicionário que diz o que
 * cada um significa na contagem da operadora ainda não veio. Duas
 * consequências desenhadas de propósito:
 *
 * 1. a classificação acontece na **leitura**, não na importação: o
 *    `tipoOferta` é gravado como veio, então corrigir o de-para quando o
 *    dicionário chegar é editar este arquivo — sem reimportar nada;
 * 2. valor desconhecido não vira compra nem resgate. Ele é **contado à
 *    parte e declarado na tela** (RN53), porque encaixá-lo no palpite mais
 *    provável inventaria dado de negócio.
 */

export type ClasseDeEvento = "RESGATE" | "COMPRA" | "NAO_CLASSIFICADO";

/**
 * Os valores observados na coluna, normalizados.
 *
 * **Decisão do Administrador da Plataforma (28/08): checkout é modalidade
 * de resgate.** Até aqui `Checkout no clube` e `Checkout externo` eram
 * tratados como compra; a operação esclareceu que, no modelo do Clube, o
 * checkout (dentro da vitrine ou no site do aliado) é a forma como o membro
 * **resgata** o benefício — não uma categoria à parte. Os três valores
 * passam a ser RESGATE, e a diferença entre eles vira **modalidade**
 * (`modalidadeDeResgate`), preservada para não perder COMO foi resgatado.
 * `Recompensa gratuita`/`emissao_voucher` são a modalidade "gratuito".
 *
 * Segue `[A CONFIRMAR — Minutrade]` (item 4 da requisição de 27/07): se o
 * dicionário da operadora disser outra coisa, é este arquivo que muda —
 * sem reimportar nada, porque o `tipoOferta` é gravado como veio.
 */
const CLASSE_POR_VALOR: Readonly<Record<string, ClasseDeEvento>> = {
  "recompensa gratuita": "RESGATE",
  "checkout no clube": "RESGATE",
  "checkout externo": "RESGATE",
  emissao_voucher: "RESGATE",
  "emissao de voucher": "RESGATE",
  "emissao voucher": "RESGATE",
};

/** As modalidades de resgate — o "como" que a decisão de 28/08 preserva. */
export type ModalidadeDeResgate = "GRATUITO" | "CHECKOUT_CLUBE" | "CHECKOUT_EXTERNO";

const MODALIDADE_POR_VALOR: Readonly<Record<string, ModalidadeDeResgate>> = {
  "recompensa gratuita": "GRATUITO",
  emissao_voucher: "GRATUITO",
  "emissao de voucher": "GRATUITO",
  "emissao voucher": "GRATUITO",
  "checkout no clube": "CHECKOUT_CLUBE",
  "checkout externo": "CHECKOUT_EXTERNO",
};

/** Rótulos humanos das modalidades, na ordem em que a tela as exibe. */
export const ROTULO_MODALIDADE: Readonly<Record<ModalidadeDeResgate, string>> = {
  GRATUITO: "Gratuito",
  CHECKOUT_CLUBE: "Checkout no clube",
  CHECKOUT_EXTERNO: "Checkout externo",
};
export const MODALIDADES_DE_RESGATE: ReadonlyArray<ModalidadeDeResgate> = [
  "GRATUITO",
  "CHECKOUT_CLUBE",
  "CHECKOUT_EXTERNO",
];

/**
 * Classifica um valor da coluna `Tipo de Oferta`.
 *
 * Casa por valor inteiro normalizado, e **não por substring**: "checkout"
 * aparece em dois valores, e um `includes` faria qualquer variação futura
 * ser classificada sem ninguém decidir isso.
 */
export function classificarEvento(tipoOferta: string | null): ClasseDeEvento {
  if (!tipoOferta) return "NAO_CLASSIFICADO";
  return CLASSE_POR_VALOR[normalizarNomeDeColuna(tipoOferta)] ?? "NAO_CLASSIFICADO";
}

/**
 * A modalidade de resgate de um evento (o "como"). `null` quando o valor
 * não é reconhecido — aí o evento é não classificado, contado à parte
 * (RN53), nunca encaixado no palpite mais provável.
 */
export function modalidadeDeResgate(tipoOferta: string | null): ModalidadeDeResgate | null {
  if (!tipoOferta) return null;
  return MODALIDADE_POR_VALOR[normalizarNomeDeColuna(tipoOferta)] ?? null;
}

/** Os valores conhecidos, para a tela poder dizer o que ela reconhece. */
export const VALORES_CONHECIDOS_DE_TIPO_DE_OFERTA = Object.freeze([
  "Recompensa gratuita",
  "emissao_voucher",
  "Checkout no clube",
  "Checkout externo",
]);
