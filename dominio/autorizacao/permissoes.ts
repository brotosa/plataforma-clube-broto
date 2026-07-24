import type { Papel } from "@prisma/client";

/**
 * Ações de negócio da Onda 1, conforme a tabela de permissões da ficha §2.
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
  | "IMPORTAR_TELEMETRIA";

/** Tabela da ficha §2 — papéis × ações (fonte da verdade). */
const PERMISSOES: Readonly<Record<Acao, ReadonlyArray<Papel>>> = {
  VISUALIZAR: ["GESTOR", "ANALISTA", "APROVADOR", "LEITURA"],
  CRIAR_EDITAR: ["GESTOR", "ANALISTA"],
  SOLICITAR_PROMOCAO: ["GESTOR", "ANALISTA"],
  APROVAR_DEVOLVER: ["GESTOR", "APROVADOR"],
  CONFIGURAR_REGRAS_APROVACAO: ["GESTOR"],
  PUBLICAR_PAUSAR_ENCERRAR_OFERTA: ["GESTOR", "ANALISTA"],
  GERAR_EXPORTACAO: ["GESTOR"],
  IMPORTAR_TELEMETRIA: ["GESTOR", "ANALISTA"],
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
