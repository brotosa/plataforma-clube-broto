import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Navegação que altera apenas a query string usa âncora nativa, não `<Link>`.**
 *
 * Invariante de arquitetura, no padrão das cercas da RN07/RN19/RN49: a regra
 * só sobrevive às próximas mudanças se o build quebrar quando alguém
 * reintroduzir um `<Link>` num controle de query.
 *
 * **O defeito que originou a regra.** Nas telas listadas abaixo, o `<Link>`
 * do App Router não confirmava a transição: interceptava o clique, buscava o
 * payload RSC (200, `text/x-component`) e o descartava — a URL não mudava e
 * a tela não repintava. Medido no alternador de modo da T30, que é o coração
 * da RN52: **12 falhas em 12 tentativas** com `<Link>`, **0 em 12** com
 * âncora.
 *
 * **Hipótese do mecanismo, NÃO confirmada:** o Router Cache do cliente
 * serviria a mesma rota sem round-trip, e a página, que lê `searchParams` no
 * servidor, não re-renderizaria.
 *
 * O que foi possível DESCARTAR, com página descartável isolada (6 tentativas
 * por variante, todas 6/6 confirmando a navegação):
 *
 *   - não é comportamento geral do `<Link>` para query-only nesta versão do
 *     Next — numa página mínima que lê `searchParams`, funciona;
 *   - não é o `prefetch` — com e sem `prefetch={false}`, funciona;
 *   - não é a presença de um `<Link>` para a própria rota na mesma página;
 *   - não é disputa com o prefetch de rotas irmãs pesadas.
 *
 * Ou seja: o gatilho é específico destas telas e não foi isolado. A âncora
 * está adotada porque **funciona e está medida**, não porque a causa esteja
 * entendida. Se o red team isolar o mecanismo, esta cerca é o lugar de
 * registrar a conclusão.
 *
 * O que esta cerca NÃO proíbe: `<Link>` para outra rota sem query. É o caso
 * comum e continua livre — inclusive nestas mesmas telas.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * As telas com controles de query, e a ROTA de cada uma.
 *
 * A rota importa porque a regra é sobre navegação que muda **apenas a
 * query**: ir de `/mercado` para `/aliados?categoria=…` é troca de rota e
 * sempre funcionou — proibir `<Link>` ali seria superstição, e ainda brigaria
 * com o `@next/next/no-html-link-for-pages`, que existe justamente para
 * manter `<Link>` na navegação entre páginas.
 *
 * Lista explícita, e não varredura do `app/` inteiro, porque a regra vale
 * onde o defeito foi medido. Tela nova com alternador por querystring entra
 * aqui, com a sua rota.
 */
const TELAS_COM_CONTROLE_DE_QUERY: ReadonlyArray<{ arquivo: string; rota: string }> = [
  // Componente compartilhado: serve Aliados (troca de rota) e Mercado (troca
  // de query). Sem rota própria — nele a âncora é exigida sempre, porque o
  // denominador comum das duas seções tem de ser a que funciona nas duas.
  { arquivo: "app/(plataforma)/segmentado-secao.tsx", rota: "*" },
  { arquivo: "app/(plataforma)/aliados/cobertura/page.tsx", rota: "/aliados/cobertura" },
  { arquivo: "app/(plataforma)/aliados/cobertura/painel-cobertura.tsx", rota: "/aliados/cobertura" },
  { arquivo: "app/(plataforma)/aliados/mapa/page.tsx", rota: "/aliados/mapa" },
  { arquivo: "app/(plataforma)/mercado/page.tsx", rota: "/mercado" },
  // Renderizado dentro da aba Cobertura da T8 — a rota dele é /mercado.
  { arquivo: "app/(plataforma)/mercado/mapa-cobertura.tsx", rota: "/mercado" },
  /**
   * Onda 9 (F16). O shell entra com rota `*` pela mesma razão do
   * segmentado: ele é renderizado em TODAS as telas, então nunca dá para
   * saber se um href com query é da rota corrente ou de outra. O "?" da
   * ajuda leva `?de=…#secao` e é âncora; a cerca existe para que a
   * próxima mão não o converta em `<Link>` por hábito.
   */
  { arquivo: "app/(plataforma)/shell-plataforma.tsx", rota: "*" },
  // A barra de volta leva a query da tela de origem (`/mercado?aba=metas`).
  { arquivo: "app/(plataforma)/ajuda/page.tsx", rota: "*" },
  /**
   * Onda 12 (F19). A T32 tem chips de status e de vigência em alerta; a
   * T33 tem o segmentado das quatro abas. Ambos alteram apenas a query da
   * própria rota, então entram aqui junto com as telas — que é o que o
   * cabeçalho desta cerca pede de tela nova com controle de query.
   */
  { arquivo: "app/(plataforma)/patrocinadores/page.tsx", rota: "/patrocinadores" },
  { arquivo: "app/(plataforma)/patrocinadores/[id]/page.tsx", rota: "/patrocinadores" },
  /**
   * Melhoria de 28/08. A T4 (Ofertas) ganhou cabeçalhos ordenáveis e um
   * filtro por vigência/telemetria, todos por querystring da própria rota:
   * a ordenação é âncora nativa (`href={urlDeOrdem(...)}`) e o filtro é
   * `<form method="get">`. Entra aqui para que a próxima mão não converta um
   * cabeçalho em `<Link>` por hábito — o `urlDeOrdem` está nos construtores.
   */
  { arquivo: "app/(plataforma)/ofertas/page.tsx", rota: "/ofertas" },
];

/**
 * `href` de um `<Link>`, seja literal (`"…"`), template (`` `…` ``) ou
 * expressão (`{…}`).
 */
const LINK_COM_HREF = /<Link\b[^>]*?href=(\{[^}]*\}|"[^"]*")/gs;

/**
 * Uma query de verdade: `?` seguido de nome de parâmetro e `=`.
 *
 * O `?` sozinho não serve como sinal — `href={x ? "/a" : "/b"}` é ternário,
 * não querystring, e um teste que confunde os dois vira ruído que a equipe
 * aprende a ignorar.
 */
const QUERY_LITERAL_COM_CAMINHO = /(\/[\w/[\]-]*)\?[A-Za-z_][\w-]*=/;

/**
 * Construtores de URL com query destas telas.
 *
 * Sem esta lista a cerca é cega justamente onde mais importa: o alternador
 * de modo da T30 — o controle em que o defeito foi medido — usa
 * `href={comUrl({ modo: … })}`, e não há `?` algum no texto do `href`. Foi
 * exatamente isso que a primeira versão desta cerca deixou passar quando
 * testada com um `<Link>` reintroduzido de propósito.
 *
 * Construtor novo entra aqui junto com a tela.
 */
const CONSTRUTORES_DE_URL = ["comUrl", "comFiltro", "urlCom", "urlDeOrdem"];

/**
 * O href muda apenas a query da PRÓPRIA rota?
 *
 * Duas formas, e a cerca precisa das duas: href literal cujo caminho é a
 * rota da tela (`"/mercado?categoria=…"` dentro de `/mercado`), e href vindo
 * de um construtor, que por definição reconstrói a rota corrente. Foi a
 * segunda que a primeira versão desta cerca deixou passar quando testada com
 * um `<Link>` reintroduzido de propósito — o alternador da T30 usa
 * `href={comUrl({ modo: … })}` e não tem `?` algum no texto.
 */
function mudaApenasAQuery(href: string, rota: string): boolean {
  const porConstrutor = CONSTRUTORES_DE_URL.some((construtor) =>
    new RegExp(`\\b${construtor}\\s*\\(`).test(href),
  );
  if (porConstrutor) {
    return true;
  }
  const literal = href.match(QUERY_LITERAL_COM_CAMINHO);
  if (!literal) {
    return false;
  }
  return rota === "*" || literal[1] === rota;
}

function conteudo(caminhoRelativo: string): string {
  return readFileSync(join(RAIZ, caminhoRelativo), "utf8");
}

describe("navegação por query string usa âncora nativa, não <Link>", () => {
  it("nenhum <Link> carrega querystring nas telas com controle de query", () => {
    const violacoes: string[] = [];
    for (const { arquivo, rota } of TELAS_COM_CONTROLE_DE_QUERY) {
      for (const ocorrencia of conteudo(arquivo).matchAll(LINK_COM_HREF)) {
        const href = ocorrencia[1] ?? "";
        if (mudaApenasAQuery(href, rota)) {
          violacoes.push(`${arquivo}: <Link href=${href.replace(/\s+/g, " ").slice(0, 70)}`);
        }
      }
    }
    expect(
      violacoes,
      `Use <a> em vez de <Link> nestes destinos — o <Link> não confirma a ` +
        `troca de query nestas telas (12/12 falhas medidas):\n${violacoes.join("\n")}`,
    ).toEqual([]);
  });

  it("os controles de query realmente existem — a cerca não pode virar teste vazio", () => {
    // Se alguém remover os controles, a cerca acima passaria por ausência de
    // alvo. Estes são os destinos que a Onda 7 depende que funcionem.
    const esperados: ReadonlyArray<[string, RegExp]> = [
      ["app/(plataforma)/aliados/mapa/page.tsx", /modo: opcao === "SEDE"/],
      ["app/(plataforma)/aliados/cobertura/page.tsx", /comFiltro\(\{ visao: "solucoes" \}\)/],
      ["app/(plataforma)/mercado/page.tsx", /urlCom\(\{ visao: "tabela" \}\)/],
      ["app/(plataforma)/mercado/mapa-cobertura.tsx", /\/mercado\?categoria=/],
      ["app/(plataforma)/aliados/cobertura/painel-cobertura.tsx", /\/mercado\?categoria=/],
      ["app/(plataforma)/segmentado-secao.tsx", /VISOES_DE_MERCADO/],
      ["app/(plataforma)/ofertas/page.tsx", /href=\{urlDeOrdem\(coluna\)\}/],
    ];
    const ausentes = esperados
      .filter(([arquivo, marca]) => !marca.test(conteudo(arquivo)))
      .map(([arquivo, marca]) => `${arquivo} não contém ${marca}`);
    expect(ausentes, ausentes.join("\n")).toEqual([]);
  });

  it("a cerca enxerga as duas formas de href, e só a MESMA rota", () => {
    // Cerca que só pega a forma óbvia dá falsa segurança; cerca que pega
    // demais vira ruído que a equipe aprende a ignorar. Os dois lados:
    expect(mudaApenasAQuery('"/mercado?categoria=abc"', "/mercado")).toBe(true);
    expect(mudaApenasAQuery("{`/mercado?categoria=${id}`}", "/mercado")).toBe(true);
    expect(mudaApenasAQuery("{comUrl({ modo: opcao })}", "/aliados/mapa")).toBe(true);
    expect(mudaApenasAQuery("{comFiltro({ visao: undefined })}", "/aliados/cobertura")).toBe(true);
    expect(mudaApenasAQuery('{urlCom({ visao: "tabela" })}', "/mercado")).toBe(true);
    expect(mudaApenasAQuery('{urlDeOrdem("emitidos")}', "/ofertas")).toBe(true);

    // Troca de ROTA com query sempre funcionou — e o
    // `@next/next/no-html-link-for-pages` exige <Link> nela.
    expect(mudaApenasAQuery('"/aliados?estagio=ALIADA_ATIVA"', "/mercado")).toBe(false);
    expect(mudaApenasAQuery("{`/mercado/radar?categoria=${id}`}", "/mercado")).toBe(false);
    // Ternário não é querystring; rota sem query não é assunto desta cerca.
    expect(mudaApenasAQuery('{x ? "/a" : "/b"}', "/mercado")).toBe(false);
    expect(mudaApenasAQuery('"/aliados/novo"', "/aliados/cobertura")).toBe(false);
  });

  it("o segmentado de seção — usado pelas duas seções — não importa Link", () => {
    // Ele serve Aliados (troca de rota) e Mercado (troca de query). Um só
    // componente, e o denominador comum tem de ser a âncora.
    const texto = conteudo("app/(plataforma)/segmentado-secao.tsx");
    expect(texto).not.toMatch(/from "next\/link"/);
    expect(texto).toMatch(/<a\b/);
  });

  it("o seletor de período do dashboard navega por window.location, não por router", () => {
    // Mesmo defeito do <Link>, por outra porta: o seletor da HOME é um
    // <select> (não dá para ser âncora), e `router.push`/`router.replace`
    // para mudar só a query cai no mesmo Router Cache — o período mudava na
    // URL e não nos números. A correção é navegação real por window.location.
    const texto = conteudo("app/(plataforma)/painel-dashboard.tsx");
    expect(texto).toMatch(/window\.location\.assign\(`\/\?periodo=/);
    expect(texto, "o seletor de período não pode voltar a usar router.push/replace").not.toMatch(
      /router\.(push|replace)\(`?\/\?periodo=/,
    );
  });

  it("a convenção está escrita no CLAUDE.md, com a hipótese declarada como hipótese", () => {
    // Cerca sem regra escrita é armadilha: quem tropeça nela precisa achar o
    // porquê sem arqueologia de git.
    const claude = conteudo("CLAUDE.md");
    expect(claude).toMatch(/apenas a query string usa âncora nativa/i);
    expect(claude).toMatch(/hip[óo]tese/i);
    expect(claude).toMatch(/n[ãa]o (foi )?confirmad/i);
  });
});
