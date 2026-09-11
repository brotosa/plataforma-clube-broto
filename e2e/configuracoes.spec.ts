import { expect, test } from "@playwright/test";
import { entrar, prisma, semViolacoesAxe } from "./ajudantes";

/**
 * E2E das Configurações (PR A — item na lateral + política de senha).
 *
 * Cobre o que a interface promete: o item "Configurações" aparece na lateral
 * abaixo de "Auditoria" só para o Administrador da Plataforma (CONFIGURAR_PORTAL);
 * o Gestor não o vê e é redirecionado se tentar a rota direto; o Administrador
 * edita a política, salva (auditado no serviço) e a tela confirma. Axe-core
 * limpo na tela.
 *
 * A tela mexe num singleton GLOBAL (`configuracao_portal`): cada caso restaura
 * o padrão (apaga a linha) para não vazar política apertada para os demais
 * specs, que trocam senha no seu próprio fluxo.
 */

const ADMIN = "administrador@dev.clubebroto.local";
const GESTOR = "gestor@dev.clubebroto.local";

async function restaurarPadrao() {
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: "portal" } });
}

test.beforeEach(restaurarPadrao);
test.afterAll(restaurarPadrao);

test("Administrador vê 'Configurações' na lateral, abaixo de 'Auditoria'", async ({ page }) => {
  await entrar(page, ADMIN);
  const nav = page.getByRole("navigation", { name: "Módulos" });
  const auditoria = nav.getByRole("link", { name: "Auditoria" });
  const configuracoes = nav.getByRole("link", { name: "Configurações" });
  await expect(auditoria).toBeVisible();
  await expect(configuracoes).toBeVisible();

  // "Configurações" é o ÚLTIMO item — vem depois de "Auditoria".
  const auditoriaTop = await auditoria.boundingBox();
  const configTop = await configuracoes.boundingBox();
  expect(configTop!.y).toBeGreaterThan(auditoriaTop!.y);
});

test("Administrador abre /configuracoes, edita e salva a política — axe limpo", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Configurações" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Política de senha" })).toBeVisible();
  await semViolacoesAxe(page);

  // Aperta a política: comprimento 12 e exige maiúscula.
  const comprimento = page.getByLabel("Comprimento mínimo");
  await comprimento.fill("12");
  await page.getByLabel("Exigir letra maiúscula").check();

  await page.getByRole("button", { name: "Salvar política" }).click();
  await expect(page.getByText("Política de senha salva")).toBeVisible();

  // Persistiu: recarregar a tela traz os valores salvos.
  await page.reload();
  await expect(page.getByLabel("Comprimento mínimo")).toHaveValue("12");
  await expect(page.getByLabel("Exigir letra maiúscula")).toBeChecked();
});

test("contador de sessão aparece ao lado do sino e conta em mm:ss", async ({ page }) => {
  await entrar(page, ADMIN);
  const contador = page.locator(".sessao-contador");
  await expect(contador).toBeVisible();
  await expect(contador).toHaveAttribute("role", "timer");
  // Mostra mm:ss (padrão 30 min → começa perto de 29:xx/30:00).
  await expect(contador).toHaveText(/\d\d:\d\d/);
  // Fica ao lado do sino de pendências, à esquerda dele no cabeçalho.
  const sino = page.getByRole("button", { name: /abrir o painel/i }).first();
  await expect(sino).toBeVisible();
  const cx = await contador.boundingBox();
  const sx = await sino.boundingBox();
  expect(cx!.x).toBeLessThan(sx!.x);
});

test("Administrador ajusta o tempo de sessão e salva", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes");
  await expect(page.getByRole("heading", { name: "Tempo de sessão" })).toBeVisible();

  const campo = page.getByLabel("Tempo de sessão (minutos)");
  await campo.fill("20");
  await page.getByRole("button", { name: "Salvar tempo de sessão" }).click();
  await expect(page.getByText("Tempo de sessão salvo")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Tempo de sessão (minutos)")).toHaveValue("20");
});

test("Gestor não vê 'Configurações' e é redirecionado se tentar a rota", async ({ page }) => {
  await entrar(page, GESTOR);
  const nav = page.getByRole("navigation", { name: "Módulos" });
  await expect(nav.getByRole("link", { name: "Auditoria" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Configurações" })).toHaveCount(0);

  // Acesso direto à rota: volta para a HOME (a área é exclusiva do Administrador).
  await page.goto("/configuracoes");
  await page.waitForURL((url) => new URL(url).pathname === "/");
  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toHaveCount(0);
});
