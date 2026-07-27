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

/**
 * As doze seções do documento entregue pelo Design na Onda 9.
 *
 * A fidelidade frase por frase é exigida **destas**, e só destas: elas têm
 * contraparte em `docs/referencias/Guia_da_Plataforma_v1.html`, e é contra
 * ela que se comparam.
 */
const SECOES_DA_REFERENCIA = [
  "oquee",
  "vocab",
  "princ",
  "j1",
  "j2",
  "j3",
  "j4",
  "j5",
  "j6",
  "papeis",
  "faltam",
  "glossario",
] as const;

/**
 * Seções nascidas DEPOIS do documento de referência, com a onda que as
 * pediu.
 *
 * A RN58 diz que o texto do guia é imutável e vem do documento entregue —
 * e continua valendo para as doze acima. Mas o guia é do produto, e o
 * produto ganhou um módulo: a ficha da Onda 12 §5 pede a seção 4.7. Ela
 * não tem contraparte na referência, que é da Onda 9, então o texto foi
 * redigido na fase, na voz do guia.
 *
 * O que a RN58 exige e continua garantido: **fonte única**. A 4.7 vive em
 * `secoes.html` como todas as outras, e a rota e o documento autônomo
 * montam dela — não há segunda cópia. O que muda é só a origem editorial,
 * e está declarada aqui em vez de silenciosamente tolerada.
 *
 * Seção nova de onda futura entra nesta lista, com o mesmo raciocínio
 * escrito. Se algum dia o Design entregar um guia v2 que já a contenha,
 * ela migra para `SECOES_DA_REFERENCIA` e volta a ser cobrada frase por
 * frase.
 */
const SECOES_NASCIDAS_DEPOIS: ReadonlyArray<{ id: string; onda: string }> = [
  { id: "j7", onda: "Onda 12 · Patrocinadores (ficha §5)" },
];

describe("RN58 — as seções do guia, com suas âncoras", () => {
  const { secoes } = carregarGuia();

  it("o sumário e o conteúdo declaram exatamente as mesmas seções, na mesma ordem", () => {
    const noConteudo = [...secoes.matchAll(/<section class="gd-sec" id="([a-z0-9]+)"/g)].map(
      (achado) => achado[1],
    );
    expect(noConteudo).toEqual(INDICE_DO_GUIA.map((entrada) => entrada.id));
  });

  it("toda seção ou vem da referência, ou está declarada como nascida depois", () => {
    const conhecidas = new Set<string>([
      ...SECOES_DA_REFERENCIA,
      ...SECOES_NASCIDAS_DEPOIS.map((secao) => secao.id),
    ]);
    const semOrigem = INDICE_DO_GUIA.filter((entrada) => !conhecidas.has(entrada.id));
    expect(
      semOrigem.map((entrada) => entrada.id),
      "seção sem origem declarada — acrescente à referência ou a SECOES_NASCIDAS_DEPOIS",
    ).toEqual([]);
    // E as doze da referência continuam todas lá, na ordem original.
    const doDocumento = INDICE_DO_GUIA.map((entrada) => entrada.id).filter((id) =>
      (SECOES_DA_REFERENCIA as ReadonlyArray<string>).includes(id),
    );
    expect(doDocumento).toEqual([...SECOES_DA_REFERENCIA]);
  });

  it("as âncoras do protótipo continuam valendo — /ajuda#j4 é endereço publicado", () => {
    for (const id of ["oquee", "vocab", "princ", "j1", "j2", "j3", "j4", "j5", "j6", "papeis", "faltam", "glossario"]) {
      expect(secoes, `âncora #${id}`).toContain(`id="${id}"`);
    }
  });

  /**
   * A única divergência deliberada de marcação em relação ao documento
   * entregue — e ela é de nível, não de texto.
   *
   * O original usava `<h4>` para o subtítulo do cartão e para o item de
   * princípio, ambos logo depois do `<h2>` da seção: salto de nível que o
   * axe reprova (heading-order) e que a política AAA da plataforma não
   * admite. Promovidos a `<h3>`, com o CSS distinguindo por contexto para
   * a aparência não mudar.
   *
   * Este teste existe porque a correção é fácil de desfazer sem querer:
   * quem comparar a transcrição com o documento e vir `h3` onde havia `h4`
   * vai achar que é erro de transcrição. Não é.
   */
  it("nenhum cabeçalho pula nível — a correção de AAA não se desfaz", () => {
    expect(secoes).not.toContain("<h4");
    for (const bloco of secoes.matchAll(
      /<section class="gd-sec" id="([a-z0-9]+)">([\s\S]*?)<\/section>/g,
    )) {
      const niveis = [...(bloco[2] ?? "").matchAll(/<(h[1-6])[\s>]/g)].map((achado) =>
        Number((achado[1] ?? "h2").slice(1)),
      );
      expect(niveis[0], `primeiro cabeçalho de #${bloco[1]}`).toBe(2);
      for (const [indice, nivel] of niveis.entries()) {
        const anterior = niveis[indice - 1] ?? nivel;
        expect(nivel - anterior, `salto de nível em #${bloco[1]}`).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * A primeira versão desta verificação procurava só atributos (`sc-camel-`,
   * `{{ }}`) e deu tudo certo — enquanto as quatro tabelas do guia estavam
   * transcritas como `<sc-raw-table>`, elemento que o navegador trata como
   * desconhecido e desenha em linha. No desktop nada gritava: o texto
   * aparecia, o axe não reprova elemento que não conhece. Quem achou foi o
   * teste de 380px, ao procurar o colapso em cards que nunca ia acontecer.
   *
   * Por isso a cerca passou a olhar **tags**, e de forma genérica: qualquer
   * elemento com hífen no nome é componente, e componente não sobrevive à
   * transcrição.
   */
  it("nenhum resto de linguagem de protótipo sobreviveu à transcrição", () => {
    const { capa } = carregarGuia();
    for (const documento of [secoes, capa]) {
      for (const resto of ["sc-for", "sc-if", "sc-camel", "sc-raw", "{{", "}}"]) {
        expect(documento, resto).not.toContain(resto);
      }
      const comHifen = [...documento.matchAll(/<\/?([a-z][\w-]*)[\s>/]/g)]
        .map((achado) => achado[1] ?? "")
        .filter((tag) => tag.includes("-"));
      expect([...new Set(comHifen)], "elementos que não são HTML").toEqual([]);
    }
  });

  it("as quatro tabelas do guia são tabelas de verdade, no padrão responsivo", () => {
    expect(secoes.match(/<table class="tbl tbl-resp">/g) ?? []).toHaveLength(4);
    // Rótulo de coluna por célula é o que faz o colapso a 380px funcionar.
    const corpos = [...secoes.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
    expect(corpos).toHaveLength(4);
    for (const corpo of corpos) {
      const celulas = [...(corpo[1] ?? "").matchAll(/<td\b([^>]*)>/g)].map((a) => a[1] ?? "");
      // A primeira célula da linha é o próprio rótulo da linha; as demais
      // precisam declarar a coluna a que pertencem.
      const semRotulo = celulas.filter((atributos) => !atributos.includes("data-label"));
      expect(semRotulo.length, "células sem data-label").toBeLessThanOrEqual(
        (corpo[1] ?? "").match(/<tr>/g)?.length ?? 0,
      );
    }
  });
});

describe("RN58 — o texto é o do documento entregue, frase por frase", () => {
  const referencia = templateDaReferencia();
  const { capa, secoes } = carregarGuia();

  it.each(
    INDICE_DO_GUIA.filter((entrada) =>
      (SECOES_DA_REFERENCIA as ReadonlyArray<string>).includes(entrada.id),
    ).map((entrada) => [entrada.id, entrada.rotulo] as const),
  )("§%s (%s) transcrita sem uma palavra alterada", (id) => {
    const naReferencia = texto(secao(referencia, id));
    expect(naReferencia.length, `seção ${id} encontrada na referência`).toBeGreaterThan(100);
    expect(texto(secao(secoes, id))).toBe(naReferencia);
  });

  /**
   * A contrapartida: seção nascida depois do documento **não** pode ter
   * contraparte na referência. Se tiver, alguém a transcreveu por outro
   * caminho e a lista `SECOES_NASCIDAS_DEPOIS` está mentindo.
   */
  it.each(SECOES_NASCIDAS_DEPOIS.map((secaoNova) => [secaoNova.id, secaoNova.onda] as const))(
    "§%s nasceu na %s — existe na fonte e não na referência",
    (id) => {
      expect(texto(secao(referencia, id))).toBe("");
      expect(texto(secao(secoes, id)).length, `seção ${id} na fonte`).toBeGreaterThan(100);
    },
  );

  it("a capa também é transcrição", () => {
    const inicio = referencia.indexOf('<header class="gd-capa">');
    const fim = referencia.indexOf("</header>", inicio);
    expect(texto(capa)).toBe(texto(referencia.slice(inicio, fim)));
  });

  it("os rótulos do sumário são os do documento", () => {
    const naReferencia = referencia.slice(referencia.indexOf("SECOES = ["));
    for (const entrada of INDICE_DO_GUIA.filter((candidata) =>
      (SECOES_DA_REFERENCIA as ReadonlyArray<string>).includes(candidata.id),
    )) {
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
  /**
   * O bloco do guia vai do marcador dele até o **próximo** bloco de
   * extensão — e não até o fim do arquivo.
   *
   * Até a Onda 11 o guia era o último bloco do `dseed-admin.css`, e cortar
   * no fim dava no mesmo. A Onda 12 acrescentou `Extensão (Onda 12 ·
   * Patrocinadores)` depois dele, e o corte antigo passou a reprovar
   * `.pt-drop` por "seletor do guia sem escopo `.gd`" — o que é falso: ele
   * não é do guia. A cerca continua exigindo o mesmo do guia; só passou a
   * saber onde ele termina.
   */
  const inicioDoBloco = css.indexOf("Extensão (Guia da Plataforma");
  const proximaExtensao = css.indexOf("/* ---- Extensão (", inicioDoBloco + 1);
  const bloco = css.slice(
    inicioDoBloco,
    proximaExtensao === -1 ? undefined : proximaExtensao,
  );

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
