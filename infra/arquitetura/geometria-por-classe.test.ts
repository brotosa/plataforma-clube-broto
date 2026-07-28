import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Geometria repetida vira classe; estilo inline é invisível às cercas.**
 *
 * Convenção da Onda 14 (ficha §1, item 10), e ela nasceu de um defeito que
 * atravessou três fases inteiras sem que nada o visse.
 *
 * Três formulários montavam a mesma grade de duas colunas com
 * `style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}`.
 * O `gap` de duas medidas é `row-gap column-gap`: **a linha ficava em
 * zero**, e o rótulo de cada campo colava no campo da linha de cima. O erro
 * foi escrito na F19, copiado na F20 e copiado de novo na F21 — e nenhuma
 * das cercas do repositório podia acusá-lo, porque todas elas leem CSS e
 * leem classe, e nenhuma lê atributo `style`.
 *
 * Consertar os três inlines devolveria o mesmo ponto cego ao quarto
 * formulário. O conserto foi por classe (`.form-grid`, no
 * `dseed-admin.css`), e esta cerca é o que impede a volta.
 *
 * **O alvo é estreito de propósito.** Grade inline continua permitida — há
 * dezenas delas em `app/`, cada uma de uma tela só, e proibi-las seria
 * trocar um defeito por um estorvo. O que não passa é o **espaçamento de
 * eixo zerado** em atalho de duas medidas: `gap: "0 16px"` e parentes. Em
 * grade de formulário isso é sempre erro; nas raras vezes em que for
 * intencional — uma faixa de uma linha só, onde não existe segunda linha
 * para respirar —, a exceção se declara em `EXCECOES`, com o motivo. A
 * lista está vazia, e é para continuar assim.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PASTAS = ["app", "conteudo", "design"];

/**
 * Espaçamento de eixo zerado em atalho de duas medidas, dentro de um
 * `style` de JSX: `gap: "0 16px"`, `gap: "12px 0"` e as variantes com
 * `rowGap`/`columnGap` explícitos não entram aqui — quem escreve o nome do
 * eixo está decidindo, não errando por atalho.
 */
const EIXO_ZERADO = /\bgap:\s*"(?:0(?:px)?\s+[^"]+|[^"\s]+\s+0(?:px)?)"/g;

/** Exceções declaradas: caminho e motivo. Vazia — e é o estado desejado. */
const EXCECOES: ReadonlyArray<{ arquivo: string; motivo: string }> = [];

function arquivosDeInterface(): string[] {
  const achados: string[] = [];
  const visitar = (pasta: string): void => {
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name !== "node_modules") {
          visitar(caminho);
        }
      } else if (/\.tsx?$/.test(entrada.name) && !entrada.name.includes(".test.")) {
        achados.push(caminho);
      }
    }
  };
  for (const pasta of PASTAS) {
    visitar(join(RAIZ, pasta));
  }
  return achados;
}

describe("geometria de formulário vive em classe, não em atributo style", () => {
  it("nenhum `gap` inline zera um dos eixos", () => {
    const dispensados = new Set(EXCECOES.map((excecao) => excecao.arquivo));
    const acusados: string[] = [];
    for (const caminho of arquivosDeInterface()) {
      const relativo = relative(RAIZ, caminho).split(sep).join("/");
      if (dispensados.has(relativo)) {
        continue;
      }
      for (const achado of readFileSync(caminho, "utf8").matchAll(EIXO_ZERADO)) {
        acusados.push(`${relativo}: ${achado[0]}`);
      }
    }
    expect(
      acusados,
      "gap inline com um eixo em zero — use .form-grid (ou declare a exceção com o motivo)",
    ).toEqual([]);
  });

  it("a classe que substituiu os três inlines existe, com a régua do .pm-grid", () => {
    // Se alguém apagar a classe, os três formulários voltam a não ter
    // espaçamento nenhum entre linhas — e sem esta asserção o teste acima
    // continuaria verde, porque não haveria inline para acusar.
    const css = readFileSync(join(RAIZ, "design", "dseed-admin.css"), "utf8");
    expect(css).toContain(
      ".form-grid{display:grid;grid-template-columns:1fr 1fr;row-gap:14px;column-gap:16px}",
    );
    expect(css).toContain(".form-grid-inteiro{grid-column:1 / -1}");
  });

  it("a classe NÃO usa !important — o colapso a 760px é do .g-resp", () => {
    // `.g-resp{display:flex!important}` é quem transforma a grade em pilha
    // no mobile. Se `.form-grid` viesse com `!important`, as duas colunas
    // sobreviveriam a 380px e a tela quebraria — o oposto do conserto.
    const css = readFileSync(join(RAIZ, "design", "dseed-admin.css"), "utf8");
    const bloco = css.slice(css.indexOf(".form-grid{"));
    expect(bloco.slice(0, bloco.indexOf("}") + 1)).not.toContain("!important");
    expect(css).toContain(".g-resp{display:flex!important;flex-direction:column!important}");
  });

  it("os três formulários da Onda 12 usam a classe, e não a geometria inline", () => {
    for (const caminho of [
      "app/(plataforma)/patrocinadores/formulario-patrocinador.tsx",
      "app/(plataforma)/patrocinadores/[id]/formularios-contrato.tsx",
      "app/(plataforma)/campanhas/[id]/modelagem.tsx",
    ]) {
      const fonte = readFileSync(join(RAIZ, caminho), "utf8");
      expect(fonte, caminho).toContain('className="g-resp form-grid"');
      expect(fonte, caminho).not.toContain('gridTemplateColumns: "1fr 1fr"');
    }
  });
});
