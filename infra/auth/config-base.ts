import type { NextAuthConfig } from "next-auth";

/**
 * Configuração base do Auth.js, SEM provedores — segura para o runtime edge
 * (não importa Prisma/bcrypt). Os provedores entram em infra/auth/index.ts,
 * usado apenas no runtime Node.
 *
 * F13: os callbacks `jwt` e `session` saíram daqui. A RN47 exige que o
 * `jwt` leia o banco a cada sessão para conferir a época, e isso só pode
 * viver no runtime Node — deixar aqui uma versão sem essa conferência seria
 * manter, à mão, um caminho que não revoga. Quem monta os dois callbacks é
 * infra/auth/index.ts; aqui fica só o que o edge pode executar.
 */
export const configBase = {
  pages: {
    signIn: "/entrar",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      // Proteção global das rotas da plataforma (o middleware redireciona
      // para /entrar quando não autenticado).
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
