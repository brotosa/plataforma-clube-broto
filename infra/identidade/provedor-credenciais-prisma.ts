import { compare } from "bcryptjs";
import type {
  ProvedorIdentidade,
  UsuarioAutenticado,
} from "@/dominio/identidade/provedor-identidade";
import { prisma } from "@/infra/prisma/cliente";
import { logger } from "@/infra/log/logger";
import { lerPoliticaDeLogin, lerPoliticaDeSenha } from "@/infra/casos-de-uso/configuracoes";
import {
  bloqueouAgora,
  cruzouLimiteDeAlerta,
  estaBloqueado,
  registrarFalha,
  registrarFalhaSemBloquear,
} from "@/dominio/usuarios/politica-login";
import { credencialProvisoriaExpirou } from "@/dominio/usuarios/politica-senha";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { registrarAlertaDeTentativas } from "@/infra/casos-de-uso/alerta-tentativas";
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
 * motivo. **Quem configura o portal nunca é bloqueado** — decisão de segurança
 * para não trancar a conta que faz o desbloqueio.
 *
 * **Mas passou a ser contado.** A isenção continua inteira: a conta não é
 * trancada, e nenhuma tentativa a impede de entrar com a senha certa. O que
 * mudou é que ela deixou de ser invisível — antes, a falha contra ela não
 * tocava contador nenhum e não gravava evento nenhum, então tentar senhas
 * contra uma conta de Administrador não deixava rastro em lugar algum e podia
 * se repetir sem limite e sem prazo. A isenção não tem contrapartida decidida
 * (pendência da ficha da Onda 15), e essa decisão continua aberta; o que esta
 * camada garante é que, quando for tomada, haja número e trilha em que se
 * apoiar.
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

    /**
     * A credencial provisória expirou?
     *
     * Só é consultada **depois** de a senha bater: antes disso não há nada a
     * dizer a quem está tentando, e conferir cedo gastaria consulta em toda
     * tentativa errada.
     *
     * Não conta falha nem estende bloqueio: a senha estava certa, e punir
     * quem acertou seria contar o que a regra não mede. Também não zera os
     * contadores — a entrada não se completou.
     */
    const credencialExpirada = async (): Promise<boolean> => {
      if (!usuario.trocaSenhaObrigatoria) return false;
      const politica = await lerPoliticaDeSenha();
      return credencialProvisoriaExpirou(usuario.credencialEmitidaEm, new Date(), politica);
    };

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
        /*
         * A isenção da RN74 continua inteira — esta conta NÃO é trancada.
         * O que mudou é que ela deixa de ser invisível.
         *
         * Antes, este ramo devolvia a recusa sem tocar contador nenhum, e o
         * `registrarFalhaDeOrigem` logo abaixo tem retorno antecipado quando o
         * bloqueio por origem está desligado — que é como ele NASCE. Somando
         * as duas coisas, na configuração de entrega uma tentativa contra
         * conta de Administrador não deixava rastro em lugar nenhum, e podia
         * se repetir sem limite e sem prazo.
         *
         * Agora conta (sem trancar), e ao cruzar o limite grava um evento.
         */
        const anterior = {
          tentativas: usuario.loginTentativas,
          bloqueadoAte: usuario.loginBloqueadoAte,
        };
        const novo = registrarFalhaSemBloquear(anterior);
        await prisma.usuario.update({
          where: { id: usuario.id },
          // `loginBloqueadoAte` NÃO entra aqui, de propósito: ver
          // `registrarFalhaSemBloquear`. Escrevê-lo poria a conta isenta na
          // lista de contas a desbloquear.
          data: { loginTentativas: novo.tentativas },
        });
        if (cruzouLimiteDeAlerta(anterior, novo, await lerPoliticaDeLogin())) {
          await registrarAlertaDeTentativas({
            usuarioId: usuario.id,
            motivo: "LIMITE_ATINGIDO_EM_CONTA_ISENTA",
            tentativas: novo.tentativas,
          });
        }
        await registrarFalhaDeOrigem(origem);
        logger.info({ email, motivo: "senha_invalida" }, "autenticação recusada");
        return null;
      }
      // Acesso bem-sucedido zera o contador da conta isenta — é o que faz o
      // número na tela significar "falhas desde o último acesso". Sem isto ele
      // cresceria para sempre e deixaria de informar qualquer coisa.
      if (usuario.loginTentativas !== 0) {
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: { loginTentativas: 0 },
        });
      }
      await limparOrigem(origem);
      /*
       * Quem configura o portal também não tem a credencial provisória
       * expirada contra si, pelo mesmo motivo da isenção de bloqueio da RN74:
       * é a conta que emite credencial para os outros, e se a dela expirar
       * não sobra ninguém para reemitir. Uma plataforma cuja única saída é o
       * banco de dados não tem saída.
       */
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
      const anterior = {
        tentativas: usuario.loginTentativas,
        bloqueadoAte: usuario.loginBloqueadoAte,
      };
      const novo = registrarFalha(anterior, politica, agora);
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { loginTentativas: novo.tentativas, loginBloqueadoAte: novo.bloqueadoAte },
      });
      /*
       * O momento em que uma conta é trancada é um ato auditável, e até aqui
       * não chegava à trilha. Estar bloqueado aparecia na tela de desbloqueio;
       * TER SIDO bloqueado não sobrava em lugar nenhum depois do prazo passar.
       *
       * Só a transição, nunca cada tentativa: o contador é zerado pelo próprio
       * bloqueio, então a travessia acontece uma vez por janela.
       */
      if (bloqueouAgora(anterior, novo)) {
        await registrarAlertaDeTentativas({
          usuarioId: usuario.id,
          motivo: "CONTA_BLOQUEADA_POR_TENTATIVAS",
          tentativas: politica.maxTentativas,
        });
      }
      await registrarFalhaDeOrigem(origem);
      logger.info(
        { email, motivo: novo.bloqueadoAte ? "senha_invalida_bloqueou" : "senha_invalida" },
        "autenticação recusada",
      );
      return null;
    }

    // Senha correta, mas a credencial provisória passou do prazo: recusa, e o
    // remédio é o Administrador emitir outra (T27 → Acesso → Redefinir
    // credencial). A tela de login relê o estado para dizer isso.
    if (await credencialExpirada()) {
      logger.info({ email, motivo: "credencial_provisoria_expirada" }, "autenticação recusada");
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
