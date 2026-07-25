/**
 * RN29/RN31 — importação do núcleo de assinantes.
 *
 * - Upsert idempotente por CPF: novo cria, existente atualiza o núcleo.
 * - A ausência de um CPF no arquivo NÃO inativa ninguém por padrão: a
 *   carga declara sua política (INCREMENTAL × FOTO_COMPLETA); só a foto
 *   completa marca ausentes como "fora da base", e somente com
 *   confirmação explícita em duas etapas (dry-run com resumo → texto de
 *   confirmação digitado).
 * - Nunca tudo-ou-nada: linha inválida vai para quarentena com motivo;
 *   as demais seguem.
 *
 * O dicionário real do arquivo do comprador é [A CONFIRMAR] (ficha §10):
 * o mapeador de colunas absorve variações de cabeçalho, e o de/para
 * aplicado fica gravado na importação.
 */

import type { PreferenciaAssinante } from "@prisma/client";
import { normalizarCpf, validarCpf } from "./cpf";

/** Destinos possíveis de uma coluna do arquivo (núcleo, ficha §1.1a). */
export const CAMPOS_NUCLEO = [
  "cpf",
  "nome",
  "endereco",
  "cep",
  "email",
  "telefone",
  "preferencia",
] as const;
export type CampoNucleo = (typeof CAMPOS_NUCLEO)[number];

/** Valor sentinela do mapeador: coluna reconhecida mas não importada. */
export const NAO_IMPORTAR = "nao_importar" as const;
export type DestinoMapeamento = CampoNucleo | typeof NAO_IMPORTAR;

/** Rótulos institucionais dos campos do modelo (T20, passo de mapeamento). */
export const ROTULOS_CAMPO_NUCLEO: Readonly<Record<CampoNucleo, string>> = {
  cpf: "CPF",
  nome: "Nome",
  endereco: "Endereço",
  cep: "CEP",
  email: "E-mail",
  telefone: "Telefone",
  preferencia: "Preferência",
};

function normalizarCabecalho(cabecalho: string): string {
  return cabecalho
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .trim();
}

/**
 * Sugestão automática do de/para de colunas a partir dos cabeçalhos do
 * arquivo. É só o ponto de partida do mapeador da T20 — a pessoa revisa e
 * ajusta; null = sem correspondência (a coluna fica de fora do resumo).
 */
export function sugerirMapeamento(
  colunas: ReadonlyArray<string>,
): Record<string, CampoNucleo | null> {
  const sugestoes: Record<string, CampoNucleo | null> = {};
  const usados = new Set<CampoNucleo>();
  for (const coluna of colunas) {
    const chave = normalizarCabecalho(coluna);
    let destino: CampoNucleo | null = null;
    if (/\bcpf\b/.test(chave)) destino = "cpf";
    else if (/\bcep\b/.test(chave)) destino = "cep";
    else if (chave.includes("mail")) destino = "email";
    else if (/fone|celular|whatsapp/.test(chave)) destino = "telefone";
    else if (chave.includes("prefer")) destino = "preferencia";
    else if (chave.includes("endereco") || chave.includes("logradouro")) destino = "endereco";
    else if (chave.includes("nome")) destino = "nome";
    if (destino && usados.has(destino)) {
      destino = null; // duas colunas para o mesmo campo: a segunda fica sem sugestão
    }
    if (destino) {
      usados.add(destino);
    }
    sugestoes[coluna] = destino;
  }
  return sugestoes;
}

/** Interpreta a preferência declarada (agricultura · pecuária · ambos). */
export function interpretarPreferencia(
  valor: string | null | undefined,
): PreferenciaAssinante | null {
  const texto = (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!texto) return null;
  if (texto === "agricultura") return "AGRICULTURA";
  if (texto === "pecuaria") return "PECUARIA";
  if (texto === "ambos" || texto === "ambas") return "AMBOS";
  return null;
}

/** Linha do arquivo já passada pelo de/para do mapeador (valores crus). */
export interface LinhaNucleo {
  linha: number;
  cpf: string;
  nome: string;
  endereco: string | null;
  cep: string | null;
  email: string | null;
  telefone: string | null;
  preferencia: string | null;
}

/**
 * RN31 — validação linha a linha do núcleo. Devolve os motivos de
 * quarentena (vazio = linha válida). E-mail/telefone ausentes ou fora de
 * formato NÃO derrubam a linha: ficam como vieram e alimentam a métrica
 * de validade da ficha §8 — quarentena é para linha inaproveitável.
 */
export function validarLinhaNucleo(linha: LinhaNucleo): string[] {
  const motivos: string[] = [];
  if (!linha.cpf.trim()) {
    motivos.push("CPF ausente.");
  } else if (!validarCpf(linha.cpf)) {
    motivos.push("CPF inválido: dígito verificador não confere (RN30).");
  }
  if (!linha.nome.trim()) {
    motivos.push("Nome ausente.");
  }
  if (linha.preferencia?.trim() && !interpretarPreferencia(linha.preferencia)) {
    motivos.push(
      `Preferência não reconhecida: "${linha.preferencia.trim()}" (esperado agricultura, pecuária ou ambos).`,
    );
  }
  return motivos;
}

export interface PlanoUpsert {
  /** cpf_hash → linha vencedora (última ocorrência no arquivo vence). */
  porHash: Map<string, LinhaNucleo>;
  novos: number;
  atualizados: number;
  /** Ocorrências repetidas do mesmo CPF no arquivo (informativo do resumo). */
  repetidosNoArquivo: number;
}

/**
 * RN29 — plano do upsert idempotente por CPF: classifica cada CPF válido
 * do arquivo em novo × atualizado em relação à base atual. O mesmo CPF
 * repetido no arquivo conta uma única vez (a última linha vence —
 * reprocessar o mesmo arquivo produz o mesmo resultado).
 */
export function planejarUpsert(
  linhasValidas: ReadonlyArray<{ linha: LinhaNucleo; cpfHash: string }>,
  hashesExistentes: ReadonlySet<string>,
): PlanoUpsert {
  const porHash = new Map<string, LinhaNucleo>();
  let repetidos = 0;
  for (const { linha, cpfHash } of linhasValidas) {
    if (porHash.has(cpfHash)) {
      repetidos += 1;
    }
    porHash.set(cpfHash, linha);
  }
  let novos = 0;
  let atualizados = 0;
  for (const cpfHash of porHash.keys()) {
    if (hashesExistentes.has(cpfHash)) {
      atualizados += 1;
    } else {
      novos += 1;
    }
  }
  return { porHash, novos, atualizados, repetidosNoArquivo: repetidos };
}

/**
 * RN29 — foto completa: quem está ATIVO na base e não consta do arquivo
 * seria marcado "fora da base". O cálculo alimenta o dry-run; a marcação
 * em si só acontece após a confirmação explícita.
 */
export function calcularForaDaBase(
  hashesAtivosNaBase: ReadonlyArray<string>,
  hashesDoArquivo: ReadonlySet<string>,
): string[] {
  return hashesAtivosNaBase.filter((hash) => !hashesDoArquivo.has(hash));
}

/** Texto exigido na confirmação da foto completa (T20, passo 4). */
export const TEXTO_CONFIRMACAO_FOTO_COMPLETA = "FOTO COMPLETA";

/**
 * RN29 — segunda etapa da foto completa: a confirmação só vale com o
 * texto exato digitado (indiferente a caixa e espaços nas bordas).
 * É a proteção contra o desastre do arquivo parcial enviado como foto
 * completa: ninguém confirma sem ler quantos sairiam.
 */
export function confirmacaoFotoCompletaValida(texto: string | null | undefined): boolean {
  return (texto ?? "").trim().toUpperCase() === TEXTO_CONFIRMACAO_FOTO_COMPLETA;
}

/** Item de quarentena com motivo (RN31), como vai ao relatório da carga. */
export interface ItemQuarentena {
  linha: number;
  motivos: string[];
}

/** Resumo da carga exibido na T20 (dry-run e resultado final). */
export interface ResumoCargaNucleo {
  linhasLidas: number;
  novos: number;
  atualizados: number;
  quarentena: number;
  repetidosNoArquivo: number;
  /** Somente foto completa; null na política incremental. */
  foraDaBase: number | null;
}

export function montarResumoNucleo(parametros: {
  linhasLidas: number;
  plano: PlanoUpsert;
  quarentena: ReadonlyArray<ItemQuarentena>;
  foraDaBase: ReadonlyArray<string> | null;
}): ResumoCargaNucleo {
  return {
    linhasLidas: parametros.linhasLidas,
    novos: parametros.plano.novos,
    atualizados: parametros.plano.atualizados,
    quarentena: parametros.quarentena.length,
    repetidosNoArquivo: parametros.plano.repetidosNoArquivo,
    foraDaBase: parametros.foraDaBase ? parametros.foraDaBase.length : null,
  };
}

/** Normaliza a linha para persistência (CPF só dígitos, textos aparados). */
export function normalizarLinhaNucleo(linha: LinhaNucleo): {
  cpf: string;
  nome: string;
  enderecoBruto: string | null;
  cep: string | null;
  email: string | null;
  telefone: string | null;
  preferencia: PreferenciaAssinante | null;
} {
  return {
    cpf: normalizarCpf(linha.cpf),
    nome: linha.nome.trim(),
    enderecoBruto: linha.endereco?.trim() || null,
    cep: linha.cep?.trim() || null,
    email: linha.email?.trim() || null,
    telefone: linha.telefone?.trim() || null,
    preferencia: interpretarPreferencia(linha.preferencia),
  };
}
