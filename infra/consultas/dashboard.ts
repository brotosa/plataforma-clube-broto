import type { EstagioEmpresa, Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  type BlocoDashboard,
  CATALOGO_ACAO_HOJE,
  type ChaveIndicador,
  type DefinicaoAcaoHoje,
  type IndicadorApurado,
  type PendenciaApurada,
  type ValorIndicador,
  definicaoDoIndicador,
  disponivel,
  indicadoresDoBloco,
  indisponivel,
  percentual,
} from "@/dominio/dashboard/indicadores";
import { calcularCompletudeAliado } from "./aliados";
import { mapaDeCobertura, painelDeMetas } from "./cobertura-metas";
import { janelaDaVitrineEmDias, kpiVitrineViva } from "./telemetria";
import { listarCampanhas } from "./campanhas";
import { calcularReceitaBroto } from "@/dominio/receita/comissao";
import { diasNoEstagio, ESTAGIOS_FUNIL, nivelEnvelhecimento } from "@/dominio/funil/regras";
import { JANELAS_VENCIMENTO, venceEm } from "@/dominio/assinantes/vencimento";
import { lerRegua, lerReguaDeEnvelhecimento } from "@/infra/configuracao/servico-configuracao";
import {
  type JanelaDashboard,
  type PeriodoDashboard,
  janelaDoDashboard,
} from "@/dominio/dashboard/periodo";

/**
 * Consultas agregadas da T26 (Onda 6, ficha §2).
 *
 * Um princípio governa o arquivo inteiro: **a fonte de cada indicador é a
 * das fichas das Ondas 1–5, não uma reinterpretação**. Onde a onda anterior
 * já publicou o cálculo — vitrine viva (F4), cobertura e metas (F9),
 * medição de campanha (F12), receita de comissão (F2) — a T26 CHAMA aquele
 * cálculo em vez de repeti-lo. Dashboard que recalcula por conta própria é
 * dashboard que diverge da tela de origem, e a faixa "exige ação hoje" leva
 * exatamente a essas telas.
 *
 * RN50 em duas frentes: nenhum número sai daqui sem estar no catálogo, e
 * indicador sem fonte sustentada devolve INDISPONIVEL com motivo.
 */

// ---------------------------------------------------------------------
// Período (seletor da ficha §2)
// ---------------------------------------------------------------------

/**
 * As definições do seletor moram em `dominio/dashboard/periodo.ts`: o
 * componente do seletor é de cliente, e importá-las daqui arrastaria
 * Prisma e node:crypto para o bundle do navegador. Reexportadas para que
 * quem já lê o painel por este módulo continue lendo.
 */
export {
  PERIODOS_DASHBOARD,
  PERIODO_PADRAO,
  ROTULOS_PERIODO,
  janelaDoDashboard,
  periodoValido,
  type JanelaDashboard,
  type PeriodoDashboard,
} from "@/dominio/dashboard/periodo";

// ---------------------------------------------------------------------
// Faixa "Exige ação hoje"
// ---------------------------------------------------------------------

/** Estágios em que uma reavaliação vencida (RN21) é acionável. */
const ESTAGIO_ALIADA: EstagioEmpresa = "ALIADA_ATIVA";

/**
 * As seis contagens da ficha §2, cada uma vinda de query real. Nenhuma é
 * estimada: uma fila vazia devolve 0 e a faixa afirma o estado positivo.
 */
export async function pendenciasDeHoje(
  agora: Date = new Date(),
): Promise<PendenciaApurada[]> {
  const janelaVigenciaDias = await lerRegua("OFERTA_VIGENCIA_A_VENCER_DIAS");
  const limiteVigencia = new Date(agora);
  limiteVigencia.setUTCDate(limiteVigencia.getUTCDate() + janelaVigenciaDias);

  const [
    aprovacoes,
    incompletos,
    vigencias,
    janelas,
    reavaliacoes,
    quarentenas,
    ultimaQuarentena,
  ] = await Promise.all([
    prisma.aprovacaoSolicitacao.count({ where: { estado: "SOLICITADA" } }),
    contarCadastrosBloqueandoPublicacao(),
    prisma.oferta.count({
      where: {
        status: { in: ["RASCUNHO", "PUBLICADA", "PAUSADA"] },
        vigenciaFim: { not: null, gte: agora, lte: limiteVigencia },
      },
    }),
    prisma.contratoComercial.count({
      where: { status: "VIGENTE", emJanelaNaoRenovacao: true },
    }),
    prisma.empresa.count({
      where: { estagio: ESTAGIO_ALIADA, reavaliacaoPendente: true },
    }),
    prisma.importacao.count({ where: { linhasErro: { gt: 0 } } }),
    prisma.importacao.findFirst({
      where: { linhasErro: { gt: 0 } },
      orderBy: { criadoEm: "desc" },
      select: { tipo: true },
    }),
  ]);

  const contagens: Readonly<Record<string, number>> = {
    APROVACOES_PENDENTES: aprovacoes,
    CADASTROS_INCOMPLETOS: incompletos,
    VIGENCIAS_A_VENCER: vigencias,
    JANELAS_CONTRATUAIS: janelas,
    REAVALIACOES_VENCIDAS: reavaliacoes,
    IMPORTACOES_EM_QUARENTENA: quarentenas,
  };

  return CATALOGO_ACAO_HOJE.map((definicao) => ({
    ...definicao,
    contagem: contagens[definicao.chave] ?? 0,
    destino: destinoEfetivo(definicao, ultimaQuarentena?.tipo ?? null),
  }));
}

/**
 * A plataforma tem três importadores em três telas. O cartão de quarentena
 * conta todos e aponta para a tela do tipo da quarentena mais recente — que
 * é onde quem clica vai resolver. Contar tudo e mandar para um lugar fixo
 * levaria o usuário à tela errada em metade dos casos.
 */
function destinoEfetivo(definicao: DefinicaoAcaoHoje, tipoRecente: string | null): string {
  if (definicao.chave !== "IMPORTACOES_EM_QUARENTENA" || !tipoRecente) {
    return definicao.destino;
  }
  if (tipoRecente === "TELEMETRIA") {
    return "/ofertas/telemetria";
  }
  if (tipoRecente === "CARGA_SELLERS" || tipoRecente === "CARGA_OFERTAS") {
    return "/carga-inicial";
  }
  if (tipoRecente === "CARGA_PROSPECTS") {
    return "/mercado/radar";
  }
  return "/assinantes/importacoes";
}

/**
 * RN09 — ofertas que não podem ser publicadas porque o cartão está
 * incompleto. A unidade é a oferta em rascunho: é ela que está parada, e é
 * dela que se chega ao aliado ou à solução que falta preencher.
 */
async function contarCadastrosBloqueandoPublicacao(): Promise<number> {
  const rascunhos = await prisma.oferta.findMany({
    where: { status: "RASCUNHO" },
    select: {
      solucao: {
        select: {
          nome: true,
          descricaoCurta: true,
          imagemCardUrl: true,
          categoriaId: true,
          coberturaNacional: true,
          empresa: { select: { nomeFantasia: true, logoUrl: true } },
          _count: { select: { culturas: true, ufs: true } },
        },
      },
    },
  });

  return rascunhos.filter(({ solucao }) => {
    const itens = [
      Boolean(solucao.empresa.nomeFantasia?.trim()),
      Boolean(solucao.empresa.logoUrl?.trim()),
      Boolean(solucao.nome?.trim()),
      Boolean(solucao.descricaoCurta?.trim()),
      Boolean(solucao.categoriaId),
      solucao._count.culturas > 0,
      solucao.coberturaNacional || solucao._count.ufs > 0,
      Boolean(solucao.imagemCardUrl?.trim()),
    ];
    return itens.some((ok) => !ok);
  }).length;
}

// ---------------------------------------------------------------------
// Blocos por domínio
// ---------------------------------------------------------------------

export interface BlocoApurado {
  bloco: BlocoDashboard;
  indicadores: IndicadorApurado[];
}

export interface PainelDoDashboard {
  janela: JanelaDashboard;
  pendencias: PendenciaApurada[];
  blocos: BlocoApurado[];
  /** Destaque do topo (hero): a vitrine viva, tese comercial do Clube. */
  destaque: IndicadorApurado;
  /** Meta × realizado, exibida com a barra no bloco de Mercado e Funil. */
  meta: { alvo: number; realizado: number; rotuloPeriodo: string | null } | null;
  /** Janela fixa da vitrine viva, lida do Parametrizador. */
  janelaVitrineEmDias: number;
}

/**
 * Monta o painel inteiro. As consultas independentes rodam em paralelo;
 * cada bloco é montado a partir de um mapa chave → valor, e um indicador
 * que ninguém preencheu vira INDISPONIVEL em vez de sumir da tela.
 */
export async function montarPainel(
  periodo: PeriodoDashboard = "90",
  agora: Date = new Date(),
): Promise<PainelDoDashboard> {
  const janela = janelaDoDashboard(periodo, agora);

  const [
    pendencias,
    rede,
    mercado,
    assinantes,
    campanhas,
    janelaVitrineEmDias,
    metas,
  ] = await Promise.all([
    pendenciasDeHoje(agora),
    indicadoresDeRede(janela),
    indicadoresDeMercado(janela, agora),
    indicadoresDeAssinantes(janela, agora),
    indicadoresDeCampanhas(janela),
    janelaDaVitrineEmDias(),
    painelDeMetas(agora),
  ]);

  const valores = new Map<ChaveIndicador, ValorIndicador>([
    ...rede,
    ...mercado,
    ...assinantes,
    ...campanhas,
  ]);

  const blocos: BlocoApurado[] = (
    ["REDE_E_ALIADOS", "MERCADO_E_FUNIL", "ASSINANTES_E_USO", "CAMPANHAS"] as const
  ).map((bloco) => ({
    bloco,
    indicadores: indicadoresDoBloco(bloco).map((definicao) => ({
      ...definicao,
      resultado: valores.get(definicao.chave) ?? indisponivel("SEM_BASE_DE_CALCULO"),
    })),
  }));

  const destaque: IndicadorApurado = {
    ...definicaoDoIndicador("VITRINE_VIVA_PCT"),
    resultado: valores.get("VITRINE_VIVA_PCT") ?? indisponivel("SEM_BASE_DE_CALCULO"),
  };

  const linhaDaMeta = metas.geral;
  return {
    janela,
    pendencias,
    blocos,
    destaque,
    meta: linhaDaMeta
      ? {
          alvo: linhaDaMeta.meta,
          realizado: linhaDaMeta.realizado,
          rotuloPeriodo: metas.rotuloPeriodo,
        }
      : null,
    janelaVitrineEmDias,
  };
}

type ParDeIndicador = readonly [ChaveIndicador, ValorIndicador];

/** Mediana em dias de uma lista de durações — null quando não há amostra. */
function medianaEmDias(duracoesEmMs: number[]): number | null {
  if (duracoesEmMs.length === 0) {
    return null;
  }
  const ordenadas = [...duracoesEmMs].sort((a, b) => a - b);
  const meio = Math.floor(ordenadas.length / 2);
  const mediana =
    ordenadas.length % 2 === 0
      ? ((ordenadas[meio - 1] ?? 0) + (ordenadas[meio] ?? 0)) / 2
      : (ordenadas[meio] ?? 0);
  return Math.round(mediana / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------
// Bloco: Rede e Aliados (ficha Onda 1 §8)
// ---------------------------------------------------------------------

async function indicadoresDeRede(janela: JanelaDashboard): Promise<ParDeIndicador[]> {
  const [aliadas, publicacoes, vitrine, cobertura, receita] = await Promise.all([
    prisma.empresa.findMany({
      where: { estagio: ESTAGIO_ALIADA },
      select: {
        razaoSocial: true,
        nomeFantasia: true,
        cnpj: true,
        enderecoMunicipio: true,
        logoUrl: true,
        descricaoInstitucional: true,
        _count: { select: { categorias: true, contatos: true } },
        contratos: { where: { status: "VIGENTE" }, select: { id: true }, take: 1 },
      },
    }),
    // Tempo rascunho → publicação: a trilha é quem sabe QUANDO publicou.
    prisma.auditoriaEvento.findMany({
      where: {
        entidade: "oferta",
        campo: "status",
        valorNovo: "PUBLICADA",
        criadoEm: { gte: janela.inicio, lte: janela.fim },
      },
      select: { entidadeId: true, criadoEm: true },
      orderBy: { criadoEm: "asc" },
    }),
    kpiVitrineViva(),
    mapaDeCobertura(),
    receitaDeComissao(janela),
  ]);

  const completos = aliadas.filter(
    (aliada) =>
      calcularCompletudeAliado({
        razaoSocial: aliada.razaoSocial,
        nomeFantasia: aliada.nomeFantasia,
        cnpj: aliada.cnpj,
        enderecoMunicipio: aliada.enderecoMunicipio,
        logoUrl: aliada.logoUrl,
        descricaoInstitucional: aliada.descricaoInstitucional,
        quantidadeCategorias: aliada._count.categorias,
        quantidadeContatos: aliada._count.contatos,
        temContratoVigente: aliada.contratos.length > 0,
      }) === 100,
  ).length;

  // Primeira publicação de cada oferta, medida da criação da oferta.
  const primeiraPorOferta = new Map<string, Date>();
  for (const evento of publicacoes) {
    if (!primeiraPorOferta.has(evento.entidadeId)) {
      primeiraPorOferta.set(evento.entidadeId, evento.criadoEm);
    }
  }
  const ofertasPublicadas =
    primeiraPorOferta.size > 0
      ? await prisma.oferta.findMany({
          where: { id: { in: [...primeiraPorOferta.keys()] } },
          select: { id: true, criadoEm: true },
        })
      : [];
  const duracoes = ofertasPublicadas
    .map((oferta) => {
      const publicadaEm = primeiraPorOferta.get(oferta.id);
      return publicadaEm ? publicadaEm.getTime() - oferta.criadoEm.getTime() : null;
    })
    .filter((valor): valor is number => valor !== null && valor >= 0);
  const mediana = medianaEmDias(duracoes);

  return [
    ["ALIADOS_CADASTRO_COMPLETO_PCT", percentual(completos, aliadas.length)],
    [
      "TEMPO_MEDIANO_RASCUNHO_PUBLICACAO",
      mediana === null
        ? indisponivel("SEM_BASE_DE_CALCULO")
        : disponivel(mediana, { base: { parte: duracoes.length, total: duracoes.length } }),
    ],
    ["VITRINE_VIVA_PCT", percentual(vitrine.publicadasComResgate, vitrine.totalPublicadas)],
    [
      "COBERTURA_CATEGORIAS",
      percentual(cobertura.resumo.categoriasCobertas, cobertura.resumo.categorias),
    ],
    ["RECEITA_COMISSAO_ESTIMADA", receita],
  ];
}

/**
 * Receita de comissão estimada: valor pago × comissão % do aliado, apenas
 * Benefícios. Recompensa não comissiona e o cupom segue
 * [A CONFIRMAR] — `calcularReceitaBroto` devolve "não aplicável" nos dois
 * casos, e aqui eles simplesmente não somam. Sem nenhuma compra
 * comissionável na janela, o indicador fica indisponível: R$ 0,00 diria
 * que a rede não faturou, quando a verdade é que não há o que apurar.
 */
async function receitaDeComissao(janela: JanelaDashboard): Promise<ValorIndicador> {
  const compras = await prisma.telemetriaEvento.findMany({
    where: {
      tipo: "COMPRA_CONFIRMADA",
      dataEvento: { gte: janela.inicio, lte: janela.fim },
      ofertaId: { not: null },
    },
    select: {
      valor: true,
      oferta: {
        select: {
          natureza: true,
          solucao: {
            select: {
              empresa: {
                select: {
                  contratos: {
                    where: { status: "VIGENTE" },
                    select: { comissaoPct: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  let total = 0;
  let comissionaveis = 0;
  for (const compra of compras) {
    if (!compra.oferta || compra.valor === null) {
      continue;
    }
    const contrato = compra.oferta.solucao.empresa.contratos[0];
    const resultado = calcularReceitaBroto({
      natureza: compra.oferta.natureza,
      valorPago: Number(compra.valor),
      comissaoPct: contrato?.comissaoPct === undefined ? null : Number(contrato.comissaoPct),
    });
    if (resultado.aplicavel) {
      total += resultado.valor;
      comissionaveis += 1;
    }
  }

  if (comissionaveis === 0) {
    return indisponivel("SEM_BASE_DE_CALCULO");
  }
  return disponivel(Math.round(total * 100) / 100, {
    base: { parte: comissionaveis, total: compras.length },
  });
}

// ---------------------------------------------------------------------
// Bloco: Mercado e Funil (ficha Onda 2 §8)
// ---------------------------------------------------------------------

const ESTAGIOS_DECISAO: ReadonlyArray<string> = ["ALIADA_ATIVA", "DESCARTADA"];

async function indicadoresDeMercado(
  janela: JanelaDashboard,
  agora: Date,
): Promise<ParDeIndicador[]> {
  const noFunil: Prisma.EmpresaWhereInput = { estagio: { in: [...ESTAGIOS_FUNIL] } };

  const [decisoes, totalFunil, avaliadas, empresasDoFunil, cobertura, metas, entradasNaJanela] =
    await Promise.all([
      // Decisões (virou aliada ou foi descartada) tomadas na janela.
      prisma.auditoriaEvento.findMany({
        where: {
          entidade: "empresa",
          campo: "estagio",
          valorNovo: { in: [...ESTAGIOS_DECISAO] },
          valorAnterior: { not: null },
          criadoEm: { gte: janela.inicio, lte: janela.fim },
        },
        select: { entidadeId: true, criadoEm: true, valorNovo: true },
        orderBy: { criadoEm: "asc" },
      }),
      prisma.empresa.count({ where: noFunil }),
      prisma.empresa.count({
        where: { ...noFunil, avaliacoesScout: { some: { status: "FECHADA" } } },
      }),
      prisma.empresa.findMany({
        where: noFunil,
        select: { estagio: true, estagioDesde: true },
      }),
      mapaDeCobertura(),
      painelDeMetas(agora),
      prisma.empresa.count({
        where: { dataEntradaRadar: { gte: janela.inicio, lte: janela.fim } },
      }),
    ]);

  // Tempo radar → decisão: da entrada no radar à primeira decisão.
  const primeiraDecisao = new Map<string, Date>();
  for (const evento of decisoes) {
    if (!primeiraDecisao.has(evento.entidadeId)) {
      primeiraDecisao.set(evento.entidadeId, evento.criadoEm);
    }
  }
  const decididas =
    primeiraDecisao.size > 0
      ? await prisma.empresa.findMany({
          where: { id: { in: [...primeiraDecisao.keys()] }, dataEntradaRadar: { not: null } },
          select: { id: true, dataEntradaRadar: true },
        })
      : [];
  const duracoes = decididas
    .map((empresa) => {
      const decididaEm = primeiraDecisao.get(empresa.id);
      return decididaEm && empresa.dataEntradaRadar
        ? decididaEm.getTime() - empresa.dataEntradaRadar.getTime()
        : null;
    })
    .filter((valor): valor is number => valor !== null && valor >= 0);
  const mediana = medianaEmDias(duracoes);

  // Envelhecimento por estágio: quantas empresas passaram da régua vigente.
  const regua = await lerReguaDeEnvelhecimento();
  const porEstagio = new Map<string, number>();
  let envelhecidas = 0;
  for (const empresa of empresasDoFunil) {
    const dias = diasNoEstagio(empresa.estagioDesde, agora);
    if (nivelEnvelhecimento(dias, regua) === null) {
      continue;
    }
    envelhecidas += 1;
    porEstagio.set(empresa.estagio, (porEstagio.get(empresa.estagio) ?? 0) + 1);
  }

  // Conversão radar → aliada dentro da janela.
  const viraramAliada = [...primeiraDecisao.keys()].filter((id) =>
    decisoes.some((e) => e.entidadeId === id && e.valorNovo === "ALIADA_ATIVA"),
  ).length;

  const linhaDaMeta = metas.geral;

  return [
    [
      "TEMPO_MEDIANO_RADAR_DECISAO",
      mediana === null ? indisponivel("SEM_BASE_DE_CALCULO") : disponivel(mediana),
    ],
    ["FUNIL_AVALIADO_PCT", percentual(avaliadas, totalFunil)],
    [
      "ENVELHECIMENTO_POR_ESTAGIO",
      empresasDoFunil.length === 0
        ? indisponivel("SEM_BASE_DE_CALCULO")
        : disponivel(envelhecidas, {
            base: { parte: envelhecidas, total: empresasDoFunil.length },
            fatias: [...ESTAGIOS_FUNIL].map((estagio) => ({
              rotulo: estagio,
              valor: porEstagio.get(estagio) ?? 0,
            })),
          }),
    ],
    ["CONVERSAO_RADAR_ALIADA_PCT", percentual(viraramAliada, entradasNaJanela)],
    [
      "GAPS_DE_COBERTURA",
      cobertura.resumo.categorias === 0
        ? indisponivel("SEM_BASE_DE_CALCULO")
        : disponivel(cobertura.resumo.gaps, {
            base: { parte: cobertura.resumo.gaps, total: cobertura.resumo.categorias },
          }),
    ],
    [
      "META_X_REALIZADO",
      // O alvo vem do Parametrizador (RN23). Sem meta definida lá, a T26
      // diz "parâmetro ainda não definido" — nunca assume um número.
      linhaDaMeta
        ? disponivel(linhaDaMeta.realizado, {
            base: { parte: linhaDaMeta.realizado, total: linhaDaMeta.meta },
          })
        : indisponivel("PARAMETRO_NAO_DEFINIDO"),
    ],
  ];
}

// ---------------------------------------------------------------------
// Bloco: Assinantes e Uso (ficha Onda 5 §8)
// ---------------------------------------------------------------------

async function indicadoresDeAssinantes(
  janela: JanelaDashboard,
  agora: Date,
): Promise<ParDeIndicador[]> {
  const daBase: Prisma.AssinanteWhereInput = { statusBase: "ATIVO" };

  const [total, comContato, comEnriquecimento, porUf, porPreferencia, assinaturas, granularidade] =
    await Promise.all([
      prisma.assinante.count({ where: daBase }),
      prisma.assinante.count({
        where: {
          ...daBase,
          OR: [{ email: { not: null } }, { telefone: { not: null } }],
        },
      }),
      prisma.assinante.count({ where: { ...daBase, atributos: { some: {} } } }),
      prisma.assinante.groupBy({
        by: ["uf"],
        where: daBase,
        _count: { _all: true },
        orderBy: { _count: { uf: "desc" } },
      }),
      prisma.assinante.groupBy({
        by: ["preferencia"],
        where: daBase,
        _count: { _all: true },
      }),
      prisma.assinatura.findMany({
        where: { vencimento: { not: null }, assinante: daBase },
        select: { vencimento: true },
      }),
      // Sonda da RN50/RN36: existe telemetria por CPF na janela?
      prisma.telemetriaEvento.count({
        where: {
          cpfHash: { not: null },
          dataEvento: { gte: janela.inicio, lte: janela.fim },
        },
      }),
    ]);

  const uso = await usoPorAssinante(janela, granularidade, total);

  const fatiasUf = porUf
    .filter((linha) => linha.uf)
    .slice(0, 8)
    .map((linha) => ({ rotulo: linha.uf as string, valor: linha._count._all }));
  const fatiasPreferencia = porPreferencia.map((linha) => ({
    rotulo: linha.preferencia ?? "não informada",
    valor: linha._count._all,
  }));

  const fatiasVencimento = JANELAS_VENCIMENTO.map((dias) => ({
    rotulo: `${dias} dias`,
    valor: assinaturas.filter(
      (assinatura) => assinatura.vencimento && venceEm(assinatura.vencimento, agora, dias),
    ).length,
  }));

  return [
    ["BASE_COM_CONTATO_VALIDO_PCT", percentual(comContato, total)],
    ["COBERTURA_ENRIQUECIMENTO_PCT", percentual(comEnriquecimento, total)],
    ["ASSINANTES_COM_USO_90D_PCT", uso],
    [
      "DISTRIBUICAO_UF_PREFERENCIA",
      total === 0
        ? indisponivel("SEM_BASE_DE_CALCULO")
        : disponivel(fatiasUf.length, { fatias: [...fatiasUf, ...fatiasPreferencia] }),
    ],
    [
      "VENCIMENTOS_30_60_90",
      assinaturas.length === 0
        ? indisponivel("SEM_BASE_DE_CALCULO")
        : disponivel(fatiasVencimento[0]?.valor ?? 0, { fatias: fatiasVencimento }),
    ],
  ];
}

/**
 * % de assinantes com uso na janela.
 *
 * É O indicador que a ficha usa para nomear a honestidade estrutural: ele
 * depende de a telemetria trazer `cpf_hash`, granularidade que a Minutrade
 * ainda não entrega ([A CONFIRMAR], mesma pendência da RN36). Sem NENHUM
 * evento identificado por CPF na janela, o número não é 0% — ele não
 * existe, e a T26 diz "aguarda telemetria por assinante".
 */
async function usoPorAssinante(
  janela: JanelaDashboard,
  eventosComCpf: number,
  totalDaBase: number,
): Promise<ValorIndicador> {
  if (eventosComCpf === 0) {
    return indisponivel("AGUARDA_TELEMETRIA_ASSINANTE");
  }
  if (totalDaBase === 0) {
    return indisponivel("SEM_BASE_DE_CALCULO");
  }
  const linhas = await prisma.$queryRaw<Array<{ usuarios: bigint }>>`
    SELECT COUNT(DISTINCT a."cpf_hash")::bigint AS usuarios
    FROM "assinantes" a
    JOIN "telemetria_eventos" t ON t."cpf_hash" = a."cpf_hash"
    WHERE a."status_base" = 'ATIVO'
      AND t."data_evento" >= ${janela.inicio}
      AND t."data_evento" <= ${janela.fim}
  `;
  return percentual(Number(linhas[0]?.usuarios ?? 0), totalDaBase);
}

// ---------------------------------------------------------------------
// Bloco: Campanhas (ficha Onda 4 §7)
// ---------------------------------------------------------------------

/**
 * Todo número deste bloco viaja com o nível de atribuição (RN43): a T26
 * reusa a medição da F12, então "campanhas ativas" e "ofertas com resgate"
 * são por oferta, e a taxa de metas só considera as metas cujo nível está
 * disponível — meta que espera telemetria por CPF não entra no
 * denominador como se tivesse falhado.
 */
async function indicadoresDeCampanhas(janela: JanelaDashboard): Promise<ParDeIndicador[]> {
  const campanhas = await listarCampanhas();
  const ativas = campanhas.filter((campanha) => campanha.estado === "ATIVA");

  const realizados = campanhas.flatMap((campanha) => campanha.realizados);
  const mensuraveis = realizados.filter((realizado) => realizado.disponivel);
  const atingidas = mensuraveis.filter((realizado) => realizado.atingida).length;

  const ofertasDeCampanha = await prisma.oferta.findMany({
    where: {
      destinacao: { in: ["CAMPANHA", "CESTA"] },
      status: { in: ["PUBLICADA", "PAUSADA", "EXPIRADA", "ENCERRADA"] },
    },
    select: { id: true },
  });
  const comResgate =
    ofertasDeCampanha.length === 0
      ? []
      : await prisma.telemetriaEvento.findMany({
          where: {
            ofertaId: { in: ofertasDeCampanha.map((oferta) => oferta.id) },
            tipo: "RESGATE_VOUCHER",
            dataEvento: { gte: janela.inicio, lte: janela.fim },
          },
          distinct: ["ofertaId"],
          select: { ofertaId: true },
        });

  const taxaMetas =
    mensuraveis.length === 0
      ? indisponivel(
          realizados.length === 0 ? "SEM_BASE_DE_CALCULO" : "AGUARDA_TELEMETRIA_ASSINANTE",
        )
      : {
          ...percentual(atingidas, mensuraveis.length),
          nivelAtribuicao: "POR_OFERTA" as const,
        };

  const resgatePercentual = percentual(comResgate.length, ofertasDeCampanha.length);

  return [
    ["CAMPANHAS_ATIVAS", disponivel(ativas.length, { nivelAtribuicao: "POR_OFERTA" })],
    [
      "TAXA_METAS_ATINGIDAS_PCT",
      taxaMetas.estado === "DISPONIVEL"
        ? { ...taxaMetas, nivelAtribuicao: "POR_OFERTA" }
        : taxaMetas,
    ],
    [
      "OFERTAS_CAMPANHA_COM_RESGATE_PCT",
      resgatePercentual.estado === "DISPONIVEL"
        ? { ...resgatePercentual, nivelAtribuicao: "POR_OFERTA" }
        : resgatePercentual,
    ],
  ];
}
