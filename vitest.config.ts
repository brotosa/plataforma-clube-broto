import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["dominio/**/*.test.ts", "infra/**/*.test.ts"],
    // As suítes de integração compartilham o banco (a da carga inicial
    // limpa e recarrega a base): arquivos rodam em sequência.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
