import type { NaturezaOferta, StatusOferta } from "@prisma/client";
import type { MecanicaSlug } from "@/dominio/ofertas/regras";

/**
 * Mapeamento da carga inicial (ficha §7) — funções puras.
 *
 * | Origem (planilha)            | Destino (modelo)                        |
 * |------------------------------|-----------------------------------------|
 * | "Seller"                     | nome de exibição                        |
 * | "Data de Entrada do Seller"  | data de entrada                         |
 * | "Id do Seller"               | id_externo_minutrade                    |
 * | "Produto"                    | nome da solução e título da oferta      |
 * | "CheckOut"                   | mecânica + natureza                     |
 * | "Preço/Desconto/Preço Final" | preço de / benefício / preço por        |
 * | "Status da Oferta"           | Ativa → Publicada; Inativa → Encerrada  |
 * | "Resgates"/"Compras"         | telemetria inicial (acumulado)          |
 */

/** Normaliza texto da planilha: apara e colapsa espaços internos. */
export function normalizarTexto(valor: unknown): string {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Heurística de agrupamento produto→solução: mesmo seller + mesmo texto
 * de produto (normalizado) = mesma solução. Revisável na conferência.
 */
export function chaveAgrupamento(idSellerExterno: string, produto: string): string {
  return `${normalizarTexto(idSellerExterno)}::${normalizarTexto(produto)}`;
}

export interface MapeamentoCheckout {
  mecanicaSlug: MecanicaSlug;
  natureza: NaturezaOferta;
}

/**
 * "CheckOut" → mecânica + natureza: checkout no clube/externo → Benefício;
 * recompensa gratuita → Recompensa. Valor desconhecido → null (quarentena).
 */
export function mapearCheckout(checkout: string): MapeamentoCheckout | null {
  const texto = normalizarTexto(checkout).toLowerCase();
  if (texto === "checkout no clube") {
    return { mecanicaSlug: "CHECKOUT_CLUBE", natureza: "BENEFICIO" };
  }
  if (texto === "checkout externo") {
    return { mecanicaSlug: "CHECKOUT_EXTERNO", natureza: "BENEFICIO" };
  }
  if (texto === "recompensa gratuita") {
    return { mecanicaSlug: "RECOMPENSA_GRATUITA", natureza: "RECOMPENSA" };
  }
  return null;
}

/** "Status da Oferta": Ativa → Publicada; Inativa → Encerrada. */
export function mapearStatusOferta(status: string): StatusOferta | null {
  const texto = normalizarTexto(status).toLowerCase();
  if (texto === "oferta ativa" || texto === "ativa") {
    return "PUBLICADA";
  }
  if (texto === "oferta inativa" || texto === "inativa") {
    return "ENCERRADA";
  }
  return null;
}

export interface PrecosInferidos {
  tipoBeneficioSlug: "GRATUIDADE" | "VALOR_FIXO" | "CONDICAO_ESPECIAL";
  precoDe: number | null;
  precoPor: number | null;
}

/**
 * Tipo de benefício inferido dos números (ficha §7: "Tipo inferido; preço
 * final 0 + recompensa → gratuidade"):
 * - Recompensa → GRATUIDADE com preços zerados (definição contratual —
 *   os valores originais da planilha permanecem no staging para consulta);
 * - Benefício com desconto informado → VALOR_FIXO (desconto em R$), com
 *   preço de/por da planilha;
 * - Benefício sem números (zeros) → CONDICAO_ESPECIAL com preços
 *   pendentes — o benefício real está descrito no título (ex.: "15% de
 *   desconto…"); nada é inventado a partir do texto.
 */
export function inferirPrecos(parametros: {
  natureza: NaturezaOferta;
  preco: number;
  desconto: number;
  precoFinal: number;
}): PrecosInferidos {
  const { natureza, preco, desconto, precoFinal } = parametros;
  if (natureza === "RECOMPENSA") {
    return { tipoBeneficioSlug: "GRATUIDADE", precoDe: null, precoPor: null };
  }
  if (desconto > 0) {
    return {
      tipoBeneficioSlug: "VALOR_FIXO",
      precoDe: preco > 0 ? preco : null,
      precoPor: precoFinal,
    };
  }
  return {
    tipoBeneficioSlug: "CONDICAO_ESPECIAL",
    precoDe: preco > 0 ? preco : null,
    precoPor: precoFinal > 0 ? precoFinal : null,
  };
}

/** Linha crua da planilha de sellers, após leitura por nome de coluna. */
export interface LinhaSeller {
  linha: number;
  idSellerExterno: string;
  nomeSeller: string;
  dataEntrada: Date | null;
}

/** Valida a linha do seller; retorna motivos de quarentena (vazio = ok). */
export function validarLinhaSeller(linha: LinhaSeller): string[] {
  const motivos: string[] = [];
  if (!linha.idSellerExterno) {
    motivos.push('"Id do Seller" ausente');
  }
  if (!linha.nomeSeller) {
    motivos.push('"Seller" (nome de exibição) ausente');
  }
  return motivos;
}

/** Linha crua da planilha de ofertas, após leitura por nome de coluna. */
export interface LinhaOferta {
  linha: number;
  idSellerExterno: string;
  nomeSeller: string;
  idOfertaExterno: string;
  statusOferta: string;
  produto: string;
  checkout: string;
  preco: number;
  desconto: number;
  precoFinal: number;
  dataOferta: Date | null;
  resgates: number;
  compras: number;
}

/** Valida a linha da oferta; retorna motivos de quarentena (vazio = ok). */
export function validarLinhaOferta(
  linha: LinhaOferta,
  idsSellersConhecidos: ReadonlySet<string>,
): string[] {
  const motivos: string[] = [];
  if (!linha.idSellerExterno) {
    motivos.push('"Id do Seller" ausente');
  } else if (!idsSellersConhecidos.has(linha.idSellerExterno)) {
    motivos.push('"Id do Seller" não consta na Lista de Sellers');
  }
  if (!linha.produto) {
    motivos.push('"Produto" ausente');
  }
  if (!mapearCheckout(linha.checkout)) {
    motivos.push(`"CheckOut" desconhecido: "${linha.checkout}"`);
  }
  if (!mapearStatusOferta(linha.statusOferta)) {
    motivos.push(`"Status da Oferta" desconhecido: "${linha.statusOferta}"`);
  }
  if (!linha.dataOferta) {
    motivos.push('"Data da Oferta" ausente (vira o início de vigência)');
  }
  return motivos;
}
