import { expect, test } from "@playwright/test";
import { entrar, runId, semearEmpresaRadar, semViolacoesAxe } from "./ajudantes";

/**
 * Busca global do cabeçalho: o campo que antes não fazia nada agora navega
 * para /busca e mostra resultados dos três tipos. Aqui exercitamos o caminho
 * pelo aliado semeado.
 */
test.describe("busca global (cabeçalho)", () => {
  test("o campo do cabeçalho leva aos resultados e acha o aliado", async ({ page }) => {
    const token = `Zbuscae2e${runId()}`;
    const nome = `${token} Agro`;
    await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    // O campo de busca global existe no cabeçalho de qualquer tela.
    const campo = page.getByRole("searchbox", { name: "Busca global" });
    await campo.fill(token);
    await campo.press("Enter");

    // Navega para a rota de resultados e encontra o aliado semeado.
    await page.waitForURL(/\/busca\?q=/);
    await expect(page.getByRole("heading", { level: 1, name: "Busca" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(nome) })).toBeVisible();
    await semViolacoesAxe(page);
  });

  test("termo sem correspondência informa 'nada encontrado', sem inventar", async ({ page }) => {
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/busca?q=zzz-termo-improvavel-Xyloqwerty");
    await expect(page.getByText("Nada encontrado")).toBeVisible();
  });
});
