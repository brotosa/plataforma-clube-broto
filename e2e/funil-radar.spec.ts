import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * F6 pela interface: entrada no radar (T9, RN13), kanban da T8 operado
 * 100% por teclado — Tab até o card, Enter abre o menu, Esc fecha e
 * devolve o foco ao gatilho, mover e descartar completáveis sem mouse
 * (RN14/RN17) —, reativação de descartada e importação de lista em três
 * passos com deduplicação. axe-core nas telas novas (kanban, tabela e T9).
 */

const SENHA = process.env.SENHA_USUARIOS_DEV ?? "clube-broto-dev";
const SUFIXO = `${Date.now()}`.slice(-6);
const NOME_RADAR = `Radar E2E ${SUFIXO}`;
const NOME_PROSPECT = `Prospect E2E ${SUFIXO}`;

async function entrar(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/aliados");
}

async function semViolacoesAxe(page: Page) {
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  const resultado = await new AxeBuilder({ page }).analyze();
  expect(resultado.violations).toEqual([]);
}

/** Rótulo acessível do elemento focado (para asserções de teclado). */
function rotuloFocado(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      document.activeElement?.getAttribute("aria-label") ??
      document.activeElement?.textContent ??
      "",
  );
}

/** Percorre a tela só com Tab até alcançar o gatilho de ações do card. */
async function tabAteAcoesDoCard(page: Page, nome: string) {
  for (let tentativa = 0; tentativa < 140; tentativa += 1) {
    await page.keyboard.press("Tab");
    if ((await rotuloFocado(page)).includes(`Ações de ${nome}`)) {
      return;
    }
  }
  throw new Error(`Tab não alcançou o gatilho de ações de ${nome}`);
}

test.describe.serial("funil e radar — T8/T9 (F6)", () => {
  test("RN13 na interface: sem origem não entra; completo entra como Mapeada", async ({ page }) => {
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado/radar");

    await page.getByLabel("Nome", { exact: true }).fill(NOME_RADAR);
    await page.getByRole("checkbox", { name: "Tecnologia e Software" }).check();
    await page.getByRole("button", { name: "Adicionar ao radar" }).click();
    await expect(page.locator('[role="alert"].aviso-inline')).toContainText("RN13");

    await page.getByLabel("Nome", { exact: true }).fill(NOME_RADAR);
    await page.getByLabel("Origem").selectOption("SCOUTING_ATIVO");
    await page.getByRole("checkbox", { name: "Tecnologia e Software" }).check();
    await page.getByRole("button", { name: "Adicionar ao radar" }).click();
    await expect(page.getByRole("status")).toContainText("incluída no radar como Mapeada");
  });

  test("kanban só por teclado: Enter abre o menu, Esc devolve o foco, mover sem mouse (RN14)", async ({ page }) => {
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");
    await expect(page.getByRole("heading", { level: 1, name: "Mercado & Scout" })).toBeVisible();

    // Tab até o gatilho do card; Enter abre o menu com foco no 1º item
    await tabAteAcoesDoCard(page, NOME_RADAR);
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: `Ações de ${NOME_RADAR}` });
    await expect(menu).toBeVisible();
    await expect
      .poll(() => rotuloFocado(page))
      .toContain("Mover para Em avaliação");

    // Esc fecha e devolve o foco ao gatilho
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect.poll(() => rotuloFocado(page)).toContain(`Ações de ${NOME_RADAR}`);

    // Reabre e move para Em avaliação apenas com o teclado (RN14: assume)
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("movida para Em avaliação");
    const laneEmAvaliacao = page
      .locator(".kb-lane", { has: page.getByText("Em avaliação", { exact: true }) })
      .first();
    await expect(laneEmAvaliacao.getByText(NOME_RADAR)).toBeVisible();
    // RN14: quem assumiu vira responsável de scout, visível no card
    await expect(
      laneEmAvaliacao.locator(".kb-card", { hasText: NOME_RADAR }).getByText(/Responsável:/),
    ).toBeVisible();
  });

  test("descartar sem mouse: modal com motivo tipificado obrigatório (RN17)", async ({ page }) => {
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    await tabAteAcoesDoCard(page, NOME_RADAR);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: `Ações de ${NOME_RADAR}` })).toBeVisible();
    // Itens: Mover para Mapeada, Mover para Priorizada, Descartar…
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect.poll(() => rotuloFocado(page)).toContain("Descartar");
    await page.keyboard.press("Enter");

    const modal = page.getByRole("dialog", { name: `Descartar ${NOME_RADAR}` });
    await expect(modal).toBeVisible();
    // Foco nasce no select de motivo; seleção e confirmação só por teclado
    await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? "")).toBe(
      "descarte-motivo",
    );
    await page.keyboard.press("ArrowDown"); // Sem fit de negócio
    await page.keyboard.press("Tab"); // comentário
    await page.keyboard.press("Tab"); // Cancelar
    await page.keyboard.press("Tab"); // Descartar empresa
    await expect.poll(() => rotuloFocado(page)).toContain("Descartar empresa");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("status")).toContainText("descartada com motivo registrado");
    await expect(page.locator(".kb-card", { hasText: NOME_RADAR })).toHaveCount(0);
  });

  test("descartada aparece na tabela e a reativação volta a Mapeada (RN17)", async ({ page }) => {
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado?visao=tabela");
    const linha = page.getByRole("row", { name: new RegExp(NOME_RADAR) });
    await expect(linha.getByText("Descartada")).toBeVisible();
    await linha.getByRole("button", { name: "Reativar" }).click();
    await expect(page.getByRole("status")).toContainText("voltou a Mapeada");

    await page.goto("/mercado");
    const laneMapeada = page
      .locator(".kb-lane", { has: page.getByText("Mapeada", { exact: true }) })
      .first();
    await expect(laneMapeada.getByText(NOME_RADAR)).toBeVisible();
  });

  test("importação em três passos: upload → mapeamento → resumo com deduplicação", async ({ page }) => {
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado/radar?importar=1");

    const csv = [
      "Empresa;Site;Segmento",
      `${NOME_PROSPECT};https://prospect.e2e.local;Tecnologia e Software`,
      `${NOME_RADAR};;Tecnologia e Software`,
    ].join("\n");
    await page
      .locator('input[name="arquivo"]')
      .setInputFiles({
        name: "prospects-e2e.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf-8"),
      });

    // Passo 2 — sugestão automática visível e ajustável por coluna
    await expect(page.getByLabel("Coluna “Empresa”")).toHaveValue("NOME");
    await expect(page.getByLabel("Coluna “Segmento”")).toHaveValue("CATEGORIA");
    await page.getByRole("button", { name: "Continuar ›" }).click();

    // Passo 3 — resumo com deduplicação por CNPJ/nome
    await expect(page.getByText("linhas lidas")).toBeVisible();
    await expect(page.getByText("já estavam no radar — ignoradas (deduplicação)")).toBeVisible();
    await page.getByRole("button", { name: "Efetivar importação" }).click();
    await expect(page.getByRole("status")).toContainText("1 empresa(s) no radar");

    await page.goto("/mercado");
    const laneMapeada = page
      .locator(".kb-lane", { has: page.getByText("Mapeada", { exact: true }) })
      .first();
    await expect(laneMapeada.getByText(NOME_PROSPECT)).toBeVisible();
    await expect(laneMapeada.locator(".kb-card", { hasText: NOME_PROSPECT }).getByText("via Lista importada")).toBeVisible();
  });

  test("axe-core limpo na T8 (kanban e tabela) e na T9", async ({ page }) => {
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");
    await semViolacoesAxe(page);
    await page.goto("/mercado?visao=tabela");
    await semViolacoesAxe(page);
    await page.goto("/mercado/radar");
    await semViolacoesAxe(page);
  });
});
