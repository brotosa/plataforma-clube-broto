import type { NaturezaOferta, StatusOferta } from "@prisma/client";
import type { MecanicaSlug } from "@/dominio/ofertas/regras";

/**
 * Exportação de catálogo Broto → operadora (ficha §6), como domínio puro.
 *
 * O **layout real da Minutrade e o meio de entrega são [A CONFIRMAR]**: por
 * isso o pacote tem um formato CANÔNICO neutro e a serialização fica atrás da
 * porta `ExportAdapter`. A implementação inicial é o `GenericJsonCsvAdapter`
 * (JSON + CSV genéricos). Quando o layout Minutrade chegar, um novo adapter o
 * implementa **sem tocar no domínio nem no pacote canônico**.
 */

/** Cada publicação envia o item para publicar ou para retirar do catálogo. */
export type AcaoPublicacao = "PUBLICAR" | "DESPUBLICAR";

/** Item do pacote canônico. Formato neutro; o adapter traduz para o destino. */
export interface ItemPublicavel {
  acao: AcaoPublicacao;
  idOferta: string;
  idExternoMinutrade: string | null;
  aliado: string;
  idSellerExterno: string | null;
  solucao: string;
  categoria: string | null;
  titulo: string;
  natureza: NaturezaOferta;
  tipoBeneficio: string;
  mecanica: MecanicaSlug;
  precoDe: number | null;
  precoPor: number | null;
  cupomCodigoRegras: string | null;
  /** Datas em ISO (yyyy-mm-dd) — o adapter formata conforme o destino. */
  vigenciaInicio: string;
  vigenciaFim: string | null;
  status: StatusOferta;
}

export interface PacoteExport {
  /** ISO 8601; injetado pela camada de aplicação (o domínio não lê o relógio). */
  geradoEm: string;
  itens: ItemPublicavel[];
}

export interface ArquivoExportado {
  nomeArquivo: string;
  tipoConteudo: string;
  conteudo: string;
}

/** Porta de serialização do pacote para o layout de destino. */
export interface ExportAdapter {
  readonly nome: string;
  serializar(pacote: PacoteExport): ArquivoExportado[];
}

// ---------------------------------------------------------------------
// Diff entre publicações (RN10) — puro
// ---------------------------------------------------------------------

export interface DiffPublicacao {
  adicionadas: string[];
  alteradas: string[];
  removidas: string[];
}

/** Chave de conteúdo publicável (ignora `acao` e `idOferta`). */
function chaveConteudo(item: ItemPublicavel): string {
  return JSON.stringify([
    item.idExternoMinutrade,
    item.aliado,
    item.idSellerExterno,
    item.solucao,
    item.categoria,
    item.titulo,
    item.natureza,
    item.tipoBeneficio,
    item.mecanica,
    item.precoDe,
    item.precoPor,
    item.cupomCodigoRegras,
    item.vigenciaInicio,
    item.vigenciaFim,
    item.status,
  ]);
}

/** Mapa idOferta → conteúdo, apenas dos itens PUBLICAR do pacote. */
function conteudoPublicado(pacote: PacoteExport | null): Map<string, string> {
  return new Map(
    (pacote?.itens ?? [])
      .filter((item) => item.acao === "PUBLICAR")
      .map((item) => [item.idOferta, chaveConteudo(item)] as const),
  );
}

/**
 * Diff dos itens publicados em relação à publicação anterior (RN10): quais
 * ofertas entraram, quais mudaram de conteúdo e quais saíram (que viram
 * despublicações em cascata no pacote — RN04, montado na camada de aplicação).
 */
export function calcularDiffPublicacao(
  anterior: PacoteExport | null,
  atual: PacoteExport,
): DiffPublicacao {
  const antes = conteudoPublicado(anterior);
  const agora = conteudoPublicado(atual);
  const adicionadas = [...agora.keys()].filter((id) => !antes.has(id));
  const removidas = [...antes.keys()].filter((id) => !agora.has(id));
  const alteradas = [...agora.keys()].filter(
    (id) => antes.has(id) && antes.get(id) !== agora.get(id),
  );
  return { adicionadas, alteradas, removidas };
}

// ---------------------------------------------------------------------
// GenericJsonCsvAdapter — implementação inicial (até o layout Minutrade)
// ---------------------------------------------------------------------

/** Escapa um campo para CSV com separador `;` (convenção pt-BR). */
function campoCsv(valor: string): string {
  return /[";\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

function valorMonetario(valor: number | null): string {
  return valor === null ? "" : valor.toFixed(2);
}

/** Colunas do CSV genérico, em ordem estável. */
const COLUNAS_CSV: ReadonlyArray<readonly [string, (item: ItemPublicavel) => string]> = [
  ["acao", (item) => item.acao],
  ["id_oferta", (item) => item.idOferta],
  ["id_externo_minutrade", (item) => item.idExternoMinutrade ?? ""],
  ["aliado", (item) => item.aliado],
  ["id_seller_externo", (item) => item.idSellerExterno ?? ""],
  ["solucao", (item) => item.solucao],
  ["categoria", (item) => item.categoria ?? ""],
  ["titulo", (item) => item.titulo],
  ["natureza", (item) => item.natureza],
  ["tipo_beneficio", (item) => item.tipoBeneficio],
  ["mecanica", (item) => item.mecanica],
  ["preco_de", (item) => valorMonetario(item.precoDe)],
  ["preco_por", (item) => valorMonetario(item.precoPor)],
  ["cupom_codigo_regras", (item) => item.cupomCodigoRegras ?? ""],
  ["vigencia_inicio", (item) => item.vigenciaInicio],
  ["vigencia_fim", (item) => item.vigenciaFim ?? ""],
  ["status", (item) => item.status],
];

export const NOME_ADAPTER_GENERICO = "GenericJsonCsvAdapter";

/**
 * Adapter genérico JSON + CSV. Placeholder até o layout Minutrade [A CONFIRMAR]:
 * entrega o pacote canônico como JSON e como CSV (separador `;`).
 */
export class GenericJsonCsvAdapter implements ExportAdapter {
  readonly nome = NOME_ADAPTER_GENERICO;

  serializar(pacote: PacoteExport): ArquivoExportado[] {
    const carimbo = pacote.geradoEm.slice(0, 10).replace(/-/g, "");
    const cabecalho = COLUNAS_CSV.map(([nome]) => nome).join(";");
    const linhas = pacote.itens.map((item) =>
      COLUNAS_CSV.map(([, extrair]) => campoCsv(extrair(item))).join(";"),
    );
    const csv = [cabecalho, ...linhas].join("\r\n");
    return [
      {
        nomeArquivo: `catalogo_broto_${carimbo}.json`,
        tipoConteudo: "application/json",
        conteudo: JSON.stringify(pacote, null, 2),
      },
      {
        nomeArquivo: `catalogo_broto_${carimbo}.csv`,
        tipoConteudo: "text/csv",
        conteudo: csv,
      },
    ];
  }
}
