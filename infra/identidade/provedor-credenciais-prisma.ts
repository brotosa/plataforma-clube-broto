import { compare } from "bcryptjs";
import type {
  ProvedorIdentidade,
  UsuarioAutenticado,
} from "@/dominio/identidade/provedor-identidade";
import { prisma } from "@/infra/prisma/cliente";
import { logger } from "@/infra/log/logger";
import { lerPoliticaDeLogin } from "@/infra/casos-de-uso/configuracoes";
import { estaBloqueado, registrarFalha } from "@/dominio/usuarios/politica-login";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
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

    // Quem CONFIGURA O PORTAL nunca é bloqueado — nem pela conta, nem pela
    // ORIGEM. Mas a falha contra essa conta CONTA para a origem: sem isso,
    // mirar um e-mail isento evadiria o bloqueio por endereço.
    //
    // Era `papel === "ADMINISTRADOR_PLATAFORMA"`. A Onda 15 renomeou aquele
    // papel para `ADMIN` e deu o nome antigo ao acesso total, e a comparação
    // literal teria ficado **errada e silenciosa**: a isenção passaria a valer
    // para um papel que, logo depois da migration, ninguém detém — e as contas
    // reais, que só trocaram de nome, perderiam a isenção sem que nada no
    // pedido dissesse para tirá-la. Numa renomeação, nada pode mudar.
    //
    // Definir pela **capacidade** mantém a isenção exatamente onde estava e
    // conserva o motivo original dela: a conta que destranca as outras não
    // pode se trancar. Quem destranca é quem tem `CONFIGURAR_PORTAL`.
    if (podeExecutar(usuario.papel, "CONFIGURAR_PORTAL")) {
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
