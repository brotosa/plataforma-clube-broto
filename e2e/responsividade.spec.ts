import { expect, test } from "@playwright/test";
import {
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
