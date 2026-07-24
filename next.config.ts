import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saída standalone para o deploy containerizado (Dockerfile multi-stage, F5).
  output: "standalone",
};

export default nextConfig;
