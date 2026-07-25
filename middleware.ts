import NextAuth from "next-auth";

/**
 * Proteção global de rotas (edge): tudo exige sessão, exceto login,
 * endpoints do Auth.js e estáticos. O RBAC por ação é aplicado nos
 * serviços de domínio (dominio/autorizacao), nunca apenas aqui.
 *
 * A configuração é autocontida (nada importado do projeto): o empacotador
 * de Edge Functions da Vercel rejeita referências a módulos locais no
 * middleware. Só o necessário para o gate de autenticação vive aqui —
 * segredo e cookies vêm de AUTH_SECRET/padrões, iguais aos de
 * infra/auth/index.ts, que mantém a configuração completa (provedores e
 * claims de papel) no runtime Node.
 */
export const { auth: middleware } = NextAuth({
  pages: {
    signIn: "/entrar",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
});

export const config = {
  matcher: [
    "/((?!entrar|api/auth|_next/static|_next/image|fontes|logos|favicon.ico|icon.svg).*)",
  ],
};
