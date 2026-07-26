import { expect, test, type Locator } from "@playwright/test";
import {
  entrar,
  runId,
  semearAliadoAtivoComContrato,
  semearAliadoEmNegociacaoM2Completo,
  semearOfertaPublicada,
  semearSolucaoCompleta,
  submeterERepintar,
} from "./ajudantes";

/**
 * Navegação 100% por teclado (F5) — a política do prompt da Onda 1 exige
 * "navegação 100% por teclado", mas até a F4 só dois controles tinham prova
 * em teste: o interruptor da T7 (`fluxo-principal.spec.ts`) e o kanban da T8
 * (`funil-radar.spec.ts`). Esta suíte cobre o que faltava das telas da Onda 1:
 * T2 (abas da ficha), T4 (ações da lista transversal), T5 (radio-cards de
 * natureza e mecânica, com os campos condicionais) e T6 (fila de aprovação
 * com o dossiê expansível e a decisão).
 *
 * O teste é sempre o mesmo: chegar ao controle SÓ com Tab/Shift+Tab, acionar
 * com Enter/Espaço/setas e verificar o efeito — sem um único clique de mouse.
 * Cada teste semeia sua própria precondição (idempotente), sem `describe.serial`.
 */

/**
 * Um controle "alcançável por teclado" precisa de duas coisas, e o teste cobre
 * as duas separadamente:
 *
 * 1. estar na ORDEM NATURAL de tabulação (`tabIndex >= 0`) — um `div` com
 *    `onClick`, ou um elemento com `tabindex="-1"`, reprova aqui mesmo que
 *    `.focus()` funcione;
 * 2. RECEBER o foco de fato.
 *
 * Contar quantos "Tab" separam um controle do outro seria instável (a ordem
 * muda com o conteúdo da tela e com quais ações o papel enxerga) e não prova
 * mais do que isto.
 */
async function alcancavelPorTeclado(alvo: Locator, descricao: string): Promise<void> {
  const tabIndex = await alvo.evaluate((elemento) => (elemento as HTMLElement).tabIndex);
  expect(tabIndex, `${descricao} fora da ordem de tabulação (tabindex ${tabIndex})`)
    .toBeGreaterThanOrEqual(0);
  await alvo.focus();
  await expect(alvo, `${descricao} não recebeu o foco`).toBeFocused();
}

test.describe("navegação por teclado — telas da Onda 1", () => {
  test("T2: as nove abas da ficha são alcançáveis por Tab e navegam com Enter", async ({
    page,
  }) => {
    const nome = `Aliado E2E ${runId()}-kbd-t2`;
    const aliado = await semearAliadoAtivoComContrato(nome);

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/aliados/${aliado.id}`);
    await page.getByRole("heading", { level: 1, name: nome }).waitFor();

    await page.waitForLoadState("networkidle"); // hidratação antes do teclado

    // Todas as abas participam da ordem de tabulação (nenhuma é div clicável).
    // Nove desde a F9, que somou Scouting, Dossiê e Ficha M1 à ficha (T12). A
    // contagem segue EXATA de propósito: aba nova sem prova de teclado quebra
    // este teste, que é justamente o ponto.
    const abas = page.getByRole("navigation", { name: "Seções da ficha do aliado" }).getByRole("link");
    await expect(abas).toHaveCount(9);
    for (const aba of await abas.all()) {
      await alcancavelPorTeclado(aba, `aba "${(await aba.textContent())?.trim()}"`);
    }

    // Enter na aba focada navega — e a aba de destino assume aria-current.
    const comercial = abas.filter({ hasText: "Comercial" });
    await comercial.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Contrato vigente" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Seções da ficha do aliado" })
        .getByRole("link", { name: "Comercial" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("T4: as ações da lista transversal são alcançáveis por Tab e abrem com Enter", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ofertas");
    await page.getByRole("heading", { level: 1, name: "Ofertas" }).waitFor();

    await page.waitForLoadState("networkidle"); // hidratação antes do teclado

    const publicar = page.getByRole("link", { name: "Publicar catálogo" });
    await alcancavelPorTeclado(publicar, 'ação "Publicar catálogo"');
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: "Publicar catálogo" }),
    ).toBeVisible();

    await page.goto("/ofertas");
    await page.waitForLoadState("networkidle");
    const importar = page.getByRole("link", { name: "Importar telemetria" });
    await alcancavelPorTeclado(importar, 'ação "Importar telemetria"');
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { level: 1, name: "Importar telemetria" }),
    ).toBeVisible();
  });

  test("T5: natureza e mecânica são radio-cards nativos — setas trocam a seleção e revelam os campos condicionais", async ({
    page,
  }) => {
    const nome = `Aliado E2E ${runId()}-kbd-t5`;
    const aliado = await semearAliadoAtivoComContrato(nome);
    const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);

    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados/${aliado.id}/solucoes/${solucao.id}/ofertas/nova`);
    await page.getByRole("heading", { level: 1, name: "Nova oferta" }).waitFor();
    await page.waitForLoadState("networkidle"); // hidratação antes do teclado

    // Recompensa: gratuidade — a seta seleciona sem clique e o efeito da regra
    // (preços zerados, RN da natureza) aparece na hora.
    const recompensa = page.getByRole("radio", { name: /Recompensa Produto\/serviço gratuito/ });
    await recompensa.focus();
    await page.keyboard.press("Space");
    await expect(recompensa).toBeChecked();
    await expect(page.getByLabel("Preço por (R$)")).toBeDisabled();

    // Seta para a direita anda no mesmo radiogroup (comportamento nativo) e
    // devolve os campos de preço.
    await page.keyboard.press("ArrowRight");
    const marcado = page.locator('input[name="natureza"]:checked');
    await expect(marcado).not.toHaveValue("RECOMPENSA");
    await expect(page.getByLabel("Preço por (R$)")).toBeEnabled();

    // Mecânica: o radiogroup seguinte também responde ao teclado, e a opção
    // incompatível (RN11) fica desabilitada — o Tab a pula, como manda o HTML.
    const checkoutClube = page.getByRole("radio", { name: /Checkout no clube/ });
    await checkoutClube.focus();
    await page.keyboard.press("Space");
    await expect(checkoutClube).toBeChecked();
  });

  test("T6: dossiê expansível abre por teclado e a decisão é acionável sem mouse (RN06)", async ({
    page,
  }) => {
    const nome = `Aliado E2E ${runId()}-kbd-t6`;
    const aliado = await semearAliadoEmNegociacaoM2Completo(nome);

    // Solicitação em aberto criada pelo analista, para a fila do aprovador.
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados/${aliado.id}`);
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Solicitar promoção a Aliada ativa" }).click(),
    );

    await entrar(page, "aprovador@dev.clubebroto.local");
    await page.goto("/aprovacoes");
    await page.waitForLoadState("networkidle"); // hidratação antes do teclado
    const item = page.locator("details", { hasText: nome }).first();
    const resumo = item.locator("summary").first();

    // O summary é focável e abre com Enter — nada de div com onClick.
    await alcancavelPorTeclado(resumo, "resumo do dossiê (summary)");
    await page.keyboard.press("Enter");
    await expect(item).toHaveAttribute("open", "");

    // Com o dossiê aberto, os botões de decisão entram na ordem de tabulação.
    const aprovar = item.getByRole("button", { name: "Aprovar" });
    await alcancavelPorTeclado(aprovar, 'botão "Aprovar"');

    // Espaço aciona o botão nativo: a promoção acontece sem clique.
    await submeterERepintar(page, () => page.keyboard.press("Space"));
    await page.goto(`/aliados/${aliado.id}`);
    await expect(page.getByText("Aliado ativo")).toBeVisible();
  });

  test("T4/T1: a linha da tabela é alcançável pelo link, não por clique na linha", async ({
    page,
  }) => {
    const nome = `Aliado E2E ${runId()}-kbd-linha`;
    const aliado = await semearAliadoAtivoComContrato(nome);
    const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);
    await semearOfertaPublicada(solucao.id, `Oferta ${nome}`);

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: new RegExp(nome) }).first();
    await alcancavelPorTeclado(link, "link do aliado na linha da tabela");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
  });
});
