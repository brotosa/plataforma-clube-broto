import NextAuth from "next-auth";
import { configBase } from "@/infra/auth/config-base";

/**
 * Proteção global de rotas (edge): tudo exige sessão, exceto login,
 * endpoints do Auth.js e estáticos. O RBAC por ação é aplicado nos
 * serviços de domínio (dominio/autorizacao), nunca apenas aqui.
 */
export const { auth: middleware } = NextAuth(configBase);

export const config = {
  matcher: [
    "/((?!entrar|api/auth|_next/static|_next/image|fontes|logos|favicon.ico).*)",
  ],
};
