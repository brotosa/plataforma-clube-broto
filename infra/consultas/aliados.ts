import type { EstagioEmpresa, Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";

/**
 * Consultas de leitura da T1 (lista de aliados) e T2 (ficha do aliado).
 * Telemetria (vouchers 90d) só existe após a F4: exibida como "—".
 */

/**
 * Completude cadastral do aliado exibida em T1/T2: percentual dos campos
 * exigidos pela promoção M2 e pela régua do card (RN09) no nível do
 * aliado. Não é a régua de publicação (essa é por oferta, RN09).
 */
export function calcularCompletudeAliado(aliado: {
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cnpj: string | null;
  enderecoMunicipio: string | null;
  /** F15 (RN54) — marca guardada pela plataforma; fonte a partir daqui. */
  temMarca: boolean;
  /** OBSOLETO (F15): endereço S3, lido só como fallback. Sai com a coluna. */
  logoUrl: string | null;
  descricaoInstitucional: string | null;
  quantidadeCategorias: number;
  quantidadeContatos: number;
  temContratoVigente: boolean;
}): number {
  const itens = [
    Boolean(aliado.nomeFantasia?.trim()),
    Boolean(aliado.razaoSocial?.trim()),
    Boolean(aliado.cnpj?.trim()),
    Boolean(aliado.enderecoMunicipio?.trim()),
    aliado.temMarca || Boolean(aliado.logoUrl?.trim()),
    Boolean(aliado.descricaoInstitucional?.trim()),
    aliado.quantidadeCategorias > 0,
    aliado.quantidadeContatos > 0,
    aliado.temContratoVigente,
  ];
  return Math.round((itens.filter(Boolean).length / itens.length) * 100);
}

/**
 * Predicado Prisma de "cadastro incompleto": ao menos um dos itens de
 * `calcularCompletudeAliado` está em falta (completude < 100). É a mesma
 * régua daquela função, do lado do banco, para o filtro `completude=incompletos`
 * dos cartões de pendência do Dashboard poder recortar a lista sem recomputar
 * em memória. A coerência entre este predicado e o cálculo em JS é garantida
 * por `infra/consultas/aliados-completude.integracao.test.ts`.
 */
export function filtroCadastroIncompletoPrisma(): Prisma.EmpresaWhereInput {
  return {
    OR: [
      // nomeFantasia é obrigatório no schema: só o vazio conta como falta.
      { nomeFantasia: "" },
      { razaoSocial: null },
      { razaoSocial: "" },
      { cnpj: null },
      { cnpj: "" },
      { enderecoMunicipio: null },
      { enderecoMunicipio: "" },
      { descricaoInstitucional: null },
      { descricaoInstitucional: "" },
      { categorias: { none: {} } },
      { contatos: { none: {} } },
      { contratos: { none: { status: "VIGENTE" } } },
      // Item da marca (RN54): incompleto quando não há marca guardada nem o
      // endereço S3 legado.
      { AND: [{ marca: { is: null } }, { OR: [{ logoUrl: null }, { logoUrl: "" }] }] },
    ],
  };
}

export interface FiltrosAliados {
  busca?: string;
  categoriaId?: string;
  estagio?: EstagioEmpresa;
  semOfertaAtiva?: boolean;
  /** Cartão "Cadastros incompletos" do Dashboard (RN09, nível do aliado). */
  completude?: "incompletos";
  /** Cartão "Janelas contratuais" do Dashboard: contrato vigente na janela. */
  contrato?: "janela";
  pagina?: number;
  /** Tamanho do bloco; a T1 usa o da rolagem contínua (RN56). */
  tamanho?: number;
}

/**
 * Tamanho de página herdado da F2, quando a T1 tinha controles de página.
 * Segue sendo o padrão da consulta para qualquer outro consumidor.
 */
export const TAMANHO_PAGINA = 8;

/**
 * RN56 — bloco da rolagem contínua da T1.
 *
 * A lista de aliados é conjunto contido (46 hoje, algumas centenas no
 * horizonte) e ler a rede inteira é gesto frequente, então a paginação de
 * 8 saiu. O que NÃO saiu é a consulta paginada no servidor por baixo: 20
 * por vez mantém a primeira pintura barata e o banco fora de um SELECT
 * sem limite — a rolagem é da leitura, não do jeito de consultar.
 */
export const TAMANHO_BLOCO_ROLAGEM = 20;

/** Uma linha da T1 — o que a tela e a rolagem contínua consomem. */
export interface LinhaDeAliado {
  id: string;
  nomeFantasia: string;
  /** Versão da marca para a URL da rota; null = sem marca (RN54). */
  marcaHash: string | null;
  categorias: string[];
  estagio: EstagioEmpresa;
  quantidadeSolucoes: number;
  quantidadeOfertasAtivas: number;
  emJanelaNaoRenovacao: boolean;
  completude: number;
}

/**
 * T1 é a rede de aliados: sem filtro explícito, a lista cobre da
 * negociação em diante. Os estágios anteriores do funil (Mapeada, Em
 * avaliação, Priorizada, Descartada) vivem na T8 — Mercado & Scout.
 */
export const ESTAGIOS_DA_REDE: ReadonlyArray<EstagioEmpresa> = [
  "EM_NEGOCIACAO",
  "EM_APROVACAO",
  "ALIADA_ATIVA",
  "SUSPENSA",
  "ENCERRADA",
];

export async function listarAliados(filtros: FiltrosAliados) {
  const onde: Prisma.EmpresaWhereInput = {};
  // Vários filtros deste conjunto usam OR próprio (busca, cadastro incompleto);
  // combiná-los num único `onde.OR` faria um cancelar o outro. O AND agrega
  // cada bloco preservando o seu OR interno.
  const e: Prisma.EmpresaWhereInput[] = [];
  if (filtros.busca?.trim()) {
    e.push({
      OR: [
        { nomeFantasia: { contains: filtros.busca.trim(), mode: "insensitive" } },
        { razaoSocial: { contains: filtros.busca.trim(), mode: "insensitive" } },
      ],
    });
  }
  if (filtros.categoriaId) {
    onde.categorias = { some: { categoriaId: filtros.categoriaId } };
  }
  onde.estagio = filtros.estagio ?? { in: [...ESTAGIOS_DA_REDE] };
  if (filtros.semOfertaAtiva) {
    onde.solucoes = { none: { ofertas: { some: { status: "PUBLICADA" } } } };
  }
  if (filtros.completude === "incompletos") {
    e.push(filtroCadastroIncompletoPrisma());
  }
  if (filtros.contrato === "janela") {
    e.push({ contratos: { some: { status: "VIGENTE", emJanelaNaoRenovacao: true } } });
  }
  if (e.length > 0) {
    onde.AND = e;
  }

  const pagina = Math.max(1, filtros.pagina ?? 1);
  const tamanho = filtros.tamanho ?? TAMANHO_PAGINA;
  const [total, empresas] = await Promise.all([
    prisma.empresa.count({ where: onde }),
    prisma.empresa.findMany({
      where: onde,
      orderBy: { nomeFantasia: "asc" },
      skip: (pagina - 1) * tamanho,
      take: tamanho,
      include: {
        categorias: { include: { categoria: true } },
        contatos: { select: { id: true } },
        contratos: { where: { status: "VIGENTE" }, select: { id: true, emJanelaNaoRenovacao: true } },
        solucoes: {
          select: {
            id: true,
            ofertas: { select: { id: true, status: true } },
          },
        },
        // Hash da marca, não o binário: a lista precisa saber SE existe e
        // com qual versão montar a URL — carregar o arquivo em 46 (ou
        // centenas de) linhas é exatamente o que a RN54 manda evitar.
        marca: { select: { hash: true } },
      },
    }),
  ]);

  const linhas: LinhaDeAliado[] = empresas.map((empresa) => {
    const ofertas = empresa.solucoes.flatMap((solucao) => solucao.ofertas);
    return {
      id: empresa.id,
      nomeFantasia: empresa.nomeFantasia,
      /** Versão da marca para a URL da rota; null = sem marca (RN54). */
      marcaHash: empresa.marca?.hash ?? null,
      categorias: empresa.categorias.map((vinculo) => vinculo.categoria.nome),
      estagio: empresa.estagio,
      quantidadeSolucoes: empresa.solucoes.length,
      quantidadeOfertasAtivas: ofertas.filter((oferta) => oferta.status === "PUBLICADA").length,
      emJanelaNaoRenovacao: empresa.contratos.some((contrato) => contrato.emJanelaNaoRenovacao),
      completude: calcularCompletudeAliado({
        razaoSocial: empresa.razaoSocial,
        nomeFantasia: empresa.nomeFantasia,
        cnpj: empresa.cnpj,
        enderecoMunicipio: empresa.enderecoMunicipio,
        temMarca: empresa.marca !== null,
        logoUrl: empresa.logoUrl,
        descricaoInstitucional: empresa.descricaoInstitucional,
        quantidadeCategorias: empresa.categorias.length,
        quantidadeContatos: empresa.contatos.length,
        temContratoVigente: empresa.contratos.length > 0,
      }),
    };
  });

  return { linhas, total, pagina, tamanhoPagina: tamanho };
}

export async function contadoresAliados() {
  const [totalAtivos, comOfertaAtiva, empresasParaMedia] = await Promise.all([
    prisma.empresa.count({ where: { estagio: "ALIADA_ATIVA" } }),
    prisma.empresa.count({
      where: {
        estagio: "ALIADA_ATIVA",
        solucoes: { some: { ofertas: { some: { status: "PUBLICADA" } } } },
      },
    }),
    prisma.empresa.findMany({
      where: { estagio: "ALIADA_ATIVA" },
      include: {
        categorias: { select: { categoriaId: true } },
        contatos: { select: { id: true } },
        contratos: { where: { status: "VIGENTE" }, select: { id: true } },
        // Existência da marca, nunca o conteúdo (RN54, nota de modelagem).
        marca: { select: { empresaId: true } },
      },
    }),
  ]);
  const completudes = empresasParaMedia.map((empresa) =>
    calcularCompletudeAliado({
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      cnpj: empresa.cnpj,
      enderecoMunicipio: empresa.enderecoMunicipio,
      temMarca: empresa.marca !== null,
      logoUrl: empresa.logoUrl,
      descricaoInstitucional: empresa.descricaoInstitucional,
      quantidadeCategorias: empresa.categorias.length,
      quantidadeContatos: empresa.contatos.length,
      temContratoVigente: empresa.contratos.length > 0,
    }),
  );
  return {
    totalAtivos,
    comOfertaAtiva,
    semOfertaAtiva: totalAtivos - comOfertaAtiva,
    completudeMedia:
      completudes.length > 0
        ? Math.round(completudes.reduce((soma, valor) => soma + valor, 0) / completudes.length)
        : null,
  };
}

/** Ficha completa do aliado (T2), com todas as abas. */
export async function buscarAliado(empresaId: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    include: {
      categorias: { include: { categoria: true } },
      contatos: { orderBy: { criadoEm: "asc" } },
      contratos: {
        orderBy: { criadoEm: "desc" },
        // Metadados do anexo (PDF); o binário sai só pela rota que o serve.
        include: { anexo: { select: { nomeArquivo: true, bytes: true, hash: true } } },
      },
      motivoSuspensao: true,
      // Metadados da marca; o binário sai só pela rota que a serve.
      marca: { select: { hash: true, nomeArquivo: true, bytes: true } },
      solucoes: {
        orderBy: { criadoEm: "asc" },
        include: {
          categoria: true,
          culturas: { include: { cultura: true } },
          ufs: { include: { uf: true } },
          ofertas: {
            orderBy: { criadoEm: "asc" },
            include: { tipoBeneficio: true, mecanica: true },
          },
        },
      },
    },
  });
  if (!empresa) {
    return null;
  }
  const contratoVigente = empresa.contratos.find((contrato) => contrato.status === "VIGENTE") ?? null;
  return {
    empresa,
    contratoVigente,
    completude: calcularCompletudeAliado({
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      cnpj: empresa.cnpj,
      enderecoMunicipio: empresa.enderecoMunicipio,
      temMarca: empresa.marca !== null,
      logoUrl: empresa.logoUrl,
      descricaoInstitucional: empresa.descricaoInstitucional,
      quantidadeCategorias: empresa.categorias.length,
      quantidadeContatos: empresa.contatos.length,
      temContratoVigente: Boolean(contratoVigente),
    }),
  };
}

/** Trilha de auditoria consultável por entidade (aba Integração). */
export async function trilhaDeAuditoria(entidade: string, entidadeId: string) {
  return prisma.auditoriaEvento.findMany({
    where: { entidade, entidadeId },
    orderBy: { criadoEm: "desc" },
    take: 100,
    include: { autor: { select: { nome: true } } },
  });
}
