import { expect, test, type Page } from "@playwright/test";
import {
  entrar,
  runId,
  semViolacoesAxe,
  semearAliadoAtivoComContrato,
  semearAvaliacaoFechada,
  semearEmpresaRadar,
} from "./ajudantes";

/**
 * F7 pela interface — T10 (avaliação com score) em testes isolados, no
 * mesmo padrão da F6: cada teste semeia sua precondição direto no banco.
 *
 * Cobertura: formulário por dimensão operado por teclado (radiogroup com
 * setas), score ao vivo, conclusão com confirmação (RN18), RN15 na T8
 * (priorizar exige avaliação fechada, e a decisão segue humana), entrada
 * pela ação "Avaliar (ScoutCB)" do card e axe-core na T10 (formulário,
 * modal e estado vazio).
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

/** Percorre a tela só com Tab até o foco alcançar o rótulo desejado. */
async function tabAteRotulo(page: Page, trecho: string) {
  for (let tentativa = 0; tentativa < 160; tentativa += 1) {
    await page.keyboard.press("Tab");
    if ((await rotuloFocado(page)).includes(trecho)) {
      return;
    }
  }
  throw new Error(`Tab não alcançou o rótulo "${trecho}"`);
}

/** Abre o menu de ações do card no kanban (clique no gatilho). */
async function abrirMenuDoCard(page: Page, nome: string) {
  await page.getByRole("button", { name: `Ações de ${nome}` }).click();
  await expect(page.getByRole("menu", { name: `Ações de ${nome}` })).toBeVisible();
}

test.describe("avaliação e score — T10 (F7) — testes isolados", () => {
  test("T10 pelo teclado: nota com setas, evidência, score ao vivo e conclusão (RN18)", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-t10`;
    const empresa = await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto(`/mercado/${empresa.id}/avaliacao`);
    await expect(
      page.getByRole("heading", { level: 1, name: `Avaliação — ${nome}` }),
    ).toBeVisible();
    await expect(page.getByText("versão 1 (nova)")).toBeVisible();

    // Teclado: Tab até o primeiro radiogroup, Enter seleciona a nota 1 e
    // as setas caminham 1→4 (aria-checked acompanha, padrão radiogroup).
    await tabAteRotulo(page, "Nota 1");
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("radiogroup", { name: /Presença geográfica/ })
        .getByRole("radio", { name: "Nota 1" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(
      page
        .getByRole("radiogroup", { name: /Presença geográfica/ })
        .getByRole("radio", { name: "Nota 4" }),
    ).toHaveAttribute("aria-checked", "true");

    // Tab sai do radiogroup direto na evidência do indicador (input
    // rotulado por <label> sr-oculto — a asserção usa o id do campo)
    await page.keyboard.press("Tab");
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ""))
      .toBe("ev-PRESENCA_GEOGRAFICA_UFS_ATENDIDAS");
    await page.keyboard.type("Atende 12 UFs segundo o site institucional.");

    // Score ao vivo: única dimensão avaliada, nota 4 → subtotal e total 80
    await expect(page.getByText("80", { exact: true }).first()).toBeVisible();

    // Segunda dimensão (Fit de Negócio) — subtotal 40 → total (80+40)/2 = 60
    await page.getByRole("button", { name: /Fit de Negócio/ }).click();
    await page
      .getByRole("radiogroup", { name: /Culturas atendidas/ })
      .getByRole("radio", { name: "Nota 2" })
      .click();
    await expect(page.getByRole("button", { name: /Fit de Negócio/ })).toContainText(
      "subtotal 40",
    );

    // Recomendação explícita e conclusão com confirmação (RN18)
    await page.getByRole("radio", { name: "Avançar" }).check();
    await page.getByRole("button", { name: "Concluir avaliação" }).click();
    const modal = page.getByRole("dialog", { name: `Concluir avaliação de ${nome}` });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("imutável (RN18)");
    await modal.getByRole("button", { name: "Concluir avaliação" }).click();
    await expect(page.getByRole("status")).toContainText("score 60");

    // Persistido: v1 fechada no histórico; a tela abre a próxima versão
    // pré-preenchida e compara com a anterior (RN18).
    await page.reload();
    await expect(page.getByText("versão 2 (nova)")).toBeVisible();
    await expect(page.getByText(/Versão anterior:/)).toContainText("60");
    await expect(page.getByText(/v1 · /)).toContainText("Avançar");
  });

  test("RN15 na T8: priorizar exige avaliação fechada; avaliar pelo menu do card", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-rn15`;
    await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    // Sem avaliação fechada, mover para Priorizada é barrado (RN15)
    await abrirMenuDoCard(page, nome);
    await page.getByRole("menuitem", { name: "Mover para Priorizada" }).click();
    await expect(page.getByRole("status")).toContainText("RN15");

    // O próprio menu leva à avaliação
    await abrirMenuDoCard(page, nome);
    await page.getByRole("menuitem", { name: "Avaliar (ScoutCB)" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: `Avaliação — ${nome}` }),
    ).toBeVisible();

    // Avaliação mínima: uma nota e recomendação, concluída (score 3×20 = 60)
    await page
      .getByRole("radiogroup", { name: /Presença geográfica/ })
      .getByRole("radio", { name: "Nota 3" })
      .click();
    await page.getByRole("radio", { name: "Monitorar" }).check();
    await page.getByRole("button", { name: "Concluir avaliação" }).click();
    await page
      .getByRole("dialog", { name: `Concluir avaliação de ${nome}` })
      .getByRole("button", { name: "Concluir avaliação" })
      .click();
    await expect(page.getByRole("status")).toContainText("score 60");

    // Com a avaliação fechada, a priorização (decisão humana) passa
    await page.goto("/mercado");
    await abrirMenuDoCard(page, nome);
    await page.getByRole("menuitem", { name: "Mover para Priorizada" }).click();
    await expect(page.getByRole("status")).toContainText("movida para Priorizada");
    await page.reload();
    const lanePriorizada = page
      .locator(".kb-lane", { has: page.getByText("Priorizada", { exact: true }) })
      .first();
    await expect(lanePriorizada.getByText(nome)).toBeVisible();
    // O card exibe o score da avaliação fechada
    await expect(
      lanePriorizada.locator(".kb-card", { hasText: nome }).getByText("score 60"),
    ).toBeVisible();
  });

  test("aba Scouting (Modelo C): reavaliar aliado ativo e gaveta de histórico com a versão atual", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-scoutaba`;
    const empresa = await semearAliadoAtivoComContrato(nome);
    // Duas versões fechadas: a gaveta lista as duas, com a atual incluída.
    await semearAvaliacaoFechada(empresa.id, { versoes: 2 });

    // Scout (avaliador) em aliado ATIVO: vê "Reavaliar" (RN21) e o histórico.
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto(`/aliados/${empresa.id}?aba=scouting`);
    await expect(
      page.getByRole("heading", { name: /Última avaliação fechada · versão 2/ }),
    ).toBeVisible();
    const reavaliar = page.getByRole("link", { name: "Reavaliar (nova versão)" });
    await expect(reavaliar).toBeVisible();
    await expect(reavaliar).toHaveAttribute("href", `/mercado/${empresa.id}/avaliacao`);

    // Gaveta: todas as versões, a atual marcada e expandida (comparação).
    await page.getByRole("button", { name: /Ver histórico/ }).click();
    const gaveta = page.getByRole("dialog", { name: /Histórico de avaliações/ });
    await expect(gaveta).toBeVisible();
    await expect(gaveta.getByText("atual")).toBeVisible();
    await expect(gaveta.getByText("Versão 1")).toBeVisible();
    await expect(gaveta.getByText("Versão 2")).toBeVisible();
    // A recomendação de cada versão aparece no histórico (semeada como Avançar).
    await expect(gaveta.getByText("Avançar").first()).toBeVisible();
    await gaveta.getByRole("button", { name: "Fechar histórico" }).click();
    await expect(gaveta).toBeHidden();

    // Leitura NÃO pode reavaliar (RBAC), mas consulta o histórico normalmente.
    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto(`/aliados/${empresa.id}?aba=scouting`);
    await expect(page.getByRole("button", { name: /Ver histórico/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reavaliar (nova versão)" })).toHaveCount(0);
  });

  test("axe-core limpo na T10: formulário, modal de conclusão e estado vazio", async ({ page }) => {
    const nomeForm = `Radar E2E ${runId()}-axet10`;
    const empresaForm = await semearEmpresaRadar(nomeForm, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });
    const nomeVazio = `Radar E2E ${runId()}-axevazio`;
    const empresaVazia = await semearEmpresaRadar(nomeVazio, {
      estagio: "MAPEADA",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");

    await page.goto(`/mercado/${empresaForm.id}/avaliacao`);
    await semViolacoesAxe(page);
    await page.getByRole("button", { name: "Concluir avaliação" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await semViolacoesAxe(page);
    await page.keyboard.press("Escape");

    // Estado vazio: Mapeada não abre avaliação (RN14) — tela informa e guia
    await page.goto(`/mercado/${empresaVazia.id}/avaliacao`);
    await expect(page.getByText("Nenhuma avaliação registrada")).toBeVisible();
    await semViolacoesAxe(page);
  });
});
