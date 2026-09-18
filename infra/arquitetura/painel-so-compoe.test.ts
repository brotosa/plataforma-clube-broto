import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RN86 — o painel COMPÕE; ele não consulta, não calcula e não inventa
 * indicador.
 *
 * ## O defeito que esta cerca existe para impedir
 *
 * Ele é plausível e chega por um pedido razoável: "o painel precisa de um
 * card com o total de assinantes ativos, e dá para fazer com um `count` aqui
 * mesmo". Quem escrever isso estará resolvendo um problema real — e no mesmo
 * instante o painel deixa de ser composição e vira **um segundo Dashboard,
 * sem as garantias do primeiro**.
 *
 * O que se perde, tudo de uma vez e em silêncio:
 *
 *  - a **RN50** — o Dashboard só exibe indicador de ficha validada, e um
 *    número calculado no painel não passou por ficha nenhuma;
 *  - a **RN76** — a consulta do caso de uso roda com a permissão de quem
 *    abre; uma contagem escrita no painel roda com o que o autor lembrar de
 *    conferir;
 *  - a **RN78** — nem finalidade nem trilha, porque nada disso está no
 *    caminho de quem consulta por fora.
 *
 * Nada aparece na tela: o card sai bonito, com um número certo. Por isso a
 * cerca quebra o build em vez de avisar.
 */

const RAIZ = process.cwd();

/** Onde o painel vive. */
const ARQUIVOS_DO_PAINEL = [
  "dominio/relatorios/painel.ts",
  "infra/casos-de-uso/paineis.ts",
  "app/(plataforma)/paineis/page.tsx",
  "app/(plataforma)/paineis/bloco.tsx",
  "app/(plataforma)/paineis/acoes.ts",
];

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

/** Imports de VALOR, ignorando `import type` e `import { type X }`. */
function modulosImportados(fonte: string): ReadonlyArray<string> {
  const encontrados: string[] = [];
  const padrao = /import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/g;
  let achado: RegExpExecArray | null;
  while ((achado = padrao.exec(fonte)) !== null) {
    if (achado[1]) continue;
    encontrados.push(achado[3] ?? "");
  }
  return encontrados;
}

describe("RN86 — o painel compõe, e não consulta por conta própria", () => {
  it("a cerca não está cega: encontrou os arquivos que deve cobrir", () => {
    /*
     * Asserção anti-cegueira, e ela NOMEIA em vez de contar. Uma cerca que
     * só conferisse "achei pelo menos um arquivo" passaria para sempre no
     * dia em que a pasta fosse renomeada: zero arquivo, zero violação,
     * verde. Já aconteceu nesta casa, com a cerca do histórico da T35.
     */
    for (const caminho of ARQUIVOS_DO_PAINEL) {
      expect(() => ler(caminho), `${caminho} sumiu — a cerca ficaria cega`).not.toThrow();
    }
  });

  it("o domínio e a tela não falam com o banco", () => {
    // O caso de uso PODE (é ele quem lê e grava o painel); os outros, não.
    const semBanco = ARQUIVOS_DO_PAINEL.filter(
      (caminho) => caminho !== "infra/casos-de-uso/paineis.ts",
    );
    for (const caminho of semBanco) {
      const modulos = modulosImportados(ler(caminho));
      expect(modulos, `${caminho} importa o Prisma`).not.toContain("@/infra/prisma/cliente");
      expect(modulos, `${caminho} importa o Prisma`).not.toContain("@prisma/client");
    }
  });

  it("nada no painel importa a camada de consultas", () => {
    /*
     * Nem o caso de uso. Ele chama `executarRelatorio`, que é quem fala com
     * `infra/consultas` — e é justamente essa indireção que carrega a
     * permissão, a finalidade, o teto e a trilha. Pular para a consulta
     * direto seria pular as quatro de uma vez.
     */
    for (const caminho of ARQUIVOS_DO_PAINEL) {
      expect(
        modulosImportados(ler(caminho)),
        `${caminho} consulta por fora do caso de uso`,
      ).not.toContain("@/infra/consultas/relatorios");
    }
  });

  it("nenhum arquivo do painel escreve SQL", () => {
    for (const caminho of ARQUIVOS_DO_PAINEL) {
      const fonte = ler(caminho);
      expect(/\bSELECT\s+[\s\S]{0,80}\bFROM\b/i.test(fonte), `${caminho} escreve SQL`).toBe(false);
      expect(/\$queryRaw|\$executeRaw/.test(fonte), `${caminho} usa query bruta`).toBe(false);
    }
  });

  it("o caso de uso executa bloco POR `executarRelatorio`, e não por outro caminho", () => {
    /*
     * A asserção positiva, e ela importa tanto quanto as negativas: as de
     * cima provam que o painel não vai a lugar nenhum indevido; esta prova
     * que ele vai ao lugar devido. Sem ela, alguém poderia arrancar a
     * execução inteira e a cerca continuaria verde.
     */
    const fonte = ler("infra/casos-de-uso/paineis.ts");
    expect(modulosImportados(fonte)).toContain("./relatorios");
    expect(fonte).toContain("executarRelatorio(");
  });

  it("o painel não soma nem agrega blocos entre si", () => {
    /*
     * A RN86 proíbe derivar número de dois blocos juntos: cada bloco é uma
     * pergunta, e somar duas perguntas produz uma terceira que ninguém
     * validou — e que não tem ficha, nem origem declarada, nem como ser
     * conferida.
     *
     * A varredura é textual e portanto grosseira; ela pega o caso óbvio
     * (reduzir a lista de blocos a um total). O que ela não pega está dito
     * aqui de propósito, para quem vier depois não a tomar por completa.
     */
    for (const caminho of ARQUIVOS_DO_PAINEL) {
      const fonte = ler(caminho);
      expect(
        /blocos[\s\S]{0,40}\.reduce\s*\(/.test(fonte),
        `${caminho} reduz a lista de blocos — o painel não agrega bloco com bloco`,
      ).toBe(false);
    }
  });
});
