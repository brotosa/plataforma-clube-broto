import { expect, test, type Page } from "@playwright/test";
import { semViolacoesAxe } from "./ajudantes";

/**
 * Carga inicial (F3) pela interface, com as PLANILHAS REAIS: iniciar →
 * conferência (ajustar agrupamento) → aprovar tudo → efetivar → base real
 * visível em T1/T4. Critério "pronto" da F3: base real carregada com
 * conferência demonstrável.
 */

const SENHA = process.env.SENHA_USUARIOS_DEV ?? "clube-broto-dev";

async function entrarComoGestor(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("gestor@dev.clubebroto.local");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  // F13: a HOME passou a ser a T26 (rota `/`).
  await page.waitForURL((url) => new URL(url).pathname === "/");
}

test.describe.serial("carga inicial — conferência demonstrável", () => {
  test("iniciar a leitura povoa o staging com as planilhas reais", async ({ page }) => {
    await entrarComoGestor(page);
    await page.goto("/carga-inicial");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Iniciar leitura das planilhas" }).click();

    // Contadores da conferência refletem as planilhas reais
    await expect(page.getByText("Sellers no staging")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("46", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("147", { exact: true }).first()).toBeVisible();
  });

  test("conferência permite renomear o nome de solução proposto", async ({ page }) => {
    await entrarComoGestor(page);
    await page.goto("/carga-inicial");
    await page.waitForLoadState("networkidle");

    const primeiroAgrupamento = page.locator("details").first();
    await primeiroAgrupamento.locator("summary").click();
    const campoNome = primeiroAgrupamento.getByLabel("Nome da solução");
    const nomeOriginal = await campoNome.inputValue();
    await campoNome.fill(`${nomeOriginal} (conferida)`);
    await primeiroAgrupamento.getByRole("button", { name: "Renomear" }).click();
    await expect(page.getByText(`${nomeOriginal} (conferida)`).first()).toBeVisible();
  });

  test("axe-core (AAA) sem violações na tela de conferência", async ({ page }) => {
    await entrarComoGestor(page);
    await page.goto("/carga-inicial");
    await semViolacoesAxe(page);
  });

  test("aprovar tudo e efetivar cria a base real", async ({ page }) => {
    await entrarComoGestor(page);
    await page.goto("/carga-inicial");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Aprovar tudo o que está pendente" }).click();
    await expect(page.getByText("46 aprovados")).toBeVisible();

    await page.getByRole("button", { name: /^Efetivar carga/ }).click();
    // A efetivação transacional zera o staging e a tela volta ao estado inicial
    await expect(page.getByRole("heading", { name: "Carga anterior efetivada" })).toBeVisible({
      timeout: 120_000,
    });
  });

  test("a base real aparece em T1 e T4 (dados das planilhas, sem invenção)", async ({ page }) => {
    await entrarComoGestor(page);

    // Seller real com nome normalizado (tinha espaço à direita na planilha)
    await page.goto("/aliados?busca=Cyan");
    const linha = page.getByRole("row", { name: /Cyan Analytics/ });
    await expect(linha.getByText("Aliado ativo")).toBeVisible();

    // Ficha do aliado real: pendências de curadoria visíveis (RN09)
    await linha.getByRole("link").first().click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await expect(page.getByText("obrigatório · não preenchido").first()).toBeVisible();

    // Lista transversal com ofertas reais (a T4 mostra as 50 mais recentes)
    await page.goto("/ofertas");
    await expect(page.getByRole("columnheader", { name: "Natureza" })).toBeVisible();
    expect(await page.locator("table tbody tr").count()).toBeGreaterThan(0);
  });
});
