import type { PeriodoMeta } from "@prisma/client";

/**
 * Metas de novos aliados (Onda 3, ficha §3.2 e RN28) como serviços puros.
 *
 * Todo período é alinhado ao calendário — mês, trimestre ou ano civil.
 * Não é detalhe de implementação: é o que dá sentido à RN28. Duas metas
 * mensais do mesmo escopo ou coincidem (mesmo mês, conflito) ou são
 * disjuntas; não existe meta "de 10 de março a 9 de abril" para negociar.
 *
 * As datas são construídas em UTC porque a coluna é DATE: sem isso, um
 * fuso a oeste jogaria "1º de janeiro" para 31 de dezembro do ano anterior.
 */

export interface IntervaloPeriodo {
  inicio: Date;
  fim: Date;
}

export const ROTULOS_PERIODO: Readonly<Record<PeriodoMeta, string>> = {
  MENSAL: "Mensal",
  TRIMESTRAL: "Trimestral",
  ANUAL: "Anual",
};

function dataUtc(ano: number, mesZeroBase: number, dia: number): Date {
  return new Date(Date.UTC(ano, mesZeroBase, dia));
}

/**
 * Intervalo do período do calendário que CONTÉM a data de referência.
 * Normalizar aqui é o que impede meia-sobreposição: a UI pode receber
 * qualquer dia do mês e a meta nasce grudada nas bordas do período.
 */
export function intervaloDoPeriodo(
  periodo: PeriodoMeta,
  referencia: Date,
): IntervaloPeriodo {
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth();
  switch (periodo) {
    case "MENSAL":
      return { inicio: dataUtc(ano, mes, 1), fim: dataUtc(ano, mes + 1, 0) };
    case "TRIMESTRAL": {
      const primeiroMesDoTrimestre = Math.floor(mes / 3) * 3;
      return {
        inicio: dataUtc(ano, primeiroMesDoTrimestre, 1),
        fim: dataUtc(ano, primeiroMesDoTrimestre + 3, 0),
      };
    }
    case "ANUAL":
      return { inicio: dataUtc(ano, 0, 1), fim: dataUtc(ano, 12, 0) };
  }
}

/** Rótulo institucional do período de uma meta ("2026", "3º trimestre de 2026"). */
export function rotuloDoIntervalo(periodo: PeriodoMeta, inicio: Date): string {
  const ano = inicio.getUTCFullYear();
  const mes = inicio.getUTCMonth();
  switch (periodo) {
    case "MENSAL": {
      const nome = new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        timeZone: "UTC",
      }).format(inicio);
      return `${nome} de ${ano}`;
    }
    case "TRIMESTRAL":
      return `${Math.floor(mes / 3) + 1}º trimestre de ${ano}`;
    case "ANUAL":
      return String(ano);
  }
}

/** Escopo da meta: geral (categoria nula) ou de uma categoria (RN28). */
export interface EscopoMeta {
  categoriaId: string | null;
}

export interface MetaExistente extends EscopoMeta {
  id: string;
  periodo: PeriodoMeta;
  inicio: Date;
  fim: Date;
}

export interface MetaProposta extends EscopoMeta {
  periodo: PeriodoMeta;
  inicio: Date;
  fim: Date;
  valor: number;
}

function mesmoEscopo(a: EscopoMeta, b: EscopoMeta): boolean {
  return (a.categoriaId ?? null) === (b.categoriaId ?? null);
}

function intervalosSeCruzam(a: IntervaloPeriodo, b: IntervaloPeriodo): boolean {
  return a.inicio.getTime() <= b.fim.getTime() && b.inicio.getTime() <= a.fim.getTime();
}

/**
 * RN28 — Encontra a meta vigente que a proposta atropelaria: mesmo tipo de
 * período, mesmo escopo e datas que se cruzam. Períodos de tipos
 * diferentes convivem por desenho (uma meta anual e uma mensal medem
 * coisas diferentes) — a ficha fala em "mesmo escopo e período".
 * Ignora `ignorarId` para permitir a edição da própria meta.
 */
export function conflitoDeMeta(
  proposta: MetaProposta,
  existentes: ReadonlyArray<MetaExistente>,
  ignorarId?: string,
): MetaExistente | null {
  return (
    existentes.find(
      (existente) =>
        existente.id !== ignorarId &&
        existente.periodo === proposta.periodo &&
        mesmoEscopo(existente, proposta) &&
        intervalosSeCruzam(existente, proposta),
    ) ?? null
  );
}

/** Mensagem que a T17 mostra antes de submeter — a RN28 visível na UI. */
export function mensagemDeConflito(
  conflito: MetaExistente,
  nomeCategoria: string | null,
): string {
  const escopo = nomeCategoria ? `da categoria ${nomeCategoria}` : "geral";
  return `Já existe meta ${escopo} para ${rotuloDoIntervalo(conflito.periodo, conflito.inicio)} (RN28) — ajuste a meta vigente em vez de criar outra.`;
}

/**
 * Validação completa da meta proposta. Retorna a lista de erros — vazia
 * quando a meta pode ser criada.
 */
export function validarMeta(
  proposta: MetaProposta,
  existentes: ReadonlyArray<MetaExistente>,
  opcoes: { nomeCategoria?: string | null; ignorarId?: string } = {},
): string[] {
  const erros: string[] = [];
  if (!Number.isInteger(proposta.valor) || proposta.valor < 1) {
    erros.push("A meta é uma contagem inteira de novos aliados a partir de 1.");
  }
  const esperado = intervaloDoPeriodo(proposta.periodo, proposta.inicio);
  if (
    esperado.inicio.getTime() !== proposta.inicio.getTime() ||
    esperado.fim.getTime() !== proposta.fim.getTime()
  ) {
    erros.push(
      `A meta ${ROTULOS_PERIODO[proposta.periodo].toLowerCase()} precisa cobrir o período inteiro do calendário.`,
    );
  }
  const conflito = conflitoDeMeta(proposta, existentes, opcoes.ignorarId);
  if (conflito) {
    erros.push(mensagemDeConflito(conflito, opcoes.nomeCategoria ?? null));
  }
  return erros;
}
