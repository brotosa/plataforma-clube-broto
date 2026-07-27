import NextAuth from "next-auth";

/**
 * Proteção global de rotas (edge): tudo exige sessão, exceto login,
 * endpoints do Auth.js, a rota de saúde e estáticos. O RBAC por ação é
 * aplicado nos serviços de domínio (dominio/autorizacao), nunca apenas aqui.
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

/**
 * `api/saude` está fora do gate por exigência da RN61: quem chama a rota de
 * saúde é balanceador ou orquestrador, que não tem sessão. Com o gate, a
 * verificação responderia 307 para `/entrar` — que muitos balanceadores
 * contam como "de pé" —, então a plataforma pareceria saudável mesmo com o
 * banco fora. O prefixo cobre os dois níveis (`/api/saude` e
 * `/api/saude/pronto`), e nenhum dos dois lê ou expõe dado da operação.
 */
export const config = {
  matcher: [
    "/((?!entrar|api/auth|api/saude|_next/static|_next/image|fontes|logos|favicon.ico|icon.svg).*)",
  ],
};
