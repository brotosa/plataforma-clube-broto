import type { EstagioEmpresa, NivelAtribuicao, Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  apurarCatalogo,
  resgatesNominaisGlobais,
  type ApuracaoDeCatalogo,
  type ResgatesNominaisGlobais,
} from "@/infra/consultas/telemetria-operadora";
import {
  type BlocoDashboard,
  CATALOGO_ACAO_HOJE,
  CATALOGO_PANORAMA,
  type CelulaPanorama,
  type ChaveIndicador,
  type ChavePanorama,
  type DefinicaoAcaoHoje,
  type DefinicaoPanorama,
  type IndicadorApurado,
  type PendenciaApurada,
  TEXTOS_INDISPONIBILIDADE,
  type ValorIndicador,
  definicaoDoIndicador,
  disponivel,
  indicadoresDoBloco,
  indisponivel,
  percentual,
} from "@/dominio/dashboard/indicadores";
import { calcularCompletudeAliado } from "./aliados";
import { mapaDeCobertura, painelDeMetas } from "./cobertura-metas";
import { apurarCobertura } from "./cobertura";
import { montarPortfolio, resumirPortfolio } from "@/dominio/cobertura/cobertura";
import { listarCestas, situacaoRn41 } from "@/infra/casos-de-uso/cestas";
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
          categoriaId: true,
          coberturaNacional: true,
          empresa: {
            select: {
              nomeFantasia: true,
              logoUrl: true,
              // Só a existência: o binário não entra em consulta de painel.
              marca: { select: { empresaId: true } },
            },
          },
          _count: { select: { culturas: true, ufs: true } },
        },
      },
    },
  });

  return rascunhos.filter(({ solucao }) => {
    // Mesma régua do domínio (`calcularCompletudeCard`): só os itens
    // OBRIGATÓRIOS. São opcionais e NÃO entram aqui a imagem do card (24/08) e
    // a descrição curta (25/08) — restam seis obrigatórios. O teste
    // `completude-equivalente.regressao` prende as duas listas juntas.
    const itens = [
      Boolean(solucao.empresa.nomeFantasia?.trim()),
      solucao.empresa.marca !== null || Boolean(solucao.empresa.logoUrl?.trim()),
      Boolean(solucao.nome?.trim()),
      Boolean(solucao.categoriaId),
      solucao._count.culturas > 0,
      solucao.coberturaNacional || solucao._count.ufs > 0,
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

const FORMATO_PANORAMA = new Intl.NumberFormat("pt-BR");

const FORMATO_RETRATO = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "UTC",
});

/**
 * F20 — as duas células de telemetria do panorama, montadas por uma
 * função só porque a regra delas é a mesma.
 *
 * **A ordem de preferência é deliberada e existe para não haver
 * regressão.** O número NOMINAL vem primeiro: onde a célula já mostrava
 * um valor antes da F20, ela continua mostrando exatamente o mesmo, pela
 * mesma conta. O contador de catálogo entra só onde havia traço — que é
 * o que a fase se propôs a acender.
 *
 * **As duas contagens jamais se somam (RN68).** É uma OU outra, e a nota
 * sempre diz qual, com a data do retrato quando a origem é o catálogo.
 * Somá-las produziria um número que não mede nada: elas divergem hoje
 * (227 × 38) e a operadora ainda não documentou a regra de contagem de
 * cada uma.
 */
function celulaDeTelemetria(
  definicao: DefinicaoPanorama,
  nominal: number | null,
  notaDoNominal: string,
  catalogo: ApuracaoDeCatalogo | null,
  extras: { nivelAtribuicao?: NivelAtribuicao } = {},
): CelulaPanorama {
  if (nominal !== null) {
    return {
      ...definicao,
      resultado: disponivel(nominal, extras),
      nota: `${notaDoNominal} · origem: extrato`,
    };
  }
  if (catalogo !== null) {
    const retrato = catalogo.dataDoRetrato
      ? `retrato de ${FORMATO_RETRATO.format(catalogo.dataDoRetrato)}`
      : "o arquivo não declarou a data do retrato";
    return {
      ...definicao,
      resultado: disponivel(catalogo.resgates),
      nota: `origem: catálogo da operadora · ${retrato} · ${FORMATO_PANORAMA.format(catalogo.ofertas)} oferta(s)`,
    };
  }
  return {
    ...definicao,
    resultado: indisponivel("AGUARDA_TELEMETRIA_ASSINANTE"),
    nota: `${notaDoNominal} · nenhum relatório da operadora importado ainda`,
  };
}

/**
 * Panorama do hero (Onda 7 §6) — as oito células, montadas a partir do que
 * as consultas dos blocos JÁ trouxeram.
 *
 * O parâmetro `valores` é o mesmo mapa que alimenta os quatro blocos: é daí
 * que saem "aliados na rede" (denominador da completude), "assinantes na
 * base" (denominador do contato válido) e "campanhas ativas". Célula que não
 * encontra número devolve INDISPONIVEL com motivo — jamais zero (RN53).
 */
function montarPanorama(
  valores: ReadonlyMap<ChaveIndicador, ValorIndicador>,
  extras: {
    solucoesPublicadas: number;
    categoriasSemSolucao: number;
    ofertasAtivas: number;
    ofertasTotal: number;
    /**
     * F15 — ofertas ativas publicadas COM RESGATE na janela. Vem do mesmo
     * serviço da vitrine viva (`kpiVitrineViva`), que é o numerador dela:
     * a célula e o percentual do hero não podem ser contados por caminhos
     * diferentes. `null` quando não há base de cálculo.
     */
    ofertasComResgate: number | null;
    janelaVitrineEmDias: number;
    /**
     * Aliados cujo contrato foi assinado na janela (a base inteira em
     * "Todos") — a célula Aliados passou a obedecer a DATA DE ASSINATURA
     * (decisão de 28/08), não a contagem de estado da rede.
     */
    aliadosNoPeriodo: number;
    /**
     * Ofertas publicadas cujo início de vigência caiu na janela (todas as
     * publicadas em "Todos") — a célula Ofertas passou a obedecer a DATA DA
     * OFERTA (início da vigência). Deixa de ser o numerador da vitrine viva
     * (a F15 acoplava as duas); a vitrine viva segue como destaque próprio.
     */
    ofertasNoPeriodo: number;
    campanhasAtivas: number;
    versaoKitVigente: number | null;
    cestasReutilizaveis: number;
    cestasComPendenciaRn41: number;
    /**
     * F20 — o que o CATÁLOGO da operadora apurou, por natureza de oferta
     * (RN68). Nulo enquanto nenhum arquivo tiver sido importado: é
     * ausência de apuração, não zero resgates.
     *
     * **Nunca somado** ao número nominal acima: as duas contagens medem
     * coisas diferentes e divergem hoje (227 × 38). A célula mostra uma
     * OU outra, sempre com a origem nomeada na nota.
     */
    catalogoBeneficios: ApuracaoDeCatalogo | null;
    catalogoCupons: ApuracaoDeCatalogo | null;
    /**
     * Errata 27/08 (RN50/RN65) — total do extrato nominal de benefícios
     * (RECOMPENSA + BENEFICIO). Vira a PRIMEIRA opção do card "Resgates de
     * benefícios", à frente do catálogo; nulo quando não há evento nominal.
     */
    extratoBeneficios: ResgatesNominaisGlobais | null;
    /** Errata 28/08 — idem para o card de cupons (natureza CUPOM_DESCONTO). */
    extratoCupons: ResgatesNominaisGlobais | null;
  },
): CelulaPanorama[] {
  const definicao = (chave: ChavePanorama) =>
    CATALOGO_PANORAMA.find((item) => item.chave === chave) as DefinicaoPanorama;

  const completude = valores.get("ALIADOS_CADASTRO_COMPLETO_PCT");
  // A célula Ofertas lia daqui o percentual da vitrine viva para compor a
  // nota. Desde a F15 ela mostra o número absoluto, vindo do mesmo serviço
  // (`kpiVitrineViva`) por `extras.ofertasComResgate` — o percentual segue
  // sendo o destaque do hero, e a célula não o repete.
  const contato = valores.get("BASE_COM_CONTATO_VALIDO_PCT");

  const aliadosNaRede =
    completude?.estado === "DISPONIVEL" && completude.base ? completude.base.total : null;
  const baseDeAssinantes =
    contato?.estado === "DISPONIVEL" && contato.base ? contato.base.total : null;

  const celulas: CelulaPanorama[] = [
    {
      // Aliados pela DATA DE ASSINATURA do contrato (decisão de 28/08). A
      // completude média do cadastro segue como nota — é qualidade da base,
      // não recorte de período; `aliadosNaRede` continua sendo o denominador
      // dela. Sem base de cadastro alguma, a célula fica indisponível.
      ...definicao("PAN_ALIADOS"),
      resultado:
        aliadosNaRede === null
          ? indisponivel("SEM_BASE_DE_CALCULO")
          : disponivel(extras.aliadosNoPeriodo),
      nota:
        completude?.estado === "DISPONIVEL"
          ? `completude média do cadastro: ${FORMATO_PANORAMA.format(completude.valor)}%`
          : "completude média do cadastro: sem base",
    },
    {
      ...definicao("PAN_SOLUCOES"),
      resultado: disponivel(extras.solucoesPublicadas),
      nota:
        extras.categoriasSemSolucao > 0
          ? `publicadas na vitrine · ${FORMATO_PANORAMA.format(extras.categoriasSemSolucao)} categoria(s) ainda sem nenhuma — depende da carga inicial do portfólio`
          : "publicadas na vitrine · depende da carga inicial do portfólio",
    },
    {
      // Ofertas pela DATA DA OFERTA — início da vigência — dentro do período
      // (decisão de 28/08). Deixa de ser o numerador da vitrine viva (a F15
      // acoplava as duas): a vitrine viva continua sendo o destaque próprio
      // do hero, com a sua janela parametrizada; esta célula responde ao
      // seletor de período. Sem oferta publicada alguma, é ausência de base
      // (RN50/RN53); com base, um período sem vigência nova é zero medido.
      ...definicao("PAN_OFERTAS"),
      resultado:
        extras.ofertasAtivas === 0
          ? indisponivel("SEM_BASE_DE_CALCULO")
          : disponivel(extras.ofertasNoPeriodo),
      nota:
        extras.ofertasAtivas === 0
          ? `${FORMATO_PANORAMA.format(extras.ofertasTotal)} oferta(s) no total · ${TEXTOS_INDISPONIBILIDADE.SEM_BASE_DE_CALCULO}`
          : `vigência iniciada no período · de ${FORMATO_PANORAMA.format(extras.ofertasAtivas)} publicadas (${FORMATO_PANORAMA.format(extras.ofertasTotal)} no total)`,
    },
    {
      ...definicao("PAN_CAMPANHAS"),
      resultado: disponivel(extras.campanhasAtivas, { nivelAtribuicao: "POR_OFERTA" }),
      nota:
        extras.versaoKitVigente === null
          ? "ativas · nenhum kit gerado ainda"
          : `ativas · kit v${extras.versaoKitVigente} vigente`,
    },
    {
      ...definicao("PAN_CESTAS"),
      resultado: disponivel(extras.cestasReutilizaveis),
      nota:
        extras.cestasComPendenciaRn41 > 0
          ? `reutilizáveis · ${FORMATO_PANORAMA.format(extras.cestasComPendenciaRn41)} com pendência de RN41`
          : "reutilizáveis · nenhuma com pendência de RN41",
    },
    {
      ...definicao("PAN_ASSINANTES"),
      resultado:
        baseDeAssinantes === null
          ? indisponivel("SEM_BASE_DE_CALCULO")
          : disponivel(baseDeAssinantes),
      nota: "base patrocinada · natureza ilustrativa até a carga real",
    },
    // F20 (complemento da RN65) — as duas células de telemetria do
    // panorama deixam de ter estado escrito no código e passam a sair da
    // EXISTÊNCIA da apuração, como os selos da T33.
    //
    // O panorama continua com OITO células: a F20 acende as que já
    // existem, e não acrescenta uma nona. O `.dash-stats` está fixado em
    // `repeat(4, minmax(0,1fr))` justamente para as oito fecharem 4×2 sem
    // sobra — com `auto-fit` o desktop resolvia 3+3+2 e a lacuna aparecia
    // como célula fantasma, porque o fundo do grid é a cor das divisórias
    // (defeito corrigido na Onda 7, registrado no `dseed-admin.css`).
    // Célula nova no hero é troca, e é decisão de Design.
    // Errata 27/08 (RN50/RN65) — o card mostra o TOTAL do extrato nominal de
    // benefícios (RECOMPENSA + BENEFICIO), decisão do Administrador da
    // Plataforma. `nominal` deixa de ser "resgates na campanha ativa" e passa
    // a ser o total do extrato; o catálogo continua como segunda opção
    // (RN68 — uma OU outra, nunca somadas), e a campanha ativa deixa de
    // alimentar esta célula.
    celulaDeTelemetria(
      definicao("PAN_RESGATES_BENEFICIOS"),
      extras.extratoBeneficios?.resgates ?? null,
      extras.extratoBeneficios?.dataDoRetrato
        ? `retrato de ${FORMATO_RETRATO.format(extras.extratoBeneficios.dataDoRetrato)}`
        : "resgates no extrato nominal",
      extras.catalogoBeneficios,
      { nivelAtribuicao: "POR_OFERTA" },
    ),
    // Errata 28/08 (RN50/RN65) — simetria com benefícios: o card mostra o
    // total do extrato nominal de cupom; o catálogo segue como segunda
    // opção. A regra de comissão do cupom permanece `[A CONFIRMAR]`, mas
    // isso não impede CONTAR o resgate.
    celulaDeTelemetria(
      definicao("PAN_RESGATES_CUPONS"),
      extras.extratoCupons?.resgates ?? null,
      extras.extratoCupons?.dataDoRetrato
        ? `retrato de ${FORMATO_RETRATO.format(extras.extratoCupons.dataDoRetrato)} · comissão do cupom em confirmação`
        : "resgates no extrato · comissão do cupom em confirmação",
      extras.catalogoCupons,
    ),
  ];

  return celulas;
}

export interface PainelDoDashboard {
  janela: JanelaDashboard;
  pendencias: PendenciaApurada[];
  blocos: BlocoApurado[];
  /** Destaque do topo (hero): a vitrine viva, tese comercial do Clube. */
  destaque: IndicadorApurado;
  /** Camada 1 do hero (Onda 7 §6): as oito células de escala da rede. */
  panorama: CelulaPanorama[];
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
    dadosDoPanorama,
  ] = await Promise.all([
    pendenciasDeHoje(agora),
    indicadoresDeRede(janela),
    indicadoresDeMercado(janela, agora),
    indicadoresDeAssinantes(janela, agora),
    indicadoresDeCampanhas(janela),
    janelaDaVitrineEmDias(),
    painelDeMetas(agora),
    dadosDoHero(janela),
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
    panorama: montarPanorama(valores, { ...dadosDoPanorama, janelaVitrineEmDias }),
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

/**
 * Os números do panorama que os blocos não trazem — todos vindos de serviços
 * que já existem, não de cálculo novo.
 *
 * O que vem de onde: soluções publicadas e categorias vazias saem do serviço
 * único de cobertura (RN51, o mesmo da T13/T29); campanhas ativas, versão do
 * kit e resgates saem de `listarCampanhas` (F12) — inclusive
 * `resgatesNaVigencia`, que a medição já apurava e a F14 apenas parou de
 * descartar; cestas saem de `listarCestas` + `situacaoRn41` (F12).
 *
 * As duas contagens diretas são de cadastro, não de regra: total de ofertas
 * (o denominador de "ativas de N", que a ficha §6 contrata) e resgates de
 * cupom na janela. Nenhuma delas reinterpreta métrica de ficha.
 */
/**
 * O filtro de intervalo de uma janela — ou `undefined` quando o período é
 * "Todos". O `undefined` é o que faz o recorte DESAPARECER em "Todos": a
 * consulta então omite a cláusula de data e conta a base inteira, inclusive
 * os registros que não têm aquela data (ex.: aliado sem contrato assinado).
 * As consultas por intervalo puro não precisam disto — o `inicio`/`fim` de
 * "Todos" já cobre do epoch a um futuro distante.
 */
function filtroDeIntervalo(janela: JanelaDashboard): { gte: Date; lte: Date } | undefined {
  return janela.dias === null ? undefined : { gte: janela.inicio, lte: janela.fim };
}

async function dadosDoHero(janela: JanelaDashboard) {
  // O recorte por data das células de fluxo do hero. Cada uma usa a SUA data
  // de negócio (decisão do Administrador, 28/08): aliados pela assinatura do
  // contrato, ofertas pelo início da vigência, resgates pela data do evento.
  const filtro = filtroDeIntervalo(janela);
  const [
    cobertura,
    campanhas,
    cestas,
    vitrine,
    ofertasTotal,
    aliadosNoPeriodo,
    ofertasNoPeriodo,
    catalogoRecompensa,
    catalogoBeneficio,
    catalogoCupons,
    extratoBeneficios,
    extratoCupons,
  ] = await Promise.all([
      apurarCobertura(),
      listarCampanhas(),
      listarCestas(),
      // F15 — uma chamada só alimenta o destaque da célula Ofertas E o
      // percentual da vitrine viva do hero. Contar "publicadas" aqui por
      // fora seria o começo da divergência que a RN50 existe para evitar.
      kpiVitrineViva(),
      prisma.oferta.count(),
      // Aliados pela DATA DE ASSINATURA do contrato. Em "Todos" (filtro
      // undefined) conta a rede inteira, inclusive quem ainda não tem
      // contrato assinado; num período, só quem assinou dentro dele.
      prisma.empresa.count({
        where: {
          estagio: ESTAGIO_ALIADA,
          ...(filtro ? { contratos: { some: { dataAssinatura: filtro } } } : {}),
        },
      }),
      // Ofertas pelo INÍCIO DA VIGÊNCIA. Em "Todos" conta todas as
      // publicadas; num período, só as que entraram em vigência dentro dele.
      prisma.oferta.count({
        where: {
          status: "PUBLICADA",
          ...(filtro ? { vigenciaInicio: filtro } : {}),
        },
      }),
      // F20 — a apuração do catálogo, pela consulta única da telemetria
      // da operadora (RN68). "Benefícios" reúne RECOMPENSA e BENEFICIO,
      // que é o que a célula sempre nomeou; cupons ficam à parte porque
      // a comissão deles segue [A CONFIRMAR].
      apurarCatalogo({ natureza: "RECOMPENSA" }),
      apurarCatalogo({ natureza: "BENEFICIO" }),
      apurarCatalogo({ natureza: "CUPOM_DESCONTO" }),
      // Errata 27/08 (RN50/RN65) — o card "Resgates de benefícios" passa a
      // exibir o TOTAL do extrato nominal (RECOMPENSA + BENEFICIO), não só o
      // recorte da campanha ativa. Uma contagem só, "extrato", nunca somada
      // ao catálogo (RN68). Recortado pela JANELA do seletor de período, pela
      // data do resgate (`dataEvento`) — decisão do Administrador (28/08).
      resgatesNominaisGlobais(["RECOMPENSA", "BENEFICIO"], janela),
      // Errata 28/08 (RN50/RN65) — simetria com benefícios: o card
      // "Resgates de cupons" também passa a exibir o total do extrato
      // nominal (natureza cupom), também recortado pela janela pela data do
      // resgate. A regra de comissão do cupom segue `[A CONFIRMAR]`, mas
      // contar o resgate não depende dela.
      resgatesNominaisGlobais(["CUPOM_DESCONTO"], janela),
    ]);

  const portfolio = montarPortfolio(cobertura.fatos);
  const resumo = resumirPortfolio(portfolio);
  const ativas = campanhas.filter((campanha) => campanha.estado === "ATIVA");
  const situacoes = cestas.map((cesta) => situacaoRn41(cesta));

  return {
    solucoesPublicadas: resumo.solucoesPublicadas,
    categoriasSemSolucao: portfolio.filter((linha) => linha.solucoesPublicadas === 0).length,
    ofertasAtivas: vitrine.totalPublicadas,
    ofertasComResgate: vitrine.publicadasComResgate,
    ofertasTotal,
    aliadosNoPeriodo,
    ofertasNoPeriodo,
    campanhasAtivas: ativas.length,
    versaoKitVigente: ativas.find((campanha) => campanha.versaoKit !== null)?.versaoKit ?? null,
    cestasReutilizaveis: cestas.length,
    cestasComPendenciaRn41: situacoes.filter((situacao) => !situacao.liberada).length,
    catalogoBeneficios: somarApuracoes(catalogoRecompensa, catalogoBeneficio),
    catalogoCupons,
    extratoBeneficios,
    extratoCupons,
  };
}

/**
 * Reúne as apurações de RECOMPENSA e BENEFICIO na célula "Resg.
 * Benefícios", que sempre nomeou as duas naturezas.
 *
 * Isto NÃO é a soma que a RN68 proíbe: aquela é somar catálogo com
 * extrato — duas contagens de coisas diferentes. Aqui são duas fatias da
 * MESMA contagem, do mesmo arquivo e do mesmo retrato. Nulo em ambas
 * continua nulo: ausência de apuração não vira zero.
 */
function somarApuracoes(
  a: ApuracaoDeCatalogo | null,
  b: ApuracaoDeCatalogo | null,
): ApuracaoDeCatalogo | null {
  if (a === null) return b;
  if (b === null) return a;
  const datas = [a.dataDoRetrato, b.dataDoRetrato].filter((data): data is Date => data !== null);
  return {
    resgates: a.resgates + b.resgates,
    compras: a.compras + b.compras,
    ofertas: a.ofertas + b.ofertas,
    dataDoRetrato: datas.length === 0 ? null : new Date(Math.max(...datas.map((d) => d.getTime()))),
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
        marca: { select: { empresaId: true } },
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
        temMarca: aliada.marca !== null,
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
