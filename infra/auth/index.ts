import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { configBase } from "./config-base";
import { provedorCredenciaisPrisma } from "@/infra/identidade/provedor-credenciais-prisma";
import type { ProvedorIdentidade } from "@/dominio/identidade/provedor-identidade";

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
        };
      },
    }),
  ],
});
