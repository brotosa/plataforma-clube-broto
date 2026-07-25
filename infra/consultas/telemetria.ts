import { prisma } from "@/infra/prisma/cliente";
import { type AgregadoOferta, agregarTelemetria } from "@/dominio/integracao/agregados";

/**
 * Leitura dos agregados de telemetria (RN07): derivam exclusivamente dos
 * eventos importados e do acumulado histórico da carga. Nada é gravado aqui.
 */

const JANELA_VITRINE_DIAS = 90;

function corteJanela(dias: number): Date {
  const corte = new Date();
  corte.setUTCDate(corte.getUTCDate() - dias);
  return corte;
}

export interface ResumoTelemetria {
  emitidos: number;
  resgatados: number;
  comprasConfirmadas: number;
  receitaConfirmada: number;
  /** Houve resgate na janela de vitrine viva (ficha §8). */
  resgateRecente: boolean;
}

function resumoVazio(): ResumoTelemetria {
  return {
    emitidos: 0,
    resgatados: 0,
    comprasConfirmadas: 0,
    receitaConfirmada: 0,
    resgateRecente: false,
  };
}

/**
 * Agregados por oferta em lote (T4, sem N+1): duas agregações no banco
 * (contagem por tipo/receita e resgates na janela) montadas em memória.
 */
export async function resumoTelemetriaPorOferta(
  ofertaIds: string[],
): Promise<Map<string, ResumoTelemetria>> {
  const mapa = new Map<string, ResumoTelemetria>();
  if (ofertaIds.length === 0) return mapa;

  const [porTipo, resgatesRecentes] = await Promise.all([
    prisma.telemetriaEvento.groupBy({
      by: ["ofertaId", "tipo"],
      where: { ofertaId: { in: ofertaIds } },
      _count: { _all: true },
      _sum: { valor: true },
    }),
    prisma.telemetriaEvento.groupBy({
      by: ["ofertaId"],
      where: {
        ofertaId: { in: ofertaIds },
        tipo: "RESGATE_VOUCHER",
        dataEvento: { gte: corteJanela(JANELA_VITRINE_DIAS) },
      },
      _count: { _all: true },
    }),
  ]);

  const obter = (id: string): ResumoTelemetria => {
    const atual = mapa.get(id);
    if (atual) return atual;
    const novo = resumoVazio();
    mapa.set(id, novo);
    return novo;
  };

  for (const grupo of porTipo) {
    if (!grupo.ofertaId) continue;
    const resumo = obter(grupo.ofertaId);
    const quantidade = grupo._count._all;
    if (grupo.tipo === "EMISSAO_VOUCHER") {
      resumo.emitidos += quantidade;
    } else if (grupo.tipo === "RESGATE_VOUCHER") {
      resumo.resgatados += quantidade;
    } else if (grupo.tipo === "COMPRA_CONFIRMADA") {
      resumo.comprasConfirmadas += quantidade;
      resumo.receitaConfirmada += Number(grupo._sum.valor ?? 0);
    }
  }
  for (const grupo of resgatesRecentes) {
    if (grupo.ofertaId && grupo._count._all > 0) {
      obter(grupo.ofertaId).resgateRecente = true;
    }
  }
  return mapa;
}

/** KPI "vitrine viva": ofertas publicadas com resgate na janela / total publicadas. */
export async function kpiVitrineViva(): Promise<{
  publicadasComResgate: number;
  totalPublicadas: number;
}> {
  const [totalPublicadas, comResgate] = await Promise.all([
    prisma.oferta.count({ where: { status: "PUBLICADA" } }),
    prisma.telemetriaEvento.findMany({
      where: {
        tipo: "RESGATE_VOUCHER",
        dataEvento: { gte: corteJanela(JANELA_VITRINE_DIAS) },
        oferta: { status: "PUBLICADA" },
      },
      distinct: ["ofertaId"],
      select: { ofertaId: true },
    }),
  ]);
  return {
    publicadasComResgate: comResgate.filter((r) => r.ofertaId).length,
    totalPublicadas,
  };
}

/** Agregado detalhado de uma oferta (RN07 via função pura de domínio). */
export async function agregadoDaOferta(ofertaId: string): Promise<AgregadoOferta | null> {
  const oferta = await prisma.oferta.findUnique({
    where: { id: ofertaId },
    include: { mecanica: true },
  });
  if (!oferta) return null;
  const [eventos, acumulado] = await Promise.all([
    prisma.telemetriaEvento.findMany({
      where: { ofertaId },
      select: { tipo: true, valor: true, dataEvento: true },
    }),
    prisma.telemetriaAcumuladoInicial.findFirst({
      where: { ofertaId },
      orderBy: { dataCorte: "desc" },
    }),
  ]);
  return agregarTelemetria({
    eventos: eventos.map((evento) => ({
      tipo: evento.tipo,
      valor: evento.valor === null ? null : Number(evento.valor),
      dataEvento: evento.dataEvento,
    })),
    foraDaPlataforma: oferta.mecanica.slug === "CHECKOUT_EXTERNO",
    acumuladoInicial: acumulado
      ? { resgates: acumulado.resgates, compras: acumulado.compras }
      : null,
  });
}
