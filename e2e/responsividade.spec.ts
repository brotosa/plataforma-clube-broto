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
