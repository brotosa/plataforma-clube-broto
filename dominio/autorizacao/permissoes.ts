import type { Papel } from "@prisma/client";

/**
 * Ações de negócio das Ondas 1 e 2, conforme as tabelas de permissões das
 * fichas §2. Os papéis da Onda 1 permanecem com suas permissões; a Onda 2
 * acrescenta ANALISTA_SCOUT e COMERCIAL com a matriz própria do funil.
 * A segregação solicitante ≠ aprovador (RN06) não é uma permissão estática:
 * é garantida no serviço do motor de aprovação.
 */
export type Acao =
  | "VISUALIZAR"
  | "CRIAR_EDITAR"
  | "SOLICITAR_PROMOCAO"
  | "APROVAR_DEVOLVER"
  | "CONFIGURAR_REGRAS_APROVACAO"
  | "PUBLICAR_PAUSAR_ENCERRAR_OFERTA"
  | "GERAR_EXPORTACAO"
  | "IMPORTAR_TELEMETRIA"
  // Onda 2 — Mercado & Scout (ficha §2)
  | "VISUALIZAR_FUNIL"
  | "INCLUIR_NO_RADAR"
  | "ASSUMIR_E_AVALIAR"
  | "PRIORIZAR"
  | "GERAR_REVISAR_DOSSIE"
  | "VER_DOSSIE"
  | "ASSUMIR_NEGOCIACAO"
  | "DEFINIR_METAS_E_DESIGNAR";

/** Tabelas das fichas §2 — papéis × ações (fonte da verdade). */
const PERMISSOES: Readonly<Record<Acao, ReadonlyArray<Papel>>> = {
  // Onda 1. VISUALIZAR ganha os papéis novos: o fluxo do funil abre a
  // ficha da empresa (T2/T12) e a ficha Onda 2 dá leitura geral a todos.
  VISUALIZAR: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  CRIAR_EDITAR: ["GESTOR", "ANALISTA"],
  // "Solicitar promoção a Aliada ativa": Gestor e Comercial (ficha Onda 2
  // §2); o Analista de Aliados mantém a permissão da Onda 1.
  SOLICITAR_PROMOCAO: ["GESTOR", "ANALISTA", "COMERCIAL"],
  APROVAR_DEVOLVER: ["GESTOR", "APROVADOR"],
  CONFIGURAR_REGRAS_APROVACAO: ["GESTOR"],
  PUBLICAR_PAUSAR_ENCERRAR_OFERTA: ["GESTOR", "ANALISTA"],
  GERAR_EXPORTACAO: ["GESTOR"],
  IMPORTAR_TELEMETRIA: ["GESTOR", "ANALISTA"],
  // Onda 2 — matriz da ficha §2, célula a célula.
  VISUALIZAR_FUNIL: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL", "APROVADOR", "LEITURA"],
  INCLUIR_NO_RADAR: ["GESTOR", "ANALISTA_SCOUT"],
  ASSUMIR_E_AVALIAR: ["GESTOR", "ANALISTA_SCOUT"],
  PRIORIZAR: ["GESTOR", "ANALISTA_SCOUT"],
  GERAR_REVISAR_DOSSIE: ["GESTOR", "ANALISTA_SCOUT"],
  VER_DOSSIE: ["GESTOR", "ANALISTA_SCOUT", "COMERCIAL"],
  ASSUMIR_NEGOCIACAO: ["GESTOR", "COMERCIAL"],
  DEFINIR_METAS_E_DESIGNAR: ["GESTOR"],
};

/** Verifica se o papel pode executar a ação. */
export function podeExecutar(papel: Papel, acao: Acao): boolean {
  return PERMISSOES[acao].includes(papel);
}

/** Erro padronizado para negativas de autorização. */
export class ErroDeAutorizacao extends Error {
  readonly acao: Acao;
  readonly papel: Papel;

  constructor(papel: Papel, acao: Acao) {
    super(`Papel ${papel} não tem permissão para a ação ${acao}.`);
    this.name = "ErroDeAutorizacao";
    this.acao = acao;
    this.papel = papel;
  }
}

/** Lança ErroDeAutorizacao quando o papel não pode executar a ação. */
export function exigirPermissao(papel: Papel, acao: Acao): void {
  if (!podeExecutar(papel, acao)) {
    throw new ErroDeAutorizacao(papel, acao);
  }
}
