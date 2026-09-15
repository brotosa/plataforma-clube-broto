import { compare } from "bcryptjs";
import type {
  ProvedorIdentidade,
  UsuarioAutenticado,
} from "@/dominio/identidade/provedor-identidade";
import { prisma } from "@/infra/prisma/cliente";
import { logger } from "@/infra/log/logger";
import { lerPoliticaDeLogin } from "@/infra/casos-de-uso/configuracoes";
import { estaBloqueado, registrarFalha } from "@/dominio/usuarios/politica-login";
import { obterOrigemDaRequisicao } from "./origem-requisicao";
import {
  limparOrigem,
  origemEstaBloqueada,
  registrarFalhaDeOrigem,
} from "@/infra/casos-de-uso/bloqueio-origem";

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
    // Origem da requisição, para o bloqueio por endereço. Nula = regra não
    // se aplica (ver `obterOrigemDaRequisicao`).
    const origem = await obterOrigemDaRequisicao();

    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.ativo) {
      // E-mail desconhecido também é falha da origem: senão bastaria variar o
      // e-mail para nunca acumular contagem.
      await registrarFalhaDeOrigem(origem);
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

    // Administrador da Plataforma: nunca bloqueado — nem pela conta, nem pela
    // ORIGEM. Mas a falha contra ele CONTA para a origem: sem isso, mirar um
    // e-mail de Administrador evadiria o bloqueio por endereço.
    //
    // **O `ADMIN` da Onda 15 NÃO é isento, e é decisão.** A isenção existe por
    // um motivo estreito — a conta que destranca as outras não pode se trancar
    // — e ele não é essa conta: se um `ADMIN` for bloqueado, o acesso total o
    // libera. Estender a isenção ao papel novo dobraria a superfície de contas
    // sem limite de tentativas, que é justamente a lacuna declarada na ficha
    // da Onda 15 §6.1. Menos contas isentas é melhor, não pior.
    if (usuario.papel === "ADMINISTRADOR_PLATAFORMA") {
      if (!(await compare(senha, usuario.senhaHash))) {
        await registrarFalhaDeOrigem(origem);
        logger.info({ email, motivo: "senha_invalida" }, "autenticação recusada");
        return null;
      }
      await limparOrigem(origem);
      return paraSessao();
    }

    // Origem bloqueada: recusa antes de conferir a senha, como no bloqueio por
    // conta. Não estende o bloqueio — só nega.
    if (await origemEstaBloqueada(origem)) {
      logger.info({ email, motivo: "origem_bloqueada" }, "autenticação recusada");
      return null;
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
      await registrarFalhaDeOrigem(origem);
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
    await limparOrigem(origem);
    return paraSessao();
  },
};
