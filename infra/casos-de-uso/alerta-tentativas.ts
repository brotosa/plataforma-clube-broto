import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { SISTEMA_AUTENTICACAO, usuarioDeSistema } from "@/infra/auditoria/usuario-de-sistema";
import { logger } from "@/infra/log/logger";

/**
 * Tentativas de acesso recusadas na trilha de auditoria (RN49 + RN74).
 *
 * ## O buraco que isto fecha
 *
 * Até aqui **nenhuma falha de autenticação, de conta nenhuma, gravava evento**.
 * A plataforma auditava 33 entidades — usuário, oferta, configuração do portal,
 * bloqueio de origem — e nenhuma delas era login. Quem quisesse saber se houve
 * tentativa de invasão não tinha onde olhar: a T28 não alcança autenticação, e
 * o único rastro era uma linha de log do servidor.
 *
 * Na conta **isenta de bloqueio** (RN74) isso era pior, porque lá não há nem
 * bloqueio para servir de sinal: a tentativa podia se repetir indefinidamente
 * sem limite, sem prazo e sem número em lugar algum.
 *
 * ## Dois momentos, e só dois
 *
 * - **`LIMITE_ATINGIDO_EM_CONTA_ISENTA`** — a conta isenta acumulou o número de
 *   falhas que teria trancado qualquer outra. Acontece **uma vez por rajada**:
 *   o contador dela só cresce até um acesso bem-sucedido, então a travessia do
 *   limite só se dá uma vez entre dois acessos.
 * - **`CONTA_BLOQUEADA_POR_TENTATIVAS`** — a conta comum foi trancada agora.
 *   Estar bloqueado já aparecia na tela de desbloqueio; **ter sido** bloqueado
 *   não sobrava em lugar nenhum depois que o prazo passava.
 *
 * **Não é um evento por tentativa, e a diferença importa.** Gravar toda falha
 * entregaria a quem ataca o controle do volume de uma tabela que, pela RN49,
 * não se apaga — e cuja política de retenção ainda é `[A CONFIRMAR — jurídico]`.
 *
 * ## O que este módulo NUNCA grava
 *
 * A senha tentada, em qualquer forma. A origem da requisição também não: ela
 * já tem casa própria em `BloqueioOrigem`, e repeti-la aqui criaria uma segunda
 * lista de endereços com outra regra de retenção.
 *
 * ## A falha aqui não pode derrubar o login
 *
 * Isto é observação, não autorização. Se a gravação falhar — banco indisponível,
 * por exemplo —, quem tinha a senha certa continua entrando: a exceção é
 * registrada no log e engolida. O contrário transformaria um defeito da trilha
 * em indisponibilidade da plataforma.
 */

export type MotivoDeAlerta =
  | "LIMITE_ATINGIDO_EM_CONTA_ISENTA"
  | "CONTA_BLOQUEADA_POR_TENTATIVAS";

/** Como cada motivo aparece na T28, em texto que se lê sem decodificar. */
const DESCRICAO: Record<MotivoDeAlerta, (tentativas: number) => string> = {
  LIMITE_ATINGIDO_EM_CONTA_ISENTA: (tentativas) =>
    `${tentativas} tentativas de senha recusadas contra conta isenta de bloqueio (RN74); o acesso NÃO foi trancado`,
  CONTA_BLOQUEADA_POR_TENTATIVAS: (tentativas) =>
    `${tentativas} tentativas de senha recusadas; o acesso foi trancado pelo tempo configurado`,
};

/**
 * Grava o alerta na trilha, com o autor de sistema.
 *
 * O evento é gravado **sobre a entidade `usuario`**, no id da conta visada:
 * é lá que quem investiga vai procurar, e é o que faz a atividade aparecer na
 * ficha daquela conta. O **autor**, porém, é a conta de sistema — atribuir a
 * autoria à própria vítima diria, na trilha dela, que ela fez isso.
 */
export async function registrarAlertaDeTentativas(parametros: {
  usuarioId: string;
  motivo: MotivoDeAlerta;
  tentativas: number;
}): Promise<void> {
  const { usuarioId, motivo, tentativas } = parametros;
  try {
    const sistema = await usuarioDeSistema(SISTEMA_AUTENTICACAO);
    await prisma.$transaction(async (tx) => {
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "usuario",
        entidadeId: usuarioId,
        autorId: sistema.id,
        anterior: { tentativasDeAcesso: null },
        novo: { tentativasDeAcesso: DESCRICAO[motivo](tentativas) },
      });
    });
  } catch (erro) {
    // Observação nunca derruba autenticação (ver cabeçalho).
    logger.error({ erro, usuarioId, motivo }, "falha ao gravar alerta de tentativas");
  }
}
