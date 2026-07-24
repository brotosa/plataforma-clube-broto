import type { Papel } from "@prisma/client";
import type { DefaultSession } from "next-auth";
// O import abaixo é necessário para a augmentação de "next-auth/jwt" valer.
import type {} from "next-auth/jwt";

/**
 * Extensões de tipo do Auth.js: id, nome e papel circulam na sessão para o
 * RBAC (dominio/autorizacao) decidir por ação.
 */
declare module "next-auth" {
  interface User {
    nome: string;
    papel: Papel;
  }

  interface Session {
    user: {
      id: string;
      nome: string;
      papel: Papel;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    nome: string;
    papel: Papel;
  }
}
