import { expect, test, type Page } from "@playwright/test";
import {
  entrar,
  limparAliadoPorNome,
  runId,
  semViolacoesAxe,
  semearEmpresaRadar,
} from "./ajudantes";

/**
 * F6 pela interface, reescrita como testes ISOLADOS: cada teste semeia sua
 * própria precondição de radar direto no banco (via Prisma) e exercita a
 * ação de UI que verifica. Nenhum teste depende de outro — o antigo
 * describe.serial refazia toda a cadeia no retry e o SUFIXO = Date.now()
 * mudava a cada reload de worker. Agora runId() é estável e a semeadura é
 * idempotente (deleta o homônimo antes de criar).
 *
 * Cobertura preservada: entrada no radar (T9, RN13), kanban da T8 operado
 * 100% por teclado (RN14/RN17), reativação de descartada e importação de
 * lista com deduplicação. axe-core nas telas novas.
 */

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

test.describe("funil e radar — T8/T9 (F6) — testes isolados", () => {
  test("RN13 na interface: sem origem não entra; completo entra como Mapeada", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-rn13`;
    await limparAliadoPorNome(nome); // idempotência

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado/radar");

    await page.getByLabel("Nome", { exact: true }).fill(nome);
    await page.getByRole("checkbox", { name: "Tecnologia e Software" }).check();
    await page.getByRole("button", { name: "Adicionar ao radar" }).click();
    await expect(page.locator('[role="alert"].aviso-inline')).toContainText("RN13");

    await page.getByLabel("Nome", { exact: true }).fill(nome);
    await page.getByLabel("Origem").selectOption("SCOUTING_ATIVO");
    await page.getByRole("checkbox", { name: "Tecnologia e Software" }).check();
    await page.getByRole("button", { name: "Adicionar ao radar" }).click();
    await expect(page.getByRole("status")).toContainText("incluída no radar como Mapeada");
  });

  test("kanban só por teclado: Enter abre o menu, Esc devolve o foco, mover sem mouse (RN14)", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-mover`;
    // Semeia Mapeada SEM responsável — o move (RN14) deve atribuir o scout.
    await semearEmpresaRadar(nome, {
      estagio: "MAPEADA",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");
    // F9: a T8 ganhou as abas Funil · Cobertura · Metas e o título passou a
    // ser o da aba corrente, como no protótipo v6.1.
    await expect(page.getByRole("heading", { level: 1, name: "Funil de mercado" })).toBeVisible();

    // Tab até o gatilho do card; Enter abre o menu com foco no 1º item
    await tabAteAcoesDoCard(page, nome);
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: `Ações de ${nome}` });
    await expect(menu).toBeVisible();
    await expect
      .poll(() => rotuloFocado(page))
      .toContain("Mover para Em avaliação");

    // Esc fecha e devolve o foco ao gatilho
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect.poll(() => rotuloFocado(page)).toContain(`Ações de ${nome}`);

    // Reabre e move para Em avaliação apenas com o teclado (RN14: assume)
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("movida para Em avaliação");
    const laneEmAvaliacao = page
      .locator(".kb-lane", { has: page.getByText("Em avaliação", { exact: true }) })
      .first();
    await expect(laneEmAvaliacao.getByText(nome)).toBeVisible();
    // RN14: quem assumiu vira responsável de scout, visível no card
    await expect(
      laneEmAvaliacao.locator(".kb-card", { hasText: nome }).getByText(/Responsável:/),
    ).toBeVisible();
  });

  test("descartar sem mouse: modal com motivo tipificado obrigatório (RN17)", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-descarte`;
    // Em avaliação ⇒ o menu do card tem 3 itens (Mapeada, Priorizada,
    // Descartar…), como o fluxo original ao chegar no descarte.
    await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    await tabAteAcoesDoCard(page, nome);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu", { name: `Ações de ${nome}` })).toBeVisible();
    // Itens: Mover para Mapeada, Mover para Priorizada, Descartar…
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect.poll(() => rotuloFocado(page)).toContain("Descartar");
    await page.keyboard.press("Enter");

    const modal = page.getByRole("dialog", { name: `Descartar ${nome}` });
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
    await expect(page.locator(".kb-card", { hasText: nome })).toHaveCount(0);
  });

  test("descartada aparece na tabela e a reativação volta a Mapeada (RN17)", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-reativar`;
    await semearEmpresaRadar(nome, {
      estagio: "DESCARTADA",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
      motivoDescarteSlug: "SEM_FIT_DE_NEGOCIO",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado?visao=tabela");
    const linha = page.getByRole("row", { name: new RegExp(nome) });
    await expect(linha.getByText("Descartada")).toBeVisible();
    await linha.getByRole("button", { name: "Reativar" }).click();
    await expect(page.getByRole("status")).toContainText("voltou a Mapeada");

    await page.goto("/mercado");
    const laneMapeada = page
      .locator(".kb-lane", { has: page.getByText("Mapeada", { exact: true }) })
      .first();
    await expect(laneMapeada.getByText(nome)).toBeVisible();
  });

  test("importação em três passos: upload → mapeamento → resumo com deduplicação", async ({ page }) => {
    const nomeRadar = `Radar E2E ${runId()}-import`;
    const nomeProspect = `Prospect E2E ${runId()}-import`;
    // O radar já contém `nomeRadar` (será deduplicado); `nomeProspect` é novo.
    await semearEmpresaRadar(nomeRadar, {
      estagio: "MAPEADA",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });
    await limparAliadoPorNome(nomeProspect); // garante que o prospect entra como novo

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado/radar?importar=1");

    const csv = [
      "Empresa;Site;Segmento",
      `${nomeProspect};https://prospect.e2e.local;Tecnologia e Software`,
      `${nomeRadar};;Tecnologia e Software`,
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
    await expect(laneMapeada.getByText(nomeProspect)).toBeVisible();
    await expect(laneMapeada.locator(".kb-card", { hasText: nomeProspect }).getByText("via Lista importada")).toBeVisible();
  });

  test("axe-core limpo na T8 (kanban e tabela) e na T9", async ({ page }) => {
    // Garante ≥1 card no kanban para a varredura cobrir também os cards.
    await semearEmpresaRadar(`Radar E2E ${runId()}-axe`, {
      estagio: "MAPEADA",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");
    await semViolacoesAxe(page);
    await page.goto("/mercado?visao=tabela");
    await semViolacoesAxe(page);
    await page.goto("/mercado/radar");
    await semViolacoesAxe(page);
  });
});
