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
    /*
     * TETO DO PRÓPRIO COOKIE — a rede por baixo da política, não a política.
     *
     * Sem isto o Auth.js usa o padrão dele, **30 dias**: o token assinado
     * continua sendo aceito pelo middleware por um mês, e a única coisa que
     * derruba a sessão é a conferência de inatividade do callback `jwt`.
     * Uma plataforma de back-office não tem por que emitir credencial de 30
     * dias, e depender de um único mecanismo para cortá-la é depender demais
     * de um mecanismo só.
     *
     * 7 dias é o `TETO_MAXIMO` da política de sessão — o maior prazo que
     * qualquer configuração válida da T35 pode pedir. Por construção, então,
     * este teto **nunca corta sessão legítima**: nenhuma configuração aceita
     * autoriza sessão mais longa que ele. E o cookie é rolante (o Auth.js
     * reescreve o `exp` a cada Set-Cookie, o que inclui o heartbeat), então
     * quem está trabalhando não é interrompido.
     *
     * Isto NÃO substitui a expiração por inatividade, que continua sendo
     * quem corta em 30 minutos. É o que sobra de proteção quando ela falha.
     */
    maxAge: 7 * 24 * 60 * 60,
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
