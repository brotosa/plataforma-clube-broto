import { Prisma } from "@prisma/client";

import { classificarEvento } from "@/dominio/telemetria-operadora/tipo-de-evento";
import { prisma } from "@/infra/prisma/cliente";

/**
 * A apuração da telemetria da operadora — **fonte única** lida pela T33,
 * pelo R1, pela T34, pela lista de Ofertas e pelo panorama da T26.
 *
 * É o padrão da RN51 aplicado à F20: duas telas não podem contar a mesma
 * coisa por caminhos diferentes. E é o que torna o complemento da RN65
 * verdadeiro — o selo de cada card sai **da existência do dado**, apurada
 * aqui, e não de um literal escrito no componente.
 *
 * **As duas contagens nunca se somam (RN68).** O contador de catálogo e o
 * extrato nominal medem coisas diferentes e divergem hoje (227 × 38).
 * Cada função abaixo devolve uma delas, com a origem no nome e a data do
 * retrato junto — e não existe função que devolva a soma, de propósito.
 */

/** O que o catálogo apurou, por natureza de oferta. */
export interface ApuracaoDeCatalogo {
  /** Soma dos resgates do último retrato. */
  resgates: number;
  /** Soma das compras do último retrato. */
  compras: number;
  /** Quantas ofertas entraram na soma — o denominador honesto. */
  ofertas: number;
  /**
   * Data do retrato mais recente entre as ofertas somadas. Nula quando
   * nenhum arquivo declarou data — a tela então diz que a data não veio,
   * e não inventa uma.
   */
  dataDoRetrato: Date | null;
}

/**
 * Apuração do catálogo, opcionalmente restrita a uma natureza de oferta.
 *
 * `null` quando **não há apuração alguma** — que é diferente de zero:
 * zero afirma que ninguém resgatou, e a verdade é que nenhum arquivo foi
 * importado ainda (RN53, herdando a disciplina da RN50).
 */
export async function apurarCatalogo(parametros: {
  natureza?: "RECOMPENSA" | "BENEFICIO" | "CUPOM_DESCONTO";
} = {}): Promise<ApuracaoDeCatalogo | null> {
  const contadores = await prisma.contadorDeOfertaTelemetria.findMany({
    where: parametros.natureza ? { oferta: { natureza: parametros.natureza } } : {},
    select: { resgates: true, compras: true, dataArquivo: true },
  });
  if (contadores.length === 0) {
    return null;
  }
  let dataDoRetrato: Date | null = null;
  let resgates = 0;
  let compras = 0;
  for (const contador of contadores) {
    resgates += contador.resgates;
    compras += contador.compras;
    if (contador.dataArquivo && (!dataDoRetrato || contador.dataArquivo > dataDoRetrato)) {
      dataDoRetrato = contador.dataArquivo;
    }
  }
  return { resgates, compras, ofertas: contadores.length, dataDoRetrato };
}

/** Uma das duas contagens do extrato nominal de um patrocinador. */
export interface ContagemNominal {
  eventos: number;
  assinantesComEvento: number;
  /** Data do evento mais recente contado. */
  dataDoRetrato: Date | null;
}

/**
 * O extrato nominal — a contagem que tem CPF, e por isso chega ao
 * patrocinador. Jamais somada ao contador de catálogo (RN68).
 */
export interface ApuracaoNominal {
  resgates: ContagemNominal;
  compras: ContagemNominal;
  /**
   * Eventos cujo `Tipo de Oferta` a fonte não trouxe ou que o de-para não
   * reconhece. Declarado, nunca distribuído entre os dois (RN53) — e é
   * este número que denuncia um valor novo da operadora.
   */
  naoClassificados: number;
}

/**
 * Resgates E compras dos assinantes com vínculo VIGENTE no patrocinador,
 * separados pelo de-para da coluna `Tipo de Oferta`.
 *
 * **Uma consulta só para os dois cards, e um gate só.** `null` quando a
 * base do patrocinador não tem evento nominal algum — aí os dois cards
 * voltam ao traço com motivo. Havendo qualquer evento, os DOIS acendem:
 * as três classes vêm da mesma coluna do mesmo relatório, então ter
 * evento é ter as duas contagens. Um zero em `compras`, nesse caso, é um
 * zero **medido** ("ninguém comprou") e não ausência de apuração — que é
 * exatamente a distinção que a RN53 existe para preservar.
 */
export async function apurarExtratoNominal(
  patrocinadorId: string,
): Promise<ApuracaoNominal | null> {
  const eventos = await prisma.eventoDeResgateTelemetria.findMany({
    where: { assinante: { vinculos: { some: { patrocinadorId, fim: null } } } },
    select: { assinanteId: true, dataEvento: true, tipoOferta: true },
  });
  if (eventos.length === 0) {
    return null;
  }

  const acumular = () => ({
    eventos: 0,
    assinantes: new Set<string>(),
    data: null as Date | null,
  });
  const porClasse = { RESGATE: acumular(), COMPRA: acumular() };
  let naoClassificados = 0;

  for (const evento of eventos) {
    const classe = classificarEvento(evento.tipoOferta);
    if (classe === "NAO_CLASSIFICADO") {
      naoClassificados += 1;
      continue;
    }
    const alvo = porClasse[classe];
    alvo.eventos += 1;
    alvo.assinantes.add(evento.assinanteId);
    if (!alvo.data || evento.dataEvento > alvo.data) {
      alvo.data = evento.dataEvento;
    }
  }

  const fechar = (parcial: ReturnType<typeof acumular>): ContagemNominal => ({
    eventos: parcial.eventos,
    assinantesComEvento: parcial.assinantes.size,
    dataDoRetrato: parcial.data,
  });

  return {
    resgates: fechar(porClasse.RESGATE),
    compras: fechar(porClasse.COMPRA),
    naoClassificados,
  };
}

/**
 * O RFV de um assinante (RN36) — recência, frequência e valor a partir dos
 * eventos nominais que casaram por CPF na importação da operadora.
 *
 * `null` quando o assinante **não tem evento nominal algum** — a seção
 * "Uso" volta ao estado de espera com motivo (RN53), nunca a zero. `valor`
 * é ausência declarada, não zero: a coluna `Valor` nem sempre veio, e um
 * "0" só entra quando foi medido.
 */
export interface UsoDoAssinante {
  totalEventos: number;
  resgates: number;
  compras: number;
  naoClassificados: number;
  /** Recência — a data do evento mais recente. */
  dataUltimoEvento: Date;
  /** Frequência anotada com o horizonte medido pela própria fonte. */
  dataPrimeiroEvento: Date;
  /** Soma do `Valor` onde a fonte o trouxe; `null` se nenhuma linha teve valor. */
  valorTotal: Prisma.Decimal | null;
  /** Quantos eventos trouxeram valor — o denominador honesto do valor. */
  eventosComValor: number;
}

export async function usoPorAssinante(assinanteId: string): Promise<UsoDoAssinante | null> {
  const eventos = await prisma.eventoDeResgateTelemetria.findMany({
    where: { assinanteId },
    select: { dataEvento: true, tipoOferta: true, valor: true },
  });
  if (eventos.length === 0) {
    return null;
  }

  let resgates = 0;
  let compras = 0;
  let naoClassificados = 0;
  let dataUltimoEvento = eventos[0]!.dataEvento;
  let dataPrimeiroEvento = eventos[0]!.dataEvento;
  let valorTotal: Prisma.Decimal | null = null;
  let eventosComValor = 0;

  for (const evento of eventos) {
    const classe = classificarEvento(evento.tipoOferta);
    if (classe === "RESGATE") resgates += 1;
    else if (classe === "COMPRA") compras += 1;
    else naoClassificados += 1;

    if (evento.dataEvento > dataUltimoEvento) dataUltimoEvento = evento.dataEvento;
    if (evento.dataEvento < dataPrimeiroEvento) dataPrimeiroEvento = evento.dataEvento;

    if (evento.valor !== null) {
      valorTotal = (valorTotal ?? new Prisma.Decimal(0)).add(evento.valor);
      eventosComValor += 1;
    }
  }

  return {
    totalEventos: eventos.length,
    resgates,
    compras,
    naoClassificados,
    dataUltimoEvento,
    dataPrimeiroEvento,
    valorTotal,
    eventosComValor,
  };
}

/**
 * Telemetria da operadora de UMA oferta, para o card da T5 — as duas
 * contagens lado a lado, **nunca somadas** (RN68).
 *
 * `catalogo` é o retrato acumulado por oferta (relatório "Lista de
 * Ofertas"), com a data do arquivo. `extrato` é a contagem dos eventos
 * nominais que casaram a esta oferta por `ofertaId` (relatório "Resgate e
 * Compras"), com a data do evento mais recente. Cada bloco é `null` quando
 * a respectiva fonte não trouxe nada — ausência, não zero (RN53).
 */
export interface TelemetriaDaOferta {
  catalogo: { resgates: number; compras: number; dataArquivo: Date | null } | null;
  extrato: {
    resgates: number;
    compras: number;
    naoClassificados: number;
    dataUltimo: Date;
  } | null;
}

export async function telemetriaOperadoraDaOferta(
  ofertaId: string,
): Promise<TelemetriaDaOferta> {
  const [contador, eventos] = await Promise.all([
    prisma.contadorDeOfertaTelemetria.findUnique({
      where: { ofertaId },
      select: { resgates: true, compras: true, dataArquivo: true },
    }),
    prisma.eventoDeResgateTelemetria.findMany({
      where: { ofertaId },
      select: { tipoOferta: true, dataEvento: true },
    }),
  ]);

  const catalogo = contador
    ? {
        resgates: contador.resgates,
        compras: contador.compras,
        dataArquivo: contador.dataArquivo,
      }
    : null;

  let extrato: TelemetriaDaOferta["extrato"] = null;
  if (eventos.length > 0) {
    let resgates = 0;
    let compras = 0;
    let naoClassificados = 0;
    let dataUltimo = eventos[0]!.dataEvento;
    for (const evento of eventos) {
      const classe = classificarEvento(evento.tipoOferta);
      if (classe === "RESGATE") resgates += 1;
      else if (classe === "COMPRA") compras += 1;
      else naoClassificados += 1;
      if (evento.dataEvento > dataUltimo) dataUltimo = evento.dataEvento;
    }
    extrato = { resgates, compras, naoClassificados, dataUltimo };
  }

  return { catalogo, extrato };
}

/** O funil de ativação (RN63) da base vinculada a um patrocinador. */
export interface ApuracaoDoFunil {
  cadastrados: number;
  freemium: number;
  assinantes: number;
}

/**
 * Estado do usuário dos vinculados. `null` enquanto **nenhum** deles tiver
 * estado informado — o estado vem da importação de usuários, e antes dela
 * a coluna inteira é nula.
 */
export async function apurarFunilDeAtivacao(
  patrocinadorId: string,
): Promise<ApuracaoDoFunil | null> {
  const porEstado = await prisma.assinante.groupBy({
    by: ["estadoUsuario"],
    where: {
      vinculos: { some: { patrocinadorId, fim: null } },
      estadoUsuario: { not: null },
    },
    _count: { _all: true },
  });
  if (porEstado.length === 0) {
    return null;
  }
  const contar = (estado: "CADASTRADO" | "FREEMIUM" | "ASSINANTE") =>
    porEstado.find((grupo) => grupo.estadoUsuario === estado)?._count._all ?? 0;
  return {
    cadastrados: contar("CADASTRADO"),
    freemium: contar("FREEMIUM"),
    assinantes: contar("ASSINANTE"),
  };
}

/** Última importação de cada tipo — cabeçalho da T34 e do histórico. */
export async function ultimaImportacaoPorTipo() {
  const importacoes = await prisma.importacaoTelemetria.findMany({
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      tipoLayout: true,
      nomeArquivo: true,
      criadoEm: true,
      dataGeracaoDeclarada: true,
      lidas: true,
      aplicadas: true,
      recusadas: true,
    },
  });
  const porTipo = new Map<string, (typeof importacoes)[number]>();
  for (const importacao of importacoes) {
    if (!porTipo.has(importacao.tipoLayout)) {
      porTipo.set(importacao.tipoLayout, importacao);
    }
  }
  return porTipo;
}

/** Contador do último retrato de uma lista de ofertas (lista de Ofertas). */
export async function contadoresPorOferta(
  ofertaIds: readonly string[],
): Promise<Map<string, { resgates: number; compras: number; dataArquivo: Date | null }>> {
  if (ofertaIds.length === 0) return new Map();
  const contadores = await prisma.contadorDeOfertaTelemetria.findMany({
    where: { ofertaId: { in: [...ofertaIds] } },
    select: { ofertaId: true, resgates: true, compras: true, dataArquivo: true },
  });
  return new Map(
    contadores.map((contador) => [
      contador.ofertaId,
      {
        resgates: contador.resgates,
        compras: contador.compras,
        dataArquivo: contador.dataArquivo,
      },
    ]),
  );
}
