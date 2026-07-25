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
  // Server actions + revalidação podem levar alguns segundos no servidor
  // de teste; 15s evita falso-negativo sem mascarar defeito real.
  expect: { timeout: 15_000 },
  // Uma repetição absorve corridas raras de hidratação sem esconder
  // regressões reais (a suíte roda serial, com estado resetado no setup).
  retries: 1,
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
