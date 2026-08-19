/**
 * Importador self-service de OFERTAS — domínio puro (sem Prisma).
 *
 * A oferta sempre pende de uma **solução que já existe**: a linha aponta a
 * solução pelo `ID Solução` (administrado pela plataforma, impresso no
 * modelo). `ID Oferta` em branco = oferta nova; preenchido = enriquecer a
 * existente. Os campos da oferta são os mesmos do formulário manual, e a
 * consistência natureza × preço × cupom × modalidade reusa `validarNatureza`
 * — a mesma regra do cadastro manual, sem duplicar.
 *
 * A criação entra como **rascunho** (status default da oferta); publicar
 * segue o fluxo normal (RN02/RN09 + aprovação). Aqui nada publica.
 */

import type { ModalidadePagamento, NaturezaOferta } from "@prisma/client";
import { validarNatureza } from "@/dominio/ofertas/regras";
import { normalizarTexto } from "./solucoes";

/** Cabeçalhos canônicos da aba "Ofertas". */
export const COLUNAS_OFERTA = {
  idOferta: "ID Oferta",
  idSolucao: "ID Solução",
  titulo: "Título",
  natureza: "Natureza",
  tipoBeneficio: "Tipo de Benefício",
  mecanica: "Mecânica de Resgate",
  precoDe: "Preço De",
  precoPor: "Preço Por",
  cupomCodigoRegras: "Código/Regras do Cupom",
  modalidade: "Modalidade de Pagamento",
  instrucoes: "Instruções Pós-Voucher",
  vigenciaInicio: "Vigência Início",
  vigenciaFim: "Vigência Fim",
  limiteResgates: "Limite de Resgates",
} as const;

/** Rótulos exibidos ↔ enum (o modelo imprime os rótulos). */
export const ROTULO_NATUREZA: Record<NaturezaOferta, string> = {
  RECOMPENSA: "Recompensa",
  BENEFICIO: "Benefício",
  CUPOM_DESCONTO: "Cupom de desconto",
};
export const ROTULO_MODALIDADE: Record<ModalidadePagamento, string> = {
  UNICA: "Única",
  RECORRENTE: "Recorrente",
};

export interface LinhaOfertaCrua {
  linha: number;
  valores: Record<string, string>;
}

export interface ItemComSlug {
  id: string;
  nome: string;
  slug: string;
}

export interface ContextoValidacaoOferta {
  tiposBeneficio: ItemComSlug[];
  mecanicas: ItemComSlug[];
  /** ids de soluções existentes (a oferta precisa apontar uma). */
  solucaoIds: Set<string>;
  /** ids de ofertas existentes (para o caminho de enriquecimento). */
  ofertaIds: Set<string>;
}

export interface PendenciaOferta {
  coluna: string;
  motivo: string;
}

/** Campos prontos para `criarOferta`/`atualizarOferta` (DadosOferta). */
export interface CamposOfertaMapeados {
  titulo: string;
  natureza: NaturezaOferta | undefined;
  tipoBeneficioId: string | undefined;
  mecanicaId: string | undefined;
  precoDe: number | null;
  precoPor: number | null;
  cupomCodigoRegras: string | null;
  modalidadePagamento: ModalidadePagamento | null;
  instrucoesResgate: string | null;
  vigenciaInicio: Date | undefined;
  vigenciaFim: Date | null;
  limiteResgates: number | null;
}

export interface ResultadoLinhaOferta {
  linha: number;
  campos: CamposOfertaMapeados;
  solucaoId: string | null;
  ofertaId: string | null;
  acao: "CRIAR" | "ENRIQUECER" | null;
  pendencias: PendenciaOferta[];
}

function limpar(valor: string | undefined): string {
  return (valor ?? "").trim();
}
function vazioParaNulo(valor: string): string | null {
  return valor === "" ? null : valor;
}

/** "R$ 11,90" / "11.90" / "1.234,56" → número; vazio → null; inválido → NaN. */
export function parseNumero(bruto: string): number | null {
  const limpo = bruto.replace(/[^\d,.-]/g, "").trim();
  if (limpo === "") return null;
  // Se tem vírgula, trata-a como separador decimal (pt-BR) e remove pontos de milhar.
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : NaN;
}

/** Monta a data conferindo que não houve "rollover" (32/13 → inválido). */
function montarData(ano: number, mes: number, dia: number): Date | undefined {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return undefined;
  }
  return data;
}

/** "dd/mm/aaaa" ou "aaaa-mm-dd" → Date (meia-noite UTC); vazio → null; inválido → undefined. */
export function parseData(bruto: string): Date | null | undefined {
  const s = bruto.trim();
  if (s === "") return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) {
    const [, d, m, a] = br;
    return montarData(Number(a), Number(m), Number(d));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    return montarData(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  return undefined;
}

function acharPorRotulo<T extends string>(
  valor: string,
  mapa: Record<T, string>,
): T | undefined {
  const alvo = normalizarTexto(valor);
  return (Object.keys(mapa) as T[]).find((k) => normalizarTexto(mapa[k]) === alvo);
}

/** Mapeia e valida uma linha da aba "Ofertas". */
export function validarLinhaOferta(
  crua: LinhaOfertaCrua,
  ctx: ContextoValidacaoOferta,
): ResultadoLinhaOferta {
  const pendencias: PendenciaOferta[] = [];
  const v = crua.valores;
  const tipoPorNome = new Map(ctx.tiposBeneficio.map((t) => [normalizarTexto(t.nome), t]));
  const mecanicaPorNome = new Map(ctx.mecanicas.map((m) => [normalizarTexto(m.nome), m]));

  // --- Solução (obrigatória, existente) ---
  const idSolucao = limpar(v[COLUNAS_OFERTA.idSolucao]);
  let solucaoId: string | null = null;
  if (idSolucao === "") {
    pendencias.push({ coluna: COLUNAS_OFERTA.idSolucao, motivo: "ID Solução é obrigatório." });
  } else if (!ctx.solucaoIds.has(idSolucao)) {
    pendencias.push({
      coluna: COLUNAS_OFERTA.idSolucao,
      motivo: "Solução não encontrada — use um ID da aba de referência do modelo.",
    });
  } else {
    solucaoId = idSolucao;
  }

  // --- Oferta existente (opcional) → enriquecer ---
  const idOferta = limpar(v[COLUNAS_OFERTA.idOferta]);
  let ofertaId: string | null = null;
  if (idOferta !== "") {
    if (!ctx.ofertaIds.has(idOferta)) {
      pendencias.push({ coluna: COLUNAS_OFERTA.idOferta, motivo: "Oferta não encontrada para este ID." });
    } else {
      ofertaId = idOferta;
    }
  }

  // --- Título ---
  const titulo = limpar(v[COLUNAS_OFERTA.titulo]);
  if (titulo === "") {
    pendencias.push({ coluna: COLUNAS_OFERTA.titulo, motivo: "Título é obrigatório." });
  }

  // --- Natureza ---
  const naturezaBruta = limpar(v[COLUNAS_OFERTA.natureza]);
  let natureza: NaturezaOferta | undefined;
  if (naturezaBruta === "") {
    pendencias.push({ coluna: COLUNAS_OFERTA.natureza, motivo: "Natureza é obrigatória." });
  } else {
    natureza = acharPorRotulo(naturezaBruta, ROTULO_NATUREZA);
    if (!natureza) {
      pendencias.push({
        coluna: COLUNAS_OFERTA.natureza,
        motivo: `Natureza "${naturezaBruta}" inválida (Recompensa, Benefício ou Cupom de desconto).`,
      });
    }
  }

  // --- Tipo de benefício ---
  const tipoBruto = limpar(v[COLUNAS_OFERTA.tipoBeneficio]);
  let tipo: ItemComSlug | undefined;
  if (tipoBruto === "") {
    pendencias.push({ coluna: COLUNAS_OFERTA.tipoBeneficio, motivo: "Tipo de benefício é obrigatório." });
  } else {
    tipo = tipoPorNome.get(normalizarTexto(tipoBruto));
    if (!tipo) {
      pendencias.push({
        coluna: COLUNAS_OFERTA.tipoBeneficio,
        motivo: `Tipo de benefício "${tipoBruto}" não existe no Parametrizador.`,
      });
    }
  }

  // --- Mecânica ---
  const mecBruta = limpar(v[COLUNAS_OFERTA.mecanica]);
  let mecanica: ItemComSlug | undefined;
  if (mecBruta === "") {
    pendencias.push({ coluna: COLUNAS_OFERTA.mecanica, motivo: "Mecânica de resgate é obrigatória." });
  } else {
    mecanica = mecanicaPorNome.get(normalizarTexto(mecBruta));
    if (!mecanica) {
      pendencias.push({
        coluna: COLUNAS_OFERTA.mecanica,
        motivo: `Mecânica "${mecBruta}" não existe no Parametrizador.`,
      });
    }
  }

  // --- Preços ---
  const precoDe = parseNumero(limpar(v[COLUNAS_OFERTA.precoDe]));
  if (Number.isNaN(precoDe)) {
    pendencias.push({ coluna: COLUNAS_OFERTA.precoDe, motivo: "Preço De não é um número válido." });
  }
  const precoPor = parseNumero(limpar(v[COLUNAS_OFERTA.precoPor]));
  if (Number.isNaN(precoPor)) {
    pendencias.push({ coluna: COLUNAS_OFERTA.precoPor, motivo: "Preço Por não é um número válido." });
  }

  // --- Modalidade ---
  const modBruta = limpar(v[COLUNAS_OFERTA.modalidade]);
  let modalidade: ModalidadePagamento | null = null;
  if (modBruta !== "") {
    const m = acharPorRotulo(modBruta, ROTULO_MODALIDADE);
    if (!m) {
      pendencias.push({
        coluna: COLUNAS_OFERTA.modalidade,
        motivo: `Modalidade "${modBruta}" inválida (Única ou Recorrente).`,
      });
    } else {
      modalidade = m;
    }
  }

  // --- Vigência ---
  const vigInicioBruta = limpar(v[COLUNAS_OFERTA.vigenciaInicio]);
  let vigenciaInicio: Date | undefined;
  if (vigInicioBruta === "") {
    pendencias.push({ coluna: COLUNAS_OFERTA.vigenciaInicio, motivo: "Início de vigência é obrigatório." });
  } else {
    const d = parseData(vigInicioBruta);
    if (d === undefined || d === null) {
      pendencias.push({
        coluna: COLUNAS_OFERTA.vigenciaInicio,
        motivo: "Data inválida (use dd/mm/aaaa).",
      });
    } else {
      vigenciaInicio = d;
    }
  }
  const vigFimBruta = limpar(v[COLUNAS_OFERTA.vigenciaFim]);
  let vigenciaFim: Date | null = null;
  if (vigFimBruta !== "") {
    const d = parseData(vigFimBruta);
    if (d === undefined) {
      pendencias.push({ coluna: COLUNAS_OFERTA.vigenciaFim, motivo: "Data inválida (use dd/mm/aaaa)." });
    } else {
      vigenciaFim = d;
    }
  }

  // --- Limite de resgates ---
  const limiteBruto = limpar(v[COLUNAS_OFERTA.limiteResgates]);
  let limiteResgates: number | null = null;
  if (limiteBruto !== "") {
    const n = parseNumero(limiteBruto);
    if (n === null || Number.isNaN(n) || !Number.isInteger(n) || n < 0) {
      pendencias.push({
        coluna: COLUNAS_OFERTA.limiteResgates,
        motivo: "Limite de resgates deve ser um inteiro não negativo.",
      });
    } else {
      limiteResgates = n;
    }
  }

  const cupomCodigoRegras = vazioParaNulo(limpar(v[COLUNAS_OFERTA.cupomCodigoRegras]));

  // --- Consistência natureza × preço × cupom × modalidade (mesma regra do manual) ---
  if (natureza && tipo) {
    for (const erro of validarNatureza({
      natureza,
      tipoBeneficioSlug: tipo.slug,
      precoDe: Number.isNaN(precoDe) ? null : precoDe,
      precoPor: Number.isNaN(precoPor) ? null : precoPor,
      cupomCodigoRegras,
      modalidadePagamento: modalidade,
    })) {
      pendencias.push({ coluna: COLUNAS_OFERTA.natureza, motivo: erro });
    }
  }

  const acao = pendencias.length > 0 ? null : ofertaId ? "ENRIQUECER" : "CRIAR";

  return {
    linha: crua.linha,
    campos: {
      titulo,
      natureza,
      tipoBeneficioId: tipo?.id,
      mecanicaId: mecanica?.id,
      precoDe: Number.isNaN(precoDe) ? null : precoDe,
      precoPor: Number.isNaN(precoPor) ? null : precoPor,
      cupomCodigoRegras,
      modalidadePagamento: modalidade,
      instrucoesResgate: vazioParaNulo(limpar(v[COLUNAS_OFERTA.instrucoes])),
      vigenciaInicio,
      vigenciaFim,
      limiteResgates,
    },
    solucaoId,
    ofertaId,
    acao,
    pendencias,
  };
}

export function validarLoteOfertas(
  linhas: LinhaOfertaCrua[],
  ctx: ContextoValidacaoOferta,
): ResultadoLinhaOferta[] {
  return linhas.map((linha) => validarLinhaOferta(linha, ctx));
}

export function linhaOfertaPronta(resultado: ResultadoLinhaOferta): boolean {
  return resultado.pendencias.length === 0;
}
