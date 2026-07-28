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
 * Os três valores observados na coluna, normalizados.
 *
 * `Checkout no clube` e `Checkout externo` são compra: os dois passam por
 * um checkout, e a diferença entre eles é **onde** ele acontece — dentro
 * da vitrine ou no site do aliado —, não se houve pagamento.
 * `Recompensa gratuita` é resgate: preço zero, sem checkout.
 *
 * O catálogo de ofertas corrobora: a coluna `CheckOut` de
 * `dados/Lista_de_Ofertas_3.xlsx` traz "Checkout externo" e "Recompensa
 * gratuita" com o mesmo sentido.
 */
const CLASSE_POR_VALOR: Readonly<Record<string, ClasseDeEvento>> = {
  "recompensa gratuita": "RESGATE",
  "checkout no clube": "COMPRA",
  "checkout externo": "COMPRA",
};

/**
 * Classifica um valor da coluna `Tipo de Oferta`.
 *
 * Casa por valor inteiro normalizado, e **não por substring**: "checkout"
 * aparece em dois dos três, e um `includes` faria qualquer variação futura
 * cair em compra sem ninguém decidir isso.
 */
export function classificarEvento(tipoOferta: string | null): ClasseDeEvento {
  if (!tipoOferta) return "NAO_CLASSIFICADO";
  return CLASSE_POR_VALOR[normalizarNomeDeColuna(tipoOferta)] ?? "NAO_CLASSIFICADO";
}

/** Os valores conhecidos, para a tela poder dizer o que ela reconhece. */
export const VALORES_CONHECIDOS_DE_TIPO_DE_OFERTA = Object.freeze([
  "Recompensa gratuita",
  "Checkout no clube",
  "Checkout externo",
]);
