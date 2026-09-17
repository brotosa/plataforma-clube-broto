import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/infra/prisma/cliente";
import { ASSUNTOS, type CampoRelatorio } from "@/dominio/relatorios/catalogo";
import { compilarRelatorio } from "@/dominio/relatorios/compilador";

/**
 * A matriz de TIPO × OPERADOR, executada contra o banco.
 *
 * ## Por que este teste existe
 *
 * O mesmo defeito foi descoberto **três vezes, uma por fase**, e sempre da
 * mesma forma: alguém rodando uma consulta contra a base povoada, à mão.
 *
 * | Fase | O que quebrava | Por que ninguém via |
 * | --- | --- | --- |
 * | F25 | `boolean = text` | nenhum modelo filtrava sim/não |
 * | F26 | `timestamp >= text` | os modelos de data usavam `nos_proximos_dias` |
 * | F26 | `integer = text` | nenhum modelo filtrava número |
 *
 * Nas três vezes os testes de unidade seguiram verdes, e seguiriam para
 * sempre. Eles conferem o **texto** que o compilador gera — e texto errado de
 * SQL não é sintaticamente errado: é semanticamente impossível, e só falha
 * quando um banco tenta executá-lo.
 *
 * Então a cobertura que faltava não era "mais um caso": era **enumerar as
 * combinações e mandar cada uma ao banco**. É o que este arquivo faz, sobre o
 * catálogo inteiro, e é por isso que ele vive em `infra/` e não em `dominio/`
 * — precisa de conexão.
 *
 * ## O que ele NÃO prova
 *
 * Que o resultado está certo. Ele prova que a consulta **roda**, que é
 * exatamente o degrau em que os três defeitos moravam. Corretude de número é
 * assunto dos testes de unidade do compilador e do pivô.
 */

afterAll(async () => {
  await prisma.$disconnect();
});

/** Um valor plausível para cada tipo — o conteúdo não importa, o tipo sim. */
function valorDeAmostra(campo: CampoRelatorio): string {
  if (campo.valores && campo.valores.length > 0) return campo.valores[0]!.valor;
  switch (campo.tipo) {
    case "BOOLEANO":
      return "true";
    case "NUMERO":
    case "DINHEIRO":
      return "1";
    case "DATA":
      return "2026-01-15";
    default:
      return "x";
  }
}

/** Quantos valores o operador consome, com amostras do tipo do campo. */
function valoresPara(campo: CampoRelatorio, operador: string): string[] {
  if (operador === "vazio" || operador === "preenchido") return [];
  if (operador === "entre") {
    return campo.tipo === "DATA"
      ? ["2026-01-01", "2026-12-31"]
      : [valorDeAmostra(campo), "9"];
  }
  if (operador === "nos_proximos_dias") return ["30"];
  return [valorDeAmostra(campo)];
}

interface Caso {
  assunto: string;
  campo: CampoRelatorio;
  operador: string;
}

const CASOS: Caso[] = ASSUNTOS.flatMap((assunto) =>
  assunto.campos
    .filter((campo) => !campo.indisponivel)
    .flatMap((campo) =>
      campo.operadores.map((operador) => ({ assunto: assunto.slug, campo, operador })),
    ),
);

describe("todo filtro do catálogo roda no banco (tipo × operador)", () => {
  /*
   * O guarda contra a cegueira: se a montagem dos casos parar de enumerar —
   * por um refactor do catálogo, por um filtro que passe a ser montado de
   * outro jeito —, os testes abaixo passariam vazios, verdes e inúteis.
   */
  it("a matriz cobre os seis tipos e os nove operadores", () => {
    expect(CASOS.length).toBeGreaterThan(200);
    const tipos = new Set(CASOS.map((caso) => caso.campo.tipo));
    const operadores = new Set(CASOS.map((caso) => caso.operador));
    expect([...tipos].sort()).toEqual([
      "BOOLEANO",
      "DATA",
      "DINHEIRO",
      "LISTA",
      "NUMERO",
      "TEXTO",
    ]);
    // As combinações que custaram três descobertas — nomeadas, não contadas.
    expect(
      CASOS.some((c) => c.campo.tipo === "BOOLEANO" && c.operador === "igual"),
      "booleano com 'é' — o defeito da F25",
    ).toBe(true);
    expect(
      CASOS.some((c) => c.campo.tipo === "DATA" && c.operador === "maior_ou_igual"),
      "data com 'de' — o defeito da F26",
    ).toBe(true);
    expect(
      CASOS.some((c) => c.campo.tipo === "NUMERO" && c.operador === "igual"),
      "número com 'é' — o outro defeito da F26",
    ).toBe(true);
    expect(operadores.size).toBeGreaterThanOrEqual(9);
  });

  it.each(CASOS)(
    "$assunto · $campo.slug · $operador",
    async ({ assunto: slug, campo, operador }) => {
      const assunto = ASSUNTOS.find((item) => item.slug === slug)!;
      const filtros = [
        { campo: campo.slug, operador: operador as never, valores: valoresPara(campo, operador) },
      ];
      // O assunto com filtro obrigatório precisa dele em TODO caso, senão a
      // recusa legítima esconderia o defeito que este teste procura.
      const exigencia = assunto.campos.find(
        (item) => item.filtroObrigatorio && item.slug !== campo.slug,
      );
      if (exigencia) {
        filtros.push({
          campo: exigencia.slug,
          operador: "maior_ou_igual" as never,
          valores: ["2026-01-01"],
        });
      }

      // O campo filtrado entra em Linhas: o compilador exige ao menos uma
      // dimensão ou medida, e usar o próprio campo mantém o caso mínimo.
      const { sql, parametros } = compilarRelatorio(
        { assunto: slug, linhas: [campo.slug], colunas: [], valores: [], filtros },
        { teto: 1 },
      );
      // `$queryRawUnsafe` porque o SQL é gerado pelo compilador a partir do
      // catálogo — nenhum pedaço dele vem de entrada de usuário (RN75).
      await expect(prisma.$queryRawUnsafe(sql, ...parametros)).resolves.toBeDefined();
    },
  );
});

describe("filtro de data cobre o DIA INTEIRO", () => {
  /*
   * O defeito que o conserto de tipo sozinho teria escondido, e que é pior
   * que a consulta não rodar: em coluna `timestamp`, "até 18/08" virava
   * meia-noite e apagava o dia 18 inteiro do relatório. Número plausível e
   * errado — o defeito mais caro possível aqui, porque parece certo.
   */
  const comData = {
    assunto: "auditoria",
    linhas: ["au-entidade"],
    colunas: [],
    valores: [],
  };

  it("'até' é exclusivo no dia seguinte, e não inclusivo na meia-noite", () => {
    const { sql } = compilarRelatorio({
      ...comData,
      filtros: [{ campo: "au-data", operador: "menor_ou_igual", valores: ["2026-08-18"] }],
    });
    expect(sql).toContain("::date + 1");
    expect(sql).not.toMatch(/ae\.criado_em <= /);
  });

  it("'entre' não usa BETWEEN, que seria inclusivo nas duas pontas", () => {
    const { sql } = compilarRelatorio({
      ...comData,
      filtros: [
        { campo: "au-data", operador: "entre", valores: ["2026-08-01", "2026-08-18"] },
      ],
    });
    expect(sql).not.toContain("BETWEEN");
    expect(sql).toContain("::date + 1");
  });

  it("a coluna fica NUA de um lado — o índice precisa continuar servindo", () => {
    /*
     * `col::date >= $1` também acertaria a semântica e perderia o índice,
     * justamente no assunto cujo filtro obrigatório existe para evitar
     * varredura sobre a tabela que mais cresce. O molde vai no PARÂMETRO.
     */
    const { sql } = compilarRelatorio({
      ...comData,
      filtros: [{ campo: "au-data", operador: "maior_ou_igual", valores: ["2026-08-01"] }],
    });
    expect(sql).not.toContain("ae.criado_em::");
  });
});

describe("RN79 — o filtro obrigatório da Auditoria", () => {
  const base = { assunto: "auditoria", linhas: ["au-entidade"], colunas: [], valores: [] };

  it("sem recorte de período, recusa nomeando a causa", () => {
    expect(() => compilarRelatorio({ ...base, filtros: [] })).toThrow(/só cresce/);
  });

  it("'está preenchido' não conta como recorte", () => {
    /*
     * `criado_em IS NOT NULL` é verdade para todas as linhas: satisfaria a
     * regra na letra e a desfaria na prática, que é pior que não ter a regra
     * — dá sensação de proteção onde não há nenhuma.
     */
    expect(() =>
      compilarRelatorio({
        ...base,
        filtros: [{ campo: "au-data", operador: "preenchido", valores: [] }],
      }),
    ).toThrow(/só cresce/);
  });

  it("com período, compila", () => {
    expect(() =>
      compilarRelatorio({
        ...base,
        filtros: [{ campo: "au-data", operador: "maior_ou_igual", valores: ["2026-08-01"] }],
      }),
    ).not.toThrow();
  });

  it("nenhum outro assunto exige filtro — a regra é da Auditoria, não geral", () => {
    const exigentes = ASSUNTOS.filter((assunto) =>
      assunto.campos.some((campo) => campo.filtroObrigatorio),
    ).map((assunto) => assunto.slug);
    expect(exigentes).toEqual(["auditoria"]);
  });
});
