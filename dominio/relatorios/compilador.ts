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

/**
 * O molde que cada tipo do catálogo exige no parâmetro. Ver `bind`, abaixo.
 *
 * `Record<TipoCampo, …>` é exaustivo de propósito: acrescentar um tipo ao
 * catálogo não compila enquanto a decisão não for tomada aqui. `null` é a
 * decisão "não precisa de molde", escrita, e não o esquecimento.
 *
 * `LISTA` não precisa porque a expressão do campo já termina em `::text` —
 * é assim que os enums entram no catálogo. `DINHEIRO` e `NUMERO` usam
 * `numeric`, que compara com `integer`, `decimal` e `real` sem perder
 * precisão nem o índice.
 */
const MOLDE_DO_TIPO: Readonly<Record<CampoRelatorio["tipo"], string | null>> = {
  TEXTO: null,
  LISTA: null,
  BOOLEANO: "::boolean",
  NUMERO: "::numeric",
  DINHEIRO: "::numeric",
  // Datas têm tratamento próprio em `compilarFiltro`, porque além do tipo
  // elas têm a semântica do dia inteiro. O molde aqui é o do início do dia.
  DATA: "::timestamp",
};

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
  /**
   * O marcador de parâmetro, com o molde do tipo quando o banco precisa dele.
   *
   * **O driver manda TODO valor de filtro como texto**, e o Postgres recusa a
   * consulta inteira quando a coluna não é texto: *operator does not exist:
   * boolean = text*, *integer = text*, *timestamp without time zone >= text*.
   * Não é erro de segurança nem número errado — é a consulta não rodar.
   *
   * **Este defeito foi descoberto três vezes, uma por fase, e sempre do mesmo
   * jeito: rodando contra a base povoada.** Booleano na F25, porque nenhum
   * modelo filtrava sim/não — os três campos de sim/não existiam para
   * agrupar, e agrupar não passa por aqui. Data e número na F26, porque
   * nenhum modelo filtrava data com "de"/"até" (os que filtravam data usavam
   * `nos_proximos_dias`, que compila para `CURRENT_DATE + make_interval` e
   * nunca compara com texto) nem número com "é"/"entre".
   *
   * Nas três vezes os testes de unidade seguiram verdes, e seguiriam para
   * sempre: eles conferem o TEXTO gerado, e texto errado de SQL só falha
   * quando um banco tenta executá-lo.
   *
   * Por isso o molde deixou de ser um `if` por tipo e virou `MOLDE_DO_TIPO`,
   * **exaustivo por construção**: tipo novo no catálogo obriga uma decisão
   * aqui em vez de cair em silêncio no caminho sem molde. E há um teste que
   * percorre a matriz inteira de tipo × operador — a cegueira não era falta
   * de teste, era teste que não enumerava as combinações.
   *
   * O molde é texto do compilador, decidido pelo TIPO declarado no catálogo,
   * nunca pelo valor digitado. A RN75 continua inteira.
   */
  const bind = (valor: string | number) => {
    parametros.push(valor);
    const molde = MOLDE_DO_TIPO[campo.tipo];
    return molde ? `$${parametros.length}${molde}` : `$${parametros.length}`;
  };

  /*
   * ------------------------------------------------------------------
   * Datas: o dia inteiro, e sem perder o índice
   * ------------------------------------------------------------------
   *
   * Dois problemas se resolvem aqui, e o segundo é o perigoso.
   *
   * **1. O tipo.** O driver manda todo valor de filtro como texto, e
   * `criado_em >= $1` com `$1 = '2026-08-18'` faz o Postgres recusar a
   * consulta: *operator does not exist: timestamp without time zone >= text*.
   * Nenhum modelo até a F26 havia filtrado data com "de", "até" ou "entre" —
   * os que filtravam data usavam `nos_proximos_dias`, que compila para
   * `CURRENT_DATE + make_interval` e nunca compara com texto. Mesma cegueira
   * do filtro booleano descoberto na F25: uma combinação de operador e tipo
   * que nenhum caminho exercitava.
   *
   * **2. O fim do dia.** O catálogo chama de `DATA` tanto coluna `date`
   * quanto `timestamp`. Em `date`, `col <= '18/08'` inclui o dia 18; em
   * `timestamp`, o mesmo texto vira meia-noite e **exclui o dia 18 inteiro**
   * — 23 horas e 59 minutos de eventos somem de um relatório que a pessoa
   * pediu "até 18 de agosto". Número plausível e errado, que é o pior defeito
   * possível aqui.
   *
   * A saída é limitar pelo **início do dia seguinte, exclusivo**. Vale igual
   * para os dois tipos, e o mais importante: mantém a coluna nua de um lado
   * da comparação, então o índice continua servindo. Escrever
   * `col::date <= $1` também acertaria a semântica e **perderia o índice** —
   * justamente no assunto (Auditoria) cujo filtro obrigatório existe para
   * evitar varredura.
   */
  // `bind` já põe `::timestamp` nos campos de data (MOLDE_DO_TIPO), que é o
  // início do dia. O fim precisa do molde próprio, `::date + 1`.
  const inicioDoDia = (valor: string) => bind(valor);
  const fimDoDiaExclusivo = (valor: string) => {
    parametros.push(valor);
    return `($${parametros.length}::date + 1)`;
  };
  const eData = campo.tipo === "DATA";

  switch (filtro.operador) {
    case "igual":
      // Num `timestamp`, `= '18/08'` só casaria com a meia-noite exata: o
      // operador "é" sobre data significa "naquele dia", nunca "naquele
      // instante".
      return eData
        ? `${campo.sql} >= ${inicioDoDia(filtro.valores[0]!)} AND ` +
            `${campo.sql} < ${fimDoDiaExclusivo(filtro.valores[0]!)}`
        : `${campo.sql} = ${bind(filtro.valores[0]!)}`;
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
      return eData
        ? `${campo.sql} >= ${inicioDoDia(filtro.valores[0]!)}`
        : `${campo.sql} >= ${bind(filtro.valores[0]!)}`;
    case "menor_ou_igual":
      return eData
        ? `${campo.sql} < ${fimDoDiaExclusivo(filtro.valores[0]!)}`
        : `${campo.sql} <= ${bind(filtro.valores[0]!)}`;
    case "entre":
      // Sem `BETWEEN` quando é data: ele é inclusivo nas duas pontas, e a
      // ponta de cima precisa ser exclusiva para o dia final entrar inteiro.
      return eData
        ? `${campo.sql} >= ${inicioDoDia(filtro.valores[0]!)} AND ` +
            `${campo.sql} < ${fimDoDiaExclusivo(filtro.valores[1]!)}`
        : `${campo.sql} BETWEEN ${bind(filtro.valores[0]!)} AND ${bind(filtro.valores[1]!)}`;
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
      /*
       * Este parâmetro **não é do tipo do campo** — é uma contagem de dias,
       * num campo de data. Por isso ele escapa do `bind` e do
       * `MOLDE_DO_TIPO`: com o molde do campo, o número sairia como
       * `$1::timestamp` e o banco recusaria com "cannot cast type bigint to
       * timestamp". Apareceu ao rodar o modelo "Assinaturas a vencer em 30
       * dias" logo depois de o molde por tipo entrar.
       *
       * O `::int` é o que este valor precisa: o driver binda número JS como
       * bigint, e `make_interval` não aceita bigint — a mesma pedra do
       * compilador de segmentos (RN33), anotada lá pelo mesmo motivo.
       */
      parametros.push(Math.trunc(dias));
      return (
        `${campo.sql} >= CURRENT_DATE AND ` +
        `${campo.sql} <= CURRENT_DATE + make_interval(days => $${parametros.length}::int)`
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

  /*
   * O filtro obrigatório é cobrado ANTES de o SQL ser montado, e a
   * conferência é sobre a definição inteira — não só sobre os campos que
   * entraram nas gavetas. Um relatório de Auditoria agrupado por "Entidade",
   * sem nenhuma data em lugar nenhum, é exatamente o caso perigoso: ele
   * parece inofensivo na tela e varre a tabela toda no banco.
   *
   * `vazio` e `preenchido` não contam como filtro de período: `criado_em IS
   * NOT NULL` é verdade para todas as linhas e não recorta nada. Aceitá-los
   * satisfaria a regra na letra e a desfaria na prática — que é pior que não
   * ter a regra, porque dá a sensação de proteção.
   */
  const OPERADORES_QUE_NAO_RECORTAM: ReadonlyArray<OperadorRelatorio> = ["vazio", "preenchido"];
  const exigencias = assunto.campos.filter((campo) => campo.filtroObrigatorio);
  const faltantes = exigencias.filter(
    (campo) =>
      !definicao.filtros.some(
        (filtro) =>
          filtro.campo === campo.slug && !OPERADORES_QUE_NAO_RECORTAM.includes(filtro.operador),
      ),
  );
  if (faltantes.length > 0) {
    throw new ErroDeRelatorioInvalido(
      faltantes.map((campo) => `${campo.rotulo}: ${campo.filtroObrigatorio}`),
    );
  }

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

// ---------------------------------------------------------------------
// RN93 — "ver as linhas por trás": a segunda consulta, sem agregação
// ---------------------------------------------------------------------

/**
 * Quantas colunas o detalhe mostra.
 *
 * As **primeiras** do assunto, na ordem em que o catálogo as declara — e a
 * ordem não é arbitrária: em todos os nove assuntos o primeiro campo é o que
 * identifica o registro (`oferta-titulo`, `aliado-nome`, `patrocinador-razao-social`,
 * `au-data`…). Quem escreveu o catálogo já tomou essa decisão, e derivá-la é
 * melhor do que eu escrever uma segunda lista que envelheceria em paralelo.
 *
 * Oito porque a tabela do detalhe convive com o resultado agregado na mesma
 * tela: mais que isso rola na horizontal e deixa de ser conferência de relance.
 * Assunto que precise de um recorte diferente é o dia em que uma declaração
 * própria passa a valer a pena — hoje ela seria cerimônia sem ganho.
 */
export const COLUNAS_DO_DETALHE = 8;

/** Teto de linhas do detalhe. Menor que o do agregado, e de propósito. */
export const TETO_DETALHE = 200;

/**
 * Compila o **detalhe**: os registros por trás do resultado agregado.
 *
 * Mesmo `FROM`, mesmo `WHERE`, **sem `GROUP BY` e sem agregação**. Não é o
 * pivô sem o agrupamento: é outra consulta, e a ficha da Onda 19 §3 explica
 * por que ela é fase própria.
 *
 * ## A contagem vem junto, e é ela que honra a RN93(a)
 *
 * Cinco dos nove assuntos têm junção que **multiplica a linha da raiz**. O
 * agregado já sabe disso — `QUANTOS` compila para `count(DISTINCT raiz.id)`,
 * exatamente para ser imune à repetição. O detalhe **não** pode se dar a esse
 * luxo: se ele desduplicasse, uma aliada com três soluções mostraria uma
 * solução só, e as outras duas sumiriam sem aviso. Então ele mostra as três
 * linhas **e devolve as duas contagens**, para a tela poder dizer "30 linhas,
 * 12 aliados". Uma célula de "12" abrindo em 30 linhas sem explicação é a
 * forma mais direta de destruir a confiança no módulo.
 *
 * ## O identificador da raiz NÃO é projetado
 *
 * Ele entra só no `count(DISTINCT …)`, do lado do servidor. Identificador
 * interno na interface é o que a RN55 proíbe, e o detalhe não precisa dele
 * para nada que a pessoa vá ler.
 */
export function compilarDetalhe(
  definicao: DefinicaoRelatorio,
  opcoes: { teto?: number } = {},
): { compilado: RelatorioCompilado; sqlDeContagem: string; parametrosDaContagem: Array<string | number> } {
  const assunto = assuntoPorSlug(definicao.assunto);
  if (!assunto) {
    throw new ErroDeRelatorioInvalido([`O assunto "${definicao.assunto}" não existe.`]);
  }

  const colunas = assunto.campos
    .filter((campo) => !campo.indisponivel)
    .slice(0, COLUNAS_DO_DETALHE);
  if (colunas.length === 0) {
    throw new ErroDeRelatorioInvalido([
      `O assunto "${assunto.rotulo}" não tem campo disponível para detalhar.`,
    ]);
  }

  const necessarias = new Set<string>();
  colunas.forEach((campo) => (campo.requer ?? []).forEach((chave) => necessarias.add(chave)));
  definicao.filtros.forEach((filtro) => {
    const campo = campoPorSlug(assunto, filtro.campo);
    (campo?.requer ?? []).forEach((chave) => necessarias.add(chave));
  });

  /*
   * O filtro obrigatório vale IDÊNTICO aqui — e com mais razão, não menos.
   * O teto limita o que volta; só o filtro limita o que o banco visita, e um
   * detalhe de Auditoria sem recorte de período varre a trilha inteira.
   */
  const OPERADORES_QUE_NAO_RECORTAM: ReadonlyArray<OperadorRelatorio> = ["vazio", "preenchido"];
  const faltantes = assunto.campos
    .filter((campo) => campo.filtroObrigatorio)
    .filter(
      (campo) =>
        !definicao.filtros.some(
          (filtro) =>
            filtro.campo === campo.slug && !OPERADORES_QUE_NAO_RECORTAM.includes(filtro.operador),
        ),
    );
  if (faltantes.length > 0) {
    throw new ErroDeRelatorioInvalido(
      faltantes.map((campo) => `${campo.rotulo}: ${campo.filtroObrigatorio}`),
    );
  }

  const parametros: Array<string | number> = [];
  const selecionados: string[] = [];
  const projecao: ColunaProjetada[] = [];

  colunas.forEach((campo, indice) => {
    const chave = `d${indice}`;
    selecionados.push(`${campo.sql} AS ${chave}`);
    projecao.push({
      chave,
      rotulo: campo.rotulo,
      papel: "LINHA",
      campo: campo.slug,
      tipo: campo.tipo,
      ...(campo.valores
        ? {
            rotulosDeValor: Object.fromEntries(
              campo.valores.map((opcao) => [opcao.valor, opcao.rotulo]),
            ),
          }
        : {}),
    });
  });

  const condicoes = definicao.filtros.map((filtro) => compilarFiltro(assunto, filtro, parametros));
  const onde = condicoes.length > 0 ? ` WHERE ${condicoes.map((c) => `(${c})`).join(" AND ")}` : "";
  const de = ` FROM ${montarFrom(assunto, necessarias)}`;

  // A contagem usa os MESMOS parâmetros do recorte, e nada além: ela precisa
  // responder sobre exatamente as linhas que o detalhe mostraria sem o teto.
  const parametrosDaContagem = [...parametros];
  const sqlDeContagem =
    `SELECT count(*)::int AS linhas, count(DISTINCT ${assunto.raiz.alias}.id)::int AS registros` +
    de +
    onde;

  const teto = Math.min(Math.max(1, Math.trunc(opcoes.teto ?? TETO_DETALHE)), TETO_LINHAS_MAXIMO);
  const limite = teto + 1;
  parametros.push(limite);

  const sql =
    `SELECT ${selecionados.join(", ")}` +
    de +
    onde +
    ` ORDER BY 1 ASC NULLS LAST` +
    ` LIMIT $${parametros.length}`;

  return { compilado: { sql, parametros, projecao, limite }, sqlDeContagem, parametrosDaContagem };
}
