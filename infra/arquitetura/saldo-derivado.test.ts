import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Saldo é derivação, nunca coluna (RN62).**
 *
 * Invariante de arquitetura, no padrão das cercas da RN07/RN19/RN49/RN58:
 * a regra só sobrevive às próximas fases se o build quebrar quando alguém
 * a desfizer. E ela é fácil de desfazer sem má-fé — "guardar o saldo evita
 * uma contagem por linha na lista" é um argumento de desempenho que soa
 * razoável até o primeiro vínculo encerrado, quando o número gravado passa
 * a divergir dos fatos **em silêncio**, sem nada na tela denunciando.
 *
 * O que esta cerca prende:
 *
 * 1. Nem `saldo` nem `ativadas` (nem sinônimo óbvio) existem como coluna
 *    de contrato ou de patrocinador no `schema.prisma`.
 * 2. A migration que criou as tabelas não os cria por outro caminho.
 * 3. Nenhum código de produção escreve um campo com esses nomes por
 *    Prisma — o que pegaria alguém acrescentando a coluna sem passar pelo
 *    schema (SQL cru, por exemplo).
 * 4. A derivação tem UM dono: `dominio/patrocinio/saldo.ts`. Quem exibe
 *    saldo importa de lá, e não refaz a subtração por conta própria — é a
 *    mesma disciplina de fonte única da RN51.
 *
 * O que ela NÃO proíbe: contar vínculos vigentes na consulta (é isso que
 * alimenta a derivação) nem nomear uma variável local `saldo`. O alvo é a
 * PERSISTÊNCIA e a duplicação da regra, não a palavra.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRETORIOS_DE_PRODUCAO = ["app", "infra", "dominio"];

/** O módulo que tem o direito de fazer a conta. */
const DONO_DA_DERIVACAO = join("dominio", "patrocinio", "saldo.ts");

function arquivosDeProducao(): string[] {
  const encontrados: string[] = [];
  const visitar = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === ".next") continue;
        visitar(caminho);
        continue;
      }
      if (!/\.tsx?$/.test(entrada.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entrada.name)) continue;
      encontrados.push(caminho);
    }
  };
  for (const diretorio of DIRETORIOS_DE_PRODUCAO) {
    visitar(join(RAIZ, diretorio));
  }
  return encontrados;
}

/** Recorta o corpo de um `model X { … }` do schema. */
function corpoDoModelo(schema: string, modelo: string): string {
  const abertura = new RegExp(`model\\s+${modelo}\\s*\\{`, "m").exec(schema);
  if (abertura === null) return "";
  const inicio = abertura.index + abertura[0].length;
  const fim = schema.indexOf("\n}", inicio);
  return schema.slice(inicio, fim === -1 ? undefined : fim);
}

/** Linhas de campo (ignora comentários `///` e `//`). */
function camposDeclarados(corpo: string): string[] {
  return corpo
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "" && !linha.startsWith("//") && !linha.startsWith("@@"))
    .map((linha) => linha.split(/\s+/)[0] ?? "")
    .filter((campo) => campo !== "");
}

const PROIBIDOS = [
  /^saldo/i,
  /^ativadas$/i,
  /^assinaturas_?ativadas$/i,
  /^assinaturasAtivadas$/i,
  /^vagas(Ocupadas|Disponiveis|Livres)$/i,
  /^vinculosVigentes$/i,
];

describe("RN62 — nem saldo nem ativadas existem como coluna", () => {
  const schema = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");

  it.each(["ContratoPatrocinio", "Patrocinador"])(
    "o modelo %s não declara campo de saldo nem de ativadas",
    (modelo) => {
      const campos = camposDeclarados(corpoDoModelo(schema, modelo));
      expect(campos.length, `modelo ${modelo} não encontrado no schema`).toBeGreaterThan(0);
      const persistidos = campos.filter((campo) =>
        PROIBIDOS.some((proibido) => proibido.test(campo)),
      );
      expect(
        persistidos,
        `${modelo} passou a persistir ${persistidos.join(", ")}. Saldo é derivação (RN62): ` +
          "a conta vive em dominio/patrocinio/saldo.ts e o número gravado envelheceria " +
          "calado no primeiro vínculo encerrado.",
      ).toEqual([]);
    },
  );

  it("o contrato continua declarando adquiridas — que é dado, não derivação", () => {
    // O contraponto do teste acima: `assinaturasAdquiridas` É coluna, e
    // tem de continuar sendo. Sem ela não há de onde derivar nada, e a
    // ausência dela é o que produz o traço com motivo.
    const campos = camposDeclarados(corpoDoModelo(schema, "ContratoPatrocinio"));
    expect(campos).toContain("assinaturasAdquiridas");
  });

  it("nenhuma migration cria coluna de saldo ou de ativadas", () => {
    const migrations = join(RAIZ, "prisma", "migrations");
    const suspeitas: string[] = [];
    for (const pasta of readdirSync(migrations, { withFileTypes: true })) {
      if (!pasta.isDirectory()) continue;
      const sql = readFileSync(join(migrations, pasta.name, "migration.sql"), "utf8");
      // Só as linhas de DDL de coluna interessam; comentário explicando a
      // regra é justamente o que se espera encontrar no cabeçalho.
      for (const linha of sql.split("\n")) {
        const limpa = linha.trim();
        if (limpa.startsWith("--")) continue;
        if (/"(saldo|ativadas|assinaturas_ativadas|vagas_disponiveis)"/i.test(limpa)) {
          suspeitas.push(`${pasta.name}: ${limpa}`);
        }
      }
    }
    expect(suspeitas).toEqual([]);
  });
});

describe("RN62 — a derivação tem um dono só", () => {
  it("nenhum arquivo de produção refaz a subtração por conta própria", () => {
    /**
     * A assinatura da duplicação: subtrair a contagem de vigentes das
     * adquiridas fora do módulo dono. Quem precisa do número chama
     * `derivarSaldo`, que já decide o caso da ausência — e é justamente o
     * caso da ausência que uma subtração solta erraria, devolvendo `NaN`
     * ou zero onde a regra manda traço com motivo.
     */
    const suspeitas: string[] = [];
    for (const arquivo of arquivosDeProducao()) {
      const caminho = relative(RAIZ, arquivo);
      if (caminho === DONO_DA_DERIVACAO) continue;
      const codigo = readFileSync(arquivo, "utf8");
      for (const [numero, linha] of codigo.split("\n").entries()) {
        if (linha.trim().startsWith("*") || linha.trim().startsWith("//")) continue;
        /**
         * O `(?<![-\w])` no começo é o que separa subtração de identificador
         * hifenizado. Sem ele, `id="ct-adquiridas-ajuda"` — um rótulo de
         * campo do formulário do contrato — era acusado de refazer a conta,
         * e uma cerca que grita em cima de coisa certa é uma cerca que a
         * equipe aprende a desligar. O `\w*` antes permite pegar
         * `assinaturasAdquiridas - x`, que é a forma real do defeito.
         */
        if (
          /(?<![-\w])\w*[Aa]dquiridas\s*-\s*\w/.test(linha) ||
          /[\s)]-\s*\w*[Vv]inculosVigentes/.test(linha)
        ) {
          suspeitas.push(`${caminho}:${numero + 1}`);
        }
      }
    }
    expect(
      suspeitas,
      `subtração de saldo fora de ${DONO_DA_DERIVACAO}: ${suspeitas.join(", ")}. ` +
        "A RN62 quer a conta num lugar só — inclusive a decisão de não haver conta.",
    ).toEqual([]);
  });

  it("quem exibe saldo importa do módulo dono", () => {
    /**
     * Complemento do anterior: garante que a fonte única é de fato usada,
     * e não apenas que ninguém subtrai. Um arquivo que fala de saldo ao
     * usuário sem importar a derivação está compondo o número por outro
     * caminho.
     */
    const semImportar: string[] = [];
    for (const arquivo of arquivosDeProducao()) {
      const caminho = relative(RAIZ, arquivo);
      if (caminho === DONO_DA_DERIVACAO) continue;
      const codigo = readFileSync(arquivo, "utf8");
      const falaDeSaldo = /SaldoDePatrocinio|estado === "APURADO"|derivarSaldo/.test(codigo);
      if (!falaDeSaldo) continue;
      if (!codigo.includes("dominio/patrocinio/saldo")) {
        semImportar.push(caminho);
      }
    }
    expect(
      semImportar,
      `estes arquivos falam de saldo sem importar a fonte única: ${semImportar.join(", ")}`,
    ).toEqual([]);
  });
});
