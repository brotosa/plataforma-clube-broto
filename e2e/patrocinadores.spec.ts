import { expect, test } from "@playwright/test";
import { entrar, prisma, semViolacoesAxe } from "./ajudantes";

/**
 * Onda 12 (F19) — T32, T33 e o R1, fim a fim.
 *
 * O que estes testes cobrem e os de integração não: que a régua chega à
 * TELA. Saldo derivado exibido como traço com motivo quando não há
 * adquiridas, minuta recusando imagem com a causa nomeada, aba Consumo com
 * os selos, e a leitura sem permissão de escrita não vendo campo de envio.
 */

const NOME = "[E2E-F19] Patrocinadora do teste";
const CNPJ = "11222333000181";

/** Limpeza idempotente — retry e re-execução não colidem no CNPJ único. */
async function limpar() {
  const patrocinadores = await prisma.patrocinador.findMany({
    where: { razaoSocial: { startsWith: "[E2E-F19]" } },
    select: { id: true, contrato: { select: { id: true } } },
  });
  const ids = patrocinadores.map((p) => p.id);
  const contratos = patrocinadores.flatMap((p) => (p.contrato ? [p.contrato.id] : []));
  await prisma.minutaContrato.deleteMany({ where: { contratoId: { in: contratos } } });
  await prisma.relatorioPatrocinador.deleteMany({ where: { patrocinadorId: { in: ids } } });
  await prisma.vinculoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
  await prisma.contratoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
  await prisma.campanha.updateMany({
    where: { patrocinadorId: { in: ids } },
    data: { patrocinadorId: null },
  });
  await prisma.auditoriaEvento.deleteMany({
    where: { entidadeId: { in: [...ids, ...contratos] } },
  });
  await prisma.patrocinador.deleteMany({ where: { id: { in: ids } } });
}

/** Cria o patrocinador direto no banco: o teste da tela é outro. */
async function semearPatrocinador(adquiridas: number | null) {
  await limpar();
  const patrocinador = await prisma.patrocinador.create({
    data: { razaoSocial: NOME, cnpj: CNPJ, segmento: "Insumos" },
    select: { id: true },
  });
  await prisma.contratoPatrocinio.create({
    data: {
      patrocinadorId: patrocinador.id,
      vigenciaInicio: new Date("2026-02-01T00:00:00.000Z"),
      vigenciaFim: new Date("2027-01-31T00:00:00.000Z"),
      assinaturasAdquiridas: adquiridas,
    },
  });
  return patrocinador.id;
}

test.afterAll(async () => {
  await limpar();
});

test("T32 — a lista mostra adquiridas × ativadas = saldo, e o item está na lateral", async ({
  page,
}) => {
  await semearPatrocinador(500);
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/patrocinadores");

  await expect(page.getByRole("heading", { name: "Patrocinadores", level: 1 })).toBeVisible();
  const linha = page.getByRole("row").filter({ hasText: NOME });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("11.222.333/0001-81");
  // Nenhum vínculo ainda: o saldo é o contrato inteiro.
  await expect(linha).toContainText("500 × 0 = 500");

  // O item entra DEPOIS de Assinantes (prompt §4).
  const itens = await page.locator(".sidebar-it, aside a").allTextContents();
  const indiceAssinantes = itens.findIndex((texto) => texto.includes("Assinantes"));
  const indicePatrocinadores = itens.findIndex((texto) => texto.includes("Patrocinadores"));
  expect(indicePatrocinadores).toBeGreaterThan(indiceAssinantes);

  await semViolacoesAxe(page);
});

test("T32 — sem adquiridas confirmadas, a célula é traço com motivo, jamais zero", async ({
  page,
}) => {
  await semearPatrocinador(null);
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/patrocinadores");

  const linha = page.getByRole("row").filter({ hasText: NOME });
  await expect(linha).toContainText("aguarda o número de assinaturas adquiridas");
  // O que NÃO pode aparecer: um zero que afirmaria não haver vaga.
  await expect(linha).not.toContainText("= 0");
});

test("T32 — a busca por CNPJ com pontuação encontra, e por texto qualquer não devolve tudo", async ({
  page,
}) => {
  await semearPatrocinador(500);
  await entrar(page, "gestor@dev.clubebroto.local");

  await page.goto("/patrocinadores?busca=11.222.333%2F0001-81");
  await expect(page.getByRole("row").filter({ hasText: NOME })).toBeVisible();

  await page.goto("/patrocinadores?busca=inexistente-zzz");
  await expect(page.getByRole("row").filter({ hasText: NOME })).toHaveCount(0);
  await expect(page.getByText("Nenhum patrocinador com estes filtros")).toBeVisible();
});

test("T33 — as quatro abas, o selo de cada card de Consumo e a ausência com motivo", async ({
  page,
}) => {
  const id = await semearPatrocinador(null);
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto(`/patrocinadores/${id}`);

  await expect(page.getByRole("heading", { name: NOME, level: 1 })).toBeVisible();
  // Aba Contrato: campos sem valor exibem o motivo, não um vazio mudo.
  await expect(page.getByText("aguarda o número contratado")).toBeVisible();
  await expect(page.getByText("sem minuta")).toBeVisible();

  await page.goto(`/patrocinadores/${id}?aba=consumo`);
  await expect(page.getByRole("heading", { name: "Base por perfil e ativação" })).toBeVisible();
  await expect(page.getByText("vivo", { exact: true })).toBeVisible();
  // Os cards em espera trazem o selo E a razão da espera — nunca um número.
  await expect(page.getByText("aguarda chave", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("aguarda fonte", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/requisição enviada à operadora em 27\/07/).first()).toBeVisible();
  // "carta pendente" é o texto que o prompt §6 proíbe.
  await expect(page.getByText(/carta pendente/)).toHaveCount(0);

  await page.goto(`/patrocinadores/${id}?aba=base`);
  await expect(page.getByText("Nenhum assinante vinculado")).toBeVisible();

  await page.goto(`/patrocinadores/${id}?aba=campanhas`);
  await expect(page.getByText("Nenhuma campanha deste patrocinador")).toBeVisible();

  await semViolacoesAxe(page);
});

test("T33 — a minuta recusa imagem nomeando o formato, e o PDF é aceito", async ({ page }) => {
  const id = await semearPatrocinador(500);
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto(`/patrocinadores/${id}`);

  const campo = page.getByLabel("Anexar a minuta");
  await expect(campo).toBeVisible();
  // A dica declara a régua, com o teto em MB — não "2048 KB".
  await expect(page.getByText(/PDF, até 2 MB/)).toBeVisible();

  await campo.setInputFiles({
    name: "contrato.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  });
  await page.getByRole("button", { name: "Anexar minuta" }).click();
  await expect(page.getByText(/A minuta não aceita PNG/)).toBeVisible();

  await campo.setInputFiles({
    name: "contrato.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nconteudo de teste\n%%EOF\n"),
  });
  await page.getByRole("button", { name: "Anexar minuta" }).click();
  await expect(page.getByText("Minuta anexada ao contrato.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Substituir minuta" })).toBeVisible();
});

test("R1 — o relatório sai agregado, com período e finalidade registrados", async ({ page }) => {
  const id = await semearPatrocinador(500);
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto(`/patrocinadores/${id}`);

  await page.getByRole("button", { name: "Gerar relatório" }).click();
  await page.getByLabel("Período — início").fill("2026-02-01");
  await page.getByLabel("Período — fim").fill("2026-07-31");
  await page.getByLabel("Finalidade").fill("prestação de contas do e2e");
  // A ação redireciona para o documento; esperar a URL é mais honesto do
  // que recarregar — recarregar abortaria o redirect em voo.
  await page.getByRole("button", { name: "Gerar", exact: true }).click();
  await page.waitForURL(/\/patrocinadores\/.+\/relatorio\/.+/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: NOME, level: 1 })).toBeVisible();
  await expect(page.getByText("prestação de contas do e2e")).toBeVisible();
  await expect(page.getByText(/Não contém dado pessoal identificável/)).toBeVisible();
  await semViolacoesAxe(page);
});

test("quem só lê vê a ficha e não vê campo de envio da minuta", async ({ page }) => {
  const id = await semearPatrocinador(500);
  await entrar(page, "leitura@dev.clubebroto.local");
  await page.goto(`/patrocinadores/${id}`);

  await expect(page.getByRole("heading", { name: NOME, level: 1 })).toBeVisible();
  await expect(page.getByLabel("Anexar a minuta")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo patrocinador" })).toHaveCount(0);
  // Leitura é para todos os papéis (RN62): a ficha abre inteira.
  await expect(page.getByText("sem minuta — pendência")).toBeVisible();
});
