import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saída standalone para o deploy containerizado (Dockerfile multi-stage, F5).
  output: "standalone",
  // Permite abrir o servidor de desenvolvimento pela URL encaminhada do
  // GitHub Codespaces (só vale em `next dev`; não afeta produção).
  allowedDevOrigins: ["*.app.github.dev"],
};

export default nextConfig;
