import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RN83 — formato é **renderização**, nunca um segundo caminho até o dado.
 *
 * ## O defeito que esta cerca existe para impedir
 *
 * Ele tem nome e é plausível: uma rota de XLSX que monte a própria consulta
 * "porque a planilha precisa de todas as linhas, e o caso de uso limita".
 * Quem escrever isso não estará agindo de má-fé — estará resolvendo um
 * problema real pelo caminho errado.
 *
 * E o estrago é silencioso. No dia em que acontecer, o alcance por papel
 * (RN76) deixa de valer para quem souber pedir em `.xlsx`, a finalidade
 * (RN78) deixa de ser exigida e a execução some da trilha. Nada disso
 * aparece na tela: a planilha sai bonita, com mais linhas, e ninguém
 * percebe que ela passou por fora.
 *
 * ## Por isso a cerca quebra o build, e não avisa
 *
 * Um renderizador recebe **tabela pronta** e devolve **bytes**. Se precisar
 * de mais dado, o lugar de mexer é o caso de uso — que é onde a permissão, a
 * finalidade e a trilha moram.
 */

const RAIZ = process.cwd();

/** Os renderizadores: tudo em `infra/relatorios/`, mais o domínio da saída. */
const RENDERIZADORES = [
  ...readdirSync(join(RAIZ, "infra/relatorios"))
    .filter((arquivo) => arquivo.endsWith(".ts") && !arquivo.endsWith(".test.ts"))
    .map((arquivo) => join("infra/relatorios", arquivo)),
  "dominio/relatorios/saida.ts",
];

/**
 * O que um renderizador não pode alcançar.
 *
 * `prisma` e a camada de consultas são o alvo direto. O **compilador** entra
 * junto por um motivo menos óbvio: quem o importa está a uma linha de montar
 * a própria definição e executá-la, e o passo seguinte é pedir o resultado
 * por conta própria. O tipo `DefinicaoRelatorio` vem de lá, então a cerca
 * cobra o import de **valor**, não o de tipo.
 */
const PROIBIDOS: ReadonlyArray<{ modulo: string; porque: string }> = [
  { modulo: "@/infra/prisma/cliente", porque: "renderizador não fala com o banco" },
  { modulo: "@prisma/client", porque: "renderizador não fala com o banco" },
  { modulo: "@/infra/consultas/relatorios", porque: "renderizador não executa consulta" },
  { modulo: "@/infra/casos-de-uso/relatorios", porque: "a dependência é do caso de uso para cá" },
];

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

/** Imports de VALOR, ignorando `import type` e `import { type X }`. */
function importesDeValor(fonte: string): ReadonlyArray<{ modulo: string; itens: string }> {
  const encontrados: Array<{ modulo: string; itens: string }> = [];
  const padrao = /import\s+(type\s+)?([\s\S]*?)from\s+["']([^"']+)["']/g;
  let achado: RegExpExecArray | null;
  while ((achado = padrao.exec(fonte)) !== null) {
    if (achado[1]) continue; // `import type { ... } from`
    encontrados.push({ modulo: achado[3] ?? "", itens: achado[2] ?? "" });
  }
  return encontrados;
}

describe("RN83 — renderizador recebe tabela pronta e devolve bytes", () => {
  it("a cerca não está cega: encontrou os renderizadores que deve cobrir", () => {
    /*
     * A asserção anti-cegueira, e ela NOMEIA em vez de contar.
     *
     * Uma cerca que só conferisse "achei pelo menos um arquivo" passaria para
     * sempre no dia em que a pasta fosse renomeada: zero arquivo, zero
     * violação, verde. Já aconteceu nesta casa, com a cerca do histórico da
     * T35, e o conserto foi este.
     */
    expect(RENDERIZADORES).toContain("infra/relatorios/saida-html.ts");
    expect(RENDERIZADORES).toContain("infra/relatorios/saida-xlsx.ts");
    expect(RENDERIZADORES).toContain("dominio/relatorios/saida.ts");
  });

  it.each(RENDERIZADORES)("%s não alcança banco nem consulta", (caminho) => {
    const fonte = ler(caminho);
    for (const proibido of PROIBIDOS) {
      const usa = importesDeValor(fonte).some((importe) => importe.modulo === proibido.modulo);
      expect(usa, `${caminho} importa ${proibido.modulo} — ${proibido.porque}`).toBe(false);
    }
  });

  it("nenhum renderizador escreve SQL", () => {
    // Complemento do import: alguém poderia montar SQL em texto e passá-lo
    // adiante sem importar nada. Não há uso legítimo de SQL aqui.
    for (const caminho of RENDERIZADORES) {
      const fonte = ler(caminho);
      expect(/\bSELECT\s+[\s\S]{0,80}\bFROM\b/i.test(fonte), `${caminho} escreve SQL`).toBe(false);
      expect(/\$queryRaw|\$executeRaw/.test(fonte), `${caminho} usa query bruta`).toBe(false);
    }
  });

  it("a rota de saída não executa consulta por conta própria", () => {
    /*
     * A rota PODE importar o caso de uso — é dela que ele é chamado. O que
     * ela não pode é pular por cima dele, que é exatamente o defeito descrito
     * no topo deste arquivo.
     */
    const fonte = ler("app/(plataforma)/relatorios/exportar/route.ts");
    const modulos = importesDeValor(fonte).map((importe) => importe.modulo);
    expect(modulos).toContain("@/infra/casos-de-uso/relatorios");
    expect(modulos).not.toContain("@/infra/consultas/relatorios");
    expect(modulos).not.toContain("@/infra/prisma/cliente");
  });
});
