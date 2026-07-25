import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Invariantes de imutabilidade como testes de arquitetura (fitness functions):
 * varrem o código de PRODUÇÃO e garantem propriedades que nenhum teste de
 * comportamento isolado cobriria.
 *
 *  - RN07 (ficha §6): telemetria é somente leitura — vouchers e compras são
 *    fatos imutáveis, rastreáveis à importação, "jamais editáveis". Logo os
 *    dados só entram pela importação e nenhum agregado exibido pode derivar de
 *    outra origem que não os eventos/acumulados importados.
 *  - RN05 (ficha §4): nada é excluído fisicamente após a primeira publicação —
 *    aliado, solução, oferta e contrato só são inativados/encerrados,
 *    preservando a trilha de auditoria.
 *
 * Estes testes são a rede de segurança para as próximas fases: a F4 (importador
 * de telemetria) e a F5 não podem, sem quebrar o build, abrir um caminho que
 * edite telemetria ou apague uma entidade publicável.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIRETORIOS_DE_PRODUCAO = ["app", "infra", "dominio"];

/** Arquivos .ts/.tsx de produção (exclui testes, node_modules e .next). */
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

interface EscritaPrisma {
  arquivo: string;
  modelo: string;
  metodo: string;
}

const METODOS_DE_ESCRITA =
  "create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany";

/**
 * Localiza chamadas `modelo.metodo(...)` do Prisma (com ou sem prefixo
 * `prisma.`/`tx.`) para os modelos informados, em todo o código de produção.
 * O `\b` evita casar campos de relação homônimos (ex.: `telemetriaEventos`,
 * plural) ou modelos com prefixo comum (ex.: `stagingOferta`).
 */
function escritasPrisma(modelos: readonly string[]): EscritaPrisma[] {
  const regex = new RegExp(
    `\\b(${modelos.join("|")})\\s*\\.\\s*(${METODOS_DE_ESCRITA})\\b`,
    "g",
  );
  const escritas: EscritaPrisma[] = [];
  for (const arquivo of arquivosDeProducao()) {
    const conteudo = readFileSync(arquivo, "utf8");
    for (const ocorrencia of conteudo.matchAll(regex)) {
      const [, modelo = "", metodo = ""] = ocorrencia;
      escritas.push({ arquivo: relative(RAIZ, arquivo), modelo, metodo });
    }
  }
  return escritas;
}

// ---------------------------------------------------------------------
// RN07 — telemetria somente leitura
// ---------------------------------------------------------------------

const MODELOS_TELEMETRIA = ["telemetriaEvento", "telemetriaAcumuladoInicial"];

/**
 * Módulos onde gravar telemetria é legítimo: a carga inicial (F3). Quando a F4
 * trouxer o importador de telemetria, o novo módulo deve ser adicionado aqui —
 * a fricção é intencional: concentra e torna auditável toda gravação.
 */
const MODULOS_DE_IMPORTACAO = new Set<string>([
  "infra/casos-de-uso/carga-inicial.ts",
  "infra/casos-de-uso/telemetria.ts",
]);

const METODOS_QUE_EDITAM = new Set(["update", "updateMany", "delete", "deleteMany"]);

describe("RN07 — telemetria é somente leitura (fatos imutáveis, ficha §6)", () => {
  const escritas = escritasPrisma(MODELOS_TELEMETRIA);

  it("o scanner enxerga as gravações de telemetria (guarda contra falso verde)", () => {
    // Se cair para 0, o regex/estrutura mudou e as asserções abaixo passariam
    // à toa — hoje a carga inicial faz ao menos um upsert de acumulado.
    expect(escritas.length).toBeGreaterThan(0);
  });

  it("nenhum caminho público muta telemetria — só os módulos de importação gravam", () => {
    const foraDaImportacao = escritas.filter(
      (escrita) => !MODULOS_DE_IMPORTACAO.has(escrita.arquivo),
    );
    expect(
      foraDaImportacao,
      `Gravação de telemetria fora da importação: ${JSON.stringify(foraDaImportacao)}`,
    ).toEqual([]);
  });

  it("telemetria é append-only: nenhuma edição/remoção em produção (nem na importação)", () => {
    // A importação pode `create`/`upsert` (reimportação idempotente do mesmo
    // corte), mas jamais editar ou apagar um fato já registrado.
    const edicoes = escritas.filter((escrita) => METODOS_QUE_EDITAM.has(escrita.metodo));
    expect(
      edicoes,
      `Edição/remoção de telemetria proibida (RN07): ${JSON.stringify(edicoes)}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// RN05 — sem exclusão física após a primeira publicação
// ---------------------------------------------------------------------

const MODELOS_ENTIDADE_PUBLICAVEL = ["empresa", "solucao", "oferta", "contratoComercial"];
const METODOS_DE_REMOCAO = new Set(["delete", "deleteMany"]);

describe("RN05 — nada é excluído fisicamente após a primeira publicação (ficha §4)", () => {
  it("nenhum caminho de produção remove fisicamente aliado, solução, oferta ou contrato", () => {
    // Edições (`update`) são permitidas; remoção física não. Entidades saem de
    // cena por status (inativar/encerrar), preservando a auditoria.
    const remocoes = escritasPrisma(MODELOS_ENTIDADE_PUBLICAVEL).filter((escrita) =>
      METODOS_DE_REMOCAO.has(escrita.metodo),
    );
    expect(
      remocoes,
      `Remoção física proibida (RN05): ${JSON.stringify(remocoes)}`,
    ).toEqual([]);
  });
});
