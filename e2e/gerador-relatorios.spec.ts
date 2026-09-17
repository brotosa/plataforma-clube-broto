import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { entrar, resolverDatabaseUrl, semViolacoesAxe } from "./ajudantes";

/**
 * T36 — Gerador de relatórios (Onda 16, F24).
 *
 * O que estes testes cobrem é o que os testes de unidade não alcançam: que a
 * cadeia inteira funciona contra o banco de verdade — tela → server action →
 * caso de uso → compilador → Postgres → pivô → tela.
 *
 * Os dois que mais importam não são os do caminho feliz:
 *
 *  • **a prévia produz NÚMERO**, e não uma tabela vazia. Todo o resto pode
 *    passar com o SQL devolvendo zero linhas: as gavetas enchem, o layout
 *    monta, nada reclama. O teste confere que há valor na célula;
 *  • **o compartilhado roda com a permissão de quem ABRE** (RN76). É a regra
 *    cujo defeito é invisível — o relatório funciona, só entrega dado demais.
 */

resolverDatabaseUrl();

const prisma = new PrismaClient();
const MARCA = "[E2E-F24]";

test.afterAll(async () => {
  await prisma.execucaoRelatorio.deleteMany({
    where: { relatorio: { nome: { startsWith: MARCA } } },
  });
  await prisma.relatorioSalvo.deleteMany({ where: { nome: { startsWith: MARCA } } });
  await prisma.$disconnect();
});

test.describe.serial("T36 — montar, prever, salvar e exportar", () => {
  test("a abertura lista os assuntos que o papel alcança", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios");

    await expect(page.getByRole("heading", { name: "Gerador de relatórios" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ofertas do Clube" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rede de Aliados" })).toBeVisible();
  });

  test("montar por teclado produz número — o arrasto não é o único caminho", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    // Os botões L/C/V são o caminho completo (disciplina da RN57): quem
    // navega por teclado precisa chegar ao mesmo resultado do arrasto.
    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();

    const tabela = page.locator(".rel-resultado table");
    await expect(tabela).toBeVisible({ timeout: 20_000 });

    // A asserção que importa: há LINHA e há NÚMERO. Sem ela, o teste passaria
    // com a consulta devolvendo vazio — o layout monta igual.
    const primeiraMedida = tabela.locator("tbody tr").first().locator("td.num").first();
    await expect(primeiraMedida).toBeVisible();
    const texto = (await primeiraMedida.innerText()).replace(/\./g, "").trim();
    expect(Number(texto)).toBeGreaterThan(0);

    await expect(page.getByText(/linhas? nesta amostra/)).toBeVisible();
  });

  test("a medida se escolhe sozinha ao pôr um número em Valores", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();
    await page.getByRole("button", { name: "Pôr Preço por em Valores" }).click();

    // Número vira média, e não soma: somar preços de ofertas distintas não
    // significa nada, e a pessoa nunca precisou saber que existe AVG.
    await expect(page.getByLabel("Medida de Preço por")).toHaveValue("MEDIA");
  });

  test("campo sem fonte aparece apagado e não entra em gaveta nenhuma (RN77)", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    // Ele existe na tela — sumir faria quem não o vê abrir chamado.
    await expect(page.getByText("Resgates", { exact: true })).toBeVisible();
    await expect(page.getByText(/divergem \(RN68\)/)).toBeVisible();
    // E não tem por onde ser usado.
    await expect(page.getByRole("button", { name: /Pôr Resgates em/ })).toHaveCount(0);
  });

  test("filtro estreita o resultado, e a recusa do compilador chega à tela", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");

    await page.getByRole("button", { name: "Pôr UF da sede em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    // Média sobre junção que multiplica: o compilador recusa, e a mensagem
    // dele É a interface (RN55) — ela explica por que o número seria falso.
    await page.getByRole("button", { name: "Pôr Categoria em Linhas" }).click();
    await page.getByRole("button", { name: "Pôr Score de scouting em Valores" }).click();
    await page.getByLabel("Medida de Score de scouting").selectOption("MEDIA");

    // Localizado pelo TEXTO, e não por `getByRole("alert")` sozinho: o Next
    // mantém um `<div role="alert">` próprio para anunciar navegação, e ele
    // casaria junto. Antes isto mirava uma classe `.aviso-erro` que eu havia
    // inventado e que não existe no CSS — o localizador funcionava, e a
    // mensagem aparecia sem o estilo de erro. A recusa agora usa o
    // `ErrosDoFormulario` que a plataforma já tinha.
    await expect(page.getByText(/ficariam infladas/)).toBeVisible({ timeout: 20_000 });
  });

  test("salvar põe na prateleira e abrir recarrega a definição", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const nome = `${MARCA} ofertas por situação`;
    await page.getByLabel("Nome do relatório").fill(nome);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("salvo");

    await page.goto("/relatorios");
    await page.getByRole("heading", { name: nome }).click();

    // Reabriu com a definição guardada: o chip está na gaveta de novo.
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByRole("button", { name: /Tirar Situação de Linhas/ })).toBeVisible();
  });

  test("exportar em CSV devolve arquivo com cabeçalho e dado", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");
    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Exportar (CSV)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^relatorio-ofertas-do-clube-\d{4}-\d{2}-\d{2}\.csv$/);

    const caminho = await download.path();
    const conteudo = caminho ? (await import("node:fs")).readFileSync(caminho, "utf8") : "";
    expect(conteudo.startsWith("﻿")).toBe(true);
    expect(conteudo).toContain("Situação;");
    // Uma linha de dado além do cabeçalho — CSV só com cabeçalho passaria
    // por todas as outras asserções.
    expect(conteudo.trim().split("\r\n").length).toBeGreaterThan(1);
  });

  test("toda execução fica na trilha operacional (RN78)", async ({ page }) => {
    const antes = await prisma.execucaoRelatorio.count();

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");
    await page.getByRole("button", { name: "Pôr Estágio em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(() => prisma.execucaoRelatorio.count(), { timeout: 15_000 })
      .toBeGreaterThan(antes);

    const ultima = await prisma.execucaoRelatorio.findFirst({ orderBy: { criadoEm: "desc" } });
    expect(ultima?.assuntoSlug).toBe("aliados");
    expect(ultima?.linhas).toBeGreaterThan(0);
  });

  test("axe-core (AAA) sem violações na abertura e no construtor", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    for (const rota of ["/relatorios", "/relatorios?assunto=ofertas"]) {
      await page.goto(rota);
      await semViolacoesAxe(page);
    }
  });
});

/**
 * RN76 — a metade que só se prova com duas contas.
 *
 * O relatório é compartilhado por quem pode ver o assunto; outra pessoa o
 * abre e a consulta roda com a permissão DELA. Hoje os dois assuntos da F24
 * exigem `VISUALIZAR`, que todo papel tem, então o que se pode provar aqui é
 * que o compartilhado aparece para o outro e abre — a negativa por papel só
 * ganhará teste quando a F26 trouxer um assunto de alcance restrito.
 *
 * Deixar isto escrito importa mais que o teste: quem for implementar a F26
 * precisa saber que esta é a garantia a exercitar, e que ela ainda não está
 * exercitada.
 */
test.describe.serial("RN76 — relatório do time", () => {
  test("o que é compartilhado aparece para outra conta", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");
    await page.getByRole("button", { name: "Pôr Estágio em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const nome = `${MARCA} rede por estágio`;
    await page.getByLabel("Nome do relatório").fill(nome);
    await page.getByLabel("Quem vê este relatório").selectOption("TIME");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Do time");

    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();

    await page.getByRole("heading", { name: nome }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });
  });

  test("o privado de um não aparece para o outro", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");
    await page.getByRole("button", { name: "Pôr Natureza em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const nome = `${MARCA} so do analista`;
    await page.getByLabel("Nome do relatório").fill(nome);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Meus relatórios");

    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: nome })).toHaveCount(0);
  });
});
