/**
 * RN32 — UF e município derivam do endereço na importação e alimentam a
 * segmentação. Estratégia em duas etapas, na ordem do prompt da Onda 5:
 *
 * 1. CEP, quando o arquivo trouxer ([A CONFIRMAR], ficha §10): UF pela
 *    tabela pública de faixas de CEP dos Correios (dado de referência
 *    estável, abaixo). O CEP NÃO deriva município aqui — isso exigiria a
 *    base completa de logradouros, que não existe no repositório; sem
 *    fonte, não se inventa.
 * 2. Heurística documentada sobre o endereço bruto (fallback): o texto
 *    termina em "<município>/UF" (ou variações com vírgula/travessão) —
 *    a UF é o token final de 2 letras validado contra as 27 UFs, e o
 *    município é o último segmento textual antes dela.
 *
 * Quando nada casa, o resultado é null — o estado honesto "não derivado"
 * aparece na UI e o assinante fica fora dos filtros de UF/município,
 * nunca dentro de um chute.
 */

interface FaixaCep {
  uf: string;
  inicio: number; // prefixo de 5 dígitos, inclusivo
  fim: number; // prefixo de 5 dígitos, inclusivo
}

/**
 * Faixas de CEP por UF (prefixo de 5 dígitos), conforme a alocação
 * pública dos Correios. Faixas não alocadas resultam em "não derivado".
 */
const FAIXAS_CEP: ReadonlyArray<FaixaCep> = [
  { uf: "SP", inicio: 1000, fim: 19999 },
  { uf: "RJ", inicio: 20000, fim: 28999 },
  { uf: "ES", inicio: 29000, fim: 29999 },
  { uf: "MG", inicio: 30000, fim: 39999 },
  { uf: "BA", inicio: 40000, fim: 48999 },
  { uf: "SE", inicio: 49000, fim: 49999 },
  { uf: "PE", inicio: 50000, fim: 56999 },
  { uf: "AL", inicio: 57000, fim: 57999 },
  { uf: "PB", inicio: 58000, fim: 58999 },
  { uf: "RN", inicio: 59000, fim: 59999 },
  { uf: "CE", inicio: 60000, fim: 63999 },
  { uf: "PI", inicio: 64000, fim: 64999 },
  { uf: "MA", inicio: 65000, fim: 65999 },
  { uf: "PA", inicio: 66000, fim: 68899 },
  { uf: "AP", inicio: 68900, fim: 68999 },
  { uf: "AM", inicio: 69000, fim: 69299 },
  { uf: "RR", inicio: 69300, fim: 69399 },
  { uf: "AM", inicio: 69400, fim: 69899 },
  { uf: "AC", inicio: 69900, fim: 69999 },
  { uf: "DF", inicio: 70000, fim: 72799 },
  { uf: "GO", inicio: 72800, fim: 72999 },
  { uf: "DF", inicio: 73000, fim: 73699 },
  { uf: "GO", inicio: 73700, fim: 76799 },
  { uf: "RO", inicio: 76800, fim: 76999 },
  { uf: "TO", inicio: 77000, fim: 77999 },
  { uf: "MT", inicio: 78000, fim: 78899 },
  { uf: "MS", inicio: 79000, fim: 79999 },
  { uf: "PR", inicio: 80000, fim: 87999 },
  { uf: "SC", inicio: 88000, fim: 89999 },
  { uf: "RS", inicio: 90000, fim: 99999 },
];

const UFS_VALIDAS = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
]);

/** UF pela faixa de CEP; null quando o CEP é inválido ou fora das faixas. */
export function derivarUfPorCep(cep: string | null | undefined): string | null {
  if (!cep) {
    return null;
  }
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) {
    return null;
  }
  const prefixo = Number(digitos.slice(0, 5));
  const faixa = FAIXAS_CEP.find((f) => prefixo >= f.inicio && prefixo <= f.fim);
  return faixa?.uf ?? null;
}

export interface LocalizacaoDerivada {
  uf: string | null;
  municipio: string | null;
}

/**
 * Heurística documentada sobre o endereço bruto: captura o sufixo
 * "<município>/UF" (separador /, vírgula ou travessão), ignorando um CEP
 * eventualmente colado ao final. Devolve nulls quando não casa.
 */
export function derivarDoEndereco(enderecoBruto: string | null | undefined): LocalizacaoDerivada {
  if (!enderecoBruto?.trim()) {
    return { uf: null, municipio: null };
  }
  // Descarta CEP e pontuação ao final ("..., Sorriso/MT — 78890-000").
  const semCep = enderecoBruto
    .trim()
    .replace(/[\s,–—-]*\d{5}-?\d{3}\s*$/, "")
    .replace(/[\s.,;]+$/, "");

  const casamento = /^(.*?)[\s]*[/,–—-][\s]*([A-Za-z]{2})$/.exec(semCep);
  if (!casamento) {
    return { uf: null, municipio: null };
  }
  const uf = casamento[2].toUpperCase();
  if (!UFS_VALIDAS.has(uf)) {
    return { uf: null, municipio: null };
  }

  // Município: último segmento textual antes da UF.
  const anterior = casamento[1];
  const segmentos = anterior
    .split(/[,–—]|\s-\s/)
    .map((parte) => parte.trim())
    .filter(Boolean);
  const municipio = segmentos.length > 0 ? segmentos[segmentos.length - 1] : null;
  return { uf, municipio: municipio || null };
}

/**
 * Derivação completa da importação (RN32): CEP primeiro (UF), endereço
 * como fallback (UF e município). Cada campo é null quando não derivável.
 */
export function derivarLocalizacao(entrada: {
  cep: string | null | undefined;
  enderecoBruto: string | null | undefined;
}): LocalizacaoDerivada {
  const doEndereco = derivarDoEndereco(entrada.enderecoBruto);
  const ufPorCep = derivarUfPorCep(entrada.cep);
  return {
    uf: ufPorCep ?? doEndereco.uf,
    municipio: doEndereco.municipio,
  };
}
