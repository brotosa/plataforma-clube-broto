import { compare } from "bcryptjs";
import type {
  ProvedorIdentidade,
  UsuarioAutenticado,
} from "@/dominio/identidade/provedor-identidade";
import { prisma } from "@/infra/prisma/cliente";
import { logger } from "@/infra/log/logger";
import { lerPoliticaDeLogin } from "@/infra/casos-de-uso/configuracoes";
import { estaBloqueado, registrarFalha } from "@/dominio/usuarios/politica-login";

/**
 * Implementação de identidade da Onda 1: credenciais próprias verificadas
 * contra `usuarios` (hash bcrypt). Substituível por um provedor Entra ID
 * sem tocar domínio nem telas (ver ProvedorIdentidade).
 *
 * Configurações (PR C) — bloqueio por tentativas: falhas consecutivas contam,
 * e ao estourar o limite a conta fica bloqueada por um tempo. Enquanto
 * bloqueada, a autenticação é recusada SEM sequer conferir a senha. Qualquer
 * recusa devolve `null` (o Auth.js trata como credencial inválida); a tela de
 * login distingue "bloqueado" relendo o estado, sem que este método vaze o
 * motivo. **O Administrador da Plataforma nunca é bloqueado nem contado** —
 * decisão de segurança para não trancar a conta que faz o desbloqueio.
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

    const paraSessao = (): UsuarioAutenticado => ({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      sessaoEpoca: usuario.sessaoEpoca,
      trocaSenhaObrigatoria: usuario.trocaSenhaObrigatoria,
    });

    // Administrador da Plataforma: nunca bloqueado, nunca contado. Só a senha.
    if (usuario.papel === "ADMINISTRADOR_PLATAFORMA") {
      if (!(await compare(senha, usuario.senhaHash))) {
        logger.info({ email, motivo: "senha_invalida" }, "autenticação recusada");
        return null;
      }
      return paraSessao();
    }

    const agora = new Date();
    // Já bloqueado: recusa sem conferir a senha (não estende o bloqueio).
    if (estaBloqueado(usuario.loginBloqueadoAte, agora)) {
      logger.info({ email, motivo: "conta_bloqueada" }, "autenticação recusada");
      return null;
    }

    if (!(await compare(senha, usuario.senhaHash))) {
      const politica = await lerPoliticaDeLogin();
      const novo = registrarFalha(
        { tentativas: usuario.loginTentativas, bloqueadoAte: usuario.loginBloqueadoAte },
        politica,
        agora,
      );
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { loginTentativas: novo.tentativas, loginBloqueadoAte: novo.bloqueadoAte },
      });
      logger.info(
        { email, motivo: novo.bloqueadoAte ? "senha_invalida_bloqueou" : "senha_invalida" },
        "autenticação recusada",
      );
      return null;
    }

    // Sucesso: zera os contadores se havia algo pendente.
    if (usuario.loginTentativas !== 0 || usuario.loginBloqueadoAte !== null) {
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { loginTentativas: 0, loginBloqueadoAte: null },
      });
    }
    return paraSessao();
  },
};
