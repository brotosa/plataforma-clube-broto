import { compare } from "bcryptjs";
import type {
  ProvedorIdentidade,
  UsuarioAutenticado,
} from "@/dominio/identidade/provedor-identidade";
import { prisma } from "@/infra/prisma/cliente";
import { logger } from "@/infra/log/logger";

/**
 * Implementação de identidade da Onda 1: credenciais próprias verificadas
 * contra `usuarios` (hash bcrypt). Substituível por um provedor Entra ID
 * sem tocar domínio nem telas (ver ProvedorIdentidade).
 */
export const provedorCredenciaisPrisma: ProvedorIdentidade = {
  async autenticarPorCredenciais(
    email: string,
    senha: string,
  ): Promise<UsuarioAutenticado | null> {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.ativo) {
      logger.info({ email, motivo: "usuario_inexistente_ou_inativo" }, "autenticação recusada");
      return null;
    }
    const senhaConfere = await compare(senha, usuario.senhaHash);
    if (!senhaConfere) {
      logger.info({ email, motivo: "senha_invalida" }, "autenticação recusada");
      return null;
    }
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      sessaoEpoca: usuario.sessaoEpoca,
      trocaSenhaObrigatoria: usuario.trocaSenhaObrigatoria,
    };
  },
};
