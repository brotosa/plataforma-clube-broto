import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CAMINHO_DO_AUTONOMO, montarDocumentoAutonomo } from "@/conteudo/guia-plataforma/autonomo";
import { carregarGuia } from "@/conteudo/guia-plataforma/guia";
import { INDICE_DO_GUIA } from "@/conteudo/guia-plataforma/indice";
import { montarGuiaHtml } from "@/conteudo/guia-plataforma/montar";

/**
 * RN58 — o guia tem uma fonte só, e o texto dela é imutável.
 *
 * Três invariantes que nenhum teste de comportamento cobriria:
 *
 *  - **Fidelidade.** O texto que a plataforma exibe é o que o Design
 *    entregou em `docs/referencias/Guia_da_Plataforma_v1.html`, frase por
 *    frase. A ficha §1.5 é explícita: a implementação transcreve, não
 *    reescreve, e "divergência de uma frase é regressão". Sem este teste,
 *    a transcrição seria verificada uma vez e nunca mais.
 *
 *  - **Sincronia.** O documento autônomo commitado é exatamente o que a
 *    fonte de hoje gera. É o risco real de o arquivo que circula
 *    envelhecer sem ninguém notar — quem corrige o texto e esquece de
 *    regerar descobre aqui, não pelo leitor que recebeu o PDF antigo.
 *
 *  - **Escopo.** A camada de leitura não vale fora do documento.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REFERENCIA = "docs/referencias/Guia_da_Plataforma_v1.html";

function ler(caminhoRelativo: string): string {
  return readFileSync(join(RAIZ, caminhoRelativo), "utf8");
}

/**
 * O documento de referência é um HTML empacotado: o conteúdo servido ao
 * leitor vem de um `<script type="__bundler/template">` com uma string
 * JSON. Desempacotar aqui é o que permite comparar com a transcrição sem
 * confiar na memória de quem transcreveu.
 */
function templateDaReferencia(): string {
  const linhas = ler(REFERENCIA).split("\n");
  // A tag de abertura, e não a linha do desempacotador que a procura por
  // `querySelector` — as duas contêm o mesmo texto.
  const marcador = linhas.findIndex(
    (linha) => linha.trim() === '<script type="__bundler/template">',
  );
  expect(marcador, "marcador do template no documento de referência").toBeGreaterThan(-1);
  const bruto = linhas[marcador + 1];
  expect(bruto, "conteúdo do template").toBeTruthy();
  return JSON.parse(bruto ?? "") as string;
}

/** Texto visível, com espaços normalizados — a comparação que interessa. */
function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Recorta uma `<section class="gd-sec" id="...">` de um HTML qualquer. */
function secao(html: string, id: string): string {
  const inicio = html.indexOf(`<section class="gd-sec" id="${id}">`);
  if (inicio === -1) {
    return "";
  }
  const fim = html.indexOf("</section>", inicio);
  return html.slice(inicio, fim === -1 ? undefined : fim);
}

describe("RN58 — as doze seções do guia, com suas âncoras", () => {
  const { secoes } = carregarGuia();

  it("o sumário e o conteúdo declaram exatamente as mesmas doze seções", () => {
    const noConteudo = [...secoes.matchAll(/<section class="gd-sec" id="([a-z0-9]+)"/g)].map(
      (achado) => achado[1],
    );
    expect(noConteudo).toEqual(INDICE_DO_GUIA.map((entrada) => entrada.id));
    expect(noConteudo).toHaveLength(12);
  });

  it("as âncoras do protótipo continuam valendo — /ajuda#j4 é endereço publicado", () => {
    for (const id of ["oquee", "vocab", "princ", "j1", "j2", "j3", "j4", "j5", "j6", "papeis", "faltam", "glossario"]) {
      expect(secoes, `âncora #${id}`).toContain(`id="${id}"`);
    }
  });

  it("nenhum resto de linguagem de protótipo sobreviveu à transcrição", () => {
    const { capa } = carregarGuia();
    for (const resto of ["sc-for", "sc-if", "sc-camel", "{{", "}}"]) {
      expect(secoes, resto).not.toContain(resto);
      expect(capa, resto).not.toContain(resto);
    }
  });
});

describe("RN58 — o texto é o do documento entregue, frase por frase", () => {
  const referencia = templateDaReferencia();
  const { capa, secoes } = carregarGuia();

  it.each(INDICE_DO_GUIA.map((entrada) => [entrada.id, entrada.rotulo] as const))(
    "§%s (%s) transcrita sem uma palavra alterada",
    (id) => {
      const naReferencia = texto(secao(referencia, id));
      expect(naReferencia.length, `seção ${id} encontrada na referência`).toBeGreaterThan(100);
      expect(texto(secao(secoes, id))).toBe(naReferencia);
    },
  );

  it("a capa também é transcrição", () => {
    const inicio = referencia.indexOf('<header class="gd-capa">');
    const fim = referencia.indexOf("</header>", inicio);
    expect(texto(capa)).toBe(texto(referencia.slice(inicio, fim)));
  });

  it("os rótulos do sumário são os do documento", () => {
    const naReferencia = referencia.slice(referencia.indexOf("SECOES = ["));
    for (const entrada of INDICE_DO_GUIA) {
      // No documento a lista vive no script do componente, como trio
      // [grupo, id, rótulo].
      expect(naReferencia, `sumário de ${entrada.id}`).toContain(
        `['${entrada.grupo}', '${entrada.id}', '${entrada.rotulo}']`,
      );
    }
  });
});

describe("RN58 — fonte única: a rota e o documento autônomo montam do mesmo lugar", () => {
  it("o documento autônomo commitado é o que a fonte de hoje gera", () => {
    // Falhou? O conteúdo mudou e o autônomo ficou para trás: rode
    // `pnpm guia:gerar` e commite o resultado.
    expect(ler(CAMINHO_DO_AUTONOMO)).toBe(montarDocumentoAutonomo());
  });

  it("o autônomo carrega o mesmo miolo que a rota", () => {
    expect(ler(CAMINHO_DO_AUTONOMO)).toContain(montarGuiaHtml());
  });

  it("o autônomo viaja sozinho — estilos e fontes embutidos", () => {
    const documento = ler(CAMINHO_DO_AUTONOMO);
    expect(documento).not.toContain('url("/fontes/');
    expect(documento.match(/data:font\/woff2/g) ?? []).toHaveLength(4);
    expect(documento).not.toContain("<link");
  });

  it("o autônomo é determinístico — duas gerações dão o mesmo arquivo", () => {
    // Sem isto, a sincronia acima seria impossível de manter: qualquer
    // data ou hash de build faria o teste reprovar a cada execução.
    expect(montarDocumentoAutonomo()).toBe(montarDocumentoAutonomo());
  });

  it("o texto do guia não existe em nenhuma segunda cópia no repositório", () => {
    // Uma frase de assinatura do guia, procurada onde ela não pode estar.
    const frase = "A Broto decide e modela; a Minutrade executa e opera.";
    const permitidos = [
      "conteudo/guia-plataforma/secoes.html", // a fonte
      CAMINHO_DO_AUTONOMO, // o gerado, que sai dela
      REFERENCIA, // o documento entregue pelo Design
    ];
    for (const caminho of permitidos) {
      expect(ler(caminho), caminho).toContain(frase);
    }
    for (const caminho of [
      "app/(plataforma)/ajuda/page.tsx",
      "conteudo/guia-plataforma/montar.ts",
      "conteudo/guia-plataforma/autonomo.ts",
    ]) {
      expect(ler(caminho), caminho).not.toContain(frase);
    }
  });
});

describe("RN58 — a camada de leitura não vaza para o resto da plataforma", () => {
  const css = ler("design/dseed-admin.css");
  const bloco = css.slice(css.indexOf("Extensão (Guia da Plataforma"));

  it("o bloco do guia existe e vem depois do resto", () => {
    expect(bloco.length).toBeGreaterThan(1000);
  });

  it("nenhum seletor do bloco do guia se aplica fora de .gd", () => {
    const seletores = new Set<string>();
    for (const achado of bloco.matchAll(/(^|\n)([^@\n{][^{\n]*)\{/g)) {
      for (const parte of (achado[2] ?? "").split(",")) {
        const limpo = parte.trim();
        if (limpo) {
          seletores.add(limpo);
        }
      }
    }
    expect(seletores.size).toBeGreaterThan(20);
    const foraDeEscopo = [...seletores].filter((s) => !s.startsWith(".gd"));
    expect(foraDeEscopo, "seletores do guia sem escopo .gd").toEqual([]);
  });

  it("a tipografia de leitura só existe dentro de .gd", () => {
    // 16px/1,7 é a medida do documento; o produto lê 14/24 e continua
    // lendo, porque a regra nasce presa ao `.gd-doc`.
    expect(bloco).toContain(".gd-doc p,.gd-doc li,.gd-doc dd{font-size:16px;line-height:1.7");
  });

  it("tokens.css permanece intocado pela onda", () => {
    const tokens = ler("design/tokens.css");
    expect(tokens).not.toContain("gd-");
    expect(tokens).not.toContain("guia");
  });
});

describe("RN58 — a ajuda é leitura, para todos", () => {
  const pagina = ler("app/(plataforma)/ajuda/page.tsx");

  it("a rota não consulta o banco nem exibe dado da operação", () => {
    for (const proibido of ["prisma", "@/infra/consultas", "@/infra/db", "await consultar"]) {
      expect(pagina, proibido).not.toContain(proibido);
    }
  });

  it("a rota não exige papel algum", () => {
    for (const proibido of ["exigirPapel", "podeGerenciar", "autorizar", "@/dominio/autorizacao"]) {
      expect(pagina, proibido).not.toContain(proibido);
    }
  });

  it("não há caminho de escrita do conteúdo pela interface", () => {
    expect(pagina).not.toContain("use server");
    expect(pagina).not.toContain("<form");
  });
});
