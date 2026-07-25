import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saída standalone apenas para o deploy containerizado (Dockerfile, F5):
  // na Vercel ela quebra o mapeamento das rotas (páginas retornam 404).
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  // Permite abrir o servidor de desenvolvimento pela URL encaminhada do
  // GitHub Codespaces (só vale em `next dev`; não afeta produção).
  allowedDevOrigins: ["*.app.github.dev"],
};

export default nextConfig;
