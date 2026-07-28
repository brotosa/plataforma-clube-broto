import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **A reconciliação relata e nunca corrige (RN70).**
 *
 * Invariante de arquitetura, no padrão das cercas da RN07/RN19/RN49/
 * RN58/RN62: a regra só sobrevive às próximas fases se o build quebrar
 * quando alguém a desfizer. E esta é das mais fáceis de desfazer de boa
 * fé — o pedido "já que a importação viu que o nome mudou, por que não
 * atualiza?" é razoável em voz alta e destrutivo na prática: a correção
 * entraria **sem autor, sem auditoria e sem decisão humana**, desfazendo
 * em silêncio o que alguém digitou na T5. E, pior, seria desfeita de
 * novo na próxima importação, num vaivém que ninguém consegue explicar.
 *
 * O que esta cerca prende:
 *
 * 1. O caminho de importação da telemetria **não escreve** em `empresa`,
 *    `solucao` nem `oferta` — nenhuma mutação Prisma sobre esses modelos
 *    em nenhum arquivo do módulo.
 * 2. Não escapa por SQL cru (`$executeRaw`/`$queryRaw`) — que é como
 *    alguém contornaria o item 1 sem perceber que está contornando.
 * 3. Os contadores moram em tabela PRÓPRIA. Enquanto isso for verdade a
 *    proibição do item 1 é total: não existe "coluna de contador no
 *    cadastro" a excetuar, e a exceção que o prompt §5 previu não
 *    precisa existir. Se um dia alguém mover o contador para dentro de
 *    `ofertas`, este teste quebra e obriga a decisão a ser explícita.
 *
 * O que ela NÃO proíbe: LER o cadastro (é disso que a comparação vive) e
 * escrever nas tabelas que a própria F20 criou.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Todo o código de produção do caminho de importação da telemetria. */
const ARQUIVOS_DA_IMPORTACAO = [
  join("infra", "casos-de-uso", "telemetria-operadora.ts"),
  join("dominio", "telemetria-operadora", "reconciliacao.ts"),
  join("dominio", "telemetria-operadora", "layouts.ts"),
  join("dominio", "telemetria-operadora", "higienes.ts"),
  join("dominio", "telemetria-operadora", "causas.ts"),
  join("dominio", "telemetria-operadora", "coluna-cpf.ts"),
];

/** Os modelos do CADASTRO, que a importação lê e nunca escreve. */
const MODELOS_DE_CADASTRO = ["empresa", "solucao", "oferta"] as const;

/** As mutações do Prisma. `findMany`/`count` etc. ficam de fora: ler pode. */
const MUTACOES = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
] as const;

function lerArquivo(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

/** Remove comentários, para a cerca não acusar o texto que a explica. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("RN70 — a importação não escreve no cadastro", () => {
  it.each(ARQUIVOS_DA_IMPORTACAO)("%s não muta empresa, solucao nem oferta", (caminho) => {
    const fonte = semComentarios(lerArquivo(caminho));
    const infracoes: string[] = [];

    for (const modelo of MODELOS_DE_CADASTRO) {
      for (const mutacao of MUTACOES) {
        // `tx.oferta.update(`, `prisma.empresa.deleteMany(` — e qualquer
        // outro receptor, porque o cliente pode chegar por parâmetro.
        const padrao = new RegExp(`\\.${modelo}\\s*\\.\\s*${mutacao}\\s*\\(`, "g");
        for (const achado of fonte.matchAll(padrao)) {
          infracoes.push(`${modelo}.${mutacao} (posição ${achado.index})`);
        }
      }
    }

    expect(
      infracoes,
      `${caminho} passou a escrever no cadastro: ${infracoes.join(", ")}. ` +
        "A RN70 é explícita: a reconciliação registra a divergência e NÃO corrige — " +
        "nem 'só o nome', nem 'só o status'. Corrigir se faz no módulo de origem, " +
        "por decisão humana e com auditoria (RN07).",
    ).toEqual([]);
  });

  it.each(ARQUIVOS_DA_IMPORTACAO)("%s não escapa por SQL cru", (caminho) => {
    const fonte = semComentarios(lerArquivo(caminho));
    const cru = [...fonte.matchAll(/\$(executeRaw|queryRaw|executeRawUnsafe|queryRawUnsafe)/g)];
    expect(
      cru.map((achado) => achado[0]),
      `${caminho} passou a usar SQL cru. É por aí que a proibição acima seria ` +
        "contornada sem que a cerca de mutação Prisma percebesse.",
    ).toEqual([]);
  });

  it("o módulo de reconciliação sequer conhece o Prisma", () => {
    // A garantia mais forte é estrutural, não textual: sem cliente de
    // banco importado, não há o que escrever — a função é pura.
    const fonte = lerArquivo(join("dominio", "telemetria-operadora", "reconciliacao.ts"));
    expect(fonte).not.toContain("@prisma/client");
    expect(fonte).not.toContain("infra/prisma");
  });
});

describe("RN70 — o contador vive fora do cadastro", () => {
  const schema = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");

  function corpoDoModelo(modelo: string): string {
    const abertura = new RegExp(`model\\s+${modelo}\\s*\\{`, "m").exec(schema);
    if (abertura === null) return "";
    const inicio = abertura.index + abertura[0].length;
    const fim = schema.indexOf("\n}", inicio);
    return schema.slice(inicio, fim === -1 ? undefined : fim);
  }

  function camposDeclarados(corpo: string): string[] {
    return corpo
      .split("\n")
      .map((linha) => linha.trim())
      .filter((linha) => linha !== "" && !linha.startsWith("//") && !linha.startsWith("@@"))
      .map((linha) => linha.split(/\s+/)[0] ?? "")
      .filter((campo) => campo !== "");
  }

  it("a tabela de contadores existe e é própria", () => {
    expect(corpoDoModelo("ContadorDeOfertaTelemetria")).not.toBe("");
  });

  it.each(["Oferta", "Empresa", "Solucao"])(
    "%s não ganhou coluna de contador da operadora",
    (modelo) => {
      const campos = camposDeclarados(corpoDoModelo(modelo));
      expect(campos.length, `modelo ${modelo} não encontrado`).toBeGreaterThan(0);
      const proibidos = [
        /^resgates$/i,
        /^compras$/i,
        /^resgatesTelemetria$/i,
        /^comprasTelemetria$/i,
        /^resgatesAcumulados$/i,
        /^contadorResgates$/i,
      ];
      const encontrados = campos.filter((campo) =>
        proibidos.some((proibido) => proibido.test(campo)),
      );
      expect(
        encontrados,
        `${modelo} passou a guardar contador da operadora (${encontrados.join(", ")}). ` +
          "Enquanto o contador mora em tabela própria, a proibição de escrita da RN70 " +
          "é total e não precisa de exceção. Mover o contador para cá reabre essa porta " +
          "— e a decisão precisa ser explícita, não um efeito colateral.",
      ).toEqual([]);
    },
  );

  it("nenhuma migration acrescenta contador da operadora ao cadastro", () => {
    const sql = readFileSync(
      join(
        RAIZ,
        "prisma",
        "migrations",
        "20260728120000_onda12_f20_telemetria_operadora",
        "migration.sql",
      ),
      "utf8",
    );
    const linhasDdl = sql
      .split("\n")
      .map((linha) => linha.trim())
      .filter((linha) => !linha.startsWith("--") && linha !== "");

    // A F20 é aditiva: nenhum ALTER TABLE sobre tabela existente.
    const alteracoes = linhasDdl.filter((linha) =>
      /ALTER TABLE "(ofertas|empresas|solucoes)"/i.test(linha),
    );
    expect(
      alteracoes,
      `a migration da F20 altera tabela de cadastro: ${alteracoes.join(" | ")}`,
    ).toEqual([]);
  });
});
