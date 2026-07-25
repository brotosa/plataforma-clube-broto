import { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  cestaPodeEntrarEmCampanha,
  ofertasQueBloqueiamCesta,
} from "@/dominio/campanhas/regras";
import { validarEstruturaRegras } from "@/dominio/segmentacao/compilador";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Cestas (T24): conjuntos nomeados e reutilizáveis de ofertas, com
 * narrativa e perfil-alvo. A RN41 não bloqueia a montagem da cesta — ela
 * bloqueia a ENTRADA em campanha; aqui a cesta com oferta não publicada
 * existe, sinalizada, para o dono resolver (publicar ou retirar).
 */

const INCLUSAO_CESTA = {
  segmento: true,
  ofertas: {
    orderBy: { ordem: "asc" },
    include: { oferta: { include: { solucao: { include: { empresa: true, categoria: true } } } } },
  },
  campanhas: { include: { campanha: true } },
} satisfies Prisma.CestaInclude;

export type CestaCompleta = Prisma.CestaGetPayload<{ include: typeof INCLUSAO_CESTA }>;

export async function lerCesta(cestaId: string): Promise<CestaCompleta> {
  return prisma.cesta.findUniqueOrThrow({ where: { id: cestaId }, include: INCLUSAO_CESTA });
}

export async function listarCestas(): Promise<CestaCompleta[]> {
  return prisma.cesta.findMany({ include: INCLUSAO_CESTA, orderBy: { nome: "asc" } });
}

/** Situação da cesta perante a RN41, para a etiqueta da T24. */
export function situacaoRn41(cesta: CestaCompleta) {
  const paraRegra = {
    id: cesta.id,
    nome: cesta.nome,
    ofertas: cesta.ofertas.map(({ oferta }) => ({
      id: oferta.id,
      titulo: oferta.titulo,
      status: oferta.status,
    })),
  };
  return {
    liberada: cestaPodeEntrarEmCampanha(paraRegra),
    bloqueiam: ofertasQueBloqueiamCesta(paraRegra),
  };
}

function estadoAuditavel(cesta: {
  nome: string;
  narrativa: string | null;
  origemPerfil: string;
  segmentoId: string | null;
}) {
  return {
    nome: cesta.nome,
    narrativa: cesta.narrativa,
    origemPerfil: cesta.origemPerfil,
    segmentoId: cesta.segmentoId,
  };
}

export async function criarCesta(
  ator: Ator,
  parametros: {
    nome: string;
    narrativa?: string | null;
    origemPerfil?: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
    segmentoId?: string | null;
    regrasPerfil?: unknown;
  },
) {
  exigirPermissao(ator.papel, "GERIR_CESTAS");
  const nome = parametros.nome.trim();
  if (!nome) {
    throw new ErroDeValidacao(["O nome da cesta é obrigatório."]);
  }
  const regras =
    parametros.regrasPerfil === undefined
      ? undefined
      : validarEstruturaRegras(parametros.regrasPerfil);

  return prisma.$transaction(async (tx) => {
    const cesta = await tx.cesta.create({
      data: {
        nome,
        narrativa: parametros.narrativa?.trim() || null,
        origemPerfil: parametros.origemPerfil ?? "SEGMENTO_SALVO",
        segmentoId: parametros.segmentoId ?? null,
        regrasPerfil: regras as unknown as Prisma.InputJsonValue,
        autorId: ator.id,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "cesta",
      entidadeId: cesta.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(cesta),
    });
    return cesta;
  });
}

export async function atualizarCesta(
  ator: Ator,
  cestaId: string,
  parametros: {
    nome?: string;
    narrativa?: string | null;
    origemPerfil?: "SEGMENTO_SALVO" | "REGRAS_PROPRIAS";
    segmentoId?: string | null;
    regrasPerfil?: unknown;
  },
) {
  exigirPermissao(ator.papel, "GERIR_CESTAS");

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.cesta.findUniqueOrThrow({ where: { id: cestaId } });
    const dados: Prisma.CestaUpdateInput = {};
    if (parametros.nome !== undefined) {
      const nome = parametros.nome.trim();
      if (!nome) {
        throw new ErroDeValidacao(["O nome da cesta é obrigatório."]);
      }
      dados.nome = nome;
    }
    if (parametros.narrativa !== undefined) {
      dados.narrativa = parametros.narrativa?.trim() || null;
    }
    if (parametros.origemPerfil !== undefined) {
      dados.origemPerfil = parametros.origemPerfil;
    }
    if (parametros.segmentoId !== undefined) {
      dados.segmento = parametros.segmentoId
        ? { connect: { id: parametros.segmentoId } }
        : { disconnect: true };
    }
    if (parametros.regrasPerfil !== undefined) {
      dados.regrasPerfil = validarEstruturaRegras(
        parametros.regrasPerfil,
      ) as unknown as Prisma.InputJsonValue;
    }

    const atualizada = await tx.cesta.update({ where: { id: cestaId }, data: dados });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "cesta",
      entidadeId: cestaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(atualizada),
    });
    return atualizada;
  });
}

/**
 * Entra/sai oferta da cesta. Retirar uma oferta que está em campanha
 * ativa não é permitido: o kit entregue descreve o que foi combinado.
 */
export async function alternarOfertaDaCesta(
  ator: Ator,
  cestaId: string,
  ofertaId: string,
  incluir: boolean,
) {
  exigirPermissao(ator.papel, "GERIR_CESTAS");

  return prisma.$transaction(async (tx) => {
    const emCampanhaAtiva = await tx.campanhaCesta.findFirst({
      where: { cestaId, campanha: { estado: "ATIVA" } },
      include: { campanha: true },
    });
    if (emCampanhaAtiva) {
      throw new ErroDeValidacao([
        `A cesta está na campanha ativa "${emCampanhaAtiva.campanha.nome}" — o conteúdo entregue no kit não muda (RN45).`,
      ]);
    }
    if (incluir) {
      const ordem = await tx.cestaOferta.count({ where: { cestaId } });
      await tx.cestaOferta.upsert({
        where: { cestaId_ofertaId: { cestaId, ofertaId } },
        update: {},
        create: { cestaId, ofertaId, ordem },
      });
    } else {
      await tx.cestaOferta.deleteMany({ where: { cestaId, ofertaId } });
    }
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "cesta",
      entidadeId: cestaId,
      autorId: ator.id,
      anterior: { oferta: incluir ? null : ofertaId },
      novo: { oferta: incluir ? ofertaId : null },
    });
  });
}

/**
 * RN41 — oferta encerrada sai da cesta com aviso registrado ao dono.
 * Chamada pelo job diário e pelo encerramento manual de oferta.
 */
export async function retirarOfertasEncerradasDasCestas(autorId: string) {
  const vinculos = await prisma.cestaOferta.findMany({
    where: { oferta: { status: { in: ["ENCERRADA", "EXPIRADA"] } } },
    include: { oferta: true, cesta: true },
  });
  if (vinculos.length === 0) {
    return { retiradas: 0 };
  }

  await prisma.$transaction(async (tx) => {
    const gravador = criarGravadorPrisma(tx);
    for (const vinculo of vinculos) {
      await tx.cestaOferta.delete({
        where: { cestaId_ofertaId: { cestaId: vinculo.cestaId, ofertaId: vinculo.ofertaId } },
      });
      await registrarMutacao(gravador, {
        entidade: "cesta",
        entidadeId: vinculo.cestaId,
        autorId,
        anterior: { oferta: vinculo.oferta.titulo },
        novo: {
          oferta: null,
          aviso: `Oferta "${vinculo.oferta.titulo}" saiu da cesta por estar ${vinculo.oferta.status.toLowerCase()} (RN41).`,
        },
      });
    }
  });
  return { retiradas: vinculos.length };
}
