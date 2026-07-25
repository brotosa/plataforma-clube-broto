import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RN19 como invariante de arquitetura: **nenhum campo do dossiê preenche
 * nota de indicador**. A regra é fácil de respeitar hoje e fácil de violar
 * amanhã — bastaria alguém "aproveitar" o dossiê para pré-preencher notas
 * na T10. Este teste falha no instante em que a avaliação passar a
 * enxergar dossiê, em qualquer direção:
 *
 * 1. os módulos de avaliação (domínio, casos de uso, consultas e tela) não
 *    importam nada de dossiê nem consultam a tabela `dossie`;
 * 2. os módulos de dossiê não escrevem nota, avaliação ou score.
 *
 * O que continua permitido — e é o desenho da ficha — é a evidência da
 * nota citar o dossiê em texto livre: isso é palavra do avaliador, não
 * campo copiado.
 */

const RAIZ = process.cwd();

function arquivosDe(diretorio: string, extensoes = [".ts", ".tsx"]): string[] {
  const caminho = join(RAIZ, diretorio);
  const encontrados: string[] = [];
  const percorrer = (atual: string) => {
    for (const entrada of readdirSync(atual)) {
      const completo = join(atual, entrada);
      if (statSync(completo).isDirectory()) {
        percorrer(completo);
      } else if (extensoes.some((extensao) => entrada.endsWith(extensao))) {
        encontrados.push(completo);
      }
    }
  };
  percorrer(caminho);
  return encontrados;
}

/** Arquivos que decidem ou calculam pontuação de indicador. */
const MODULOS_DE_AVALIACAO = [
  ...arquivosDe("dominio/avaliacao"),
  join(RAIZ, "infra/casos-de-uso/avaliacoes.ts"),
  join(RAIZ, "infra/consultas/avaliacoes.ts"),
  ...arquivosDe("app/(plataforma)/mercado/[empresaId]/avaliacao"),
].filter((arquivo) => !arquivo.endsWith(".test.ts") && !arquivo.endsWith(".test.tsx"));

const MODULOS_DE_DOSSIE = [
  ...arquivosDe("dominio/dossie"),
  ...arquivosDe("infra/dossie"),
  join(RAIZ, "infra/casos-de-uso/dossies.ts"),
  join(RAIZ, "infra/consultas/dossies.ts"),
  ...arquivosDe("app/(plataforma)/mercado/[empresaId]/dossie"),
].filter((arquivo) => !arquivo.endsWith(".test.ts") && !arquivo.endsWith(".test.tsx"));

function conteudo(arquivo: string): string {
  return readFileSync(arquivo, "utf8");
}

function relativo(arquivo: string): string {
  return arquivo.slice(RAIZ.length + 1);
}

describe("RN19 — dossiê e pontuação são independentes (invariante de arquitetura)", () => {
  it("os módulos de avaliação existem (o teste não passa por engano)", () => {
    expect(MODULOS_DE_AVALIACAO.length).toBeGreaterThan(4);
    expect(MODULOS_DE_DOSSIE.length).toBeGreaterThan(4);
  });

  it("nenhum módulo de avaliação importa dossiê", () => {
    const infratores = MODULOS_DE_AVALIACAO.filter((arquivo) =>
      /^\s*import[\s\S]*?from\s+["'][^"']*dossie[^"']*["']/m.test(conteudo(arquivo)),
    ).map(relativo);
    expect(infratores).toEqual([]);
  });

  it("nenhum módulo de avaliação consulta a tabela de dossiês", () => {
    const infratores = MODULOS_DE_AVALIACAO.filter((arquivo) =>
      /\b(tx|prisma|cliente)\s*\.\s*dossie/i.test(conteudo(arquivo)),
    ).map(relativo);
    expect(infratores).toEqual([]);
  });

  it("nenhum módulo de dossiê toca em nota, avaliação ou indicador", () => {
    const infratores = MODULOS_DE_DOSSIE.filter((arquivo) =>
      /\b(tx|prisma|cliente)\s*\.\s*(avaliacaoNota|avaliacaoScout|indicador)\b/.test(
        conteudo(arquivo),
      ),
    ).map(relativo);
    expect(infratores).toEqual([]);
  });

  it("nenhum módulo de dossiê altera a empresa (o score é só leitura na T11)", () => {
    const infratores = MODULOS_DE_DOSSIE.filter((arquivo) =>
      /\b(tx|prisma|cliente)\s*\.\s*empresa\s*\.\s*(update|updateMany|create|upsert)/.test(
        conteudo(arquivo),
      ),
    ).map(relativo);
    expect(infratores).toEqual([]);
  });

  it("a T10 continua dizendo ao avaliador que a pontuação é humana", () => {
    const formulario = conteudo(
      join(RAIZ, "app/(plataforma)/mercado/[empresaId]/avaliacao/formulario-avaliacao.tsx"),
    );
    expect(formulario).toContain("a pontuação é sempre humana");
  });
});
