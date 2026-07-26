import type { Papel } from "@prisma/client";
import type { DefaultSession } from "next-auth";
// O import abaixo é necessário para a augmentação de "next-auth/jwt" valer.
import type {} from "next-auth/jwt";

/**
 * Extensões de tipo do Auth.js: id, nome e papel circulam na sessão para o
 * RBAC (dominio/autorizacao) decidir por ação.
 *
 * A Onda 6 acrescenta dois campos, ambos exigidos pela ficha §3:
 * • `sessaoEpoca` — época em que o token foi emitido; divergir da coluna do
 *   usuário derruba a sessão na requisição seguinte (RN47). Não circula na
 *   Session porque é assunto do servidor: nenhuma tela decide nada com ela.
 * • `trocaSenhaObrigatoria` — credencial provisória, que só navega para a
 *   tela de troca de senha.
 */
declare module "next-auth" {
  interface User {
    nome: string;
    papel: Papel;
    sessaoEpoca: number;
    trocaSenhaObrigatoria: boolean;
  }

  interface Session {
    user: {
      id: string;
      nome: string;
      papel: Papel;
      trocaSenhaObrigatoria: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    nome: string;
    papel: Papel;
    sessaoEpoca: number;
    trocaSenhaObrigatoria: boolean;
  }
}
