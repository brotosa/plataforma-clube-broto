import type { EstagioEmpresa } from "@prisma/client";
import { validarCnpj } from "./cnpj";

/**
 * Máquina de estados da Empresa (ficha §3.1) com os estágios documentados.
 * Estágios de prospecção pré-negociação entram por migração na Onda 2.
 *
 * - EM_NEGOCIACAO → ALIADA_ATIVA: promoção (M2), sujeita ao motor de
 *   aprovação (RN06) e aos requisitos mínimos abaixo.
 * - ALIADA_ATIVA → SUSPENSA: exige motivo tipificado (RN12) e dispara a
 *   cascata da RN04.
 * - SUSPENSA → ALIADA_ATIVA: reativação (suspensão é temporária por
 *   definição; encerramento é o estado terminal).
 * - EM_NEGOCIACAO/ALIADA_ATIVA/SUSPENSA → ENCERRADA: terminal; dispara a
 *   cascata da RN04.
 */
const TRANSICOES: Readonly<Record<EstagioEmpresa, ReadonlyArray<EstagioEmpresa>>> = {
  EM_NEGOCIACAO: ["ALIADA_ATIVA", "ENCERRADA"],
  ALIADA_ATIVA: ["SUSPENSA", "ENCERRADA"],
  SUSPENSA: ["ALIADA_ATIVA", "ENCERRADA"],
  ENCERRADA: [],
};

export function podeTransicionar(
  de: EstagioEmpresa,
  para: EstagioEmpresa,
): boolean {
  return TRANSICOES[de].includes(para);
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
