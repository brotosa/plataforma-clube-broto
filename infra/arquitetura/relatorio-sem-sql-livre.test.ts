import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ASSUNTOS, assuntoPorSlug } from "@/dominio/relatorios/catalogo";
import { compilarRelatorio, validarEstruturaDefinicao } from "@/dominio/relatorios/compilador";

/**
 * CERCA — RN75: no Gerador de relatórios, a composição é livre; a linguagem
 * não.
 *
 * ## O que ela protege
 *
 * O módulo deixa qualquer papel montar consultas sobre a base de produção. A
 * base carrega dado pessoal de mais de dois mil assinantes, e um caminho em
 * que texto de usuário vira texto de SQL é, ao mesmo tempo, uma porta de
 * exportação irrestrita e a forma mais fácil de derrubar o banco.
 *
 * ## Por que duas leituras, e não uma
 *
 * As duas metades cobrem falhas de naturezas diferentes, e nenhuma delas
 * cobre a outra:
 *
 *  • a **comportamental** submete marcas adversárias por todas as portas de
 *    texto livre e confere que nenhuma aparece no SQL. Ela pega o ramo novo
 *    que alguém acrescentar ao compilador, mesmo escrito de um jeito que
 *    nenhuma expressão regular preveria — mas só pega o que ela pensou em
 *    submeter;
 *  • a **estrutural** lê o código-fonte e cobra que o SQL seja montado só a
 *    partir do catálogo e executado a partir de uma variável, nunca de um
 *    literal composto. Ela pega o caminho inteiro que a primeira não
 *    exercitaria por não saber que ele existe.
 *
 * Uma cerca que fizesse só a primeira daria por segura uma função nunca
 * chamada pelos testes. Uma que fizesse só a segunda daria por segura uma
 * concatenação escrita de forma que a regex não reconhece.
 */

const RAIZ = process.cwd();
const ARQUIVO_COMPILADOR = join("dominio", "relatorios", "compilador.ts");
const ARQUIVO_CATALOGO = join("dominio", "relatorios", "catalogo.ts");
const ARQUIVO_CONSULTA = join("infra", "consultas", "relatorios.ts");

function lerArquivo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

/** Remove comentários — eles falam de SQL o tempo todo, e não são código. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * O primeiro argumento de cada chamada de SQL cru.
 *
 * Escrito à mão, e não como expressão regular, por uma razão medida: a
 * primeira versão desta cerca usava `<[^>]*>` para pular o genérico e não
 * casava com `$queryRawUnsafe<Array<Record<string, unknown>>>(…)`, porque o
 * genérico tem `>` dentro. Ela passou a não encontrar chamada nenhuma — e
 * teria dado o arquivo por seguro sem ter olhado para ele.
 *
 * Quem pegou foi a própria asserção de "a cerca ficou cega", que existe
 * exatamente para isso: conferência que não encontra nada para conferir não
 * é conferência aprovada.
 */
function primeirosArgumentosDeSqlCru(fonte: string): string[] {
  const argumentos: string[] = [];
  const marcador = /\$(?:query|execute)Raw(?:Unsafe)?/g;

  for (const achado of fonte.matchAll(marcador)) {
    let i = (achado.index ?? 0) + achado[0].length;
    // Pula o genérico, contando os sinais para atravessar os aninhados.
    if (fonte[i] === "<") {
      let profundidade = 0;
      for (; i < fonte.length; i += 1) {
        if (fonte[i] === "<") profundidade += 1;
        else if (fonte[i] === ">") {
          profundidade -= 1;
          if (profundidade === 0) {
            i += 1;
            break;
          }
        }
      }
    }
    while (i < fonte.length && /\s/.test(fonte[i]!)) i += 1;
    if (fonte[i] !== "(") continue;
    i += 1;

    // Lê até a vírgula ou o parêntese de nível zero: é o primeiro argumento.
    let profundidade = 0;
    const inicio = i;
    for (; i < fonte.length; i += 1) {
      const caractere = fonte[i]!;
      if ("([{`".includes(caractere)) profundidade += 1;
      else if (")]}".includes(caractere)) {
        if (profundidade === 0) break;
        profundidade -= 1;
      } else if (caractere === "," && profundidade === 0) break;
    }
    argumentos.push(fonte.slice(inicio, i).trim());
  }

  return argumentos;
}

// ---------------------------------------------------------------------
// Leitura comportamental
// ---------------------------------------------------------------------

const MARCA = "zzMARCAzz";
/**
 * Cargas que, num caminho vulnerável, mudariam a consulta. Não é uma lista
 * de ataques a repelir — é uma amostra: o que se afirma é que **nada** do
 * que a pessoa escreve entra no texto, e por isso qualquer carga serviria.
 */
const CARGAS: ReadonlyArray<string> = [
  `${MARCA}' OR '1'='1`,
  `${MARCA}"; DROP TABLE ofertas; --`,
  `${MARCA}) UNION SELECT senha_hash FROM usuarios --`,
  `${MARCA}\\'; SELECT pg_sleep(10); --`,
  `${MARCA}%'; COPY (SELECT 1) TO PROGRAM 'sh'; --`,
];

describe("RN75 — nada que o usuário escreve chega ao texto do SQL", () => {
  /*
   * A varredura é sobre o CATÁLOGO INTEIRO, campo a campo e operador a
   * operador, e não sobre casos escolhidos a dedo. Campo novo entra na
   * conferência sozinho; é o que impede a cerca de envelhecer em silêncio
   * enquanto o catálogo cresce.
   */
  const casos = ASSUNTOS.flatMap((assunto) =>
    assunto.campos
      .filter((campo) => !campo.indisponivel)
      .flatMap((campo) =>
        campo.operadores.map((operador) => ({
          assunto: assunto.slug,
          campo: campo.slug,
          operador,
          fechado: Boolean(campo.valores),
        })),
      ),
  );

  it("há o que varrer — o catálogo não está vazio", () => {
    expect(casos.length).toBeGreaterThan(30);
  });

  it.each(CARGAS)("carga %s não aparece no SQL de nenhum campo/operador", (carga) => {
    let exercitados = 0;

    casos.forEach((caso) => {
      const assunto = assuntoPorSlug(caso.assunto)!;
      const primeiroCampo = assunto.campos.find((campo) => !campo.indisponivel)!;
      const aridade = { vazio: 0, preenchido: 0, entre: 2 }[caso.operador as string] ?? 1;
      const valores = Array.from({ length: aridade }, () => carga);

      let sql: string | null = null;
      try {
        sql = compilarRelatorio(
          validarEstruturaDefinicao({
            assunto: caso.assunto,
            linhas: [primeiroCampo.slug],
            colunas: [],
            valores: [],
            filtros: [{ campo: caso.campo, operador: caso.operador, valores }],
          }),
        ).sql;
        exercitados += 1;
      } catch {
        /*
         * Recusar é o desfecho CERTO para campo de lista fechada e para
         * "nos próximos dias": a carga não é uma opção válida nem um
         * número. O que a cerca cobra é que, quando compila, o texto saia
         * limpo — e o contador abaixo garante que nem tudo recusou, senão o
         * teste passaria sem ter compilado nada.
         */
      }
      if (sql) {
        expect(sql, `${caso.assunto}/${caso.campo}/${caso.operador}`).not.toContain(MARCA);
      }
    });

    expect(exercitados, "nenhuma combinação chegou a compilar").toBeGreaterThan(10);
  });

  it("nome de campo, de assunto e chave de ordenação também não passam", () => {
    const tentativas = [
      { assunto: `ofertas; DROP TABLE ${MARCA}`, campo: "oferta-status", chave: "d0" },
      { assunto: "ofertas", campo: `o.titulo) UNION SELECT ${MARCA} --`, chave: "d0" },
      { assunto: "ofertas", campo: "oferta-status", chave: `d0; DROP TABLE ${MARCA}` },
    ];

    tentativas.forEach((tentativa) => {
      let sql: string | null = null;
      try {
        sql = compilarRelatorio(
          validarEstruturaDefinicao({
            assunto: tentativa.assunto,
            linhas: [tentativa.campo],
            colunas: [],
            valores: [],
            filtros: [],
            ordenacao: { chave: tentativa.chave, direcao: "ASC" },
          }),
        ).sql;
      } catch {
        // Recusa é o desfecho esperado nas três.
      }
      expect(sql, JSON.stringify(tentativa)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------
// Leitura estrutural
// ---------------------------------------------------------------------

describe("RN75 — o SQL é montado do catálogo e executado de uma variável", () => {
  it("o compilador não conhece o cliente de banco", () => {
    // Garantia estrutural, e a mais forte das duas: sem cliente importado,
    // não há como executar nada ali — a função é pura e testável sem banco.
    const fonte = lerArquivo(ARQUIVO_COMPILADOR);
    expect(fonte).not.toContain("@prisma/client");
    expect(fonte).not.toContain("infra/prisma");
  });

  it("o SQL cru é executado passando a variável do compilador, nunca um literal", () => {
    const fonte = semComentarios(lerArquivo(ARQUIVO_CONSULTA));
    const chamadas = primeirosArgumentosDeSqlCru(fonte);

    /*
     * Os nomes que o COMPILADOR produz — e a lista é a regra, não uma
     * conveniência: o primeiro argumento do SQL cru tem de ser um deles.
     *
     * Eram um só até a F34. O detalhe da RN93 acrescentou dois caminhos de
     * execução (as linhas e a contagem de linhas × registros), e os dois
     * recebem texto que saiu de `compilarDetalhe`. A cerca cresceu para
     * abranger o nome novo **sem** afrouxar o que ela pede: continua sendo
     * proibido passar literal de template ou concatenação.
     */
    const NOMES_QUE_O_COMPILADOR_PRODUZ = ["compilado.sql", "sqlDeContagem"];

    expect(chamadas.length, "nenhuma execução encontrada — a cerca ficou cega").toBeGreaterThanOrEqual(
      3,
    );

    /*
     * Anti-cegueira em pares com a de cima: o `forEach` abaixo passaria com
     * qualquer subconjunto, então o conjunto EXATO de nomes é afirmado aqui.
     * Caminho de execução novo com variável de outro nome reprova, mesmo que
     * essa variável seja legítima — e reprovar obriga a decidir aqui, que é
     * o lugar onde a decisão fica registrada.
     */
    expect([...new Set(chamadas)].sort()).toEqual([...NOMES_QUE_O_COMPILADOR_PRODUZ].sort());

    chamadas.forEach((primeiroArgumento) => {
      expect(
        primeiroArgumento,
        "o primeiro argumento do SQL cru precisa ser uma variável que o compilador produziu " +
          `(${NOMES_QUE_O_COMPILADOR_PRODUZ.join(" ou ")}). Literal de template ou ` +
          "concatenação ali é exatamente o caminho que a RN75 fecha — e a leitura " +
          "comportamental acima não o veria, porque ele nem passaria pelo compilador.",
      ).toBeOneOf(NOMES_QUE_O_COMPILADOR_PRODUZ);
    });
  });

  it("o resto da aplicação não executa SQL cru sobre o catálogo de relatórios", () => {
    /*
     * A execução mora em UM arquivo. Se um segundo caminho aparecer — numa
     * server action, num caso de uso —, ele não terá passado por esta
     * cerca, e é justamente o segundo caminho que costuma ser o inseguro.
     */
    const fonte = semComentarios(lerArquivo(join("infra", "casos-de-uso", "relatorios.ts")));
    expect(fonte).not.toMatch(/\$(?:query|execute)Raw/);
  });

  it("nenhuma expressão do catálogo é montada por interpolação", () => {
    /*
     * `campo.sql` e `juncao.sql` são o único texto que entra na consulta.
     * Enquanto forem literais, o que eles contêm está escrito no
     * repositório e passa por revisão. Um `${}` ali abriria a porta pela
     * qual um valor de configuração — ou de banco — viraria SQL, e nenhuma
     * das outras conferências veria isso acontecer.
     */
    const fonte = semComentarios(lerArquivo(ARQUIVO_CATALOGO));
    const atribuicoes = [...fonte.matchAll(/\bsql:\s*([\s\S]*?),\n/g)];
    expect(atribuicoes.length, "nenhuma expressão encontrada — a cerca ficou cega").toBeGreaterThan(
      20,
    );

    const interpoladas = atribuicoes
      .map((achado) => achado[1] ?? "")
      .filter((expressao) => expressao.includes("${"));

    expect(
      interpoladas,
      "expressão de campo ou junção montada por interpolação: o texto do SQL precisa ser " +
        "literal no catálogo, para que esteja escrito no repositório e passe por revisão.",
    ).toEqual([]);
  });
});
