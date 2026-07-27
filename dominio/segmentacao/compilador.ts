/**
 * RN33 — compilador de segmentos: estrutura declarativa (JSONB) → SQL
 * PARAMETRIZADO sobre a allowlist do catálogo.
 *
 * Contrato de segurança (testado):
 * - O texto SQL sai EXCLUSIVAMENTE das definições do catálogo (código).
 *   Campo, operador e valor do usuário jamais entram no texto — campo e
 *   operador são validados contra a allowlist; valores viajam como
 *   parâmetros de bind ($1, $2, …).
 * - Campo fora do catálogo (núcleo em código + atributos ativos do
 *   catálogo de enriquecimento) é REJEITADO, não ignorado.
 *
 * Contrato de uso: o fragmento devolvido pressupõe o alias `a` para a
 * tabela assinantes; os parâmetros começam em $1 — quem compõe a query
 * continua a numeração a partir de parametros.length + 1.
 *
 * Semântica dos combinadores: encadeamento linear com dobra à esquerda,
 * como no protótipo v6.1 — r1 OU r2 E r3 ≡ ((r1 OU r2) E r3).
 *
 * Estados honestos:
 * - Regra de "uso em 90 dias" (RN36) torna a contagem INDISPONÍVEL
 *   enquanto não houver telemetria por assinante — nunca estimada.
 * - UF/município "não derivado" (null) fica fora de filtros positivos E
 *   negativos desses campos (semântica de NULL do SQL): sem dado, o
 *   assinante não entra em nenhum dos lados do filtro.
 * - Atributo multivalorado: "é X" = possui ao menos um valor X;
 *   "não é X" = possui o atributo E nenhum valor X (quem não tem o
 *   atributo não é contado como "não é").
 */

import {
  CAMPOS_NUCLEO_CATALOGO,
  type Combinador,
  OPERADORES,
  type Operador,
  type RegraSegmento,
  SLUG_USO_90_DIAS,
} from "./catalogo";

/** Erro de regra fora do contrato declarativo/allowlist. */
export class ErroDeSegmentoInvalido extends Error {
  readonly erros: ReadonlyArray<string>;

  constructor(erros: ReadonlyArray<string>) {
    super(erros.join(" "));
    this.name = "ErroDeSegmentoInvalido";
    this.erros = erros;
  }
}

export type ResultadoCompilacao =
  | { status: "OK"; sql: string; parametros: Array<string | number> }
  | { status: "AGUARDANDO_TELEMETRIA"; motivo: string };

/**
 * Valida a ESTRUTURA de regras vindas de fora (POST da T18 ou JSONB do
 * banco): lista de { campo, operador, valor, combinadorAnterior? }.
 * Não olha o catálogo — isso é papel do compilador.
 */
export function validarEstruturaRegras(entrada: unknown): RegraSegmento[] {
  if (!Array.isArray(entrada)) {
    throw new ErroDeSegmentoInvalido(["Regras devem ser uma lista."]);
  }
  const erros: string[] = [];
  const regras: RegraSegmento[] = [];
  entrada.forEach((item, indice) => {
    if (typeof item !== "object" || item === null) {
      erros.push(`Regra ${indice + 1}: formato inválido.`);
      return;
    }
    const bruto = item as Record<string, unknown>;
    const campo = bruto.campo;
    const operador = bruto.operador;
    const valor = bruto.valor;
    const combinador = bruto.combinadorAnterior;
    if (typeof campo !== "string" || !campo.trim()) {
      erros.push(`Regra ${indice + 1}: campo ausente.`);
    }
    if (
      typeof operador !== "string" ||
      !(OPERADORES as ReadonlyArray<string>).includes(operador)
    ) {
      erros.push(`Regra ${indice + 1}: operador desconhecido.`);
    }
    if (typeof valor !== "string" || !valor.trim()) {
      erros.push(`Regra ${indice + 1}: valor ausente.`);
    }
    if (
      indice > 0 &&
      combinador !== undefined &&
      combinador !== "E" &&
      combinador !== "OU"
    ) {
      erros.push(`Regra ${indice + 1}: combinador deve ser E ou OU.`);
    }
    if (erros.length === 0) {
      regras.push({
        campo: (campo as string).trim(),
        operador: operador as Operador,
        valor: (valor as string).trim(),
        combinadorAnterior:
          indice > 0 ? ((combinador as Combinador | undefined) ?? "E") : undefined,
      });
    }
  });
  if (erros.length > 0) {
    throw new ErroDeSegmentoInvalido(erros);
  }
  return regras;
}

interface CondicaoCompilada {
  sql: string;
  parametros: Array<string | number>;
}

const NUCLEO_POR_SLUG = new Map(
  CAMPOS_NUCLEO_CATALOGO.map((campo) => [campo.slug, campo]),
);

function compilarCondicaoNucleo(
  regra: RegraSegmento,
  proximoIndice: () => number,
): CondicaoCompilada {
  const definicao = NUCLEO_POR_SLUG.get(regra.campo)!;
  if (!definicao.operadores.includes(regra.operador)) {
    throw new ErroDeSegmentoInvalido([
      `Operador "${regra.operador}" não é permitido para o campo "${regra.campo}".`,
    ]);
  }
  if (definicao.valores) {
    const permitido = definicao.valores.some((opcao) => opcao.valor === regra.valor);
    if (!permitido) {
      throw new ErroDeSegmentoInvalido([
        `Valor "${regra.valor}" não é permitido para o campo "${regra.campo}".`,
      ]);
    }
  }

  switch (regra.campo) {
    case "uf": {
      const indice = proximoIndice();
      return {
        sql: `a.uf ${regra.operador === "e" ? "=" : "<>"} $${indice}`,
        parametros: [regra.valor.toUpperCase()],
      };
    }
    case "municipio": {
      const indice = proximoIndice();
      // Comparação insensível a caixa/acentuação fica para quando o
      // dicionário do arquivo confirmar a grafia; igualdade estrita é
      // determinística e indexável.
      return {
        sql: `a.municipio ${regra.operador === "e" ? "=" : "<>"} $${indice}`,
        parametros: [regra.valor],
      };
    }
    case "preferencia": {
      const indice = proximoIndice();
      return {
        sql: `a.preferencia ${regra.operador === "e" ? "=" : "<>"} CAST($${indice} AS "PreferenciaAssinante")`,
        parametros: [regra.valor.toUpperCase()],
      };
    }
    case "vencimento": {
      const indice = proximoIndice();
      // RN37: janela cumulativa, hoje ≤ vencimento ≤ hoje + N dias.
      return {
        sql:
          `EXISTS (SELECT 1 FROM assinaturas s WHERE s.assinante_id = a.id ` +
          `AND s.vencimento >= CURRENT_DATE ` +
          // ::int — o driver binda números JS como bigint, que o
          // make_interval não aceita.
          `AND s.vencimento <= CURRENT_DATE + make_interval(days => $${indice}::int))`,
        parametros: [Number(regra.valor)],
      };
    }
    case "perfil-assinatura": {
      const indice = proximoIndice();
      // Onda 12 (RN63). `nao_e` usa `IS DISTINCT FROM` e não `<>` porque
      // perfil NULO é o estado mais comum hoje — e "não é patrocinada"
      // precisa incluir quem ainda não tem perfil informado, senão o
      // recorte esconde a maior parte da base sem dizer.
      return {
        sql:
          regra.operador === "e"
            ? `a.perfil_assinatura = CAST($${indice} AS "PerfilAssinatura")`
            : `a.perfil_assinatura IS DISTINCT FROM CAST($${indice} AS "PerfilAssinatura")`,
        parametros: [regra.valor.toUpperCase()],
      };
    }
    case "patrocinador": {
      const indice = proximoIndice();
      // Onda 12 (RN62). Vínculo VIGENTE (`fim IS NULL`) — a mesma
      // definição de `dominio/patrocinio/saldo.ts`, e a única que faz o
      // recorte significar "a base do patrocinador hoje".
      const existe =
        `EXISTS (SELECT 1 FROM vinculos_patrocinio v WHERE v.assinante_id = a.id ` +
        `AND v.patrocinador_id = $${indice} AND v.fim IS NULL)`;
      return {
        sql: regra.operador === "e" ? existe : `NOT ${existe}`,
        parametros: [regra.valor],
      };
    }
    default:
      throw new ErroDeSegmentoInvalido([
        `Campo "${regra.campo}" sem compilação definida.`,
      ]);
  }
}

function compilarCondicaoEnriquecimento(
  regra: RegraSegmento,
  proximoIndice: () => number,
): CondicaoCompilada {
  if (regra.operador !== "e" && regra.operador !== "nao_e") {
    throw new ErroDeSegmentoInvalido([
      `Operador "${regra.operador}" não é permitido para o atributo "${regra.campo}".`,
    ]);
  }
  const existeComValor = (indiceSlug: number, indiceValor: number) =>
    `EXISTS (SELECT 1 FROM atributos_enriquecimento ae ` +
    `JOIN catalogo_atributos ca ON ca.id = ae.catalogo_id ` +
    `WHERE ae.assinante_id = a.id AND ca.slug = $${indiceSlug} AND ae.valor = $${indiceValor})`;

  if (regra.operador === "e") {
    const indiceSlug = proximoIndice();
    const indiceValor = proximoIndice();
    return {
      sql: existeComValor(indiceSlug, indiceValor),
      parametros: [regra.campo, regra.valor],
    };
  }
  // "não é": tem o atributo E nenhum valor igual — quem não tem o
  // atributo fica fora (estado honesto, como o NULL do núcleo).
  const indiceSlugTem = proximoIndice();
  const indiceSlugNao = proximoIndice();
  const indiceValor = proximoIndice();
  return {
    sql:
      `(EXISTS (SELECT 1 FROM atributos_enriquecimento ae ` +
      `JOIN catalogo_atributos ca ON ca.id = ae.catalogo_id ` +
      `WHERE ae.assinante_id = a.id AND ca.slug = $${indiceSlugTem}) ` +
      `AND NOT ${existeComValor(indiceSlugNao, indiceValor)})`,
    parametros: [regra.campo, regra.campo, regra.valor],
  };
}

/**
 * Compila a lista de regras para um fragmento WHERE parametrizado.
 * `slugsEnriquecimentoAtivos` são os atributos ativos do catálogo (dados);
 * qualquer campo fora de núcleo + ativos é rejeitado (teste obrigatório).
 */
export function compilarSegmento(
  regras: ReadonlyArray<RegraSegmento>,
  contexto: { slugsEnriquecimentoAtivos: ReadonlySet<string> },
): ResultadoCompilacao {
  if (regras.length === 0) {
    return { status: "OK", sql: "TRUE", parametros: [] };
  }

  // RN36 — regra de uso torna a contagem indisponível: telemetria por
  // assinante ainda [A CONFIRMAR] com a Minutrade. A regra é persistível
  // e a interface a exibe; o número, nunca.
  if (regras.some((regra) => regra.campo === SLUG_USO_90_DIAS)) {
    return {
      status: "AGUARDANDO_TELEMETRIA",
      motivo:
        "A regra de uso em 90 dias só conta quando a telemetria chegar por assinante — a contagem não é estimada.",
    };
  }

  const parametros: Array<string | number> = [];
  let indicesAlocados = 0;
  const proximoIndice = () => {
    indicesAlocados += 1;
    return indicesAlocados;
  };
  let sqlAcumulado = "";

  regras.forEach((regra, indice) => {
    let condicao: CondicaoCompilada;
    if (NUCLEO_POR_SLUG.has(regra.campo)) {
      condicao = compilarCondicaoNucleo(regra, proximoIndice);
    } else if (contexto.slugsEnriquecimentoAtivos.has(regra.campo)) {
      condicao = compilarCondicaoEnriquecimento(regra, proximoIndice);
    } else {
      throw new ErroDeSegmentoInvalido([
        `Campo "${regra.campo}" não está no catálogo de segmentação.`,
      ]);
    }
    parametros.push(...condicao.parametros);
    if (indice === 0) {
      sqlAcumulado = `(${condicao.sql})`;
      return;
    }
    const conectivo = regra.combinadorAnterior === "OU" ? "OR" : "AND";
    sqlAcumulado = `(${sqlAcumulado} ${conectivo} (${condicao.sql}))`;
  });

  return { status: "OK", sql: sqlAcumulado, parametros };
}

/**
 * Resumo textual da regra para T18/T21 ("UF é MT E cultura é soja"),
 * no vocabulário do protótipo.
 */
export function resumirRegras(
  regras: ReadonlyArray<RegraSegmento>,
  rotuloPorSlug: (slug: string) => string,
): string {
  if (regras.length === 0) {
    return "Nenhum filtro aplicado — carteira inteira";
  }
  return regras
    .map((regra, indice) => {
      const prefixo =
        indice === 0 ? "" : regra.combinadorAnterior === "OU" ? " OU " : " E ";
      if (regra.campo === "vencimento") {
        return `${prefixo}vence em ${regra.valor} dias`;
      }
      if (regra.campo === SLUG_USO_90_DIAS) {
        return `${prefixo}${regra.valor === "sem" ? "sem" : "com"} uso em 90 dias`;
      }
      const operador = regra.operador === "nao_e" ? "não é" : "é";
      return `${prefixo}${rotuloPorSlug(regra.campo)} ${operador} ${regra.valor}`;
    })
    .join("");
}
