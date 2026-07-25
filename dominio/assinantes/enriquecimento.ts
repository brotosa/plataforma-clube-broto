/**
 * RN35 — enriquecimento: importação própria, casando por CPF, com
 * proveniência por atributo (fonte e data). Nunca sobrescreve o núcleo:
 * quando uma coluna do arquivo de enriquecimento aponta para um campo do
 * núcleo e o valor difere, a divergência é registrada no resumo da carga
 * e o núcleo permanece intacto.
 *
 * Os atributos e a fonte reais são [A CONFIRMAR] (ficha §10): por isso o
 * modelo é EAV com catálogo — cada cabeçalho novo vira um atributo do
 * catálogo, e o construtor de segmentos só enxerga o que está lá (RN33).
 */

import { validarCpf } from "./cpf";
import { CAMPOS_NUCLEO, type CampoNucleo } from "./importacao";

/** Slug estável de atributo a partir do cabeçalho da coluna. */
export function slugificarAtributo(cabecalho: string): string {
  return cabecalho
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Linha de enriquecimento após o de/para (CPF + pares atributo→valor). */
export interface LinhaEnriquecimento {
  linha: number;
  cpf: string;
  /** slug do atributo → valor textual como veio do arquivo. */
  atributos: Record<string, string>;
}

/** RN31 vale para as duas famílias: quarentena com motivo, linha a linha. */
export function validarLinhaEnriquecimento(linha: LinhaEnriquecimento): string[] {
  const motivos: string[] = [];
  if (!linha.cpf.trim()) {
    motivos.push("CPF ausente.");
  } else if (!validarCpf(linha.cpf)) {
    motivos.push("CPF inválido: dígito verificador não confere (RN30).");
  }
  const comValor = Object.values(linha.atributos).filter((valor) => valor.trim());
  if (comValor.length === 0) {
    motivos.push("Nenhum atributo com valor na linha.");
  }
  return motivos;
}

/** Divergência entre arquivo de enriquecimento e núcleo (RN35). */
export interface DivergenciaNucleo {
  linha: number;
  campo: CampoNucleo;
  valorNucleo: string | null;
  valorArquivo: string;
}

const CAMPOS_NUCLEO_SET: ReadonlySet<string> = new Set(CAMPOS_NUCLEO);

/**
 * Separa, de uma linha casada com um assinante, o que vira atributo EAV
 * do que colide com o núcleo:
 *
 * - slug que NÃO é campo do núcleo → atributo a gravar (com proveniência);
 * - slug de campo do núcleo com valor IGUAL → ignorado (nada a fazer);
 * - slug de campo do núcleo com valor DIFERENTE → divergência registrada,
 *   núcleo intacto, valor do arquivo não entra em lugar nenhum.
 */
export function separarAtributosDeDivergencias(parametros: {
  linha: LinhaEnriquecimento;
  nucleoAtual: Partial<Record<CampoNucleo, string | null>>;
}): {
  atributos: Array<{ slug: string; valor: string }>;
  divergencias: DivergenciaNucleo[];
} {
  const atributos: Array<{ slug: string; valor: string }> = [];
  const divergencias: DivergenciaNucleo[] = [];
  for (const [slug, valorCru] of Object.entries(parametros.linha.atributos)) {
    const valor = valorCru.trim();
    if (!valor) {
      continue;
    }
    if (!CAMPOS_NUCLEO_SET.has(slug)) {
      atributos.push({ slug, valor });
      continue;
    }
    const campo = slug as CampoNucleo;
    const valorNucleo = parametros.nucleoAtual[campo] ?? null;
    if ((valorNucleo ?? "").trim() === valor) {
      continue;
    }
    divergencias.push({
      linha: parametros.linha.linha,
      campo,
      valorNucleo,
      valorArquivo: valor,
    });
  }
  return { atributos, divergencias };
}

/** Resumo da carga de enriquecimento exibido na T20. */
export interface ResumoCargaEnriquecimento {
  linhasLidas: number;
  assinantesEnriquecidos: number;
  atributosGravados: number;
  naoEncontrados: number;
  divergencias: number;
  quarentena: number;
}
