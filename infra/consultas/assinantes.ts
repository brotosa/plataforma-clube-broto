import { prisma } from "@/infra/prisma/cliente";
import { CAMPOS_NUCLEO_CATALOGO } from "@/dominio/segmentacao/catalogo";
import {
  compilarSegmento,
  resumirRegras,
  validarEstruturaRegras,
} from "@/dominio/segmentacao/compilador";
import { formatarCpf, normalizarCpf, validarCpf } from "@/dominio/assinantes/cpf";
import {
  mascararCpf,
  mascararEmail,
  mascararTelefone,
} from "@/dominio/assinantes/mascara";
import { janelaVencimento } from "@/dominio/assinantes/vencimento";
import { decifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";

/**
 * Consultas do módulo Assinantes (T18/T19/T21).
 *
 * RN30 — a máscara é decidida AQUI, no servidor: o parâmetro
 * `dadosPlenos` só chega true depois de a camada de API validar a
 * permissão "visualizar dados pessoais plenos" e registrar o evento de
 * auditoria (casos-de-uso/assinantes-acesso.ts). O front nunca recebe o
 * dado pleno para "esconder por conta própria".
 *
 * RN33 — a contagem usa exclusivamente o SQL do compilador (allowlist);
 * é aberta a todos os papéis. Regra de uso (RN36) devolve o estado
 * "aguardando telemetria por assinante" — nunca um número.
 */

export const TAMANHO_PAGINA_ASSINANTES = 8;

/** Atributos ativos do catálogo — allowlist dinâmica do compilador. */
export async function slugsEnriquecimentoAtivos(): Promise<Set<string>> {
  const ativos = await prisma.catalogoAtributo.findMany({
    where: { ativo: true },
    select: { slug: true },
  });
  return new Set(ativos.map(({ slug }) => slug));
}

/** Campos oferecidos pelo construtor da T18 (núcleo + catálogo ativo). */
export async function camposDoConstrutor() {
  const catalogo = await prisma.catalogoAtributo.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
  });
  const ufs = await prisma.uf.findMany({ orderBy: { sigla: "asc" } });
  return {
    nucleo: CAMPOS_NUCLEO_CATALOGO.map((campo) => ({
      slug: campo.slug,
      rotulo: campo.rotulo,
      operadores: campo.operadores,
      valores:
        campo.slug === "uf"
          ? ufs.map((uf) => ({ valor: uf.sigla, rotulo: uf.sigla }))
          : campo.valores,
    })),
    enriquecimento: catalogo.map((atributo) => ({
      slug: atributo.slug,
      rotulo: atributo.nome,
      operadores: ["e", "nao_e"] as const,
      valores: null,
    })),
  };
}

export type ResultadoContagem =
  | { status: "OK"; total: number }
  | { status: "AGUARDANDO_TELEMETRIA"; motivo: string };

/**
 * Contagem viva da T18/T21 (endpoint separado e rápido). Conta apenas
 * assinantes ATIVOS — quem saiu por foto completa não compõe a carteira.
 */
export async function contarAssinantes(regrasBrutas: unknown): Promise<ResultadoContagem> {
  const regras = validarEstruturaRegras(regrasBrutas);
  const compilado = compilarSegmento(regras, {
    slugsEnriquecimentoAtivos: await slugsEnriquecimentoAtivos(),
  });
  if (compilado.status === "AGUARDANDO_TELEMETRIA") {
    return compilado;
  }
  const linhas = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
    `SELECT count(*)::bigint AS total FROM assinantes a WHERE a.status_base = 'ATIVO' AND (${compilado.sql})`,
    ...compilado.parametros,
  );
  return { status: "OK", total: Number(linhas[0]?.total ?? 0) };
}

export interface FiltrosCarteira {
  regras?: unknown;
  busca?: string;
  pagina?: number;
  /**
   * Onda 12 — recorte "base do patrocinador": só quem tem vínculo VIGENTE
   * com o patrocinador informado. É o que a aba Base da T33 usa para
   * reusar esta tabela em vez de escrever outra.
   */
  patrocinadorId?: string;
  /** Onda 12 (RN63) — filtro de Perfil na T18. */
  perfilAssinatura?: string;
}

/**
 * Carteira (T18): consulta paginada no servidor, filtro do construtor +
 * busca por nome. Valores sensíveis mascarados por padrão; plenos apenas
 * com `dadosPlenos` já autorizado e auditado pela API.
 */
export async function listarCarteira(
  filtros: FiltrosCarteira,
  exibicao: { dadosPlenos: boolean },
) {
  const regras = validarEstruturaRegras(filtros.regras ?? []);
  const compilado = compilarSegmento(regras, {
    slugsEnriquecimentoAtivos: await slugsEnriquecimentoAtivos(),
  });
  if (compilado.status === "AGUARDANDO_TELEMETRIA") {
    return {
      status: "AGUARDANDO_TELEMETRIA" as const,
      motivo: compilado.motivo,
      linhas: [],
      total: null,
      pagina: 1,
      tamanhoPagina: TAMANHO_PAGINA_ASSINANTES,
    };
  }

  const pagina = Math.max(1, filtros.pagina ?? 1);
  const parametros: Array<string | number> = [...compilado.parametros];
  let sqlBusca = "";
  const busca = filtros.busca?.trim();
  if (busca) {
    // "Buscar por nome ou CPF": um CPF válido digitado vira busca exata
    // pelo hash — nenhuma comparação em claro; o CPF digitado não é
    // registrado. Qualquer outro texto busca por nome.
    if (validarCpf(busca)) {
      parametros.push(hashCpf(normalizarCpf(busca)));
      sqlBusca = ` AND a.cpf_hash = $${parametros.length}`;
    } else {
      parametros.push(`%${busca}%`);
      sqlBusca = ` AND a.nome ILIKE $${parametros.length}`;
    }
  }
  /**
   * Recortes da Onda 12. Ambos entram por parâmetro numerado, como todo o
   * resto desta consulta — nenhum valor é concatenado no SQL.
   *
   * O do patrocinador é `EXISTS` e não `JOIN` de propósito: um assinante
   * pode ter mais de um vínculo com o mesmo patrocinador ao longo do
   * tempo, e o JOIN duplicaria a linha na lista. `fim IS NULL` é a
   * definição de vigente, a mesma de `dominio/patrocinio/saldo.ts`.
   */
  let sqlRecorte = "";
  if (filtros.patrocinadorId) {
    parametros.push(filtros.patrocinadorId);
    sqlRecorte += ` AND EXISTS (SELECT 1 FROM vinculos_patrocinio v WHERE v.assinante_id = a.id AND v.patrocinador_id = $${parametros.length} AND v.fim IS NULL)`;
  }
  if (filtros.perfilAssinatura) {
    parametros.push(filtros.perfilAssinatura);
    sqlRecorte += ` AND a.perfil_assinatura = $${parametros.length}::"PerfilAssinatura"`;
  }
  const baseWhere = `a.status_base = 'ATIVO' AND (${compilado.sql})${sqlBusca}${sqlRecorte}`;

  const totalLinhas = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
    `SELECT count(*)::bigint AS total FROM assinantes a WHERE ${baseWhere}`,
    ...parametros,
  );
  const total = Number(totalLinhas[0]?.total ?? 0);

  const parametrosPagina = [
    ...parametros,
    TAMANHO_PAGINA_ASSINANTES,
    (pagina - 1) * TAMANHO_PAGINA_ASSINANTES,
  ];
  const ids = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT a.id FROM assinantes a WHERE ${baseWhere} ORDER BY a.nome ASC, a.id ASC LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    ...parametrosPagina,
  );

  const registros = await prisma.assinante.findMany({
    where: { id: { in: ids.map(({ id }) => id) } },
    include: {
      assinatura: true,
      atributos: { include: { catalogo: { select: { slug: true, nome: true } } } },
      // Onda 12 — a coluna Patrocinador da T18. Só os vigentes: quem já
      // saiu da vaga não é patrocinado hoje, e listá-lo seria afirmar o
      // contrário.
      vinculos: {
        where: { fim: null },
        select: { patrocinador: { select: { razaoSocial: true } } },
      },
    },
  });
  const porId = new Map(registros.map((registro) => [registro.id, registro]));
  const hoje = new Date();

  const linhas = ids
    .map(({ id }) => porId.get(id))
    .filter((registro): registro is NonNullable<typeof registro> => Boolean(registro))
    .map((registro) => {
      const atributosPorSlug = new Map<string, string[]>();
      for (const atributo of registro.atributos) {
        const lista = atributosPorSlug.get(atributo.catalogo.slug) ?? [];
        lista.push(atributo.valor);
        atributosPorSlug.set(atributo.catalogo.slug, lista);
      }
      return {
        id: registro.id,
        nome: registro.nome,
        cpf: exibicao.dadosPlenos
          ? formatarCpf(decifrarCpf(registro.cpfCifrado))
          : mascararCpf(decifrarCpf(registro.cpfCifrado)),
        email: exibicao.dadosPlenos ? registro.email : mascararEmail(registro.email),
        telefone: exibicao.dadosPlenos
          ? registro.telefone
          : mascararTelefone(registro.telefone),
        uf: registro.uf,
        municipio: registro.municipio,
        preferencia: registro.preferencia,
        unidadesProdutivas: atributosPorSlug.get("unidade-produtiva") ?? [],
        culturas: atributosPorSlug.get("cultura") ?? [],
        vencimento: registro.assinatura?.vencimento ?? null,
        janelaVencimento: registro.assinatura?.vencimento
          ? janelaVencimento(registro.assinatura.vencimento, hoje)
          : null,
        marcaSintetico: registro.marcaSintetico,
        /**
         * Onda 12 (RN63). `null` é o estado honesto e o mais comum hoje:
         * o perfil vem da coluna nativa `Patrocinador` do relatório da
         * operadora, que só a F20 ingere. A tela escreve o motivo.
         */
        perfilAssinatura: registro.perfilAssinatura,
        patrocinadores: registro.vinculos.map((vinculo) => vinculo.patrocinador.razaoSocial),
      };
    });

  return {
    status: "OK" as const,
    motivo: null,
    linhas,
    total,
    pagina,
    tamanhoPagina: TAMANHO_PAGINA_ASSINANTES,
  };
}

/** Existe base importada? (estado vazio institucional da T18) */
export async function existeBaseImportada(): Promise<boolean> {
  const total = await prisma.assinante.count();
  return total > 0;
}

/**
 * Perfil (T19): núcleo com os DOIS estados de exibição, assinatura com
 * origem sinalizada, uso "aguardando telemetria por assinante" (RN36),
 * atributos com proveniência (RN35) e segmentos que incluem o assinante.
 */
export async function perfilAssinante(
  assinanteId: string,
  exibicao: { dadosPlenos: boolean },
) {
  const registro = await prisma.assinante.findUnique({
    where: { id: assinanteId },
    include: {
      assinatura: true,
      atributos: {
        include: { catalogo: { select: { slug: true, nome: true } } },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (!registro) {
    return null;
  }
  const cpfPleno = decifrarCpf(registro.cpfCifrado);
  const hoje = new Date();

  // Segmentos que incluem este assinante: avalia cada segmento salvo com
  // o mesmo compilador (EXISTS por id). Segmentos com regra de uso ficam
  // de fora — sem telemetria por assinante, não há pertencimento a
  // calcular (RN36).
  const segmentos = await prisma.segmento.findMany({ orderBy: { nome: "asc" } });
  const slugsAtivos = await slugsEnriquecimentoAtivos();
  const segmentosDoAssinante: string[] = [];
  for (const segmento of segmentos) {
    let compilado;
    try {
      compilado = compilarSegmento(validarEstruturaRegras(segmento.regras), {
        slugsEnriquecimentoAtivos: slugsAtivos,
      });
    } catch {
      continue; // segmento com campo removido do catálogo não derruba o perfil
    }
    if (compilado.status !== "OK") {
      continue;
    }
    const pertence = await prisma.$queryRawUnsafe<Array<{ um: number }>>(
      `SELECT 1 AS um FROM assinantes a WHERE a.id = $${compilado.parametros.length + 1} AND a.status_base = 'ATIVO' AND (${compilado.sql}) LIMIT 1`,
      ...[...compilado.parametros, assinanteId],
    );
    if (pertence.length > 0) {
      segmentosDoAssinante.push(segmento.nome);
    }
  }

  return {
    id: registro.id,
    nome: registro.nome,
    cpf: exibicao.dadosPlenos ? formatarCpf(cpfPleno) : mascararCpf(cpfPleno),
    email: exibicao.dadosPlenos ? registro.email : mascararEmail(registro.email),
    telefone: exibicao.dadosPlenos
      ? registro.telefone
      : mascararTelefone(registro.telefone),
    enderecoBruto: registro.enderecoBruto,
    cep: registro.cep,
    uf: registro.uf,
    municipio: registro.municipio,
    preferencia: registro.preferencia,
    statusBase: registro.statusBase,
    marcaSintetico: registro.marcaSintetico,
    assinatura: registro.assinatura
      ? {
          plano: registro.assinatura.plano,
          status: registro.assinatura.status,
          vencimento: registro.assinatura.vencimento,
          janela: registro.assinatura.vencimento
            ? janelaVencimento(registro.assinatura.vencimento, hoje)
            : null,
          origemDado: registro.assinatura.origemDado,
        }
      : null,
    atributos: registro.atributos.map((atributo) => ({
      slug: atributo.catalogo.slug,
      nome: atributo.catalogo.nome,
      valor: atributo.valor,
      fonte: atributo.fonte,
      dataReferencia: atributo.dataReferencia,
    })),
    segmentos: segmentosDoAssinante,
  };
}

/** Segmentos salvos com contagem atual (T21) — recalculada a cada consulta. */
export async function listarSegmentosComContagem() {
  const segmentos = await prisma.segmento.findMany({
    orderBy: { nome: "asc" },
    include: { autor: { select: { nome: true } } },
  });
  const slugsAtivos = await slugsEnriquecimentoAtivos();
  const rotuloPorSlug = await construirRotuloPorSlug();

  const resultado = [];
  for (const segmento of segmentos) {
    let contagem: ResultadoContagem;
    let resumo = "";
    try {
      const regras = validarEstruturaRegras(segmento.regras);
      resumo = resumirRegras(regras, rotuloPorSlug);
      const compilado = compilarSegmento(regras, {
        slugsEnriquecimentoAtivos: slugsAtivos,
      });
      if (compilado.status === "AGUARDANDO_TELEMETRIA") {
        contagem = compilado;
      } else {
        const linhas = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
          `SELECT count(*)::bigint AS total FROM assinantes a WHERE a.status_base = 'ATIVO' AND (${compilado.sql})`,
          ...compilado.parametros,
        );
        contagem = { status: "OK", total: Number(linhas[0]?.total ?? 0) };
      }
    } catch {
      contagem = {
        status: "AGUARDANDO_TELEMETRIA",
        motivo: "Regra com campo fora do catálogo atual — revise o segmento.",
      };
    }
    resultado.push({
      id: segmento.id,
      nome: segmento.nome,
      regras: segmento.regras,
      resumo,
      autor: segmento.autor.nome,
      criadoEm: segmento.criadoEm,
      contagem,
    });
  }
  return resultado;
}

/** Rótulo institucional por slug (núcleo em código + catálogo em dados). */
export async function construirRotuloPorSlug(): Promise<(slug: string) => string> {
  const catalogo = await prisma.catalogoAtributo.findMany({
    select: { slug: true, nome: true },
  });
  const rotulos = new Map<string, string>();
  for (const campo of CAMPOS_NUCLEO_CATALOGO) {
    rotulos.set(campo.slug, campo.rotulo);
  }
  for (const atributo of catalogo) {
    rotulos.set(atributo.slug, atributo.nome);
  }
  return (slug: string) => rotulos.get(slug) ?? slug;
}
