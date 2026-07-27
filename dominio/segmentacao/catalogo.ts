/**
 * RN33 — catálogo do construtor de segmentos: a ALLOWLIST de campos e
 * operadores. Nenhum pedaço de SQL nasce de entrada de usuário — o texto
 * SQL vem exclusivamente das definições deste arquivo; valores viajam
 * como parâmetros de bind.
 *
 * Duas origens de campo:
 * - NÚCLEO (código, aqui): colunas reais de assinantes/assinaturas, com
 *   operadores por tipo. São os campos que a RN32 e a RN37 alimentam.
 * - ENRIQUECIMENTO (dados): atributos ativos de catalogo_atributos. O
 *   compilador recebe os slugs ativos e resolve por EXISTS no EAV — o
 *   slug é parâmetro de bind, nunca texto de SQL.
 *
 * O campo "uso em 90 dias" (RN36) existe no catálogo e nas regras salvas,
 * mas torna a contagem INDISPONÍVEL enquanto a telemetria por assinante
 * não chegar ([A CONFIRMAR] com a Minutrade) — nunca um número estimado.
 */

/** Operadores declarativos do construtor (rótulos do protótipo v6.1). */
export const OPERADORES = ["e", "nao_e", "vence_em"] as const;
export type Operador = (typeof OPERADORES)[number];

export const ROTULOS_OPERADOR: Readonly<Record<Operador, string>> = {
  e: "é",
  nao_e: "não é",
  vence_em: "vence em",
};

/** Combinador com a regra anterior (encadeamento linear, T18). */
export type Combinador = "E" | "OU";

/** Uma regra declarativa persistida (segmentos.regras, RN33). */
export interface RegraSegmento {
  campo: string;
  operador: Operador;
  valor: string;
  /** Combinador com a regra ANTERIOR; ignorado (e opcional) na primeira. */
  combinadorAnterior?: Combinador;
}

/** Campos do núcleo — chaves e rótulos conforme o protótipo v6.1. */
export interface CampoNucleoCatalogo {
  slug: string;
  rotulo: string;
  operadores: ReadonlyArray<Operador>;
  /** Valores fechados quando a taxonomia é conhecida; null = texto livre. */
  valores: ReadonlyArray<{ valor: string; rotulo: string }> | null;
}

export const CAMPOS_NUCLEO_CATALOGO: ReadonlyArray<CampoNucleoCatalogo> = [
  {
    slug: "uf",
    rotulo: "UF",
    operadores: ["e", "nao_e"],
    valores: null, // as 27 UFs vêm da tabela ufs (seed da Onda 1)
  },
  {
    slug: "municipio",
    rotulo: "município",
    operadores: ["e", "nao_e"],
    valores: null,
  },
  {
    slug: "preferencia",
    rotulo: "preferência",
    operadores: ["e", "nao_e"],
    valores: [
      { valor: "agricultura", rotulo: "agricultura" },
      { valor: "pecuaria", rotulo: "pecuária" },
      { valor: "ambos", rotulo: "ambos" },
    ],
  },
  {
    slug: "vencimento",
    rotulo: "vencimento",
    operadores: ["vence_em"],
    valores: [
      { valor: "30", rotulo: "30 dias" },
      { valor: "60", rotulo: "60 dias" },
      { valor: "90", rotulo: "90 dias" },
    ],
  },
  {
    slug: "uso-90-dias",
    rotulo: "uso em 90 dias",
    operadores: ["e"],
    valores: [
      { valor: "com", rotulo: "com uso" },
      { valor: "sem", rotulo: "sem uso" },
    ],
  },
  /**
   * Onda 12 (RN63) — perfil de assinatura.
   *
   * Entra como campo do CONSTRUTOR, e não como um filtro solto da T18, de
   * propósito: assim a coluna da carteira, o filtro e o recorte de público
   * da campanha leem a mesma definição. Um filtro paralelo divergiria da
   * segmentação no primeiro valor novo — que é exatamente o que a RN33
   * evita ao fazer do catálogo a allowlist única.
   */
  {
    slug: "perfil-assinatura",
    rotulo: "perfil de assinatura",
    operadores: ["e", "nao_e"],
    valores: [
      { valor: "patrocinada", rotulo: "patrocinada" },
      { valor: "promocional_broto", rotulo: "promocional Broto" },
      { valor: "autoassinatura", rotulo: "autoassinatura" },
    ],
  },
  /**
   * Onda 12 (RN62) — o recorte "base do patrocinador".
   *
   * `valores: null` porque a lista é viva: vem de `patrocinadores`, como as
   * UFs vêm de `ufs`. O valor é o id do patrocinador, e o operador `e`
   * significa "tem vínculo VIGENTE com" — vínculo encerrado não é base de
   * ninguém hoje.
   */
  {
    slug: "patrocinador",
    rotulo: "patrocinador",
    operadores: ["e", "nao_e"],
    valores: null,
  },
];

export const SLUGS_NUCLEO: ReadonlySet<string> = new Set(
  CAMPOS_NUCLEO_CATALOGO.map((campo) => campo.slug),
);

/** Slug do campo que depende da telemetria por assinante (RN36). */
export const SLUG_USO_90_DIAS = "uso-90-dias";
