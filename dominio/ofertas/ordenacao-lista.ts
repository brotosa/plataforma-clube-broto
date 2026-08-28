/**
 * Ordenação e filtro por presença de telemetria da lista transversal de
 * ofertas (T4). Funções puras, testadas à parte da página: a T4 anota o
 * conjunto contido de ofertas com as cinco medidas de telemetria (que vivem
 * em outras tabelas — extrato nominal e contador de catálogo, nunca somados,
 * RN68) e ordena/filtra em memória.
 *
 * **Ausência não é zero (RN53).** O contador de catálogo distingue "nenhum
 * relatório importado" (`null`) de "importado, medido zero" (`0`). Na
 * ordenação, a ausência fica **sempre no fim**, independentemente da direção
 * — não vira o menor nem o maior valor por acaso. A vigência sem fim
 * (indeterminada) segue a mesma regra: sem data de término, ordena por
 * último.
 */

export const ORDENS_LISTA = [
  "titulo",
  "aliado",
  "natureza",
  "status",
  "emitidos",
  "resg-extrato",
  "compra-extrato",
  "resg-catalogo",
  "compra-catalogo",
  "vigencia",
] as const;
export type OrdemLista = (typeof ORDENS_LISTA)[number];

export type DirecaoLista = "asc" | "desc";

export const FILTROS_TELEMETRIA = [
  "com-emissao",
  "com-resg-extrato",
  "com-compra-extrato",
  "com-resg-catalogo",
  "com-compra-catalogo",
  "sem-telemetria",
] as const;
export type FiltroTelemetria = (typeof FILTROS_TELEMETRIA)[number];

/**
 * A projeção primitiva de uma oferta para ordenar/filtrar — só o que as
 * funções precisam, desacoplado do tipo do Prisma. Os rótulos (natureza,
 * status) já vêm resolvidos, para a ordenação seguir o texto que a tela
 * mostra, não o valor do enum.
 */
export interface LinhaOrdenavel {
  titulo: string;
  aliadoNome: string;
  naturezaRotulo: string;
  statusRotulo: string;
  emitidos: number;
  resgExtrato: number;
  comprasExtrato: number;
  /** `null` quando não há contador de catálogo importado — ausência ≠ zero. */
  resgCatalogo: number | null;
  comprasCatalogo: number | null;
  temCatalogo: boolean;
  /** Fim da vigência em epoch-ms; `null` quando indeterminada. */
  vigenciaFimMs: number | null;
  /** Recência da oferta, o desempate estável. */
  atualizadoEmMs: number;
}

/** Compara números tolerando ausência (`null`), que fica sempre por último. */
export function compararNumeroAusenteAoFim(
  a: number | null,
  b: number | null,
  fator: number,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * fator;
}

/** Uma oferta sem telemetria alguma: sem extrato e sem contador de catálogo. */
export function semTelemetria(linha: LinhaOrdenavel): boolean {
  return (
    linha.emitidos === 0 &&
    linha.resgExtrato === 0 &&
    linha.comprasExtrato === 0 &&
    !linha.temCatalogo
  );
}

/** A oferta passa no recorte de presença de telemetria escolhido. */
export function passaFiltroTelemetria(linha: LinhaOrdenavel, filtro: FiltroTelemetria): boolean {
  switch (filtro) {
    case "com-emissao":
      return linha.emitidos > 0;
    case "com-resg-extrato":
      return linha.resgExtrato > 0;
    case "com-compra-extrato":
      return linha.comprasExtrato > 0;
    case "com-resg-catalogo":
      return (linha.resgCatalogo ?? 0) > 0;
    case "com-compra-catalogo":
      return (linha.comprasCatalogo ?? 0) > 0;
    case "sem-telemetria":
      return semTelemetria(linha);
  }
}

/**
 * Comparador de duas linhas pela coluna e direção. NÃO aplica o desempate —
 * quem ordena a lista o faz por último (recência), para uma ordem estável.
 */
export function compararPorColuna(
  a: LinhaOrdenavel,
  b: LinhaOrdenavel,
  ordem: OrdemLista,
  direcao: DirecaoLista,
): number {
  const fator = direcao === "asc" ? 1 : -1;
  switch (ordem) {
    case "titulo":
      return a.titulo.localeCompare(b.titulo, "pt-BR") * fator;
    case "aliado":
      return a.aliadoNome.localeCompare(b.aliadoNome, "pt-BR") * fator;
    case "natureza":
      return a.naturezaRotulo.localeCompare(b.naturezaRotulo, "pt-BR") * fator;
    case "status":
      return a.statusRotulo.localeCompare(b.statusRotulo, "pt-BR") * fator;
    case "emitidos":
      return (a.emitidos - b.emitidos) * fator;
    case "resg-extrato":
      return (a.resgExtrato - b.resgExtrato) * fator;
    case "compra-extrato":
      return (a.comprasExtrato - b.comprasExtrato) * fator;
    case "resg-catalogo":
      return compararNumeroAusenteAoFim(a.resgCatalogo, b.resgCatalogo, fator);
    case "compra-catalogo":
      return compararNumeroAusenteAoFim(a.comprasCatalogo, b.comprasCatalogo, fator);
    case "vigencia":
      return compararNumeroAusenteAoFim(a.vigenciaFimMs, b.vigenciaFimMs, fator);
  }
}

/**
 * Ordena uma lista de linhas (ou de objetos que as contêm) por coluna e
 * direção, com desempate pela recência (mais recente primeiro). Não muta a
 * entrada. O `projetar` extrai a `LinhaOrdenavel` de cada item, para a página
 * poder ordenar os seus objetos ricos sem duplicar os campos.
 */
export function ordenarLista<T>(
  itens: ReadonlyArray<T>,
  projetar: (item: T) => LinhaOrdenavel,
  ordem: OrdemLista,
  direcao: DirecaoLista,
): T[] {
  return [...itens].sort((a, b) => {
    const la = projetar(a);
    const lb = projetar(b);
    return compararPorColuna(la, lb, ordem, direcao) || lb.atualizadoEmMs - la.atualizadoEmMs;
  });
}
