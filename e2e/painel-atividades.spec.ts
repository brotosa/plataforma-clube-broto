import { expect, test } from "@playwright/test";
import { entrar, runId, semViolacoesAxe, semearAliadoAtivoComContrato } from "./ajudantes";

/**
 * Painel de atividades da ficha do aliado: comentar, marcar como pendência e
 * resolver, pela interface. Coluna recuável persistente no shell.
 */
test.describe("painel de atividades do aliado", () => {
  test("comentar, marcar pendência e resolver; recolher e reabrir", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-painel`;
    const empresa = await semearAliadoAtivoComContrato(nome);

    await entrar(page, "scout@dev.clubebroto.local");
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/aliados/${empresa.id}`);

    // O painel aparece no shell, em qualquer aba.
    const painel = page.getByRole("complementary", { name: /Painel de atividades do aliado/ });
    await expect(painel.getByRole("heading", { name: "Atividades" })).toBeVisible();

    // Comentar como pendência.
    const texto = `Cadastrar o Fernando ${runId()}`;
    await painel.getByPlaceholder("Escreva um comentário para a equipe…").fill(texto);
    await painel.getByRole("checkbox", { name: "Marcar como pendência" }).check();
    await painel.getByRole("button", { name: "Comentar" }).click();

    // Aparece no feed com o selo de pendência.
    await expect(painel.getByText(texto)).toBeVisible();
    const item = painel.locator(".pa-item", { hasText: texto });
    await expect(item.getByText("pendência", { exact: true })).toBeVisible();

    // Resolver → vira "resolvida".
    await item.getByRole("button", { name: "Resolver" }).click();
    await expect(item.getByText("resolvida", { exact: true })).toBeVisible();

    // Persiste após recarregar (foi gravado no banco, não é estado de tela).
    await page.reload();
    await expect(
      page.getByRole("complementary").getByText(texto),
    ).toBeVisible();

    // Recolher e reabrir a coluna.
    await page.getByRole("button", { name: "Recolher atividades" }).click();
    const reabrir = page.getByRole("button", { name: /Atividades/ });
    await expect(reabrir).toBeVisible();
    await reabrir.click();
    await expect(page.getByRole("heading", { name: "Atividades" })).toBeVisible();
  });

  test("mencionar digitando @: autocomplete inline, escolha por teclado, tag no feed", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-mencao`;
    const empresa = await semearAliadoAtivoComContrato(nome);

    await entrar(page, "scout@dev.clubebroto.local");
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/aliados/${empresa.id}`);

    const painel = page.getByRole("complementary", { name: /Painel de atividades do aliado/ });
    const campo = painel.getByPlaceholder("Escreva um comentário para a equipe…");
    await expect(campo).toBeVisible();

    // Digitar "@Gest" abre o listbox filtrado — sem apertar botão nenhum.
    const texto = `Ver com o time ${runId()} @Gest`;
    await campo.click();
    await campo.pressSequentially(texto);

    const opcao = painel.getByRole("option", { name: /Gestor \(desenvolvimento\)/ });
    await expect(opcao).toBeVisible();

    // O campo é um combobox e o listbox está limpo no axe (AAA) enquanto aberto.
    await semViolacoesAxe(page);

    // Escolher pelo teclado (opção ativa é a primeira): Enter insere "@Nome ".
    await campo.press("Enter");
    await expect(campo).toHaveValue(/@Gestor \(desenvolvimento\) $/);
    await expect(opcao).toBeHidden();

    await painel.getByRole("button", { name: "Comentar" }).click();

    // No feed: o texto e a tag de menção ao Gestor.
    const item = painel.locator(".pa-item", { hasText: "Ver com o time" });
    await expect(item).toBeVisible();
    await expect(item.locator(".pa-tag-mencao", { hasText: "Gestor (desenvolvimento)" })).toBeVisible();

    // Persiste após recarregar (menção gravada no banco).
    await page.reload();
    await expect(
      page.getByRole("complementary").locator(".pa-tag-mencao", { hasText: "Gestor (desenvolvimento)" }),
    ).toBeVisible();
  });

  test("Leitura vê o feed mas não tem campo de comentar", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-leitura`;
    const empresa = await semearAliadoAtivoComContrato(nome);

    await entrar(page, "leitura@dev.clubebroto.local");
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/aliados/${empresa.id}`);

    await expect(page.getByRole("heading", { name: "Atividades" })).toBeVisible();
    await expect(page.getByPlaceholder("Escreva um comentário para a equipe…")).toHaveCount(0);
    await expect(
      page.getByText("acompanha o histórico da ficha, mas não registra comentários", {
        exact: false,
      }),
    ).toBeVisible();
  });
});
