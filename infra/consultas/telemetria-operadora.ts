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

/** O extrato nominal de um patrocinador — a outra contagem, jamais somada. */
export interface ApuracaoNominal {
  eventos: number;
  assinantesComEvento: number;
  /** Data do evento mais recente contado. */
  dataDoRetrato: Date | null;
}

/**
 * Resgates nominais dos assinantes com vínculo VIGENTE no patrocinador.
 *
 * `null` quando não há evento algum para essa base — o card volta ao
 * traço com motivo, que é o comportamento que a RN65 contrata.
 */
export async function apurarExtratoNominal(
  patrocinadorId: string,
): Promise<ApuracaoNominal | null> {
  const eventos = await prisma.eventoDeResgateTelemetria.findMany({
    where: { assinante: { vinculos: { some: { patrocinadorId, fim: null } } } },
    select: { assinanteId: true, dataEvento: true },
  });
  if (eventos.length === 0) {
    return null;
  }
  let dataDoRetrato: Date | null = null;
  const assinantes = new Set<string>();
  for (const evento of eventos) {
    assinantes.add(evento.assinanteId);
    if (!dataDoRetrato || evento.dataEvento > dataDoRetrato) {
      dataDoRetrato = evento.dataEvento;
    }
  }
  return {
    eventos: eventos.length,
    assinantesComEvento: assinantes.size,
    dataDoRetrato,
  };
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
