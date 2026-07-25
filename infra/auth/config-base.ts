import type { NextAuthConfig } from "next-auth";

/**
 * Configuração base do Auth.js, SEM provedores — segura para o runtime edge
 * do middleware (não importa Prisma/bcrypt). Os provedores entram em
 * infra/auth/index.ts, usado apenas no runtime Node.
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
    jwt({ token, user }) {
      if (user) {
        // user.id é opcional no tipo do Auth.js, mas o nosso authorize
        // sempre o preenche; o sub do token cobre o caso-limite.
        token.id = user.id ?? token.sub ?? "";
        token.papel = user.papel;
        token.nome = user.nome;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.papel = token.papel;
      session.user.nome = token.nome;
      return session;
    },
  },
} satisfies NextAuthConfig;
