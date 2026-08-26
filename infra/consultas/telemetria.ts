import { prisma } from "@/infra/prisma/cliente";
import { type AgregadoOferta, agregarTelemetria } from "@/dominio/integracao/agregados";
import { classificarEvento } from "@/dominio/telemetria-operadora/tipo-de-evento";
import { lerRegua } from "@/infra/configuracao/servico-configuracao";

/**
 * Leitura dos agregados de telemetria (RN07): derivam exclusivamente dos
 * eventos importados e do acumulado histórico da carga. Nada é gravado aqui.
 *
 * A janela da vitrine viva ("oferta sem resgate", 90 dias na implantação)
 * é lida do Serviço de Configuração a cada consulta: alterá-la na T17 muda
 * o KPI na próxima visita, sem deploy.
 */

/** Janela vigente da vitrine viva, em dias (chave OFERTA_SEM_RESGATE_DIAS). */
export async function janelaDaVitrineEmDias(): Promise<number> {
  return lerRegua("OFERTA_SEM_RESGATE_DIAS");
}

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

  const janelaEmDias = await janelaDaVitrineEmDias();
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
        dataEvento: { gte: corteJanela(janelaEmDias) },
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

/**
 * KPI "vitrine viva": ofertas publicadas com resgate na janela / total
 * publicadas.
 *
 * **A fonte passou do voucher clássico (Onda 1) para o extrato nominal da
 * operadora (Onda 12).** O card da oferta e este KPI liam
 * `telemetriaEvento`, que nunca foi alimentado em produção; o dado real de
 * resgate chega no relatório "Resgate e Compras", casado à oferta por
 * `ofertaId`. A janela de 90 dias (RN50) é preservada porque o extrato tem
 * data por evento — foi por isso que se escolheu o extrato, e não o
 * catálogo, que é um retrato sem datas (RN68).
 *
 * "Com resgate" conta o evento classificado como RESGATE (Recompensa
 * gratuita) — a mesma leitura da T33/T34. Compra (checkout) é uso, mas não
 * é resgate: a métrica é literal (RN50). Quando o dicionário de
 * `Tipo de Oferta` da operadora chegar (item 4, `[A CONFIRMAR]`), é aqui e
 * na `classificarEvento` que a regra se ajusta, sem tocar no resto.
 */
export async function kpiVitrineViva(): Promise<{
  publicadasComResgate: number;
  totalPublicadas: number;
  janelaEmDias: number;
}> {
  const janelaEmDias = await janelaDaVitrineEmDias();
  const [totalPublicadas, eventos] = await Promise.all([
    prisma.oferta.count({ where: { status: "PUBLICADA" } }),
    prisma.eventoDeResgateTelemetria.findMany({
      where: {
        dataEvento: { gte: corteJanela(janelaEmDias) },
        oferta: { status: "PUBLICADA" },
      },
      select: { ofertaId: true, tipoOferta: true },
    }),
  ]);
  const comResgate = new Set<string>();
  for (const evento of eventos) {
    if (evento.ofertaId && classificarEvento(evento.tipoOferta) === "RESGATE") {
      comResgate.add(evento.ofertaId);
    }
  }
  return {
    publicadasComResgate: comResgate.size,
    totalPublicadas,
    janelaEmDias,
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
