import { prisma } from "@/infra/prisma/cliente";
import {
  realizadoDasMetas,
  resumoMetas,
  type DadosMedicao,
  type RealizadoDaMeta,
} from "@/dominio/campanhas/atribuicao";
import {
  atributosDoPublico,
  sugerirParaPublico,
  type AtributosDoPublico,
  type CandidatoSugestao,
  type Sugestao,
} from "@/dominio/campanhas/matching";
import { ofertasPublicadasDaCampanha } from "@/dominio/campanhas/regras";
import { validarEstruturaRegras } from "@/dominio/segmentacao/compilador";

/**
 * Consultas de leitura das telas T22–T25. Os números do painel nascem
 * daqui já com o nível de atribuição (RN43): a tela não decide nada
 * sobre origem de dado, apenas exibe a etiqueta que vem junto.
 */

const INCLUSAO_LISTA = {
  publicoSnapshot: true,
  metas: { orderBy: { criadoEm: "asc" } },
  kits: { orderBy: { versao: "desc" } },
  ofertasAvulsas: { include: { oferta: true } },
  cestas: { include: { cesta: { include: { ofertas: { include: { oferta: true } } } } } },
} as const;

/** Resgates das ofertas da campanha DENTRO da vigência (nível por oferta). */
async function medicaoPorOferta(
  ofertaIds: string[],
  vigencia: { inicio: Date | null; fim: Date | null },
) {
  if (ofertaIds.length === 0) {
    return { resgates: 0, aliados: 0 };
  }
  const [resgates, ofertas] = await Promise.all([
    prisma.telemetriaEvento.count({
      where: {
        ofertaId: { in: ofertaIds },
        tipo: "RESGATE_VOUCHER",
        ...(vigencia.inicio || vigencia.fim
          ? {
              dataEvento: {
                ...(vigencia.inicio ? { gte: vigencia.inicio } : {}),
                ...(vigencia.fim ? { lte: vigencia.fim } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.oferta.findMany({
      where: { id: { in: ofertaIds } },
      select: { solucao: { select: { empresaId: true } } },
    }),
  ]);
  return {
    resgates,
    aliados: new Set(ofertas.map((oferta) => oferta.solucao.empresaId)).size,
  };
}

/**
 * Nível por público (RN43b): assinantes do snapshot com resgate na
 * vigência, cruzando `cpf_hash`. Retorna null enquanto a telemetria não
 * trouxer CPF — e null significa "indisponível", nunca zero.
 */
async function medicaoPorPublico(
  publicoSnapshotId: string | null,
  vigencia: { inicio: Date | null; fim: Date | null },
  ofertaIds: string[],
): Promise<number | null> {
  if (!publicoSnapshotId || ofertaIds.length === 0) {
    return null;
  }
  const comCpf = await prisma.telemetriaEvento.count({
    where: { ofertaId: { in: ofertaIds }, tipo: "RESGATE_VOUCHER", cpfHash: { not: null } },
  });
  if (comCpf === 0) {
    // A telemetria da campanha não tem granularidade por CPF: o nível
    // por público não existe para esta campanha (RN43/RN44).
    return null;
  }
  const eventos = await prisma.telemetriaEvento.findMany({
    where: {
      ofertaId: { in: ofertaIds },
      tipo: "RESGATE_VOUCHER",
      cpfHash: { not: null },
      ...(vigencia.inicio || vigencia.fim
        ? {
            dataEvento: {
              ...(vigencia.inicio ? { gte: vigencia.inicio } : {}),
              ...(vigencia.fim ? { lte: vigencia.fim } : {}),
            },
          }
        : {}),
    },
    select: { cpfHash: true },
    distinct: ["cpfHash"],
  });
  const hashesDaTelemetria = new Set(eventos.map((evento) => evento.cpfHash));
  const snapshot = await prisma.exportacaoLista.findUniqueOrThrow({
    where: { id: publicoSnapshotId },
    select: { regras: true },
  });
  const assinantes = await assinantesDoSnapshot(snapshot.regras);
  return assinantes.filter((hash) => hash && hashesDaTelemetria.has(hash)).length;
}

/** Hashes de CPF do público congelado, recalculados pela regra gravada. */
async function assinantesDoSnapshot(regras: unknown): Promise<Array<string | null>> {
  const { compilarSegmento } = await import("@/dominio/segmentacao/compilador");
  const { slugsEnriquecimentoAtivos } = await import("@/infra/consultas/assinantes");
  const compilado = compilarSegmento(validarEstruturaRegras(regras), {
    slugsEnriquecimentoAtivos: await slugsEnriquecimentoAtivos(),
  });
  if (compilado.status === "AGUARDANDO_TELEMETRIA") {
    return [];
  }
  const linhas = await prisma.$queryRawUnsafe<Array<{ cpf_hash: string | null }>>(
    `SELECT a.cpf_hash FROM assinantes a WHERE a.status_base = 'ATIVO' AND (${compilado.sql})`,
    ...compilado.parametros,
  );
  return linhas.map((linha) => linha.cpf_hash);
}

type CampanhaDaLista = Awaited<ReturnType<typeof prisma.campanha.findMany>> extends Array<
  infer T
>
  ? T
  : never;

export interface LinhaCampanha {
  id: string;
  nome: string;
  objetivo: string | null;
  estado: string;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  publicoCongelado: number | null;
  versaoKit: number | null;
  resumo: { texto: string; nivel: string };
  realizados: RealizadoDaMeta[];
}

/** T22 — lista de campanhas com metas × realizado etiquetado. */
export async function listarCampanhas(): Promise<LinhaCampanha[]> {
  const campanhas = await prisma.campanha.findMany({
    include: INCLUSAO_LISTA,
    orderBy: [{ criadoEm: "desc" }],
  });

  const linhas: LinhaCampanha[] = [];
  for (const campanha of campanhas) {
    const medicao = await dadosDeMedicao(campanha);
    const realizados = realizadoDasMetas(
      campanha.metas.map((meta) => ({ tipo: meta.tipo, alvo: Number(meta.alvo) })),
      medicao,
    );
    linhas.push({
      id: campanha.id,
      nome: campanha.nome,
      objetivo: campanha.objetivo,
      estado: campanha.estado,
      vigenciaInicio: campanha.vigenciaInicio,
      vigenciaFim: campanha.vigenciaFim,
      publicoCongelado: campanha.publicoSnapshot?.contagem ?? null,
      versaoKit: campanha.kits[0]?.versao ?? null,
      resumo: resumoMetas(realizados),
      realizados,
    });
  }
  return linhas;
}

type CampanhaComConteudo = Awaited<
  ReturnType<typeof prisma.campanha.findFirstOrThrow<{ include: typeof INCLUSAO_LISTA }>>
>;

/** Números da campanha nos dois níveis, prontos para a RN43/RN44. */
async function dadosDeMedicao(campanha: CampanhaComConteudo): Promise<DadosMedicao> {
  const publicadas = ofertasPublicadasDaCampanha({
    ofertasAvulsas: campanha.ofertasAvulsas.map(({ oferta }) => ({
      id: oferta.id,
      titulo: oferta.titulo,
      status: oferta.status,
    })),
    cestas: campanha.cestas.map(({ cesta }) => ({
      id: cesta.id,
      nome: cesta.nome,
      ofertas: cesta.ofertas.map(({ oferta }) => ({
        id: oferta.id,
        titulo: oferta.titulo,
        status: oferta.status,
      })),
    })),
  });
  const ofertaIds = publicadas.map((oferta) => oferta.id);
  const vigencia = { inicio: campanha.vigenciaInicio, fim: campanha.vigenciaFim };

  const [porOferta, porPublico] = await Promise.all([
    medicaoPorOferta(ofertaIds, vigencia),
    medicaoPorPublico(campanha.publicoSnapshotId, vigencia, ofertaIds),
  ]);

  return {
    resgatesNaVigencia: porOferta.resgates,
    aliadosParticipantes: porOferta.aliados,
    ofertasAtivas: ofertaIds.length,
    publicoCongelado: campanha.publicoSnapshot?.contagem ?? 0,
    assinantesDoPublicoComResgate: porPublico,
  };
}

/** T25 — painel: metas etiquetadas, desempenho por oferta e linha do tempo. */
export async function painelDaCampanha(campanhaId: string) {
  const campanha = await prisma.campanha.findUniqueOrThrow({
    where: { id: campanhaId },
    include: {
      ...INCLUSAO_LISTA,
      kits: { orderBy: { versao: "desc" }, include: { autor: true } },
      ofertasAvulsas: {
        include: { oferta: { include: { solucao: { include: { empresa: true } } } } },
      },
      cestas: {
        include: {
          cesta: {
            include: {
              ofertas: {
                include: { oferta: { include: { solucao: { include: { empresa: true } } } } },
              },
            },
          },
        },
      },
    },
  });

  const medicao = await dadosDeMedicao(campanha as unknown as CampanhaComConteudo);
  const realizados = realizadoDasMetas(
    campanha.metas.map((meta) => ({ tipo: meta.tipo, alvo: Number(meta.alvo) })),
    medicao,
  );

  const ofertas = [
    ...campanha.ofertasAvulsas.map(({ oferta }) => oferta),
    ...campanha.cestas.flatMap(({ cesta }) => cesta.ofertas.map(({ oferta }) => oferta)),
  ].filter((oferta, indice, lista) => lista.findIndex((o) => o.id === oferta.id) === indice);

  const agregados = await prisma.telemetriaEvento.groupBy({
    by: ["ofertaId", "tipo"],
    where: {
      ofertaId: { in: ofertas.map((oferta) => oferta.id) },
      ...(campanha.vigenciaInicio || campanha.vigenciaFim
        ? {
            dataEvento: {
              ...(campanha.vigenciaInicio ? { gte: campanha.vigenciaInicio } : {}),
              ...(campanha.vigenciaFim ? { lte: campanha.vigenciaFim } : {}),
            },
          }
        : {}),
    },
    _count: { _all: true },
  });

  const desempenho = ofertas.map((oferta) => {
    const conta = (tipo: string) =>
      agregados.find((linha) => linha.ofertaId === oferta.id && linha.tipo === tipo)?._count
        ._all ?? 0;
    return {
      id: oferta.id,
      titulo: oferta.titulo,
      aliado: oferta.solucao.empresa.nomeFantasia,
      emitidos: conta("EMISSAO_VOUCHER"),
      resgatados: conta("RESGATE_VOUCHER"),
      compras: conta("COMPRA_CONFIRMADA"),
    };
  });

  const linhaDoTempo = [
    { data: campanha.criadoEm, evento: "Campanha criada", detalhe: "rascunho aberto" },
    ...(campanha.ativadaEm
      ? [
          {
            data: campanha.ativadaEm,
            evento: "Campanha ativada",
            detalhe: `público congelado em ${campanha.publicoSnapshot?.contagem ?? 0} assinantes · kit v1 gerado`,
          },
        ]
      : []),
    ...campanha.kits
      .filter((kit) => kit.versao > 1)
      .map((kit) => ({
        data: kit.criadoEm,
        evento: `Kit v${kit.versao}`,
        detalhe: kit.diffTexto ? "nova versão com diff auditado" : "nova versão",
      })),
    ...(campanha.encerradaEm
      ? [
          {
            data: campanha.encerradaEm,
            evento: "Campanha encerrada",
            detalhe: "ofertas exclusivas pausadas por padrão (RN40)",
          },
        ]
      : []),
  ].sort((a, b) => a.data.getTime() - b.data.getTime());

  return { campanha, realizados, resumo: resumoMetas(realizados), desempenho, linhaDoTempo, medicao };
}

/** Candidatos de conteúdo (T23) e as sugestões da RN42 para o público. */
export async function conteudoDisponivel(regrasDoPublico: unknown) {
  const [ofertas, cestas] = await Promise.all([
    prisma.oferta.findMany({
      where: { status: "PUBLICADA" },
      include: {
        solucao: {
          include: {
            empresa: true,
            categoria: true,
            culturas: { include: { cultura: true } },
            ufs: { include: { uf: true } },
          },
        },
      },
      orderBy: { titulo: "asc" },
    }),
    prisma.cesta.findMany({
      include: {
        ofertas: {
          include: {
            oferta: {
              include: {
                solucao: {
                  include: {
                    categoria: true,
                    culturas: { include: { cultura: true } },
                    ufs: { include: { uf: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { nome: "asc" },
    }),
  ]);

  let publico: AtributosDoPublico = { ufs: [], culturas: [], preferencias: [] };
  try {
    publico = atributosDoPublico(validarEstruturaRegras(regrasDoPublico));
  } catch {
    // Regra inválida não deixa a tela sem conteúdo: sem atributos, o
    // matching simplesmente não sugere nada (RN42 é assistiva).
  }

  const candidatosOferta: CandidatoSugestao[] = ofertas.map((oferta) => ({
    id: oferta.id,
    nome: oferta.titulo,
    taxonomias: {
      categoria: oferta.solucao.categoria?.nome ?? null,
      culturas: oferta.solucao.culturas.map(({ cultura }) => cultura.nome),
      coberturaNacional: oferta.solucao.coberturaNacional,
      ufs: oferta.solucao.ufs.map(({ uf }) => uf.sigla),
    },
  }));

  const candidatosCesta: CandidatoSugestao[] = cestas.map((cesta) => ({
    id: cesta.id,
    nome: cesta.nome,
    taxonomias: {
      categoria: null,
      culturas: cesta.ofertas.flatMap(({ oferta }) =>
        oferta.solucao.culturas.map(({ cultura }) => cultura.nome),
      ),
      coberturaNacional: cesta.ofertas.some(({ oferta }) => oferta.solucao.coberturaNacional),
      ufs: cesta.ofertas.flatMap(({ oferta }) => oferta.solucao.ufs.map(({ uf }) => uf.sigla)),
    },
  }));

  const porId = (sugestoes: Sugestao[]) =>
    new Map(sugestoes.map((sugestao) => [sugestao.id, sugestao]));

  return {
    ofertas,
    cestas,
    sugestoesDeOferta: porId(sugerirParaPublico(candidatosOferta, publico)),
    sugestoesDeCesta: porId(sugerirParaPublico(candidatosCesta, publico)),
  };
}

/** Nome e regra do público em vigor — usados pela T23 e pela T24. */
export async function segmentosDisponiveis() {
  return prisma.segmento.findMany({ orderBy: { nome: "asc" } });
}

export async function formatosDePeca() {
  return prisma.formatoPeca.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } });
}

export type { CampanhaDaLista };
