import type { NextConfig } from "next";
import { version } from "./package.json";

/**
 * Versão exibida no rodapé institucional (Onda 7, ficha §4).
 *
 * A fonte é o `version` do `package.json` e **só ela**: a ficha é explícita
 * em que a versão "é lida do build, nunca digitada". Um literal no
 * componente seria a mesma coisa que o rótulo "Ondas 1–2" que esta onda vem
 * corrigir — texto que envelhece sem ninguém perceber.
 *
 * `env` (e não `NEXT_PUBLIC_*` no ambiente) porque o valor precisa existir
 * no build de qualquer hospedagem, sem depender de alguém lembrar de
 * configurar variável.
 */
const nextConfig: NextConfig = {
  // Saída standalone apenas para o deploy containerizado (Dockerfile, F5):
  // na Vercel ela quebra o mapeamento das rotas (páginas retornam 404).
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  // Permite abrir o servidor de desenvolvimento pela URL encaminhada do
  // GitHub Codespaces (só vale em `next dev`; não afeta produção).
  allowedDevOrigins: ["*.app.github.dev"],
  env: {
    NEXT_PUBLIC_VERSAO_APP: version,
    /**
     * Ambiente e commit curto — exibidos apenas fora de produção, para
     * ninguém apresentar uma preview acreditando estar na plataforma no ar.
     * `VERCEL_*` cobre a hospedagem atual; as demais são para o contêiner.
     */
    NEXT_PUBLIC_AMBIENTE:
      process.env.AMBIENTE_APP ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "",
    NEXT_PUBLIC_COMMIT_CURTO: (
      process.env.COMMIT_SHA ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GITHUB_SHA ??
      ""
    ).slice(0, 7),
  },
};

export default nextConfig;
