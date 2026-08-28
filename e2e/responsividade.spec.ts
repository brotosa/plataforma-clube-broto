import { expect, test } from "@playwright/test";
import {
  prisma,
  entrar,
  runId,
  semRolagemHorizontal,
  semViolacoesAxe,
  tabelaColapsadaEmCards,
  semearAliadoAtivoComContrato,
  semearCampanhaRascunho,
  semearDecisaoDeAprovacao,
  semearOfertaPublicada,
  semearSolucaoCompleta,
} from "./ajudantes";
import { INDICE_DO_GUIA } from "@/conteudo/guia-plataforma/indice";

/**
 * Responsividade a 380px (F5) — o piso declarado no prompt da Onda 1:
 *
 *   "T1/T4/T6 plenamente usáveis a 380px; T2/T3/T5/T7 íntegras com aviso de
 *    edição preferencial em desktop."
 *
 * Roda no projeto `mobile-380` do playwright.config (viewport 380×740); as
 * demais suítes rodam em `desktop` e ignoram este arquivo.
 *
 * Disciplina de estabilidade (a mesma da estabilização do e2e): cada teste
 * semeia sua própria precondição de forma idempotente, nenhum depende de
 * outro, e não há `describe.serial`.
 *
 * "Plenamente usável" é verificado por três sinais objetivos, não por
 * inspeção visual:
 *  1. a página não rola na horizontal (nada some fora da viewport);
 *  2. as tabelas colapsam em cards — cabeçalho oculto e TODA célula com
 *     `data-label` (o rótulo que substitui a coluna);
 *  3. a navegação por gaveta abre e fecha, inclusive por teclado.
 */

test.describe("responsividade a 380px — T1/T4/T6 plenamente usáveis", () => {
  for (const [tela, rota] of [
    ["T1 — Aliados", "/aliados"],
    ["T4 — Ofertas", "/ofertas"],
    ["T6 — Aprovações", "/aprovacoes"],
  ] as const) {
    test(`${tela} colapsa em cards, sem rolagem horizontal`, async ({ page }) => {
      // Precondição própria: uma oferta publicada garante linha em T1 e T4; a
      // decisão registrada faz a T6 renderizar a tabela de histórico (com a
      // fila vazia ela mostra só o estado vazio, e não haveria o que medir).
      const nome = `Aliado E2E ${runId()}-380-${rota.replace(/\W/g, "")}`;
      const aliado = await semearAliadoAtivoComContrato(nome);
      const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);
      await semearOfertaPublicada(solucao.id, `Oferta ${nome}`);
      await semearDecisaoDeAprovacao(aliado.id);

      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(rota);
      await page.getByRole("heading", { level: 1 }).first().waitFor();

      await semRolagemHorizontal(page);
      await tabelaColapsadaEmCards(page);
    });
  }

  test("T4 mantém a coluna Natureza como rótulo do card (ficha §3.3)", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-380-natureza`;
    const aliado = await semearAliadoAtivoComContrato(nome);
    const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);
    await semearOfertaPublicada(solucao.id, `Oferta ${nome}`);

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ofertas");
    await expect(page.locator('td[data-label="Natureza"]').first()).toBeVisible();
  });

  test("gaveta de navegação abre e fecha por teclado", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    const abrir = page.getByRole("button", { name: "Abrir menu" });
    await expect(abrir).toBeVisible(); // só existe abaixo de 760px
    await abrir.focus();
    await page.keyboard.press("Enter");

    const modulos = page.getByRole("navigation", { name: "Módulos" });
    await expect(modulos.getByRole("link", { name: "Ofertas" })).toBeVisible();

    const fechar = page.getByRole("button", { name: "Fechar menu" });
    await fechar.focus();
    await page.keyboard.press("Enter");
    await expect(fechar).toHaveCount(0);
  });

  test("axe-core (AAA) sem violações em T1/T4/T6 a 380px", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    for (const rota of ["/aliados", "/ofertas", "/aprovacoes"]) {
      await page.goto(rota);
      await semViolacoesAxe(page);
    }
  });
});

/**
 * Ondas 3 e 4 a 380px (F5 sobre o produto completo).
 *
 * O critério do prompt da Onda 1 nomeia T1–T7 porque era o que existia; a
 * disciplina, não a lista, é que é o entregável da F5 — toda tela do produto
 * cabe na viewport, e o que for tabela colapsa em cards. As telas novas
 * entram aqui sob os MESMOS sinais objetivos.
 *
 * O axe AAA das Ondas 3 e 4 já roda em `parametrizador.spec.ts` e
 * `campanhas.spec.ts`, que adotaram o ajudante `semViolacoesAxe` da F5 — mas
 * no viewport de desktop. A 380px o layout é outro (gaveta no lugar da
 * sidebar, tabela em cards), então a varredura precisa acontecer AQUI também:
 * é literalmente outra árvore de acessibilidade.
 */
test.describe("responsividade a 380px — Ondas 3 e 4", () => {
  const ADMIN = "administrador@dev.clubebroto.local";

  // T15 (hub), T16 (editor de lista) e T17 (valores de regra). Sem tabela:
  // o Parametrizador usa cartões, então o sinal é caber e passar em AAA.
  for (const [tela, rota] of [
    ["T15 — hub do Parametrizador", "/parametrizador"],
    ["T16 — editor de lista (culturas)", "/parametrizador/listas/culturas"],
    ["T17 — valores de regra", "/parametrizador/valores"],
  ] as const) {
    test(`${tela} cabe a 380px e passa em AAA`, async ({ page }) => {
      await entrar(page, ADMIN);
      await page.goto(rota);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await semRolagemHorizontal(page);
      await semViolacoesAxe(page);
    });
  }

  test("T22 — Campanhas colapsa em cards, sem rolagem horizontal, e passa em AAA", async ({
    page,
  }) => {
    // Precondição PRÓPRIA: sem uma campanha a T22 mostra só o estado vazio e
    // não haveria tabela para medir. Semear aqui evita a asserção condicional
    // que "passa" sem ter verificado nada — a F12 cobre a T22 a 380px, mas em
    // visibilidade e AAA; o colapso em cards e o estouro horizontal, não.
    await semearCampanhaRascunho(`Campanha E2E ${runId()}-380`);

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas");
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await semViolacoesAxe(page);
  });

  test("Cestas cabe a 380px e passa em AAA", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas/cestas");
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });
});

test.describe("responsividade a 380px — T2/T3/T5/T7 íntegras com aviso", () => {
  const AVISO = /Edição preferencial em desktop/;

  test("T2 (ficha do aliado) e T3/T5 (formulários) exibem o aviso e ficam íntegras", async ({
    page,
  }) => {
    const nome = `Aliado E2E ${runId()}-380-formularios`;
    const aliado = await semearAliadoAtivoComContrato(nome);
    const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);
    const oferta = await semearOfertaPublicada(solucao.id, `Oferta ${nome}`);

    await entrar(page, "gestor@dev.clubebroto.local");

    for (const [tela, rota] of [
      ["T2", `/aliados/${aliado.id}`],
      ["T2 (editar)", `/aliados/${aliado.id}/editar`],
      ["T3", `/aliados/${aliado.id}/solucoes/nova`],
      ["T5", `/aliados/${aliado.id}/solucoes/${solucao.id}/ofertas/nova`],
      ["T5 (editar)", `/ofertas/${oferta.id}/editar`],
    ] as const) {
      await page.goto(rota);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await expect(page.getByText(AVISO), `aviso em ${tela}`).toBeVisible();
      await semRolagemHorizontal(page);
      // O aviso só existe abaixo de 760px, então ele NUNCA é varrido pela
      // auditoria de desktop — a varredura AAA precisa acontecer aqui.
      await semViolacoesAxe(page);
    }
  });

  test("T7 exibe o aviso de configuração e o interruptor segue operável por teclado", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/aprovacoes/regras");
    await expect(page.getByText("Configuração preferencial em desktop.")).toBeVisible();
    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);

    // Íntegra = o controle continua alcançável e acionável no viewport estreito.
    const interruptor = page.getByRole("switch").first();
    await interruptor.focus();
    await expect(interruptor).toBeFocused();
  });
});

/**
 * Onda 6 a 380px (F13) — a T26 é a HOME, então é a primeira tela que
 * qualquer pessoa vê em qualquer aparelho. O prompt da Onda 6 pede que ela
 * seja **plena** a 380px, e não apenas íntegra: nada de aviso de "edição
 * preferencial em desktop" aqui.
 *
 * A T28 é tabela e cai no mesmo sinal das demais tabelas do produto: colapsa
 * em cards. A T27 também é tabela, mas com ações por linha — o que se mede
 * nela é caber e continuar operável.
 */
test.describe("responsividade a 380px — Onda 6", () => {
  const ADMIN_ONDA6 = "administrador@dev.clubebroto.local";

  test("T26 — Dashboard pleno a 380px: as duas camadas cabem e passam em AAA", async ({
    page,
  }) => {
    await entrar(page, ADMIN_ONDA6);

    await expect(page.getByRole("heading", { level: 1, name: "O Clube hoje" })).toBeVisible();
    // O título da camada 2 mudou na F14 ("Pendências · exige ação hoje",
    // ficha Onda 7 §6) porque as pendências saíram do hero e viraram seção
    // própria; a exigência a 380px é a mesma.
    await expect(page.getByRole("heading", { name: /Pendências/ })).toBeVisible();
    // O panorama de oito células cabe na coluna única (Onda 7 §6).
    await expect(page.locator(".dash-stats .dash-stat")).toHaveCount(8);

    // Acabamento pós-Onda 7: no estreito a grade colapsa em UMA coluna (a
    // consulta de 520px do v9.1), e a marca d'água CONTINUA — o protótipo
    // apenas a reduz de 280px para 200px na consulta de 760px, não a remove.
    const hero = await page.evaluate(() => {
      const stats = document.querySelector(".dash-stats")!;
      const marca = document.querySelector(".dash-marca") as HTMLElement | null;
      return {
        colunas: getComputedStyle(stats).gridTemplateColumns.split(" ").length,
        marcaPresente: Boolean(marca),
        alturaDaMarca: marca ? Math.round(marca.getBoundingClientRect().height) : 0,
        heroCorta: getComputedStyle(document.querySelector(".dash-hero")!).overflowX,
      };
    });
    expect(hero.colunas).toBe(1);
    expect(hero.marcaPresente).toBe(true);
    expect(hero.alturaDaMarca).toBe(200);
    // A marca sangra 40px além da borda direita POR DESENHO (`right:-40px`);
    // quem a contém é o `overflow:hidden` do hero. Medir `scrollWidth` aqui
    // acusaria esse sangramento intencional — o que importa é a página não
    // rolar, e disso cuida o `semRolagemHorizontal` ao fim do teste.
    expect(hero.heroCorta).toBe("hidden");
    // Os quatro blocos da ficha §2 continuam presentes — a 380px o grid
    // vira uma coluna, mas nenhum bloco é escondido.
    for (const bloco of ["Rede e Aliados", "Mercado e Funil", "Assinantes e Uso", "Campanhas"]) {
      await expect(page.getByRole("heading", { name: bloco, exact: true })).toBeVisible();
    }
    // Pleno: o seletor de período segue operável, não some no estreito.
    await expect(page.getByLabel("Período")).toBeVisible();

    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });

  test("T27 — Usuários cabe a 380px, colapsa em cards e passa em AAA", async ({ page }) => {
    await entrar(page, ADMIN_ONDA6);
    await page.goto("/usuarios");
    await page.getByRole("heading", { level: 1, name: "Usuários" }).waitFor();

    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await semViolacoesAxe(page);
  });

  test("T28 — Auditoria cabe a 380px, colapsa em cards e passa em AAA", async ({ page }) => {
    await entrar(page, ADMIN_ONDA6);
    await page.goto("/auditoria?periodo=tudo");
    await page.getByRole("heading", { level: 1, name: "Auditoria" }).waitFor();

    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await semViolacoesAxe(page);
  });
});

/**
 * Onda 7 a 380px (F14) — as duas telas novas entram sob os mesmos sinais
 * objetivos das anteriores: nada some fora da viewport, tabela colapsa em
 * cards, axe AAA limpo.
 *
 * A T30 tem uma exigência extra e própria: o mapa é SVG com `viewBox`, e
 * SVG mal contido é a causa clássica de rolagem horizontal no estreito. O
 * teste mede o desenho, não confia no CSS.
 *
 * O sino também é medido aqui: a 380px o painel deixa de flutuar estreito e
 * passa a ocupar a largura útil (`.not-pop` na consulta de 420px). Sem essa
 * verificação, "painel acessível" valeria só no desktop.
 */
test.describe("responsividade a 380px — Onda 7", () => {
  const GESTOR = "gestor@dev.clubebroto.local";

  test("T29 — Cobertura cabe a 380px e passa em AAA", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/cobertura");
    await page.getByRole("heading", { level: 1, name: "Cobertura do portfólio" }).waitFor();

    // A faixa de indicadores vira coluna única, sem esconder célula.
    await expect(page.locator(".kpi-cel")).toHaveCount(4);
    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });

  test("T30 — Mapa cabe a 380px, a tabela por UF colapsa e passa em AAA", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/mapa");
    await page.getByRole("heading", { level: 1, name: "Distribuição geográfica" }).waitFor();

    // O SVG do mapa não pode estourar a viewport.
    const largura = await page.locator("svg.mapa-svg").evaluate((no) => no.getBoundingClientRect().width);
    expect(largura).toBeLessThanOrEqual(380);

    // O alternador de modo (RN52) continua operável no estreito.
    await expect(page.getByRole("link", { name: "Abrangência declarada" })).toBeVisible();

    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await semViolacoesAxe(page);
  });

  test("sino de pendências: painel usa a largura útil a 380px e passa em AAA", async ({ page }) => {
    await entrar(page, GESTOR);

    await page.getByRole("button", { name: /abrir o painel/i }).click();
    const painel = page.getByRole("dialog", { name: "Ações pendentes" });
    await expect(painel).toBeVisible();

    const caixa = await painel.evaluate((no) => {
      const r = no.getBoundingClientRect();
      return { largura: r.width, esquerda: r.left, direita: r.right };
    });
    // Largura ÚTIL: nem estreito demais, nem estourando a viewport.
    expect(caixa.largura).toBeGreaterThan(280);
    expect(caixa.esquerda).toBeGreaterThanOrEqual(0);
    expect(caixa.direita).toBeLessThanOrEqual(380);

    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });
});

/**
 * Acabamento pós-Onda 7 a 380px — o segmentado de seção no estreito.
 *
 * Em desktop ele vive na linha do cabeçalho; a 380px o `flex-wrap` do
 * cabeçalho o joga para linha própria, que é o colapso já praticado em
 * Aliados. O que se mede aqui é que ele continua INTEIRO e operável nas
 * duas seções — segmentado que sai da viewport é navegação perdida.
 */
test.describe("responsividade a 380px — segmentado de seção", () => {
  for (const [secao, rota, rotulo] of [
    ["Aliados & Soluções", "/aliados", /Visões de Aliados/],
    ["Mercado & Scout", "/mercado", /Visões do Mercado/],
  ] as const) {
    test(`${secao}: o segmentado cabe e permanece operável a 380px`, async ({ page }) => {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(rota);
      await page.getByRole("heading", { level: 1 }).first().waitFor();

      const segmentado = page.getByRole("navigation", { name: rotulo });
      await expect(segmentado).toBeVisible();

      const caixa = await segmentado.evaluate((no) => {
        const b = no.getBoundingClientRect();
        return { esquerda: Math.round(b.left), direita: Math.round(b.right) };
      });
      expect(caixa.esquerda).toBeGreaterThanOrEqual(0);
      expect(caixa.direita).toBeLessThanOrEqual(380);

      // Os três destinos continuam alcançáveis.
      await expect(segmentado.getByRole("link")).toHaveCount(3);

      await semRolagemHorizontal(page);
      await semViolacoesAxe(page);
    });
  }
});

/**
 * F15 a 380px — o que a Onda 8 acrescentou às telas estreitas.
 *
 * A T1 já era medida acima (colapso em cards, sem rolagem horizontal); o
 * que muda com a RN56 é o rodapé da lista, que deixou de ter controles de
 * página e passou a ter situação + botão. E a T2 ganhou o cartão da marca,
 * com um campo de arquivo, que é onde o estreito costuma vazar.
 */
test.describe("responsividade a 380px — F15 (Onda 8)", () => {
  test("T1: rolagem contínua com situação e botão dentro da viewport", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-380-rolagem`;
    await semearAliadoAtivoComContrato(nome);

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/aliados");
    await page.getByRole("heading", { level: 1 }).first().waitFor();

    // A situação da lista é o que substituiu "1–8 de 46".
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("link", { name: "Próxima página" })).toHaveCount(0);

    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await semViolacoesAxe(page);
  });

  test("T2: o cartão da marca cabe e é operável a 380px", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-380-marca`;
    const aliado = await semearAliadoAtivoComContrato(nome);

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/aliados/${aliado.id}/editar`);
    await expect(page.getByRole("heading", { name: "Marca do aliado" })).toBeVisible();

    // O campo de arquivo é o controle que mais costuma estourar a largura.
    const campo = page.getByLabel("Enviar a marca");
    await expect(campo).toBeVisible();
    const caixa = await campo.evaluate((no) => {
      const b = no.getBoundingClientRect();
      return { esquerda: Math.round(b.left), direita: Math.round(b.right) };
    });
    expect(caixa.esquerda).toBeGreaterThanOrEqual(0);
    expect(caixa.direita).toBeLessThanOrEqual(380);

    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });
});

/**
 * Onda 9 (F16) — a rota de ajuda a 380px.
 *
 * O guia é o conteúdo mais longo da plataforma e o único com tabelas de
 * texto corrido, então é onde o colapso mobile tem mais a errar.
 */
test.describe("Onda 9 — Ajuda contextual a 380px", () => {
  test("T31: o guia cabe a 380px, com sumário fechado e tabelas em cards", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ajuda");

    // A contagem vem do SUMÁRIO, não de um número escrito aqui. Eram 12
    // até a Onda 11; a Onda 12 acrescentou a 4.7 e este teste reprovou por
    // estar desatualizado, não por defeito. Lendo da fonte única, ele passa
    // a acompanhar o guia sozinho — que é a disciplina da RN58.
    await expect(page.locator("section.gd-sec")).toHaveCount(INDICE_DO_GUIA.length);

    // Sumário recolhido por padrão: o texto começa na primeira dobra.
    const sumario = page.locator("details.gd-idx-mob");
    await expect(sumario).toBeVisible();
    expect(await sumario.evaluate((no) => (no as HTMLDetailsElement).open)).toBe(false);
    // A coluna fixa do desktop some — duas listas de seções na mesma tela
    // seriam duas navegações concorrentes.
    await expect(page.getByRole("navigation", { name: "Sumário do guia" })).toBeHidden();

    // Abrir, escolher e o recolhido se fecha sozinho.
    await sumario.getByText("Neste guia").click();
    await sumario.getByRole("link", { name: "4.4 · Rodar uma campanha" }).click();
    await expect(page.getByRole("heading", { name: "4.4 Rodar uma campanha" })).toBeVisible();
    expect(await sumario.evaluate((no) => (no as HTMLDetailsElement).open)).toBe(false);

    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });

  test("T31: a linha do tempo das jornadas põe o número acima do título", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ajuda#j1");

    // A 380px o marcador deixa de ser coluna à esquerda: sem isso ele sairia
    // da tela pelo deslocamento negativo do desktop.
    const recuo = await page
      .locator("#j1 ol.gd-jorn > li")
      .first()
      .evaluate((no) => getComputedStyle(no).paddingLeft);
    expect(recuo).toBe("0px");

    await semRolagemHorizontal(page);
  });

  test("T31: as tabelas do guia colapsam com rótulo por célula", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ajuda#papeis");

    const tabela = page.locator("#papeis table.tbl-resp").first();
    await expect(tabela).toBeVisible();
    await expect(tabela.locator("thead")).toBeHidden();

    /**
     * A convenção do guia difere da do produto, e de propósito: a primeira
     * célula da linha é o NOME da linha — no card colapsado ela é o título,
     * e um rótulo de coluna acima dela seria ruído. As demais declaram a
     * coluna a que pertencem. Por isso a asserção não é o
     * `tabelaColapsadaEmCards` compartilhado, que exige rótulo em todas.
     */
    const semRotulo = await tabela.locator("tbody td:not([data-label])").count();
    const linhas = await tabela.locator("tbody tr").count();
    expect(semRotulo, "só a primeira célula de cada linha fica sem rótulo").toBe(linhas);

    const rotuloVisivel = await tabela
      .locator("tbody td[data-label]")
      .first()
      .evaluate((no) => getComputedStyle(no, "::before").content);
    expect(rotuloVisivel).not.toBe("none");
    expect(rotuloVisivel).not.toBe('""');

    await semRolagemHorizontal(page);
  });

  test("T31: célula de prosa não estoura a largura da tabela", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ajuda#faltam");

    // O defeito que originou o patch: célula com <em> no meio da frase era
    // fatiada em itens de flex que não quebravam, e o card virava região
    // rolável sem foco de teclado. Aqui a régua é o próprio estouro.
    const estouros = await page.evaluate(() =>
      [...document.querySelectorAll(".gd-doc .card")].map((c) => c.scrollWidth - c.clientWidth),
    );
    expect(Math.max(...estouros), "estouro dentro dos cards do guia").toBeLessThanOrEqual(0);

    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });
});

/**
 * Onda 10 (F17) — o cartão de imagem da solução a 380px.
 *
 * Mesmo sinal que a F15 mediu para o cartão da marca: o campo de arquivo é
 * o controle que mais costuma estourar a largura.
 */
test.describe("Onda 10 — Imagem do card a 380px", () => {
  test("T3: o cartão da imagem cabe e é operável a 380px", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-380-imagem`;
    const aliado = await semearAliadoAtivoComContrato(nome);
    const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);

    await entrar(page, "gestor@dev.clubebroto.local");
    // O cartão de imagem vive na rota de edição da solução (como a marca do
    // aliado vive em /editar); a ficha é somente leitura.
    await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}/editar`);
    await expect(page.getByRole("heading", { name: "Imagem do card" })).toBeVisible();

    const campo = page.getByLabel("Enviar a imagem do card");
    await expect(campo).toBeVisible();
    const caixa = await campo.evaluate((no) => {
      const b = no.getBoundingClientRect();
      return { esquerda: Math.round(b.left), direita: Math.round(b.right) };
    });
    expect(caixa.esquerda).toBeGreaterThanOrEqual(0);
    expect(caixa.direita).toBeLessThanOrEqual(380);

    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });

  test("T32/T33: as telas do patrocínio cabem e são operáveis a 380px", async ({ page }) => {
    // Onda 12 (F19). O que a 380px costuma quebrar aqui: a célula de
    // três números (adquiridas × ativadas = saldo) e a moldura da minuta,
    // que é a única caixa de largura fixa da T33.
    const nome = `[E2E-380] Patrocinadora ${runId()}`;
    await prisma.patrocinador.deleteMany({ where: { razaoSocial: { startsWith: "[E2E-380]" } } });
    const patrocinador = await prisma.patrocinador.create({
      data: { razaoSocial: nome, cnpj: "11444777000161" },
      select: { id: true },
    });
    await prisma.contratoPatrocinio.create({
      data: { patrocinadorId: patrocinador.id, assinaturasAdquiridas: 500 },
    });

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/patrocinadores");
    await expect(page.getByRole("heading", { name: "Patrocinadores", level: 1 })).toBeVisible();
    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);

    await page.goto(`/patrocinadores/${patrocinador.id}`);
    const campo = page.getByLabel("Anexar a minuta");
    await expect(campo).toBeVisible();
    const caixa = await campo.evaluate((no) => {
      const b = no.getBoundingClientRect();
      return { esquerda: Math.round(b.left), direita: Math.round(b.right) };
    });
    expect(caixa.esquerda).toBeGreaterThanOrEqual(0);
    expect(caixa.direita).toBeLessThanOrEqual(380);
    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);

    await page.goto(`/patrocinadores/${patrocinador.id}?aba=consumo`);
    await expect(page.getByRole("heading", { name: "Base por perfil e ativação" })).toBeVisible();
    await semRolagemHorizontal(page);

    await prisma.contratoPatrocinio.deleteMany({ where: { patrocinadorId: patrocinador.id } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: patrocinador.id } });
    await prisma.patrocinador.delete({ where: { id: patrocinador.id } });
  });

  test("T34: a telemetria da operadora cabe e colapsa a 380px", async ({ page }) => {
    // Onda 12 (F20). O que a 380px costuma quebrar aqui: o histórico tem
    // cinco colunas, uma delas com a lista de causas, e o campo de
    // arquivo estica sozinho em iOS/Android.
    //
    // A importação é semeada direto no banco: quem exercita o ENVIO é
    // `telemetria-operadora.spec.ts`; aqui ela existe só para a tabela
    // ter linha e haver o que medir no colapso.
    const autor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    await prisma.importacaoTelemetria.deleteMany({
      where: { nomeArquivo: { startsWith: "[E2E-380]" } },
    });
    await prisma.importacaoTelemetria.create({
      data: {
        tipoLayout: "OFERTAS",
        nomeArquivo: `[E2E-380] Lista_de_Ofertas_${runId()}.csv`,
        hashConteudo: `hash-380-${runId()}`,
        autorId: autor.id,
        lidas: 3,
        aplicadas: 2,
        recusadas: 1,
        recusasPorCausa: { SEM_IDENTIFICADOR: 1 },
      },
    });

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ofertas/telemetria-operadora");
    await expect(
      page.getByRole("heading", { name: "Telemetria da operadora", level: 1 }),
    ).toBeVisible();

    const campo = page.locator("#arquivo-telemetria-operadora");
    await expect(campo).toBeVisible();
    const caixa = await campo.evaluate((no) => {
      const b = no.getBoundingClientRect();
      return { esquerda: Math.round(b.left), direita: Math.round(b.right) };
    });
    expect(caixa.esquerda).toBeGreaterThanOrEqual(0);
    expect(caixa.direita).toBeLessThanOrEqual(380);

    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await semViolacoesAxe(page);

    await prisma.importacaoTelemetria.deleteMany({
      where: { nomeArquivo: { startsWith: "[E2E-380]" } },
    });
  });

  test("cabeçalho: o \"?\" continua alcançável a 380px, na ponta direita", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    const ajuda = page.locator("header").first().getByRole("link", {
      name: "Ajuda — abrir o guia da plataforma",
    });
    await expect(ajuda).toBeVisible();
    const caixa = await ajuda.boundingBox();
    expect(caixa?.x ?? 0).toBeGreaterThan(0);
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(380);
    await semRolagemHorizontal(page);
  });
});

test.describe("responsividade a 380px — Onda 14", () => {
  test("o atalho de teclado cabe na tela quando recebe foco", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    const atalho = page.getByRole("link", { name: "Pular para o conteúdo" });
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press("Tab");
    await expect(atalho).toBeFocused();

    // A caixa do atalho é larga; a 380px é onde ela poderia vazar.
    const caixa = await atalho.boundingBox();
    expect(caixa?.x ?? -1, "borda esquerda do atalho").toBeGreaterThanOrEqual(0);
    expect(
      (caixa?.x ?? 0) + (caixa?.width ?? 0),
      "borda direita do atalho",
    ).toBeLessThanOrEqual(380);

    await semRolagemHorizontal(page);
    await page.keyboard.press("Enter");
    await expect(page.locator("main#conteudo")).toBeFocused();
  });

  test("os complementos do guia cabem a 380px e passam em AAA", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    for (const secao of ["j1", "j2", "j4", "j5"]) {
      await page.goto(`/ajuda#${secao}`);
      const bloco = page.locator(`#${secao} .gd-compl`);
      await expect(bloco).toBeVisible();
      // O bloco tem ícone à esquerda e prosa à direita: a 380px é onde a
      // caixa do `.gd-bloco` poderia estourar a coluna do documento.
      const estouro = await bloco.evaluate((no) => {
        const doc = no.closest(".gd-doc");
        if (!doc) return Number.NaN;
        return Math.round(no.getBoundingClientRect().right - doc.getBoundingClientRect().right);
      });
      expect(estouro, `estouro do complemento de §${secao}`).toBeLessThanOrEqual(0);
      await semRolagemHorizontal(page);
    }

    await semViolacoesAxe(page);
  });

  test("o formulário do patrocinador vira pilha — o .g-resp continua vencendo", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/patrocinadores");
    await page.getByRole("button", { name: "Novo patrocinador" }).click();

    const grade = page.locator("form .form-grid").first();
    await expect(grade).toBeVisible();
    // `.form-grid` não traz `!important` justamente para perder aqui: a
    // grade de duas colunas viraria ilegível a 380px.
    await expect(grade).toHaveCSS("display", "flex");
    await expect(grade).toHaveCSS("flex-direction", "column");

    await semRolagemHorizontal(page);
    await semViolacoesAxe(page);
  });
});
