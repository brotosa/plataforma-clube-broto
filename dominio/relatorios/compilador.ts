/**
 * RN75 — compilador do Gerador de relatórios: definição declarativa (JSONB)
 * → SQL PARAMETRIZADO sobre a allowlist do assunto.
 *
 * ## Contrato de segurança, e ele é testado
 *
 * - O texto SQL sai **exclusivamente** das definições do catálogo. Campo,
 *   operador, agregação e junção da pessoa são *chaves* procuradas lá; o que
 *   ela digita vira parâmetro de bind (`$1`, `$2`, …).
 * - Chave fora do catálogo é **recusada, não ignorada**. Ignorar devolveria
 *   um relatório com um filtro a menos, e o número sairia menor sem nada na
 *   tela dizendo por quê — o defeito mais caro possível aqui, porque parece
 *   certo.
 * - Os únicos números que o compilador escreve direto no SQL são **índices
 *   que ele mesmo gerou**: posições de `$n`, ordinais de `GROUP BY` e o teto
 *   de linhas, já convertido para inteiro e limitado.
 *
 * ## O problema da junção que multiplica, e por que ele não é detalhe
 *
 * Um aliado com três soluções aparece três vezes quando a junção de soluções
 * está ativa. `count(e.nome_fantasia)` devolveria 3 para um aliado só — o
 * produto cartesiano em miniatura, e o defeito clássico de relatório montado
 * sobre junção. Pior: o número é plausível, então ninguém desconfia.
 *
 * Duas defesas, e as duas são estruturais:
 *
 * 1. **`QUANTOS` conta a identidade do assunto, sempre** — `count(DISTINCT
 *    o.id)`, não `count(*)`. "Quantas ofertas" passa a significar quantas
 *    ofertas, independentemente de quantas junções estejam abertas. É também
 *    o que gente quer dizer com "quantos".
 * 2. **`SOMA` e `MEDIA` são recusadas quando há junção que multiplica**, com
 *    a causa escrita (RN55). Somar preço sobre linhas repetidas infla o
 *    total, e não há como consertar isso dentro de uma consulta plana sem
 *    subconsulta por medida — que é trabalho de fase própria. Recusar com
 *    explicação é honesto; devolver o número inflado, não.
 *
 * `MINIMO` e `MAXIMO` são imunes à repetição e passam sempre.
 *
 * ## Colunas: o pivô acontece fora do SQL
 *
 * O `GROUP BY` traz linhas e colunas juntas, e o pivô é montado em memória
 * sobre um resultado **já limitado pelo teto** (RN79). Fazer o pivô em SQL
 * exigiria `crosstab` com a lista de colunas escrita no texto da consulta —
 * e essa lista viria dos dados, que é exatamente a porta que a RN75 fecha.
 */

import {
  ARIDADE_OPERADOR,
  type Agregacao,
  type AssuntoRelatorio,
  type CampoRelatorio,
  type OperadorRelatorio,
  assuntoPorSlug,
  campoPorSlug,
} from "./catalogo";

/** Erro de definição fora do contrato declarativo/allowlist. */
export class ErroDeRelatorioInvalido extends Error {
  readonly erros: ReadonlyArray<string>;

  constructor(erros: ReadonlyArray<string>) {
    super(erros.join(" "));
    this.name = "ErroDeRelatorioInvalido";
    this.erros = erros;
  }
}

export interface ValorDeRelatorio {
  campo: string;
  agregacao: Agregacao;
}

export interface FiltroDeRelatorio {
  campo: string;
  operador: OperadorRelatorio;
  valores: ReadonlyArray<string>;
}

export interface OrdenacaoDeRelatorio {
  /** Chave gerada pelo próprio compilador: `d0…dN` ou `v0…vN`. */
  chave: string;
  direcao: "ASC" | "DESC";
}

export interface DefinicaoRelatorio {
  assunto: string;
  linhas: ReadonlyArray<string>;
  colunas: ReadonlyArray<string>;
  valores: ReadonlyArray<ValorDeRelatorio>;
  filtros: ReadonlyArray<FiltroDeRelatorio>;
  ordenacao?: OrdenacaoDeRelatorio;
}

/** Teto de linhas do resultado (RN79). */
export const TETO_LINHAS_PADRAO = 5_000;
export const TETO_LINHAS_MAXIMO = 50_000;
/** Linhas da prévia — amostra, recalculada a cada mudança. */
export const LINHAS_DA_PREVIA = 50;

export interface ColunaProjetada {
  /** `d0…dN` (dimensão) ou `v0…vN` (medida) — o alias no SELECT. */
  chave: string;
  rotulo: string;
  papel: "LINHA" | "COLUNA" | "VALOR";
  campo: string;
  tipo: CampoRelatorio["tipo"];
  agregacao?: Agregacao;
  /**
   * Valor guardado → rótulo de gente, para os campos de lista fechada.
   *
   * **Sem isto, a tela exibe o banco.** A primeira versão não o tinha, e o
   * cruzamento por Natureza saiu com as colunas `BENEFICIO`, `RECOMPENSA` e
   * `CUPOM_DESCONTO` — que é o que o Postgres devolve, e não o que o
   * catálogo já sabia chamar de "Benefício (Checkout Broto)". Apareceu no
   * primeiro print da tela montada com dado real; nenhum teste o via, porque
   * todos conferiam número e nenhum conferia nome.
   *
   * Vai junto da projeção, e não é buscado pela tela, para que o pivô e o
   * CSV usem o mesmo rótulo sem consultar o catálogo — que é código de
   * servidor e não atravessa para o cliente.
   */
  rotulosDeValor?: Readonly<Record<string, string>>;
}

export interface RelatorioCompilado {
  sql: string;
  parametros: Array<string | number>;
  projecao: ReadonlyArray<ColunaProjetada>;
  /**
   * Quantas linhas o SQL pode devolver: o teto **mais uma**. A linha extra é
   * o sinal de estouro — sem ela seria impossível distinguir "deu exatamente
   * o teto" de "foi cortado no teto", e a tela precisa saber a diferença
   * para nomear a causa em vez de exibir um resultado truncado em silêncio.
   */
  limite: number;
}

// ---------------------------------------------------------------------
// Validação de estrutura — antes de olhar o catálogo
// ---------------------------------------------------------------------

function exigirListaDeTextos(entrada: unknown, onde: string, erros: string[]): string[] {
  if (entrada === undefined || entrada === null) return [];
  if (!Array.isArray(entrada)) {
    erros.push(`${onde}: formato inválido.`);
    return [];
  }
  const saida: string[] = [];
  entrada.forEach((item) => {
    if (typeof item !== "string" || !item.trim()) {
      erros.push(`${onde}: entrada vazia ou de tipo inesperado.`);
      return;
    }
    saida.push(item.trim());
  });
  return saida;
}

/**
 * Valida a ESTRUTURA de uma definição vinda de fora — do formulário da T36
 * ou do JSONB de um relatório salvo. Não consulta o catálogo: isso é papel
 * de `compilarRelatorio`, e a separação é a mesma que a RN33 já usa.
 *
 * O JSONB do banco passa por aqui **igual** ao que chega do navegador. Não é
 * zelo excessivo: um relatório salvo hoje pode ser aberto depois de o
 * catálogo perder um campo, e nesse dia a definição guardada é, para todos
 * os efeitos, entrada não confiável.
 */
export function validarEstruturaDefinicao(entrada: unknown): DefinicaoRelatorio {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    throw new ErroDeRelatorioInvalido(["A definição do relatório deve ser um objeto."]);
  }
  const bruto = entrada as Record<string, unknown>;
  const erros: string[] = [];

  const assunto = typeof bruto.assunto === "string" ? bruto.assunto.trim() : "";
  if (!assunto) {
    erros.push("Assunto ausente.");
  }

  const linhas = exigirListaDeTextos(bruto.linhas, "Linhas", erros);
  const colunas = exigirListaDeTextos(bruto.colunas, "Colunas", erros);

  const valores: ValorDeRelatorio[] = [];
  if (bruto.valores !== undefined && bruto.valores !== null) {
    if (!Array.isArray(bruto.valores)) {
      erros.push("Valores: formato inválido.");
    } else {
      bruto.valores.forEach((item, indice) => {
        if (typeof item !== "object" || item === null) {
          erros.push(`Valor ${indice + 1}: formato inválido.`);
          return;
        }
        const linha = item as Record<string, unknown>;
        if (typeof linha.campo !== "string" || !linha.campo.trim()) {
          erros.push(`Valor ${indice + 1}: campo ausente.`);
          return;
        }
        if (typeof linha.agregacao !== "string") {
          erros.push(`Valor ${indice + 1}: agregação ausente.`);
          return;
        }
        valores.push({
          campo: linha.campo.trim(),
          agregacao: linha.agregacao as Agregacao,
        });
      });
    }
  }

  const filtros: FiltroDeRelatorio[] = [];
  if (bruto.filtros !== undefined && bruto.filtros !== null) {
    if (!Array.isArray(bruto.filtros)) {
      erros.push("Filtros: formato inválido.");
    } else {
      bruto.filtros.forEach((item, indice) => {
        if (typeof item !== "object" || item === null) {
          erros.push(`Filtro ${indice + 1}: formato inválido.`);
          return;
        }
        const linha = item as Record<string, unknown>;
        if (typeof linha.campo !== "string" || !linha.campo.trim()) {
          erros.push(`Filtro ${indice + 1}: campo ausente.`);
          return;
        }
        if (typeof linha.operador !== "string") {
          erros.push(`Filtro ${indice + 1}: operador ausente.`);
          return;
        }
        const brutos = linha.valores;
        const valoresDoFiltro: string[] = [];
        if (Array.isArray(brutos)) {
          brutos.forEach((valor) => {
            if (typeof valor === "string") valoresDoFiltro.push(valor.trim());
            else if (typeof valor === "number") valoresDoFiltro.push(String(valor));
            else erros.push(`Filtro ${indice + 1}: valor de tipo inesperado.`);
          });
        } else if (brutos !== undefined && brutos !== null) {
          erros.push(`Filtro ${indice + 1}: valores devem ser uma lista.`);
        }
        filtros.push({
          campo: linha.campo.trim(),
          operador: linha.operador as OperadorRelatorio,
          valores: valoresDoFiltro,
        });
      });
    }
  }

  let ordenacao: OrdenacaoDeRelatorio | undefined;
  if (bruto.ordenacao !== undefined && bruto.ordenacao !== null) {
    const linha = bruto.ordenacao as Record<string, unknown>;
    const chave = typeof linha.chave === "string" ? linha.chave.trim() : "";
    const direcao = linha.direcao === "DESC" ? "DESC" : "ASC";
    if (!chave) {
      erros.push("Ordenação: chave ausente.");
    } else {
      ordenacao = { chave, direcao };
    }
  }

  if (erros.length > 0) {
    throw new ErroDeRelatorioInvalido(erros);
  }
  return { assunto, linhas, colunas, valores, filtros, ordenacao };
}

// ---------------------------------------------------------------------
// Compilação
// ---------------------------------------------------------------------

function exigirCampo(assunto: AssuntoRelatorio, slug: string): CampoRelatorio {
  const campo = campoPorSlug(assunto, slug);
  if (!campo) {
    throw new ErroDeRelatorioInvalido([
      `O campo "${slug}" não está no catálogo do assunto "${assunto.rotulo}".`,
    ]);
  }
  if (campo.indisponivel) {
    // RN77: o campo existe no catálogo para ser VISTO, não para ser usado.
    // A mensagem que a tela mostra é a do próprio catálogo — quem escreveu
    // o campo é quem sabe por que ele não sustenta número.
    throw new ErroDeRelatorioInvalido([`${campo.rotulo}: ${campo.indisponivel}`]);
  }
  return campo;
}

/**
 * Resolve as junções necessárias, **na ordem das dependências**, e devolve o
 * fragmento FROM. A ordem importa: `aliado` depende de `solucao`, e um
 * `JOIN empresas e ON e.id = s.empresa_id` antes de `s` existir é erro de
 * sintaxe no banco — não uma falha de segurança, mas uma que só apareceria
 * na combinação certa de campos, isto é, em produção.
 */
function montarFrom(assunto: AssuntoRelatorio, necessarias: ReadonlySet<string>): string {
  const incluidas = new Set<string>();
  const partes: string[] = [`${assunto.raiz.tabela} ${assunto.raiz.alias}`];

  const incluir = (chave: string, visitando: ReadonlySet<string>) => {
    if (incluidas.has(chave)) return;
    const juncao = assunto.juncoes[chave];
    if (!juncao) {
      throw new ErroDeRelatorioInvalido([
        `A junção "${chave}" não está declarada no assunto "${assunto.rotulo}".`,
      ]);
    }
    if (visitando.has(chave)) {
      throw new ErroDeRelatorioInvalido([`Junções em ciclo a partir de "${chave}".`]);
    }
    if (juncao.depende) {
      incluir(juncao.depende, new Set([...visitando, chave]));
    }
    incluidas.add(chave);
    partes.push(juncao.sql);
  };

  [...necessarias].sort().forEach((chave) => incluir(chave, new Set()));
  return partes.join(" ");
}

function juncoesQueMultiplicam(
  assunto: AssuntoRelatorio,
  ativas: ReadonlySet<string>,
): string[] {
  return [...ativas].filter((chave) => assunto.juncoes[chave]?.multiplica);
}

function compilarFiltro(
  assunto: AssuntoRelatorio,
  filtro: FiltroDeRelatorio,
  parametros: Array<string | number>,
): string {
  const campo = exigirCampo(assunto, filtro.campo);
  if (!campo.operadores.includes(filtro.operador)) {
    throw new ErroDeRelatorioInvalido([
      `O operador "${filtro.operador}" não vale para o campo "${campo.rotulo}".`,
    ]);
  }
  const esperados = ARIDADE_OPERADOR[filtro.operador];
  if (esperados === undefined) {
    throw new ErroDeRelatorioInvalido([`Operador "${filtro.operador}" desconhecido.`]);
  }
  if (filtro.valores.length !== esperados) {
    throw new ErroDeRelatorioInvalido([
      `O filtro de "${campo.rotulo}" espera ${esperados} valor(es) e recebeu ${filtro.valores.length}.`,
    ]);
  }
  if (campo.valores && esperados > 0) {
    filtro.valores.forEach((valor) => {
      const permitido = campo.valores!.some((opcao) => opcao.valor === valor);
      if (!permitido) {
        throw new ErroDeRelatorioInvalido([
          `O valor "${valor}" não é uma opção de "${campo.rotulo}".`,
        ]);
      }
    });
  }

  /*
   * Daqui para baixo, `campo.sql` é texto do catálogo e os valores da pessoa
   * só aparecem como `$n`. Nenhum ramo interpola `filtro.valores` no texto —
   * é isto que a cerca `relatorio-sem-sql-livre` lê.
   */
  const bind = (valor: string | number) => {
    parametros.push(valor);
    return `$${parametros.length}`;
  };

  switch (filtro.operador) {
    case "igual":
      return `${campo.sql} = ${bind(filtro.valores[0]!)}`;
    case "diferente":
      // `IS DISTINCT FROM` e não `<>`: com `<>`, linha de valor nulo sai do
      // resultado sem aparecer em lado nenhum, e "não é X" passa a esconder
      // silenciosamente todo registro sem o dado preenchido.
      return `${campo.sql} IS DISTINCT FROM ${bind(filtro.valores[0]!)}`;
    case "contem":
      // O curinga entra no PARÂMETRO, nunca no texto. `%` e `_` digitados
      // pela pessoa valem como curinga — é o que ela espera de "contém", e
      // não há risco: são metacaracteres de LIKE, não de SQL.
      return `${campo.sql} ILIKE ${bind(`%${filtro.valores[0]!}%`)}`;
    case "maior_ou_igual":
      return `${campo.sql} >= ${bind(filtro.valores[0]!)}`;
    case "menor_ou_igual":
      return `${campo.sql} <= ${bind(filtro.valores[0]!)}`;
    case "entre":
      return `${campo.sql} BETWEEN ${bind(filtro.valores[0]!)} AND ${bind(filtro.valores[1]!)}`;
    case "vazio":
      return `${campo.sql} IS NULL`;
    case "preenchido":
      return `${campo.sql} IS NOT NULL`;
    case "nos_proximos_dias": {
      const dias = Number(filtro.valores[0]);
      if (!Number.isFinite(dias) || dias < 0 || dias > 3_650) {
        throw new ErroDeRelatorioInvalido([
          `"${campo.rotulo} nos próximos (dias)" espera um número de 0 a 3650.`,
        ]);
      }
      // `::int` porque o driver binda número JS como bigint, e
      // `make_interval` não aceita bigint — a mesma pedra do compilador de
      // segmentos (RN33), anotada lá pelo mesmo motivo.
      return (
        `${campo.sql} >= CURRENT_DATE AND ` +
        `${campo.sql} <= CURRENT_DATE + make_interval(days => ${bind(Math.trunc(dias))}::int)`
      );
    }
    default: {
      const exaustivo: never = filtro.operador;
      throw new ErroDeRelatorioInvalido([`Operador "${String(exaustivo)}" sem compilação.`]);
    }
  }
}

function compilarAgregacao(
  assunto: AssuntoRelatorio,
  campo: CampoRelatorio,
  agregacao: Agregacao,
  multiplicadoras: ReadonlyArray<string>,
): string {
  if (!campo.agregacoes.includes(agregacao)) {
    throw new ErroDeRelatorioInvalido([
      `A medida "${agregacao}" não vale para o campo "${campo.rotulo}".`,
    ]);
  }
  switch (agregacao) {
    case "QUANTOS":
      // Conta a IDENTIDADE do assunto, não a expressão: imune à repetição
      // que as junções 1:N produzem. Ver o cabeçalho deste arquivo.
      return `count(DISTINCT ${assunto.raiz.alias}.id)`;
    case "QUANTOS_DISTINTOS":
      return `count(DISTINCT ${campo.sql})`;
    case "MINIMO":
      return `min(${campo.sql})`;
    case "MAXIMO":
      return `max(${campo.sql})`;
    case "SOMA":
    case "MEDIA": {
      if (multiplicadoras.length > 0) {
        throw new ErroDeRelatorioInvalido([
          `Soma e média de "${campo.rotulo}" ficariam infladas com os campos escolhidos, ` +
            `porque cada registro aparece repetido. Troque a medida por "quantos" ou ` +
            `"menor/maior", ou tire os campos que multiplicam as linhas.`,
        ]);
      }
      return agregacao === "SOMA" ? `sum(${campo.sql})` : `avg(${campo.sql})`;
    }
    default: {
      const exaustivo: never = agregacao;
      throw new ErroDeRelatorioInvalido([`Medida "${String(exaustivo)}" sem compilação.`]);
    }
  }
}

/**
 * Compila a definição para uma consulta parametrizada.
 *
 * `teto` é o número máximo de linhas do resultado; a consulta pede uma a
 * mais, para que a chamada consiga distinguir "deu o teto" de "foi cortada".
 */
export function compilarRelatorio(
  definicao: DefinicaoRelatorio,
  opcoes: { teto?: number } = {},
): RelatorioCompilado {
  const assunto = assuntoPorSlug(definicao.assunto);
  if (!assunto) {
    throw new ErroDeRelatorioInvalido([`O assunto "${definicao.assunto}" não existe.`]);
  }

  const dimensoes = [
    ...definicao.linhas.map((slug) => ({ slug, papel: "LINHA" as const })),
    ...definicao.colunas.map((slug) => ({ slug, papel: "COLUNA" as const })),
  ];

  const repetido = dimensoes
    .map((dimensao) => dimensao.slug)
    .find((slug, indice, todos) => todos.indexOf(slug) !== indice);
  if (repetido) {
    throw new ErroDeRelatorioInvalido([
      `O campo "${repetido}" está em Linhas e em Colunas ao mesmo tempo.`,
    ]);
  }

  const necessarias = new Set<string>();
  const registrarJuncoes = (campo: CampoRelatorio) => {
    (campo.requer ?? []).forEach((chave) => necessarias.add(chave));
  };

  const camposDimensao = dimensoes.map((dimensao) => {
    const campo = exigirCampo(assunto, dimensao.slug);
    registrarJuncoes(campo);
    return { ...dimensao, campo };
  });

  const valores =
    definicao.valores.length > 0
      ? definicao.valores
      : /*
         * Sem medida escolhida, a medida é "quantos registros". É o que a
         * pessoa quer dizer ao arrastar só dimensões, e evita o outro
         * caminho possível — listar sem agrupar —, que devolveria a mesma
         * linha repetida uma vez por junção e pareceria defeito.
         */
        [{ campo: camposDimensao[0]?.campo.slug ?? "", agregacao: "QUANTOS" as Agregacao }];

  if (camposDimensao.length === 0 && definicao.valores.length === 0) {
    throw new ErroDeRelatorioInvalido([
      "Arraste ao menos um campo para Linhas, Colunas ou Valores.",
    ]);
  }

  const camposValor = valores.map((valor) => {
    const campo = exigirCampo(assunto, valor.campo);
    registrarJuncoes(campo);
    return { ...valor, campo };
  });

  definicao.filtros.forEach((filtro) => {
    const campo = campoPorSlug(assunto, filtro.campo);
    if (campo) registrarJuncoes(campo);
  });

  const multiplicadoras = juncoesQueMultiplicam(assunto, necessarias);

  const projecao: ColunaProjetada[] = [];
  const selecionados: string[] = [];

  camposDimensao.forEach((dimensao, indice) => {
    const chave = `d${indice}`;
    selecionados.push(`${dimensao.campo.sql} AS ${chave}`);
    projecao.push({
      chave,
      rotulo: dimensao.campo.rotulo,
      papel: dimensao.papel,
      campo: dimensao.campo.slug,
      tipo: dimensao.campo.tipo,
      ...(dimensao.campo.valores
        ? {
            rotulosDeValor: Object.fromEntries(
              dimensao.campo.valores.map((opcao) => [opcao.valor, opcao.rotulo]),
            ),
          }
        : {}),
    });
  });

  const parametros: Array<string | number> = [];

  camposValor.forEach((valor, indice) => {
    const chave = `v${indice}`;
    const sql = compilarAgregacao(assunto, valor.campo, valor.agregacao, multiplicadoras);
    selecionados.push(`${sql} AS ${chave}`);
    projecao.push({
      chave,
      rotulo: valor.campo.rotulo,
      papel: "VALOR",
      campo: valor.campo.slug,
      tipo: valor.agregacao === "QUANTOS" || valor.agregacao === "QUANTOS_DISTINTOS"
        ? "NUMERO"
        : valor.campo.tipo,
      agregacao: valor.agregacao,
    });
  });

  const condicoes = definicao.filtros.map((filtro) =>
    compilarFiltro(assunto, filtro, parametros),
  );

  const teto = Math.min(
    Math.max(1, Math.trunc(opcoes.teto ?? TETO_LINHAS_PADRAO)),
    TETO_LINHAS_MAXIMO,
  );
  const limite = teto + 1;

  const chavesValidas = new Set(projecao.map((coluna) => coluna.chave));
  let ordenacao = definicao.ordenacao;
  if (ordenacao && !chavesValidas.has(ordenacao.chave)) {
    throw new ErroDeRelatorioInvalido([
      `A ordenação aponta para "${ordenacao.chave}", que não está no resultado.`,
    ]);
  }
  if (!ordenacao) {
    // Sem escolha explícita, ordena pela primeira medida, decrescente — o
    // "maior primeiro" que quase toda pergunta de negócio quer. Sem medida
    // não há como; aí vai pela primeira dimensão.
    const primeiraMedida = projecao.find((coluna) => coluna.papel === "VALOR");
    ordenacao = primeiraMedida
      ? { chave: primeiraMedida.chave, direcao: "DESC" }
      : { chave: projecao[0]!.chave, direcao: "ASC" };
  }

  const agrupamento =
    camposDimensao.length > 0
      ? ` GROUP BY ${camposDimensao.map((_, indice) => indice + 1).join(", ")}`
      : "";

  parametros.push(limite);
  const sql =
    `SELECT ${selecionados.join(", ")}` +
    ` FROM ${montarFrom(assunto, necessarias)}` +
    (condicoes.length > 0 ? ` WHERE ${condicoes.map((c) => `(${c})`).join(" AND ")}` : "") +
    agrupamento +
    ` ORDER BY ${ordenacao.chave} ${ordenacao.direcao === "DESC" ? "DESC" : "ASC"} NULLS LAST` +
    ` LIMIT $${parametros.length}`;

  return { sql, parametros, projecao, limite };
}

/**
 * Resumo legível da definição, para a galeria e para a trilha ("Ofertas do
 * Clube · por Aliado · quantos"). Não substitui a definição guardada; serve
 * para quem lê uma lista e precisa reconhecer o relatório sem abrir.
 */
export function resumirDefinicao(definicao: DefinicaoRelatorio): string {
  const assunto = assuntoPorSlug(definicao.assunto);
  if (!assunto) return "Relatório de assunto desconhecido";

  const rotulo = (slug: string) => campoPorSlug(assunto, slug)?.rotulo ?? slug;
  const partes: string[] = [assunto.rotulo];
  if (definicao.linhas.length > 0) {
    partes.push(`por ${definicao.linhas.map(rotulo).join(", ")}`);
  }
  if (definicao.colunas.length > 0) {
    partes.push(`× ${definicao.colunas.map(rotulo).join(", ")}`);
  }
  if (definicao.filtros.length > 0) {
    partes.push(
      `${definicao.filtros.length} filtro${definicao.filtros.length > 1 ? "s" : ""}`,
    );
  }
  return partes.join(" · ");
}
