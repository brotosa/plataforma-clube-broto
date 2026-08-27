import { Prisma } from "@prisma/client";

import {
  classificarEvento,
  modalidadeDeResgate,
  MODALIDADES_DE_RESGATE,
  ROTULO_MODALIDADE,
  type ModalidadeDeResgate,
} from "@/dominio/telemetria-operadora/tipo-de-evento";
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

/** Uma modalidade dentro do total de resgates — o "como" (RN65). */
export interface ContagemPorModalidade extends ContagemNominal {
  modalidade: ModalidadeDeResgate;
  rotulo: string;
}

/**
 * O extrato nominal — a contagem que tem CPF, e por isso chega ao
 * patrocinador. Jamais somada ao contador de catálogo (RN68).
 *
 * **Decisão de 28/08: checkout é modalidade de resgate.** `resgates` é o
 * total — todas as modalidades somadas —, e `porModalidade` preserva COMO
 * cada assinante resgatou (gratuito, checkout no clube, checkout externo).
 * Não há mais um card de "compras" à parte: compra virou uma modalidade do
 * resgate, e a quebra vive aqui para a tela poder exibi-la sem recontar.
 */
export interface ApuracaoNominal {
  /** O total de resgates — a soma de todas as modalidades. */
  resgates: ContagemNominal;
  /**
   * A quebra do total por modalidade, na ordem de exibição
   * (`MODALIDADES_DE_RESGATE`). Só as modalidades com ao menos um evento —
   * um zero medido não vira linha, porque o total já o cobre.
   */
  porModalidade: ReadonlyArray<ContagemPorModalidade>;
  /**
   * Eventos cujo `Tipo de Oferta` a fonte não trouxe ou que o de-para não
   * reconhece. Declarado, nunca encaixado no palpite mais provável (RN53) —
   * e é este número que denuncia um valor novo da operadora.
   */
  naoClassificados: number;
}

/**
 * Acumulador de contagem nominal — eventos, assinantes distintos e a data
 * do evento mais recente. Fechado em `ContagemNominal` no fim.
 */
function acumuladorNominal() {
  return { eventos: 0, assinantes: new Set<string>(), data: null as Date | null };
}
type AcumuladorNominal = ReturnType<typeof acumuladorNominal>;

function registrarEvento(alvo: AcumuladorNominal, assinanteId: string, dataEvento: Date) {
  alvo.eventos += 1;
  alvo.assinantes.add(assinanteId);
  if (!alvo.data || dataEvento > alvo.data) {
    alvo.data = dataEvento;
  }
}

function fecharNominal(parcial: AcumuladorNominal): ContagemNominal {
  return {
    eventos: parcial.eventos,
    assinantesComEvento: parcial.assinantes.size,
    dataDoRetrato: parcial.data,
  };
}

/**
 * Resgates dos assinantes com vínculo VIGENTE no patrocinador, com a quebra
 * por modalidade da coluna `Tipo de Oferta`.
 *
 * **Uma consulta só, e um gate só.** `null` quando a base do patrocinador
 * não tem evento nominal algum — aí o card volta ao traço com motivo.
 * Havendo qualquer evento classificado, o card acende com o total e as
 * modalidades presentes; o volume que o de-para não reconhece fica em
 * `naoClassificados`, declarado à parte (RN53), nunca somado ao resgate.
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

  const total = acumuladorNominal();
  const porModalidade = new Map<ModalidadeDeResgate, AcumuladorNominal>();
  let naoClassificados = 0;

  for (const evento of eventos) {
    if (classificarEvento(evento.tipoOferta) !== "RESGATE") {
      naoClassificados += 1;
      continue;
    }
    registrarEvento(total, evento.assinanteId, evento.dataEvento);
    const modalidade = modalidadeDeResgate(evento.tipoOferta);
    if (modalidade) {
      const alvo = porModalidade.get(modalidade) ?? acumuladorNominal();
      registrarEvento(alvo, evento.assinanteId, evento.dataEvento);
      porModalidade.set(modalidade, alvo);
    }
  }

  const quebra: ContagemPorModalidade[] = [];
  for (const modalidade of MODALIDADES_DE_RESGATE) {
    const parcial = porModalidade.get(modalidade);
    if (!parcial) continue;
    quebra.push({ modalidade, rotulo: ROTULO_MODALIDADE[modalidade], ...fecharNominal(parcial) });
  }

  return {
    resgates: fecharNominal(total),
    porModalidade: quebra,
    naoClassificados,
  };
}

/**
 * Total GLOBAL de resgates do extrato nominal (RN68), por natureza de
 * oferta — a soma de todos os eventos de classe RESGATE do relatório
 * "Resgate e Compras", em toda a base (não recortado por campanha nem por
 * patrocinador).
 *
 * É a fonte do card "Resgates de benefícios" do Dashboard depois da errata
 * de 27/08 (o card passou de "resgates na campanha ativa" para o total do
 * extrato — decisão do Administrador da Plataforma, RN50/RN65). Continua
 * sendo UMA contagem só, nomeada como "extrato": jamais somada ao contador
 * de catálogo (RN68).
 *
 * `null` quando não há evento nominal algum nessas naturezas — ausência de
 * apuração, não zero (RN53). Havendo eventos mas nenhum de classe RESGATE,
 * devolve `0` **medido** com a data do retrato.
 */
export interface ResgatesNominaisGlobais {
  resgates: number;
  dataDoRetrato: Date | null;
}

export async function resgatesNominaisGlobais(
  naturezas: ReadonlyArray<"RECOMPENSA" | "BENEFICIO" | "CUPOM_DESCONTO">,
): Promise<ResgatesNominaisGlobais | null> {
  const eventos = await prisma.eventoDeResgateTelemetria.findMany({
    where: { oferta: { natureza: { in: [...naturezas] } } },
    select: { tipoOferta: true, dataEvento: true },
  });
  if (eventos.length === 0) {
    return null;
  }
  let resgates = 0;
  let dataDoRetrato: Date | null = null;
  for (const evento of eventos) {
    if (classificarEvento(evento.tipoOferta) !== "RESGATE") {
      continue;
    }
    resgates += 1;
    if (!dataDoRetrato || evento.dataEvento > dataDoRetrato) {
      dataDoRetrato = evento.dataEvento;
    }
  }
  return { resgates, dataDoRetrato };
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
/** Quantos resgates de cada modalidade, para a linha de uso do assinante. */
export interface UsoPorModalidade {
  modalidade: ModalidadeDeResgate;
  rotulo: string;
  eventos: number;
}

export interface UsoDoAssinante {
  totalEventos: number;
  /** O total de resgates — todas as modalidades somadas. */
  resgates: number;
  /** A quebra do total por modalidade (RN65), só as com evento. */
  porModalidade: ReadonlyArray<UsoPorModalidade>;
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
  let naoClassificados = 0;
  const porModalidade = new Map<ModalidadeDeResgate, number>();
  let dataUltimoEvento = eventos[0]!.dataEvento;
  let dataPrimeiroEvento = eventos[0]!.dataEvento;
  let valorTotal: Prisma.Decimal | null = null;
  let eventosComValor = 0;

  for (const evento of eventos) {
    if (classificarEvento(evento.tipoOferta) === "RESGATE") {
      resgates += 1;
      const modalidade = modalidadeDeResgate(evento.tipoOferta);
      if (modalidade) porModalidade.set(modalidade, (porModalidade.get(modalidade) ?? 0) + 1);
    } else {
      naoClassificados += 1;
    }

    if (evento.dataEvento > dataUltimoEvento) dataUltimoEvento = evento.dataEvento;
    if (evento.dataEvento < dataPrimeiroEvento) dataPrimeiroEvento = evento.dataEvento;

    if (evento.valor !== null) {
      valorTotal = (valorTotal ?? new Prisma.Decimal(0)).add(evento.valor);
      eventosComValor += 1;
    }
  }

  const quebra: UsoPorModalidade[] = MODALIDADES_DE_RESGATE.filter((m) =>
    porModalidade.has(m),
  ).map((modalidade) => ({
    modalidade,
    rotulo: ROTULO_MODALIDADE[modalidade],
    eventos: porModalidade.get(modalidade)!,
  }));

  return {
    totalEventos: eventos.length,
    resgates,
    porModalidade: quebra,
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
    /** Total de resgates da oferta no extrato nominal (todas as modalidades). */
    resgates: number;
    /** A quebra por modalidade (RN65), só as com evento. */
    porModalidade: ReadonlyArray<{ modalidade: ModalidadeDeResgate; rotulo: string; eventos: number }>;
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
    let naoClassificados = 0;
    const porModalidade = new Map<ModalidadeDeResgate, number>();
    let dataUltimo = eventos[0]!.dataEvento;
    for (const evento of eventos) {
      if (classificarEvento(evento.tipoOferta) === "RESGATE") {
        resgates += 1;
        const modalidade = modalidadeDeResgate(evento.tipoOferta);
        if (modalidade) porModalidade.set(modalidade, (porModalidade.get(modalidade) ?? 0) + 1);
      } else {
        naoClassificados += 1;
      }
      if (evento.dataEvento > dataUltimo) dataUltimo = evento.dataEvento;
    }
    const quebra = MODALIDADES_DE_RESGATE.filter((m) => porModalidade.has(m)).map(
      (modalidade) => ({
        modalidade,
        rotulo: ROTULO_MODALIDADE[modalidade],
        eventos: porModalidade.get(modalidade)!,
      }),
    );
    extrato = { resgates, porModalidade: quebra, naoClassificados, dataUltimo };
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
