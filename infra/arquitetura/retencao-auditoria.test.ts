import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * RN49 como invariante de arquitetura: **nenhum evento de auditoria é
 * apagado na v1**, e RN48: **a trilha é somente leitura**.
 *
 * A política formal de retenção é [A CONFIRMAR — jurídico/compliance]. Até
 * que venha, a premissa é retenção integral — e a única forma de essa
 * premissa sobreviver às próximas mudanças é o build quebrar quando alguém
 * escrever a primeira purga. É a mesma rede que a F1 armou para a RN07
 * (telemetria imutável) e a RN05 (nada é excluído fisicamente).
 *
 * O que este teste NÃO proíbe: gravar evento novo. A trilha só cresce —
 * `create`/`createMany` seguem livres, e é assim que a auditoria funciona.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRETORIOS_DE_PRODUCAO = ["app", "infra", "dominio"];

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

/**
 * Limpezas de teste são legítimas e vivem em helpers próprios, fora do
 * código de produção. Este é o único arquivo de produção que pode tocar a
 * tabela — e mesmo ele só a lê.
 */
const METODOS_PROIBIDOS = "update|updateMany|upsert|delete|deleteMany";

describe("RN49 — auditoria não se apaga (retenção integral até o jurídico decidir)", () => {
  it("nenhum código de produção edita ou remove auditoria_eventos pelo Prisma", () => {
    const regex = new RegExp(
      `\\bauditoriaEvento\\s*\\.\\s*(${METODOS_PROIBIDOS})\\b`,
      "g",
    );
    const violacoes: string[] = [];
    for (const arquivo of arquivosDeProducao()) {
      const conteudo = readFileSync(arquivo, "utf8");
      for (const ocorrencia of conteudo.matchAll(regex)) {
        violacoes.push(`${relative(RAIZ, arquivo)}: auditoriaEvento.${ocorrencia[1]}`);
      }
    }
    expect(violacoes, violacoes.join("\n")).toEqual([]);
  });

  it("nenhum SQL de produção apaga ou altera a tabela de eventos", () => {
    const regex =
      /(DELETE\s+FROM|TRUNCATE(\s+TABLE)?|UPDATE)\s+"?auditoria_eventos"?/gi;
    const violacoes: string[] = [];
    for (const arquivo of arquivosDeProducao()) {
      const conteudo = readFileSync(arquivo, "utf8");
      if (regex.test(conteudo)) {
        violacoes.push(relative(RAIZ, arquivo));
      }
      regex.lastIndex = 0;
    }
    expect(violacoes, violacoes.join("\n")).toEqual([]);
  });

  it("nenhuma migration aplicada apaga eventos de auditoria", () => {
    const migrations = join(RAIZ, "prisma", "migrations");
    const violacoes: string[] = [];
    for (const entrada of readdirSync(migrations, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      const sql = join(migrations, entrada.name, "migration.sql");
      const conteudo = readFileSync(sql, "utf8");
      // Comentários explicando que NÃO há purga são bem-vindos; comandos, não.
      const semComentarios = conteudo
        .split("\n")
        .filter((linha) => !linha.trimStart().startsWith("--"))
        .join("\n");
      if (/(DELETE\s+FROM|TRUNCATE(\s+TABLE)?)\s+"?auditoria_eventos"?/i.test(semComentarios)) {
        violacoes.push(entrada.name);
      }
    }
    expect(violacoes, violacoes.join("\n")).toEqual([]);
  });

  it("a pendência de retenção segue declarada como [A CONFIRMAR] no repositório", () => {
    const migrations = join(RAIZ, "prisma", "migrations");
    const textos = readdirSync(migrations, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => readFileSync(join(migrations, e.name, "migration.sql"), "utf8"));
    const declarada = textos.some(
      (texto) => /A CONFIRMAR/.test(texto) && /reten[cç][aã]o/i.test(texto),
    );
    expect(
      declarada,
      "nenhuma migration declara o [A CONFIRMAR] da retenção da auditoria (RN49)",
    ).toBe(true);
  });
});
