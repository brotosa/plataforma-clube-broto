import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { estaExpirada } from "@/dominio/ofertas/regras";
import { estaNaJanelaDeNaoRenovacao } from "@/dominio/contratos/janela";
import { precisaReavaliacao } from "@/dominio/avaliacao/regras";
import { logger } from "@/infra/log/logger";

/**
 * Job diário das Ondas 1 e 2:
 * 1. RN03 — ofertas com vigência fim anterior à data corrente mudam para
 *    EXPIRADA (publicadas expiradas ficam pendentes de despublicação no
 *    próximo export).
 * 2. Janela contratual — contratos vigentes a ≤30 dias do aniversário da
 *    data-base são marcados (alerta em T1/T2); fora da janela, desmarcados.
 * 3. RN21 (F7) — aliada ativa que completa 12 meses da última avaliação
 *    fechada recebe a marca de reavaliação (alerta na T10); a marca sai
 *    quando uma nova avaliação fecha (no caso de uso) ou quando a empresa
 *    deixa o estágio de aliada ativa (varredura de alerta órfão aqui).
 *    Sem avaliação fechada não há aniversário — nada é marcado.
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
  reavaliacoesMarcadas: number;
  reavaliacoesDesmarcadas: number;
}

export async function executarJobDiario(hoje = new Date()): Promise<ResultadoJobDiario> {
  const sistema = await usuarioDeSistema();
  const resultado: ResultadoJobDiario = {
    ofertasExpiradas: 0,
    contratosMarcados: 0,
    contratosDesmarcados: 0,
    reavaliacoesMarcadas: 0,
    reavaliacoesDesmarcadas: 0,
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

  // RN21 — reavaliação anual das aliadas ativas
  const aliadasAtivas = await prisma.empresa.findMany({
    where: { estagio: "ALIADA_ATIVA" },
    select: {
      id: true,
      reavaliacaoPendente: true,
      avaliacoesScout: {
        where: { status: "FECHADA" },
        orderBy: { fechadaEm: "desc" },
        take: 1,
        select: { fechadaEm: true },
      },
    },
  });
  for (const aliada of aliadasAtivas) {
    const ultimaFechadaEm = aliada.avaliacoesScout[0]?.fechadaEm ?? null;
    const precisa = precisaReavaliacao(ultimaFechadaEm, hoje);
    if (precisa === aliada.reavaliacaoPendente) {
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.empresa.update({
        where: { id: aliada.id },
        data: { reavaliacaoPendente: precisa },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "empresa",
        entidadeId: aliada.id,
        autorId: sistema.id,
        anterior: { reavaliacaoPendente: aliada.reavaliacaoPendente },
        novo: { reavaliacaoPendente: precisa },
      });
    });
    if (precisa) {
      resultado.reavaliacoesMarcadas += 1;
    } else {
      resultado.reavaliacoesDesmarcadas += 1;
    }
  }

  // RN21 — alerta órfão: quem deixou de ser aliada ativa não fica marcada
  const forasDoCiclo = await prisma.empresa.findMany({
    where: { estagio: { not: "ALIADA_ATIVA" }, reavaliacaoPendente: true },
    select: { id: true },
  });
  for (const empresa of forasDoCiclo) {
    await prisma.$transaction(async (tx) => {
      await tx.empresa.update({
        where: { id: empresa.id },
        data: { reavaliacaoPendente: false },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "empresa",
        entidadeId: empresa.id,
        autorId: sistema.id,
        anterior: { reavaliacaoPendente: true },
        novo: { reavaliacaoPendente: false },
      });
    });
    resultado.reavaliacoesDesmarcadas += 1;
  }

  logger.info({ ...resultado }, "job diário executado");
  return resultado;
}
