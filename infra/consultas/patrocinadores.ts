import type { PerfilAssinatura, StatusPatrocinador } from "@prisma/client";
import { normalizarCnpj } from "@/dominio/empresas/cnpj";
import { prisma } from "@/infra/prisma/cliente";
import {
  apurarExtratoNominal,
  apurarFunilDeAtivacao,
} from "@/infra/consultas/telemetria-operadora";
import {
  avaliarVigencia,
  derivarSaldo,
  type SaldoDePatrocinio,
  type SituacaoDeVigencia,
} from "@/dominio/patrocinio/saldo";

/**
 * RN62 — **a consulta única do patrocínio**.
 *
 * T32, T33, R1 e (na F20) o Dashboard leem daqui. É o mesmo desenho da
 * RN51: um fato apurado por uma consulta, e lentes diferentes derivadas
 * dele. O saldo em particular **nunca** é recalculado fora de
 * `dominio/patrocinio/saldo.ts` — este módulo só reúne os ingredientes
 * (adquiridas e contagem de vigentes) e chama a derivação.
 *
 * **A contagem de vigentes é feita no banco, agrupada**, e não uma consulta
 * por linha: a T32 lista todos os patrocinadores, e um `count` por linha
 * seria N+1 numa tela que existe para dar visão do conjunto. O índice
 * `(patrocinador_id, fim)` foi criado exatamente para isto.
 */

// ---------------------------------------------------------------------
// Fato
// ---------------------------------------------------------------------

export interface FatoDoPatrocinador {
  id: string;
  razaoSocial: string;
  cnpj: string;
  segmento: string | null;
  status: StatusPatrocinador;
  responsavelComercial: string | null;
  /** null = não há contrato ainda; a tela diz isso, não finge um vazio. */
  contrato: {
    id: string;
    dataAssinatura: Date | null;
    vigenciaInicio: Date | null;
    vigenciaFim: Date | null;
    precoUnitario: string | null;
    valorTotalContratado: string | null;
    assinaturasAdquiridas: number | null;
    /** Metadados da minuta; null = "sem minuta — pendência". */
    minuta: { nomeArquivo: string; bytes: number; hash: string; enviadaEm: Date } | null;
  } | null;
  vinculosVigentes: number;
  /** Vínculos já encerrados — a rotatividade que o modelo preserva. */
  vinculosEncerrados: number;
  campanhasAtivas: number;
  campanhasTotais: number;
}

/** O que cada tela deriva do fato, sempre pelo mesmo caminho. */
export interface LeituraDoPatrocinador extends FatoDoPatrocinador {
  saldo: SaldoDePatrocinio;
  vigencia: SituacaoDeVigencia;
}

function comLentes(fato: FatoDoPatrocinador, hoje: Date): LeituraDoPatrocinador {
  return {
    ...fato,
    saldo: derivarSaldo({
      assinaturasAdquiridas: fato.contrato?.assinaturasAdquiridas ?? null,
      vinculosVigentes: fato.vinculosVigentes,
    }),
    vigencia: avaliarVigencia(fato.contrato?.vigenciaFim ?? null, hoje),
  };
}

export interface FiltrosDePatrocinador {
  busca?: string;
  status?: StatusPatrocinador | "TODOS";
  /** Só os que têm contrato vencido ou vencendo em até 30 dias. */
  apenasVigenciaEmAlerta?: boolean;
}

/**
 * T32 — a lista.
 *
 * Sem paginação, e isto é a RN56 valendo: patrocinador é **conjunto
 * contido** (unidades comerciais, não catálogo), como a rede de aliados.
 * Se um dia passar de algumas centenas, a decisão a tomar é a mesma que a
 * F15 tomou para os aliados — rolagem contínua sobre consulta paginada —,
 * e não paginação clássica.
 */
export async function listarPatrocinadores(
  filtros: FiltrosDePatrocinador = {},
  hoje: Date = new Date(),
): Promise<LeituraDoPatrocinador[]> {
  const busca = filtros.busca?.trim() ?? "";
  // O CNPJ é guardado sem máscara e em maiúsculas (pode ter letras — CNPJ
  // alfanumérico, IN RFB nº 2.229/2024): buscar por "11.222.333/0001-81"
  // precisa perder a pontuação antes, senão nunca casa. E a cláusula do
  // CNPJ só entra quando SOBRA caractere — `contains: ""` casa com todas as
  // linhas, e uma busca por "inexistente" devolveria a lista inteira.
  const cnpjDaBusca = normalizarCnpj(busca);
  const registros = await prisma.patrocinador.findMany({
    where: {
      ...(filtros.status && filtros.status !== "TODOS" ? { status: filtros.status } : {}),
      ...(busca === ""
        ? {}
        : {
            OR: [
              { razaoSocial: { contains: busca, mode: "insensitive" as const } },
              ...(cnpjDaBusca === "" ? [] : [{ cnpj: { contains: cnpjDaBusca } }]),
            ],
          }),
    },
    select: {
      id: true,
      razaoSocial: true,
      cnpj: true,
      segmento: true,
      status: true,
      responsavelComercial: { select: { nome: true } },
      contrato: {
        select: {
          id: true,
          dataAssinatura: true,
          vigenciaInicio: true,
          vigenciaFim: true,
          precoUnitario: true,
          valorTotalContratado: true,
          assinaturasAdquiridas: true,
          // Metadados da minuta, JAMAIS o conteúdo: o binário só sai do
          // banco pela rota que o serve (RN54/RN60/RN62).
          minuta: { select: { nomeArquivo: true, bytes: true, hash: true, atualizadoEm: true } },
        },
      },
    },
    orderBy: [{ razaoSocial: "asc" }],
  });

  const ids = registros.map((registro) => registro.id);
  const [vigentes, encerrados, campanhas] = await Promise.all([
    prisma.vinculoPatrocinio.groupBy({
      by: ["patrocinadorId"],
      where: { patrocinadorId: { in: ids }, fim: null },
      _count: { _all: true },
    }),
    prisma.vinculoPatrocinio.groupBy({
      by: ["patrocinadorId"],
      where: { patrocinadorId: { in: ids }, fim: { not: null } },
      _count: { _all: true },
    }),
    prisma.campanha.groupBy({
      by: ["patrocinadorId", "estado"],
      where: { patrocinadorId: { in: ids } },
      _count: { _all: true },
    }),
  ]);

  const porPatrocinador = (
    grupos: Array<{ patrocinadorId: string | null; _count: { _all: number } }>,
  ) => new Map(grupos.map((grupo) => [grupo.patrocinadorId ?? "", grupo._count._all]));
  const vigentesPor = porPatrocinador(vigentes);
  const encerradosPor = porPatrocinador(encerrados);

  const ativasPor = new Map<string, number>();
  const totaisPor = new Map<string, number>();
  for (const grupo of campanhas) {
    const chave = grupo.patrocinadorId ?? "";
    totaisPor.set(chave, (totaisPor.get(chave) ?? 0) + grupo._count._all);
    if (grupo.estado === "ATIVA") {
      ativasPor.set(chave, (ativasPor.get(chave) ?? 0) + grupo._count._all);
    }
  }

  const leituras = registros.map((registro) =>
    comLentes(
      {
        id: registro.id,
        razaoSocial: registro.razaoSocial,
        cnpj: registro.cnpj,
        segmento: registro.segmento,
        status: registro.status,
        responsavelComercial: registro.responsavelComercial?.nome ?? null,
        contrato:
          registro.contrato === null
            ? null
            : {
                id: registro.contrato.id,
                dataAssinatura: registro.contrato.dataAssinatura,
                vigenciaInicio: registro.contrato.vigenciaInicio,
                vigenciaFim: registro.contrato.vigenciaFim,
                precoUnitario: registro.contrato.precoUnitario?.toString() ?? null,
                valorTotalContratado:
                  registro.contrato.valorTotalContratado?.toString() ?? null,
                assinaturasAdquiridas: registro.contrato.assinaturasAdquiridas,
                minuta:
                  registro.contrato.minuta === null
                    ? null
                    : {
                        nomeArquivo: registro.contrato.minuta.nomeArquivo,
                        bytes: registro.contrato.minuta.bytes,
                        hash: registro.contrato.minuta.hash,
                        enviadaEm: registro.contrato.minuta.atualizadoEm,
                      },
              },
        vinculosVigentes: vigentesPor.get(registro.id) ?? 0,
        vinculosEncerrados: encerradosPor.get(registro.id) ?? 0,
        campanhasAtivas: ativasPor.get(registro.id) ?? 0,
        campanhasTotais: totaisPor.get(registro.id) ?? 0,
      },
      hoje,
    ),
  );

  if (!filtros.apenasVigenciaEmAlerta) return leituras;
  return leituras.filter(
    (leitura) => leitura.vigencia.estado === "VENCENDO" || leitura.vigencia.estado === "VENCIDA",
  );
}

/** T33 — o mesmo fato, para um só. */
export async function lerPatrocinador(
  id: string,
  hoje: Date = new Date(),
): Promise<LeituraDoPatrocinador | null> {
  const [leitura] = await listarPatrocinadores({ busca: undefined, status: "TODOS" }, hoje).then(
    (lista) => lista.filter((item) => item.id === id),
  );
  return leitura ?? null;
}

// ---------------------------------------------------------------------
// Aba Consumo (RN65) — seis cards, cada um com selo e motivo
// ---------------------------------------------------------------------

/**
 * Os três motivos de traço da RN65. O selo é do CARD, não do número: um
 * card `vivo` traz número, os outros trazem o motivo da espera — e a
 * ausência do número é a informação, não uma falha.
 */
export type SeloDeOrigem = "VIVO" | "AGUARDA_CHAVE" | "AGUARDA_FONTE";

export interface CardDeConsumo {
  chave: string;
  titulo: string;
  selo: SeloDeOrigem;
  /** Por que não há número, quando não há. Nunca vazio em card em espera. */
  motivo: string | null;
  /** Linhas do card quando ele é `vivo`; vazio nos demais. */
  linhas: ReadonlyArray<{ rotulo: string; valor: string }>;
}

/**
 * Texto único de cada espera. Vive aqui para que T33 e R1 digam a MESMA
 * coisa — dois textos para a mesma espera divergem na primeira revisão.
 *
 * O texto de `aguarda fonte` é o do protótipo, com a data da requisição:
 * "requisição enviada à operadora em 27/07", e nunca "carta pendente"
 * (prompt §6).
 */
export const MOTIVO_AGUARDA_CHAVE =
  "aguarda chave — o relatório existe, mas ainda não foi importado com o CPF que liga cada linha ao assinante (RN69); envie o extrato nominal na tela de Telemetria da operadora";
export const MOTIVO_AGUARDA_FONTE =
  "aguarda fonte — relatório ainda não fornecido; requisição enviada à operadora em 27/07";

/**
 * O motivo do card de **modalidades**, distinto no texto e **igual no
 * selo** ao dos resgates.
 *
 * A espera é a mesma: falta importar o extrato nominal, de onde sai a
 * quebra por modalidade. O texto mantém a armadilha a desfazer — o contador
 * de `Compras` da lista de Ofertas existe, mas é **por oferta** e não se
 * atribui a patrocinador (RN68); e, desde a decisão de 28/08, checkout
 * (dentro ou fora do clube) é **modalidade de resgate**, não uma categoria
 * de "compra" à parte. Quem olhar os dois lugares precisa saber que não são
 * o mesmo número, e por quê.
 */
export const MOTIVO_AGUARDA_CHAVE_MODALIDADES =
  "aguarda chave — a quebra por modalidade vem do extrato nominal, pela coluna Tipo de Oferta (RN69), e ele ainda não foi importado; envie-o na tela de Telemetria da operadora. O contador de Compras da lista de Ofertas é outra contagem: vem do catálogo, é por oferta e não se atribui a patrocinador (RN68)."

const FORMATO_DATA_RETRATO = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "UTC",
});

/**
 * Linha do volume que a fonte não classificou, quando existe.
 *
 * Ausência é informação (RN53): evento com `Tipo de Oferta` desconhecido
 * não é distribuído entre resgate e compra por palpite — é declarado. E
 * este número é o que denuncia um valor novo da operadora antes de
 * alguém notar pela conta que não fecha.
 */
function linhaDeNaoClassificados(
  quantidade: number,
): Array<{ rotulo: string; valor: string }> {
  if (quantidade === 0) return [];
  return [
    {
      rotulo: "Eventos com tipo não reconhecido (fora da conta)",
      valor: String(quantidade),
    },
  ];
}

/** "12 (retrato de 20/07/2026)" — o número nunca viaja sem o quando. */
function comDataDoRetrato(valor: string, data: Date | null): string {
  return data
    ? `${valor} (retrato de ${FORMATO_DATA_RETRATO.format(data)})`
    : `${valor} (o arquivo não declarou a data do retrato)`;
}

const ROTULO_PERFIL: Readonly<Record<PerfilAssinatura, string>> = {
  PATROCINADA: "Assinatura patrocinada",
  PROMOCIONAL_BROTO: "Promocional Broto",
  AUTOASSINATURA: "Autoassinatura",
};

/**
 * Os seis cards da aba Consumo.
 *
 * **Leitura da contagem, declarada para poder ser corrigida.** A ficha §4
 * enumera sete medidas (base por perfil, ativação, resgates, compras,
 * funil, acessos, consumo de soluções) e o prompt §4 diz "os seis cards".
 * A única aritmética que fecha em seis é *base por perfil e ativação* ser
 * um card só — o que também é o agrupamento natural, já que os dois são
 * dado próprio da plataforma e se leem juntos. Está aqui, num lugar só,
 * para que a conferência contra o protótipo v11.2 (ausente do repositório)
 * seja uma edição desta lista, e não uma caça pela tela.
 */
export async function cardsDeConsumo(patrocinadorId: string): Promise<CardDeConsumo[]> {
  const [porPerfil, vigentes, semPerfil, extrato, funil] = await Promise.all([
    prisma.assinante.groupBy({
      by: ["perfilAssinatura"],
      where: { vinculos: { some: { patrocinadorId, fim: null } } },
      _count: { _all: true },
    }),
    prisma.vinculoPatrocinio.count({ where: { patrocinadorId, fim: null } }),
    prisma.assinante.count({
      where: { vinculos: { some: { patrocinadorId, fim: null } }, perfilAssinatura: null },
    }),
    // F20 — as duas apurações que fazem os selos deixarem de ser literais.
    apurarExtratoNominal(patrocinadorId),
    apurarFunilDeAtivacao(patrocinadorId),
  ]);

  const linhasDaBase: Array<{ rotulo: string; valor: string }> = [
    { rotulo: "Vagas ativadas", valor: String(vigentes) },
  ];
  for (const grupo of porPerfil) {
    if (grupo.perfilAssinatura === null) continue;
    linhasDaBase.push({
      rotulo: ROTULO_PERFIL[grupo.perfilAssinatura],
      valor: String(grupo._count._all),
    });
  }
  if (semPerfil > 0) {
    // Ausência é informação (RN53): o volume sem perfil é declarado, não
    // distribuído nem escondido. Enquanto a F20 não ingerir a coluna
    // nativa `Patrocinador`, este número é a base inteira.
    linhasDaBase.push({
      rotulo: "Perfil ainda não informado pela fonte",
      valor: String(semPerfil),
    });
  }

  return [
    {
      chave: "base",
      titulo: "Base por perfil e ativação",
      selo: "VIVO",
      motivo: null,
      linhas: linhasDaBase,
    },
    // F20 (RN65, complemento) — daqui para baixo NENHUM selo é literal:
    // cada um sai da existência da apuração. É isso que faz o card
    // acender sozinho quando o dado chega, sem mudança de layout e sem
    // uma fase só para trocar constantes.
    {
      chave: "resgates",
      titulo: "Resgates de ofertas",
      selo: extrato ? "VIVO" : "AGUARDA_CHAVE",
      motivo: extrato ? null : MOTIVO_AGUARDA_CHAVE,
      linhas: extrato
        ? [
            {
              rotulo: "Resgates no extrato nominal",
              valor: comDataDoRetrato(
                String(extrato.resgates.eventos),
                extrato.resgates.dataDoRetrato,
              ),
            },
            {
              rotulo: "Assinantes com ao menos um resgate",
              valor: String(extrato.resgates.assinantesComEvento),
            },
            ...linhaDeNaoClassificados(extrato.naoClassificados),
          ]
        : [],
    },
    {
      // **Acende pelo MESMO extrato do card acima.** Desde a decisão de
      // 28/08, checkout (no clube ou externo) é modalidade de resgate, não
      // uma "compra" à parte — então este card deixou de contar compras e
      // passou a exibir COMO os resgates aconteceram: gratuito, checkout no
      // clube, checkout externo. O total já está no card de resgates; aqui
      // é só a quebra, para não perder a informação da modalidade (RN65).
      //
      // A RN68 não se aplica aqui: ela prende o contador de CATÁLOGO, que é
      // por oferta e não se atribui a patrocinador. O evento nominal tem
      // CPF, e é por isso que ele chega ao patrocinador. O motivo é
      // `aguarda chave`, como o dos resgates, porque a espera é a mesma.
      chave: "modalidades",
      titulo: "Modalidades de resgate",
      selo: extrato ? "VIVO" : "AGUARDA_CHAVE",
      motivo: extrato ? null : MOTIVO_AGUARDA_CHAVE_MODALIDADES,
      linhas: extrato
        ? extrato.porModalidade.map((m) => ({
            rotulo: m.rotulo,
            valor: comDataDoRetrato(String(m.eventos), m.dataDoRetrato),
          }))
        : [],
    },
    {
      chave: "funil",
      titulo: "Funil de ativação",
      selo: funil ? "VIVO" : "AGUARDA_CHAVE",
      motivo: funil ? null : MOTIVO_AGUARDA_CHAVE,
      linhas: funil
        ? [
            { rotulo: "Cadastrados", valor: String(funil.cadastrados) },
            { rotulo: "Freemium", valor: String(funil.freemium) },
            { rotulo: "Assinantes", valor: String(funil.assinantes) },
          ]
        : [],
    },
    {
      chave: "acessos",
      titulo: "Acessos à plataforma",
      selo: "AGUARDA_FONTE",
      motivo: MOTIVO_AGUARDA_FONTE,
      linhas: [],
    },
    {
      chave: "solucoes",
      titulo: "Consumo de soluções",
      selo: "AGUARDA_FONTE",
      motivo: MOTIVO_AGUARDA_FONTE,
      linhas: [],
    },
  ];
}

// ---------------------------------------------------------------------
// Campanhas do patrocinador (T33, aba Campanhas)
// ---------------------------------------------------------------------

export interface CampanhaDoPatrocinador {
  id: string;
  nome: string;
  estado: string;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
  /** null = "pendente de registro" (RN64); o kit sai carimbado assim mesmo. */
  aprovacao: { aprovador: string; data: Date | null; temEvidencia: boolean } | null;
}

export async function listarCampanhasDoPatrocinador(
  patrocinadorId: string,
): Promise<CampanhaDoPatrocinador[]> {
  const campanhas = await prisma.campanha.findMany({
    where: { patrocinadorId },
    select: {
      id: true,
      nome: true,
      estado: true,
      vigenciaInicio: true,
      vigenciaFim: true,
      aprovacaoAprovador: true,
      aprovacaoData: true,
      evidencia: { select: { hash: true } },
    },
    orderBy: [{ criadoEm: "desc" }],
  });
  return campanhas.map((campanha) => ({
    id: campanha.id,
    nome: campanha.nome,
    estado: campanha.estado,
    vigenciaInicio: campanha.vigenciaInicio,
    vigenciaFim: campanha.vigenciaFim,
    aprovacao:
      campanha.aprovacaoAprovador === null
        ? null
        : {
            aprovador: campanha.aprovacaoAprovador,
            data: campanha.aprovacaoData,
            temEvidencia: campanha.evidencia !== null,
          },
  }));
}

/** Gerações anteriores do R1 (T33) — a trilha que a RN66 manda guardar. */
export async function listarGeracoesDeRelatorio(patrocinadorId: string) {
  return prisma.relatorioPatrocinador.findMany({
    where: { patrocinadorId },
    select: {
      id: true,
      periodoInicio: true,
      periodoFim: true,
      finalidade: true,
      criadoEm: true,
      autor: { select: { nome: true } },
    },
    orderBy: [{ criadoEm: "desc" }],
    take: 20,
  });
}

/**
 * Mapa assinanteId → id do vínculo VIGENTE deste patrocinador, para a aba
 * Base oferecer "Encerrar" por linha sem que `listarCarteira` (consulta de
 * segmentação, compartilhada com a T18) precise carregar o `vinculoId`.
 * Só há um vínculo vigente por par assinante×patrocinador (RN62), então o
 * mapa é 1:1.
 */
export async function vinculosVigentesPorAssinante(
  patrocinadorId: string,
): Promise<Map<string, string>> {
  const vigentes = await prisma.vinculoPatrocinio.findMany({
    where: { patrocinadorId, fim: null },
    select: { id: true, assinanteId: true },
  });
  return new Map(vigentes.map((v) => [v.assinanteId, v.id]));
}

/** Patrocinadores ativos, para o filtro da T18 e a etiqueta da campanha. */
export async function listarPatrocinadoresParaEtiqueta() {
  return prisma.patrocinador.findMany({
    where: { status: "ATIVO" },
    select: { id: true, razaoSocial: true },
    orderBy: [{ razaoSocial: "asc" }],
  });
}
