import type { EstagioEmpresa, OrigemDossie, StatusDossie } from "@prisma/client";

/**
 * Regras do dossiê de due diligence (Onda 2, ficha §3.4 e §6) como
 * serviços puros. O centro é a RN19: o dossiê gerado por IA nasce marcado
 * "gerado automaticamente — requer revisão", só sai desse estado por ação
 * humana explícita com autor e data, e **jamais preenche nota de
 * indicador** — ele alimenta evidência; a pontuação é sempre humana.
 *
 * A independência entre dossiê e pontuação não é só doutrina: o teste de
 * arquitetura em infra/arquitetura/independencia-dossie.test.ts falha se
 * algum módulo de avaliação passar a ler dossiê.
 */

/** Tarja institucional da RN19, exibida enquanto o dossiê não é revisado. */
export const MARCA_REQUER_REVISAO = "Gerado automaticamente — requer revisão";

export const MENSAGEM_RN19 =
  "O dossiê é evidência para a leitura humana: nenhum campo dele preenche nota de indicador (RN19).";

/** Rótulos institucionais do ciclo de vida (ficha §3.4). */
export const ROTULOS_STATUS_DOSSIE: Readonly<Record<StatusDossie, string>> = {
  GERANDO: "gerando…",
  PRONTO: "pronto",
  FALHA: "falha",
};

export const ROTULOS_ORIGEM_DOSSIE: Readonly<Record<OrigemDossie, string>> = {
  GERADO_IA: "gerado por IA",
  INSERIDO_MANUALMENTE: "inserido manualmente",
};

/**
 * Estágios em que a aba Dossiê fica ativa: os pré-aliança a partir de
 * Mapeada (o dossiê é insumo da própria avaliação) e Aliada ativa, que
 * reavalia anualmente (RN21). Em aprovação fica fora — o caso parado no
 * motor não muda embaixo do aprovador (coerência com RN06/RN20, mesma
 * regra da avaliação).
 */
export const ESTAGIOS_COM_DOSSIE: ReadonlyArray<EstagioEmpresa> = [
  "MAPEADA",
  "EM_AVALIACAO",
  "PRIORIZADA",
  "EM_NEGOCIACAO",
  "ALIADA_ATIVA",
];

export function podeTerDossieNoEstagio(estagio: EstagioEmpresa): boolean {
  return ESTAGIOS_COM_DOSSIE.includes(estagio);
}

export const MENSAGEM_ESTAGIO_SEM_DOSSIE =
  "Esta empresa não recebe dossiê no estágio atual — a aba fica ativa nos estágios pré-aliança e na aliada ativa.";

/**
 * Uma geração por vez, por empresa: enquanto houver dossiê GERANDO, novo
 * pedido é recusado. Barreira contra o clique repetido — e, com a geração
 * sendo sempre sob demanda de um analista, contra qualquer disparo em
 * lote acidental.
 */
export function validarPedidoDeGeracao(parametros: {
  estagio: EstagioEmpresa;
  temGeracaoEmAndamento: boolean;
}): string[] {
  const erros: string[] = [];
  if (!podeTerDossieNoEstagio(parametros.estagio)) {
    erros.push(MENSAGEM_ESTAGIO_SEM_DOSSIE);
  }
  if (parametros.temGeracaoEmAndamento) {
    erros.push(
      "Já existe uma geração em andamento para esta empresa — aguarde concluir antes de pedir outra.",
    );
  }
  return erros;
}

/**
 * Nova tentativa só faz sentido sobre uma geração que falhou: o dossiê
 * pronto não é regerado por cima (novo dossiê é novo pedido) e o que está
 * gerando ainda não terminou.
 */
export function podeTentarNovamente(status: StatusDossie): boolean {
  return status === "FALHA";
}

export const MENSAGEM_NOVA_TENTATIVA_INVALIDA =
  "Nova tentativa só se aplica a uma geração que falhou.";

/** RN19 — só o dossiê pronto e ainda não revisado aceita a marca. */
export function podeMarcarComoRevisado(dossie: {
  status: StatusDossie;
  revisado: boolean;
}): string[] {
  const erros: string[] = [];
  if (dossie.status !== "PRONTO") {
    erros.push("Só um dossiê pronto pode ser marcado como revisado.");
  }
  if (dossie.revisado) {
    erros.push("Este dossiê já foi marcado como revisado.");
  }
  return erros;
}

/**
 * RN19 — a marca de revisão sempre carrega autor e data; não existe
 * "revisado" anônimo (o banco também garante, por CHECK).
 */
export function marcarComoRevisado(revisorId: string, quando: Date) {
  return { revisado: true as const, revisorId, revisadoEm: quando };
}
