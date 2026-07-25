import { defineConfig } from "@playwright/test";

/**
 * E2E da F1: fluxo de login, shell e acessibilidade (axe-core).
 * O servidor de produção (`next start`) é levantado automaticamente;
 * o banco precisa estar migrado e com seed (ver README).
 */
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
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000/entrar",
    // Depuração local: PW_REUSAR_SERVIDOR=1 permite apontar para um
    // servidor já em execução (com logs visíveis).
    reuseExistingServer: Boolean(process.env.PW_REUSAR_SERVIDOR),
    timeout: 60_000,
  },
});
