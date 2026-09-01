/**
 * Mapeamento da importação de listas de prospects (T9, ficha Onda 2 §7).
 * O layout real das listas existentes é [A CONFIRMAR]: nada aqui assume
 * colunas fixas — o parser lê qualquer cabeçalho e o destino de cada
 * coluna é CONFIGURAÇÃO escolhida no passo 2 (com sugestão automática),
 * gravada na importação. Funções puras, sem banco.
 */

import { normalizarCnpj } from "@/dominio/empresas/cnpj";

/** Destinos possíveis de uma coluna da lista. */
export const ALVOS_MAPEAMENTO = [
  "NOME",
  "SITE",
  "CNPJ",
  "CATEGORIA",
  "IGNORAR",
] as const;
export type AlvoMapeamento = (typeof ALVOS_MAPEAMENTO)[number];

export const ROTULOS_ALVO: Readonly<Record<AlvoMapeamento, string>> = {
  NOME: "Nome de exibição",
  SITE: "Site",
  CNPJ: "CNPJ",
  CATEGORIA: "Categoria-alvo",
  IGNORAR: "ignorar",
};

/** Coluna da lista → destino. A chave é o cabeçalho original. */
export type MapeamentoColunas = Record<string, AlvoMapeamento>;

/** Normalização de comparação: minúsculas, sem acento, espaços colapsados. */
export function normalizarComparavel(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave de deduplicação por CNPJ — sem máscara e em maiúsculas. Usa o
 * normalizador do domínio porque o CNPJ pode ser **alfanumérico** (IN RFB
 * nº 2.229/2024): remover as letras (o antigo "só dígitos") colapsaria CNPJs
 * distintos na mesma chave e casaria duplicatas que não existem.
 */
export function chaveCnpj(valor: unknown): string {
  return normalizarCnpj(String(valor ?? ""));
}

/**
 * Sugestão automática de mapeamento a partir dos cabeçalhos — apenas um
 * ponto de partida: a decisão final é da pessoa no passo 2.
 */
export function sugerirMapeamento(cabecalhos: string[]): MapeamentoColunas {
  const sugestao: MapeamentoColunas = {};
  let nomeJaSugerido = false;
  for (const cabecalho of cabecalhos) {
    const chave = normalizarComparavel(cabecalho);
    let alvo: AlvoMapeamento = "IGNORAR";
    if (!nomeJaSugerido && /\b(empresa|nome|razao social|fantasia|prospect)\b/.test(chave)) {
      alvo = "NOME";
      nomeJaSugerido = true;
    } else if (/\b(site|url|website|pagina|link)\b/.test(chave)) {
      alvo = "SITE";
    } else if (/\bcnpj\b/.test(chave)) {
      alvo = "CNPJ";
    } else if (/\b(categoria|segmento|setor|vertical)\b/.test(chave)) {
      alvo = "CATEGORIA";
    }
    sugestao[cabecalho] = alvo;
  }
  return sugestao;
}

/**
 * Valida a configuração: exatamente uma coluna mapeada para NOME (sem
 * nome não há empresa) e no máximo uma para cada destino exclusivo.
 */
export function validarMapeamento(mapeamento: MapeamentoColunas): string[] {
  const erros: string[] = [];
  const porAlvo = new Map<AlvoMapeamento, number>();
  for (const alvo of Object.values(mapeamento)) {
    porAlvo.set(alvo, (porAlvo.get(alvo) ?? 0) + 1);
  }
  if ((porAlvo.get("NOME") ?? 0) !== 1) {
    erros.push("Mapeie exatamente uma coluna para Nome de exibição.");
  }
  for (const alvo of ["SITE", "CNPJ", "CATEGORIA"] as const) {
    if ((porAlvo.get(alvo) ?? 0) > 1) {
      erros.push(`Mapeie no máximo uma coluna para ${ROTULOS_ALVO[alvo]}.`);
    }
  }
  return erros;
}

/**
 * Separa o texto de categoria da lista em candidatos (as listas reais
 * podem trazer múltiplas, separadas por ; , / ou |). O casamento com a
 * taxonomia da vitrine é por igualdade normalizada — sem adivinhação.
 */
export function separarCategorias(texto: string | null): string[] {
  if (!texto?.trim()) return [];
  return texto
    .split(/[;,/|]/)
    .map((parte) => parte.trim())
    .filter(Boolean);
}

export interface CamposProspect {
  nomeFantasia: string | null;
  site: string | null;
  cnpj: string | null;
  categoriasTexto: string | null;
}

/** Aplica o mapeamento a uma linha crua (chaveada pelo cabeçalho). */
export function extrairCampos(
  linha: Record<string, unknown>,
  mapeamento: MapeamentoColunas,
): CamposProspect {
  const campos: CamposProspect = {
    nomeFantasia: null,
    site: null,
    cnpj: null,
    categoriasTexto: null,
  };
  for (const [cabecalho, alvo] of Object.entries(mapeamento)) {
    const bruto = String(linha[cabecalho] ?? "").trim();
    if (!bruto || alvo === "IGNORAR") continue;
    if (alvo === "NOME") campos.nomeFantasia = bruto;
    if (alvo === "SITE") campos.site = bruto;
    if (alvo === "CNPJ") campos.cnpj = bruto;
    if (alvo === "CATEGORIA") campos.categoriasTexto = bruto;
  }
  return campos;
}
