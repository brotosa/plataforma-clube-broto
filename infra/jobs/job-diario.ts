import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { estaExpirada } from "@/dominio/ofertas/regras";
import { estaNaJanelaDeNaoRenovacao } from "@/dominio/contratos/janela";
import { logger } from "@/infra/log/logger";

/**
 * Job diário da Onda 1:
 * 1. RN03 — ofertas com vigência fim anterior à data corrente mudam para
 *    EXPIRADA (publicadas expiradas ficam pendentes de despublicação no
 *    próximo export).
 * 2. Janela contratual — contratos vigentes a ≤30 dias do aniversário da
 *    data-base são marcados (alerta em T1/T2); fora da janela, desmarcados.
 *
 * As mutações são auditadas com o usuário de sistema (rotina), que não
 * possui login (ativo = false).
 */

const EMAIL_USUARIO_SISTEMA = "rotina@sistema.clubebroto.local";

async function usuarioDeSistema() {
  return prisma.usuario.upsert({
    where: { email: EMAIL_USUARIO_SISTEMA },
    update: {},
    create: {
      nome: "Rotina da plataforma (job diário)",
      email: EMAIL_USUARIO_SISTEMA,
      senhaHash: "sem-login",
      papel: "GESTOR",
      ativo: false, // nunca autentica: o provedor de identidade exige ativo
    },
  });
}

export interface ResultadoJobDiario {
  ofertasExpiradas: number;
  contratosMarcados: number;
  contratosDesmarcados: number;
}

export async function executarJobDiario(hoje = new Date()): Promise<ResultadoJobDiario> {
  const sistema = await usuarioDeSistema();
  const resultado: ResultadoJobDiario = {
    ofertasExpiradas: 0,
    contratosMarcados: 0,
    contratosDesmarcados: 0,
  };

  // RN03 — expiração por vigência
  const candidatas = await prisma.oferta.findMany({
    where: {
      status: { in: ["RASCUNHO", "PUBLICADA", "PAUSADA"] },
      vigenciaFim: { not: null },
    },
    select: { id: true, status: true, vigenciaFim: true, pendenteRepublicacao: true },
  });
  for (const oferta of candidatas) {
    if (!estaExpirada(oferta.vigenciaFim, hoje)) {
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.oferta.update({
        where: { id: oferta.id },
        data: {
          status: "EXPIRADA",
          // Publicada que expira precisa sair do ar no próximo export.
          pendenteRepublicacao: oferta.status === "PUBLICADA" ? true : oferta.pendenteRepublicacao,
        },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "oferta",
        entidadeId: oferta.id,
        autorId: sistema.id,
        anterior: { status: oferta.status },
        novo: { status: "EXPIRADA" },
      });
    });
    resultado.ofertasExpiradas += 1;
  }

  // Janela de não-renovação contratual
  const contratos = await prisma.contratoComercial.findMany({
    where: { status: "VIGENTE" },
    select: { id: true, vigenciaBase: true, emJanelaNaoRenovacao: true },
  });
  for (const contrato of contratos) {
    const naJanela = estaNaJanelaDeNaoRenovacao(contrato.vigenciaBase, hoje);
    if (naJanela === contrato.emJanelaNaoRenovacao) {
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.contratoComercial.update({
        where: { id: contrato.id },
        data: { emJanelaNaoRenovacao: naJanela },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "contrato_comercial",
        entidadeId: contrato.id,
        autorId: sistema.id,
        anterior: { emJanelaNaoRenovacao: contrato.emJanelaNaoRenovacao },
        novo: { emJanelaNaoRenovacao: naJanela },
      });
    });
    if (naJanela) {
      resultado.contratosMarcados += 1;
    } else {
      resultado.contratosDesmarcados += 1;
    }
  }

  logger.info({ ...resultado }, "job diário executado");
  return resultado;
}
