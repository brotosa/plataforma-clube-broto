import { expect, test } from "@playwright/test";
import { entrar, prisma, runId, SENHA, semViolacoesAxe } from "./ajudantes";

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

const SUFIXO_E2E = "@cfg-e2e.local";

async function restaurarPadrao() {
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: "portal" } });
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: SUFIXO_E2E } },
    select: { id: true },
  });
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
}

/** Usuário LEITURA descartável com a senha de dev (copia o hash do seed). */
async function semearUsuario(sufixo: string) {
  const modelo = await prisma.usuario.findUniqueOrThrow({
    where: { email: "leitura@dev.clubebroto.local" },
    select: { senhaHash: true },
  });
  const email = `bloqueio-${sufixo}${SUFIXO_E2E}`;
  return prisma.usuario.create({
    data: {
      nome: `Bloqueio ${sufixo}`,
      email,
      senhaHash: modelo.senhaHash,
      papel: "LEITURA",
      ativo: true,
      trocaSenhaObrigatoria: false,
    },
  });
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

test("Administrador ajusta o bloqueio por login e vê a lista de bloqueados vazia", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes");
  await expect(page.getByRole("heading", { name: "Bloqueio por tentativas de login" })).toBeVisible();
  await expect(page.getByText("Nenhuma conta bloqueada no momento.")).toBeVisible();

  await page.getByLabel("Tentativas antes de bloquear").fill("4");
  await page.getByLabel("Tempo de bloqueio (minutos)").fill("20");
  await page.getByRole("button", { name: "Salvar bloqueio" }).click();
  await expect(page.getByText("Bloqueio por login salvo")).toBeVisible();
});

test("bloqueio por tentativas: erra a senha, é barrado e o Administrador desbloqueia", async ({
  browser,
}) => {
  const marca = runId();
  const alvo = await semearUsuario(`${marca}`);
  // Política curta para o teste: bloqueia em 3 falhas.
  await prisma.configuracaoPortal.upsert({
    where: { id: "portal" },
    update: { loginMaxTentativas: 3 },
    create: { id: "portal", loginMaxTentativas: 3 },
  });

  // A vítima erra a senha 3 vezes e passa a ver o aviso de bloqueio.
  const ctx = await browser.newContext();
  try {
    const pagina = await ctx.newPage();
    for (let i = 1; i <= 3; i += 1) {
      await pagina.goto("/entrar");
      await pagina.getByLabel("E-mail").fill(alvo.email);
      await pagina.getByLabel("Senha").fill("senha-errada");
      await pagina.getByRole("button", { name: "Entrar" }).click();
      await pagina.waitForURL(/\/entrar\?erro=/);
    }
    await expect(pagina.getByText(/Acesso bloqueado por tentativas/)).toBeVisible();

    // Mesmo com a senha CERTA, segue barrada enquanto bloqueada.
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(alvo.email);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    await pagina.waitForURL(/\/entrar\?erro=bloqueado/);

    // O Administrador desbloqueia pela tela de Configurações.
    const adminCtx = await browser.newContext();
    try {
      const paginaAdmin = await adminCtx.newPage();
      await entrar(paginaAdmin, ADMIN);
      await paginaAdmin.goto("/configuracoes");
      const linha = paginaAdmin.getByRole("row", { name: new RegExp(alvo.email) });
      await expect(linha).toBeVisible();
      await linha.getByRole("button", { name: "Desbloquear" }).click();
      await expect(paginaAdmin.getByText(new RegExp(alvo.email))).toHaveCount(0);
    } finally {
      await adminCtx.close();
    }

    // Agora a vítima entra normalmente.
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(alvo.email);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    await pagina.waitForURL((url) => new URL(url).pathname === "/");
  } finally {
    await ctx.close();
  }
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
