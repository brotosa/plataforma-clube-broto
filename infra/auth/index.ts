import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { configBase } from "./config-base";
import { prisma } from "@/infra/prisma/cliente";
import { provedorCredenciaisPrisma } from "@/infra/identidade/provedor-credenciais-prisma";
import type { ProvedorIdentidade } from "@/dominio/identidade/provedor-identidade";
import { sessaoContinuaValida } from "@/dominio/usuarios/regras";
import { logger } from "@/infra/log/logger";

const esquemaCredenciais = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

/** Provedor de identidade em uso (troca única quando o Entra ID entrar). */
const provedorIdentidade: ProvedorIdentidade = provedorCredenciaisPrisma;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...configBase,
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const analise = esquemaCredenciais.safeParse(credentials);
        if (!analise.success) {
          return null;
        }
        const usuario = await provedorIdentidade.autenticarPorCredenciais(
          analise.data.email,
          analise.data.senha,
        );
        if (!usuario) {
          return null;
        }
        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          nome: usuario.nome,
          papel: usuario.papel,
          sessaoEpoca: usuario.sessaoEpoca,
          trocaSenhaObrigatoria: usuario.trocaSenhaObrigatoria,
        };
      },
    }),
  ],
  callbacks: {
    ...configBase.callbacks,
    /**
     * RN47 — a revogação acontece AQUI.
     *
     * Com `strategy: "jwt"` não existe tabela de sessão para apagar: o
     * token vive no cookie assinado e valeria até expirar. O Auth.js chama
     * este callback a cada leitura de sessão (@auth/core, lib/actions/
     * session.ts) e trata `null` como sessão inválida — descartando o
     * cookie. Conferir a época do token contra a coluna do usuário é,
     * portanto, o que transforma "inativar" em revogação imediata, e não em
     * "bloqueia o próximo login".
     *
     * O preço é uma leitura de `usuarios` por requisição autenticada. Numa
     * plataforma de back-office isso é barato; e é o custo de a inativação
     * significar o que diz que significa.
     *
     * O middleware não faz esta conferência de propósito: ele roda no
     * runtime edge, sem Prisma. Não precisa — a guarda da camada (o layout
     * de (plataforma) chama `auth()`) roda antes de qualquer conteúdo ser
     * renderizado, e a partir do momento em que o cookie é limpo o próprio
     * middleware volta a barrar.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? "";
        token.papel = user.papel;
        token.nome = user.nome;
        token.sessaoEpoca = user.sessaoEpoca;
        token.trocaSenhaObrigatoria = user.trocaSenhaObrigatoria;
        return token;
      }

      if (!token.id) {
        return token;
      }

      const atual = await prisma.usuario.findUnique({
        where: { id: token.id },
        select: {
          ativo: true,
          papel: true,
          nome: true,
          sessaoEpoca: true,
          trocaSenhaObrigatoria: true,
        },
      });

      if (!atual || !sessaoContinuaValida(token.sessaoEpoca, atual)) {
        logger.info(
          { usuarioId: token.id, epocaDoToken: token.sessaoEpoca },
          "sessão revogada (RN47)",
        );
        return null;
      }

      // O usuário segue válido: papel, nome e a marca de credencial
      // provisória são relidos, para que a UI nunca fique com um retrato
      // velho de quem é a pessoa.
      token.papel = atual.papel;
      token.nome = atual.nome;
      token.trocaSenhaObrigatoria = atual.trocaSenhaObrigatoria;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.papel = token.papel;
      session.user.nome = token.nome;
      session.user.trocaSenhaObrigatoria = token.trocaSenhaObrigatoria;
      return session;
    },
  },
});
