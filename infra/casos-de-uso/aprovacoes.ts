import type { TipoEntidadeAprovacao } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { validarDecisao } from "@/dominio/aprovacao/motor";
import { estadoAuditavel, promoverDentroDaTransacao } from "./empresas";
import { publicarDentroDaTransacao } from "./ofertas";
import { aplicarParametroSensivelDentroDaTransacao } from "./parametrizador";
import { ativarCampanhaAprovada } from "./campanhas";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Decide uma solicitação da fila (T6): Aprovada aplica o efeito da
 * entidade na mesma transação; Devolvida exige comentário (RN06).
 */
export async function decidirSolicitacao(
  ator: Ator,
  solicitacaoId: string,
  decisao: "APROVADA" | "DEVOLVIDA",
  comentario: string | null,
) {
  exigirPermissao(ator.papel, "APROVAR_DEVOLVER");

  const solicitacao = await prisma.aprovacaoSolicitacao.findUniqueOrThrow({
    where: { id: solicitacaoId },
  });
  const regra = await prisma.aprovacaoRegra.findUniqueOrThrow({
    where: { tipoEntidade: solicitacao.tipoEntidade },
    include: { aprovadores: true },
  });

  const erros = validarDecisao({
    solicitacao: { estado: solicitacao.estado, solicitanteId: solicitacao.solicitanteId },
    regra: {
      exigida: regra.exigida,
      aprovadoresDesignados: regra.aprovadores.map((designado) => designado.usuarioId),
    },
    decisorId: ator.id,
    decisao,
    comentario,
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  const decidida = await prisma.$transaction(async (tx) => {
    const decidida = await tx.aprovacaoSolicitacao.update({
      where: { id: solicitacaoId },
      data: {
        estado: decisao,
        comentario,
        aprovadorId: ator.id,
        decididoEm: new Date(),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "aprovacao_solicitacao",
      entidadeId: solicitacaoId,
      autorId: ator.id,
      anterior: { estado: solicitacao.estado, comentario: solicitacao.comentario },
      novo: { estado: decidida.estado, comentario: decidida.comentario },
    });

    if (decisao === "APROVADA") {
      await aplicarEfeito(
        tx,
        ator.id,
        solicitacao.tipoEntidade,
        solicitacao.entidadeId,
        solicitacao.payload,
      );
    } else if (solicitacao.tipoEntidade === "PROMOCAO_ALIADA_ATIVA") {
      // Onda 2 (pipeline da ficha §3.1): a devolução tira a empresa de
      // Em aprovação e a devolve a Em negociação, com auditoria.
      const empresa = await tx.empresa.findUniqueOrThrow({
        where: { id: solicitacao.entidadeId },
      });
      if (empresa.estagio === "EM_APROVACAO") {
        const devolvida = await tx.empresa.update({
          where: { id: empresa.id },
          data: { estagio: "EM_NEGOCIACAO", estagioDesde: new Date() },
        });
        await registrarMutacao(criarGravadorPrisma(tx), {
          entidade: "empresa",
          entidadeId: empresa.id,
          autorId: ator.id,
          anterior: estadoAuditavel(empresa),
          novo: estadoAuditavel(devolvida),
        });
      }
    }
    return decidida;
  });

  return decidida;
}

/**
 * Efeito de cada tipo de entidade quando a solicitação é aprovada.
 *
 * O `switch` é exaustivo por tipo — entidade nova sem efeito próprio
 * quebra a compilação em vez de cair silenciosamente em outro efeito.
 *
 * Até a F20 esta função devolvia os arquivos a gravar depois do commit
 * (só a Onda 4 tinha). A RN71 inverteu a ordem — conteúdo antes da
 * referência —, então não há mais nada a devolver: quem gera o kit já
 * gravou o pacote quando esta função retorna.
 */
async function aplicarEfeito(
  tx: Parameters<typeof promoverDentroDaTransacao>[0],
  autorId: string,
  tipo: TipoEntidadeAprovacao,
  entidadeId: string,
  payload: unknown,
): Promise<void> {
  switch (tipo) {
    case "PROMOCAO_ALIADA_ATIVA":
      await promoverDentroDaTransacao(tx, autorId, entidadeId);
      return;
    case "PUBLICACAO_OFERTA":
      await publicarDentroDaTransacao(tx, autorId, entidadeId);
      return;
    // RN27 (Onda 3) — a escrita de parâmetro sensível só toca a
    // configuração agora; até aqui o valor vigente seguiu valendo, e o
    // proposto esperou no payload da solicitação.
    case "PARAMETRO_SENSIVEL":
      await aplicarParametroSensivelDentroDaTransacao(tx, autorId, payload);
      return;
    case "ATIVACAO_CAMPANHA":
      return ativarCampanhaAprovada(tx, autorId, entidadeId);
  }
}

/**
 * T7 — liga/desliga a exigência de aprovação por tipo de entidade e
 * designa aprovadores, sem código (RN06). Somente Gestor.
 */
export async function configurarRegraAprovacao(
  ator: Ator,
  tipoEntidade: TipoEntidadeAprovacao,
  configuracao: { exigida?: boolean; aprovadorIds?: string[] },
) {
  exigirPermissao(ator.papel, "CONFIGURAR_REGRAS_APROVACAO");

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.aprovacaoRegra.findUniqueOrThrow({
      where: { tipoEntidade },
      include: { aprovadores: true },
    });
    const regra = await tx.aprovacaoRegra.update({
      where: { tipoEntidade },
      data: configuracao.exigida === undefined ? {} : { exigida: configuracao.exigida },
    });
    if (configuracao.aprovadorIds) {
      await tx.aprovacaoRegraAprovador.deleteMany({ where: { regraId: regra.id } });
      if (configuracao.aprovadorIds.length > 0) {
        await tx.aprovacaoRegraAprovador.createMany({
          data: configuracao.aprovadorIds.map((usuarioId) => ({
            regraId: regra.id,
            usuarioId,
          })),
        });
      }
    }
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "aprovacao_regra",
      entidadeId: regra.id,
      autorId: ator.id,
      anterior: {
        tipoEntidade,
        exigida: anterior.exigida,
        aprovadores: anterior.aprovadores.map((designado) => designado.usuarioId).sort(),
      },
      novo: {
        tipoEntidade,
        exigida: regra.exigida,
        aprovadores: (configuracao.aprovadorIds ??
          anterior.aprovadores.map((designado) => designado.usuarioId)).slice().sort(),
      },
    });
    return regra;
  });
}
