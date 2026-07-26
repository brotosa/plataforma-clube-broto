import { expect, test, type Page } from "@playwright/test";
import { semViolacoesAxe } from "./ajudantes";

/**
 * E2E da fundação (F1): login com papéis aplicados, shell fiel ao
 * protótipo (módulos futuros desabilitados) e axe-core sem violações
 * nas telas existentes (política AAA do projeto).
 */

const CREDENCIAIS = {
  email: "gestor@dev.clubebroto.local",
  senha: process.env.SENHA_USUARIOS_DEV ?? "clube-broto-dev",
};

async function entrarComoGestor(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/aliados");
}

/**
 * Varredura axe que AGUARDA a tela assentar (h1 único) antes de analisar —
 * sem isso, a primeira varredura após o redirect do login corria contra o
 * repintar do App Router no runner lento e acusava "Page must have a
 * level-one heading" (flaky). Reaproveita o ajudante compartilhado.
 */
async function esperarSemViolacoesAxe(page: Page) {
  await semViolacoesAxe(page);
}

test("login inválido permanece em /entrar com mensagem de erro", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("nao-existe@dev.clubebroto.local");
  await page.getByLabel("Senha").fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/entrar\?erro=credenciais/);
  // Locator específico: o announcer de rota do Next também tem role=alert
  await expect(page.locator('p[role="alert"]')).toContainText("E-mail ou senha inválidos");
});

test("rota protegida redireciona para /entrar sem sessão", async ({ page }) => {
  await page.goto("/aliados");
  await expect(page).toHaveURL(/\/entrar/);
});

test("login como Gestor aplica papel e monta o shell do protótipo", async ({ page }) => {
  await entrarComoGestor(page);

  // Identidade e papel institucional no header (ficha §2)
  await expect(page.getByText("Gestor (desenvolvimento)")).toBeVisible();
  await expect(page.getByText("Gestor do Clube")).toBeVisible();

  // Navegação: módulos das Ondas 1, 2 e 5 ativos…
  const nav = page.getByRole("navigation", { name: "Módulos" });
  await expect(nav.getByRole("link", { name: "Aliados & Soluções" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Ofertas" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Aprovações" })).toBeVisible();
  // F6: Mercado & Scout ganhou o funil (T8) e deixou de ser onda futura
  await expect(nav.getByRole("link", { name: "Mercado & Scout" })).toBeVisible();
  // F11: Assinantes ganhou a carteira (T18) e deixou de ser onda futura
  await expect(nav.getByRole("link", { name: "Assinantes" })).toBeVisible();
  // F10: Parametrizador (T15) deixou de ser onda futura
  await expect(nav.getByRole("link", { name: "Parametrizador" })).toBeVisible();

  // …e módulos de ondas futuras presentes porém desabilitados
  for (const modulo of [
    "Dashboard",
    "Campanhas & Cestas",
    "Usuários",
    "Auditoria",
  ]) {
    const botao = nav.getByRole("button", { name: modulo });
    await expect(botao).toBeVisible();
    await expect(botao).toHaveAttribute("aria-disabled", "true");
    await expect(botao).toHaveAttribute("title", "Disponível em onda futura");
  }
});

test("navegação entre os módulos da Onda 1 e estado do motor de aprovação", async ({ page }) => {
  await entrarComoGestor(page);

  await page.getByRole("link", { name: "Ofertas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ofertas" })).toBeVisible();

  await page.getByRole("link", { name: "Aprovações" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Aprovações" })).toBeVisible();
  // Estado inicial do motor conforme RN06 (seed): Aliado ligado, Oferta desligada (T7)
  await page.getByRole("link", { name: "Regras de aprovação (T7)" }).click();
  // Escopado ao card de cada regra: o mesmo texto de status aparece uma vez
  // por regra, então o getByText global seria sensível a strict-mode se o
  // estado de outra regra coincidisse. O globalSetup garante o estado de
  // nascimento (promoção ON, oferta OFF).
  const cartaoPromocao = page.locator(".card", {
    has: page.getByRole("heading", { name: "Promoção a Aliada ativa" }),
  });
  await expect(cartaoPromocao.getByText("Aprovação exigida")).toBeVisible();
  const cartaoOferta = page.locator(".card", {
    has: page.getByRole("heading", { name: "Publicação de oferta" }),
  });
  await expect(cartaoOferta.getByText("Aprovação desligada")).toBeVisible();
});

test("sidebar recolhe e expande por teclado (Enter)", async ({ page }) => {
  await entrarComoGestor(page);
  const alternar = page.getByRole("button", { name: "Recolher ou expandir menu" });
  await expect(alternar).toHaveAttribute("aria-expanded", "true");
  await alternar.focus();
  await page.keyboard.press("Enter");
  await expect(alternar).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(alternar).toHaveAttribute("aria-expanded", "true");
});

test("axe-core sem violações em /entrar", async ({ page }) => {
  await page.goto("/entrar");
  await esperarSemViolacoesAxe(page);
});

test("axe-core sem violações nas telas autenticadas", async ({ page }) => {
  await entrarComoGestor(page);
  await esperarSemViolacoesAxe(page);

  await page.goto("/ofertas");
  await page.getByRole("heading", { level: 1, name: "Ofertas" }).waitFor();
  await esperarSemViolacoesAxe(page);

  await page.goto("/aprovacoes");
  await page.getByRole("heading", { level: 1, name: "Aprovações" }).waitFor();
  await esperarSemViolacoesAxe(page);
});

test("papel Leitura entra e visualiza (ficha §2: visualizar é de todos)", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("leitura@dev.clubebroto.local");
  await page.getByLabel("Senha").fill(CREDENCIAIS.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/aliados");
  await expect(page.getByText("Leitura (desenvolvimento)")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Aliados" })).toBeVisible();
});
