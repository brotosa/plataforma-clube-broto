import type { EstagioEmpresa } from "@prisma/client";
import { validarCnpj } from "./cnpj";

/**
 * Máquina de estados da Empresa — pipeline completo das fichas §3.1
 * (Onda 1 v0.6 + Onda 2 v0.1) e do protótipo v6.1.
 *
 * Funil pré-aliança (Onda 2):
 * - MAPEADA → EM_AVALIACAO: ato do analista, que assume a empresa como
 *   responsável de scout (RN14, garantida no caso de uso).
 * - EM_AVALIACAO ⇄ MAPEADA e PRIORIZADA ⇄ EM_AVALIACAO: avanço e retorno
 *   de correção — decisão humana explícita, sempre auditada.
 * - PRIORIZADA → EM_NEGOCIACAO: handoff que exige responsável comercial
 *   designado (RN16, garantida no caso de uso).
 * - EM_NEGOCIACAO → EM_APROVACAO: somente pelo pedido de promoção ao motor
 *   (RN06/RN20); EM_APROVACAO → EM_NEGOCIACAO é a devolução do aprovador.
 * - Qualquer estágio do funil → DESCARTADA: exige motivo tipificado (RN17);
 *   DESCARTADA → MAPEADA é a reativação preservando o histórico (RN17).
 *
 * Rede (Onda 1):
 * - EM_NEGOCIACAO → ALIADA_ATIVA: promoção (M2), sujeita ao motor de
 *   aprovação (RN06) e aos requisitos mínimos abaixo (com a regra do motor
 *   desligada a promoção é direta, sem passar por EM_APROVACAO).
 * - ALIADA_ATIVA → SUSPENSA: exige motivo tipificado (RN12) e dispara a
 *   cascata da RN04.
 * - SUSPENSA → ALIADA_ATIVA: reativação (suspensão é temporária por
 *   definição; encerramento é o estado terminal).
 * - EM_NEGOCIACAO/ALIADA_ATIVA/SUSPENSA → ENCERRADA: terminal; dispara a
 *   cascata da RN04.
 */
const TRANSICOES: Readonly<Record<EstagioEmpresa, ReadonlyArray<EstagioEmpresa>>> = {
  MAPEADA: ["EM_AVALIACAO", "DESCARTADA"],
  EM_AVALIACAO: ["MAPEADA", "PRIORIZADA", "DESCARTADA"],
  PRIORIZADA: ["EM_AVALIACAO", "EM_NEGOCIACAO", "DESCARTADA"],
  EM_NEGOCIACAO: ["PRIORIZADA", "EM_APROVACAO", "ALIADA_ATIVA", "ENCERRADA", "DESCARTADA"],
  EM_APROVACAO: ["ALIADA_ATIVA", "EM_NEGOCIACAO"],
  ALIADA_ATIVA: ["SUSPENSA", "ENCERRADA"],
  SUSPENSA: ["ALIADA_ATIVA", "ENCERRADA"],
  ENCERRADA: [],
  DESCARTADA: ["MAPEADA"],
};

export function podeTransicionar(
  de: EstagioEmpresa,
  para: EstagioEmpresa,
): boolean {
  return TRANSICOES[de].includes(para);
}

/** Destinos válidos a partir de um estágio (consulta ao grafo acima). */
export function transicoesValidasDe(de: EstagioEmpresa): ReadonlyArray<EstagioEmpresa> {
  return TRANSICOES[de];
}

/** Dados mínimos avaliados na promoção a Aliada ativa (M2). */
export interface DadosPromocao {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnpj: string | null;
  enderecoMunicipio: string | null;
  enderecoUf: string | null;
  quantidadeContatos: number;
  contratoVigente: {
    temAnexo: boolean;
    comissaoPctDefinida: boolean;
    ambientesDefinidos: boolean;
  } | null;
}

/**
 * Requisitos da promoção a Aliada ativa (M2, ficha cadastral v1 §
 * obrigatoriedade progressiva): identificação completa com CNPJ validado
 * (RN08) e endereço, ≥1 contato, bloco comercial completo (contrato
 * anexado, comissão %, ambientes de pagamento).
 * Retorna a lista de pendências — vazia quando a promoção é possível.
 */
export function pendenciasDePromocao(dados: DadosPromocao): string[] {
  const pendencias: string[] = [];
  if (!dados.razaoSocial?.trim()) {
    pendencias.push("Razão social não preenchida");
  }
  if (!dados.nomeFantasia?.trim()) {
    pendencias.push("Nome fantasia (nome de exibição) não preenchido");
  }
  if (!dados.cnpj?.trim()) {
    pendencias.push("CNPJ não preenchido");
  } else if (!validarCnpj(dados.cnpj)) {
    pendencias.push("CNPJ inválido (dígito verificador não confere)");
  }
  if (!dados.enderecoMunicipio?.trim() || !dados.enderecoUf?.trim()) {
    pendencias.push("Endereço da sede incompleto (mínimo contratual)");
  }
  if (dados.quantidadeContatos < 1) {
    pendencias.push("Nenhum contato cadastrado (mínimo 1)");
  }
  if (!dados.contratoVigente) {
    pendencias.push("Contrato vigente não cadastrado");
  } else {
    if (!dados.contratoVigente.temAnexo) {
      pendencias.push("Contrato sem anexo (PDF)");
    }
    if (!dados.contratoVigente.comissaoPctDefinida) {
      pendencias.push("Comissão % não definida no contrato");
    }
    if (!dados.contratoVigente.ambientesDefinidos) {
      pendencias.push("Ambientes de pagamento não definidos");
    }
  }
  return pendencias;
}

/**
 * RN12 — Suspensão exige motivo tipificado; o motivo "OUTROS" exige
 * descrição. Retorna a lista de erros — vazia quando a suspensão é válida.
 */
export function validarSuspensao(parametros: {
  motivoSlug: string | null;
  descricao: string | null;
}): string[] {
  const erros: string[] = [];
  if (!parametros.motivoSlug) {
    erros.push("Suspensão exige motivo tipificado (RN12)");
    return erros;
  }
  if (parametros.motivoSlug === "OUTROS" && !parametros.descricao?.trim()) {
    erros.push('O motivo "Outros" exige descrição (RN12)');
  }
  return erros;
}
