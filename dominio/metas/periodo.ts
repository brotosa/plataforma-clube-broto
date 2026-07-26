import type { PeriodoMeta } from "@prisma/client";

/**
 * Janela dos períodos de meta (Onda 2, RN22) como serviço puro. O mesmo
 * recorte serve para achar a meta vigente e para contar o realizado — se
 * as duas contas usassem janelas diferentes, o painel mentiria.
 *
 * Datas em UTC: a coluna é `DATE` e o período é um fato de calendário
 * (o ano de 2026 começa em 1º de janeiro, não às 21h de 31 de dezembro no
 * fuso local).
 */

export const ROTULOS_PERIODO: Readonly<Record<PeriodoMeta, string>> = {
  MENSAL: "mensal",
  TRIMESTRAL: "trimestral",
  ANUAL: "anual",
};

/** Como o período é dito no título do painel ("Novos aliados no ano"). */
export const ROTULOS_JANELA: Readonly<Record<PeriodoMeta, string>> = {
  MENSAL: "no mês",
  TRIMESTRAL: "no trimestre",
  ANUAL: "no ano",
};

export interface JanelaDePeriodo {
  /** Primeiro instante do período (inclusivo). */
  inicio: Date;
  /** Primeiro instante do período seguinte (exclusivo). */
  fim: Date;
}

/** Janela do período que contém a data de referência. */
export function janelaDoPeriodo(periodo: PeriodoMeta, referencia: Date): JanelaDePeriodo {
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth();

  if (periodo === "ANUAL") {
    return {
      inicio: new Date(Date.UTC(ano, 0, 1)),
      fim: new Date(Date.UTC(ano + 1, 0, 1)),
    };
  }
  if (periodo === "TRIMESTRAL") {
    const primeiroMesDoTrimestre = Math.floor(mes / 3) * 3;
    return {
      inicio: new Date(Date.UTC(ano, primeiroMesDoTrimestre, 1)),
      fim: new Date(Date.UTC(ano, primeiroMesDoTrimestre + 3, 1)),
    };
  }
  return {
    inicio: new Date(Date.UTC(ano, mes, 1)),
    fim: new Date(Date.UTC(ano, mes + 1, 1)),
  };
}

/** A data cai dentro da janela (início inclusivo, fim exclusivo)? */
export function dentroDaJanela(janela: JanelaDePeriodo, data: Date): boolean {
  return data.getTime() >= janela.inicio.getTime() && data.getTime() < janela.fim.getTime();
}

/**
 * Rótulo do período para a tela: "2026" (anual), "3º trimestre de 2026",
 * "julho de 2026".
 */
export function rotuloDaJanela(periodo: PeriodoMeta, janela: JanelaDePeriodo): string {
  const ano = janela.inicio.getUTCFullYear();
  if (periodo === "ANUAL") {
    return String(ano);
  }
  if (periodo === "TRIMESTRAL") {
    const trimestre = Math.floor(janela.inicio.getUTCMonth() / 3) + 1;
    return `${trimestre}º trimestre de ${ano}`;
  }
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${meses[janela.inicio.getUTCMonth()]} de ${ano}`;
}
