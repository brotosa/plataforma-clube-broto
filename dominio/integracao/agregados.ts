import type { TipoEventoTelemetria } from "@prisma/client";

/**
 * Agregados de telemetria por oferta (ficha §6 e §8), como domínio puro.
 *
 * RN07: os agregados derivam EXCLUSIVAMENTE dos eventos importados (e do
 * acumulado histórico da carga inicial, também importado). Nenhuma outra
 * fonte alimenta estes números — garantido pelo teste de arquitetura em
 * infra/arquitetura/imutabilidade.test.ts.
 *
 * Distinção contratual (ficha §6): para vendas FORA da Plataforma o valor
 * pago não transita pela Operadora — o resgate fica "aguardando conciliação"
 * mensal, distinto da "compra confirmada" (dentro da Plataforma).
 */

export interface EventoAgregavel {
  tipo: TipoEventoTelemetria;
  valor: number | null;
  dataEvento: Date;
}

export interface AcumuladoInicial {
  resgates: number | null;
  compras: number | null;
}

export interface AgregadoOferta {
  emitidos: number;
  resgatados: number;
  comprasConfirmadas: number;
  receitaConfirmada: number;
  /** Fora da Plataforma: resgates aguardam conciliação (sem compra confirmada). */
  foraDaPlataforma: boolean;
  /** "Acumulado até a data da carga" (rótulo de Resgates [A CONFIRMAR]). */
  historicoResgates: number | null;
  historicoCompras: number | null;
}

export function agregarTelemetria(parametros: {
  eventos: ReadonlyArray<EventoAgregavel>;
  foraDaPlataforma: boolean;
  acumuladoInicial?: AcumuladoInicial | null;
}): AgregadoOferta {
  let emitidos = 0;
  let resgatados = 0;
  let comprasConfirmadas = 0;
  let receitaConfirmada = 0;
  for (const evento of parametros.eventos) {
    if (evento.tipo === "EMISSAO_VOUCHER") {
      emitidos += 1;
    } else if (evento.tipo === "RESGATE_VOUCHER") {
      resgatados += 1;
    } else if (evento.tipo === "COMPRA_CONFIRMADA") {
      comprasConfirmadas += 1;
      receitaConfirmada += evento.valor ?? 0;
    }
  }
  return {
    emitidos,
    resgatados,
    comprasConfirmadas,
    receitaConfirmada: Math.round(receitaConfirmada * 100) / 100,
    foraDaPlataforma: parametros.foraDaPlataforma,
    historicoResgates: parametros.acumuladoInicial?.resgates ?? null,
    historicoCompras: parametros.acumuladoInicial?.compras ?? null,
  };
}

/** Resgates "vivos": houve resgate na janela (ficha §8 — vitrine viva, 90 dias). */
export function temResgateNaJanela(
  eventos: ReadonlyArray<EventoAgregavel>,
  hoje: Date,
  janelaDias = 90,
): boolean {
  const corte = new Date(hoje);
  corte.setUTCDate(corte.getUTCDate() - janelaDias);
  return eventos.some(
    (evento) => evento.tipo === "RESGATE_VOUCHER" && evento.dataEvento >= corte,
  );
}
