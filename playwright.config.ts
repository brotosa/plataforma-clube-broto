import { defineConfig } from "@playwright/test";

/**
 * E2E dos fluxos, acessibilidade (axe-core em modo AAA) e responsividade.
 * O servidor de produção (`next start`) é levantado automaticamente;
 * o banco precisa estar migrado e com seed (ver README).
 *
 * Dois projetos, mesma disciplina de estabilidade (setup idempotente por
 * teste, sem `describe.serial` novo, sem `continue-on-error` no CI):
 * • `desktop`   — 1280×800, todas as suítes exceto a de responsividade;
 * • `mobile-380` — 380×740, só `responsividade.spec.ts` (F5: T1/T4/T6
 *   plenamente usáveis a 380px; T2/T3/T5/T7 íntegras com o aviso de edição
 *   preferencial em desktop).
 * Rodam em sequência (workers:1, fullyParallel:false) sobre o mesmo banco.
 */
const SUITE_RESPONSIVA = /responsividade\.spec\.ts/;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/configuracao-global.ts",
  fullyParallel: false,
  workers: 1,
  // Cada teste faz login (credenciais + bcrypt) + navegação + server action.
  // O runner do CI é bem mais lento que a máquina local, então o orçamento
  // padrão de 30s por teste estoura; 60s cobre o fluxo completo sem mascarar
  // defeito (um elemento realmente ausente ainda falha).
  timeout: 60_000,
  // Server actions + revalidação levam alguns segundos; no CI, mais.
  expect: { timeout: process.env.CI ? 20_000 : 15_000 },
  // A suíte roda serial com estado resetado; corridas de hidratação são raras
  // mas mais prováveis no CI lento — duas repetições no CI absorvem sem
  // esconder regressões (localmente uma basta).
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    // Ambientes com Chromium próprio (ex.: contêiner de desenvolvimento)
    // podem apontar o executável sem baixar navegadores.
    launchOptions: process.env.CHROMIUM_EXECUTAVEL
      ? { executablePath: process.env.CHROMIUM_EXECUTAVEL }
      : {},
  },
  projects: [
    {
      name: "desktop",
      testIgnore: SUITE_RESPONSIVA,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      // 380px é o piso declarado no prompt da Onda 1 (§Acessibilidade).
      name: "mobile-380",
      testMatch: SUITE_RESPONSIVA,
      use: { viewport: { width: 380, height: 740 }, isMobile: false },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000/entrar",
    // Depuração local: PW_REUSAR_SERVIDOR=1 permite apontar para um
    // servidor já em execução (com logs visíveis).
    reuseExistingServer: Boolean(process.env.PW_REUSAR_SERVIDOR),
    timeout: 60_000,
  },
});
