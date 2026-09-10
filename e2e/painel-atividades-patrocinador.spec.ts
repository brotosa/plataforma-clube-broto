import { expect, test } from "@playwright/test";
import { entrar, prisma, runId, semViolacoesAxe } from "./ajudantes";

/**
 * Painel de atividades da ficha do PATROCINADOR: o mesmo componente e as
 * mesmas regras do aliado, agora na T33. Comentar, marcar como pendência e
 * resolver, pela interface; coluna recuável persistente no shell.
 */

const PREFIXO = "[E2E-PAT-PAINEL]";

async function limpar() {
  const patrocinadores = await prisma.patrocinador.findMany({
    where: { razaoSocial: { startsWith: PREFIXO } },
    select: { id: true },
  });
  const ids = patrocinadores.map((p) => p.id);
  const notas = await prisma.notaRapida.findMany({
    where: { patrocinadorId: { in: ids } },
    select: { id: true },
  });
  const notaIds = notas.map((n) => n.id);
  await prisma.notaRapidaMencao.deleteMany({ where: { notaRapidaId: { in: notaIds } } });
  await prisma.auditoriaEvento.deleteMany({
    where: { entidade: "nota_rapida", entidadeId: { in: notaIds } },
  });
  await prisma.notaRapida.deleteMany({ where: { id: { in: notaIds } } });
  await prisma.patrocinador.deleteMany({ where: { id: { in: ids } } });
}

/** Cria o patrocinador direto no banco — o teste é do painel, não do cadastro. */
async function semearPatrocinador(): Promise<string> {
  await limpar();
  // create ignora a validação de CNPJ; só precisa ser único (marca do run).
  const patrocinador = await prisma.patrocinador.create({
    data: { razaoSocial: `${PREFIXO} ${runId()}`, cnpj: `PAINEL${runId()}` },
    select: { id: true },
  });
  return patrocinador.id;
}

test.afterAll(async () => {
  await limpar();
});

test.describe("painel de atividades do patrocinador", () => {
  test("comentar, marcar pendência e resolver; recolher e reabrir", async ({ page }) => {
    const patrocinadorId = await semearPatrocinador();

    await entrar(page, "scout@dev.clubebroto.local");
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/patrocinadores/${patrocinadorId}`);

    // O painel aparece no shell da ficha, com o rótulo do patrocinador.
    const painel = page.getByRole("complementary", {
      name: /Painel de atividades do patrocinador/,
    });
    await expect(painel.getByRole("heading", { name: "Atividades" })).toBeVisible();

    // A ficha do patrocinador (com o painel) passa na varredura AAA.
    await semViolacoesAxe(page);

    // Comentar como pendência.
    const texto = `Confirmar a minuta ${runId()}`;
    await painel.getByPlaceholder("Escreva um comentário para a equipe…").fill(texto);
    await painel.getByRole("checkbox", { name: "Marcar como pendência" }).check();
    await painel.getByRole("button", { name: "Comentar" }).click();

    // Aparece no feed com o selo de pendência.
    await expect(painel.getByText(texto)).toBeVisible();
    const item = painel.locator(".pa-item", { hasText: texto });
    await expect(item.getByText("pendência", { exact: true })).toBeVisible();

    // Resolver a pendência.
    await item.getByRole("button", { name: "Resolver" }).click();
    await expect(item.getByText("resolvida", { exact: true })).toBeVisible();

    // O comentário persiste ao trocar de aba (vive no shell da ficha).
    await page.goto(`/patrocinadores/${patrocinadorId}?aba=consumo`);
    await expect(page.getByRole("complementary").getByText(texto)).toBeVisible();

    // Recolher e reabrir a coluna.
    await page.getByRole("button", { name: "Recolher atividades" }).click();
    const reabrir = page.getByRole("button", { name: /Atividades/ });
    await reabrir.click();
    await expect(page.getByRole("heading", { name: "Atividades" })).toBeVisible();
  });

  test("Leitura acompanha o feed, mas não vê o campo de comentar", async ({ page }) => {
    const patrocinadorId = await semearPatrocinador();

    await entrar(page, "leitura@dev.clubebroto.local");
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/patrocinadores/${patrocinadorId}`);

    await expect(page.getByRole("heading", { name: "Atividades" })).toBeVisible();
    await expect(page.getByPlaceholder("Escreva um comentário para a equipe…")).toHaveCount(0);
  });
});
