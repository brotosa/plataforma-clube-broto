import { mkdirSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { ORDEM_MODULOS, ROTA_DO_MODULO, arquivoDaTela } from "@/conteudo/manual-usuario/conteudo";
import { entrar } from "./ajudantes";

/**
 * **Gerador das imagens de tela do Manual do usuário — não é teste de
 * comportamento.** Roda só sob `CAPTURAR_TELAS=1`; no CI (sem a flag) fica
 * pulado de propósito, porque escreve arquivos em `public/manual/` e não
 * verifica nada. Regenera as capturas quando as telas mudam:
 *
 *   CAPTURAR_TELAS=1 CHROMIUM_EXECUTAVEL=/opt/pw-browsers/chromium-*\/chrome-linux/chrome \
 *     npx playwright test e2e/capturar-telas-manual.spec.ts --project=desktop
 *
 * Uma captura por MÓDULO (a escolha do usuário), na resolução do projeto
 * desktop (1280×800), logado como Administrador da Plataforma — o único
 * papel que alcança todas as telas (só o Parametrizador exige permissão de
 * visão; os demais módulos renderizam para qualquer sessão). Os dados são os
 * do seed local: PF é sintética (SINTÉTICO), e-mails de auditoria são de
 * contas `@dev.clubebroto.local` — nada real de pessoa física entra na
 * imagem.
 */

test.skip(!process.env.CAPTURAR_TELAS, "gerador de imagens: rode com CAPTURAR_TELAS=1");

test("capturar as telas do manual (uma por módulo)", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync("public/manual", { recursive: true });
  await entrar(page, "administrador@dev.clubebroto.local");

  for (const modulo of ORDEM_MODULOS) {
    const rota = ROTA_DO_MODULO[modulo];
    await page.goto(rota);
    // Confirma que a rota é a esperada (nenhum redirecionamento silencioso
    // por falta de permissão) antes de fotografar.
    await expect(page).toHaveURL(new RegExp(`${rota.replace("/", "\\/")}(\\?|$|#|\\/)`));
    await page.locator("main :is(h1, .h-page)").first().waitFor({ state: "visible", timeout: 15_000 });
    // Deixa KPIs/animações assentarem para a imagem não sair no meio da transição.
    await page.waitForTimeout(700);
    // `arquivoDaTela` devolve o caminho público ("/manual/x.png"); a captura
    // grava o mesmo arquivo dentro de `public/`.
    await page.screenshot({ path: `public${arquivoDaTela(modulo)}`, animations: "disabled" });
  }
});
