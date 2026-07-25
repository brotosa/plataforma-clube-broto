import { defineConfig } from "@playwright/test";

/**
 * E2E da F1: fluxo de login, shell e acessibilidade (axe-core).
 * O servidor de produção (`next start`) é levantado automaticamente;
 * o banco precisa estar migrado e com seed (ver README).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
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
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
