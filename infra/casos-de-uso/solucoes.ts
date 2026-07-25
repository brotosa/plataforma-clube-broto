import type { PorteProdutor, StatusSolucao } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { calcularCascata, podeCriarSolucao } from "@/dominio/solucoes/regras";
import { type Ator, ErroDeValidacao } from "./contexto";

export interface DadosSolucao {
  nome?: string;
  descricaoCurta?: string | null;
  descricaoCompleta?: string | null;
  categoriaId?: string | null;
  perfilCliente?: PorteProdutor[];
  tecnologias?: string[];
  imagemCardUrl?: string | null;
  linkExterno?: string | null;
  coberturaNacional?: boolean;
  culturaIds?: string[];
  ufIds?: string[];
}

function estadoAuditavelSolucao(solucao: {
  nome: string;
  descricaoCurta: string | null;
  descricaoCompleta: string | null;
  categoriaId: string | null;
  perfilCliente: PorteProdutor[];
  tecnologias: string[];
  imagemCardUrl: string | null;
  linkExterno: string | null;
  status: StatusSolucao;
  coberturaNacional: boolean;
}) {
  return {
    nome: solucao.nome,
    descricaoCurta: solucao.descricaoCurta,
    descricaoCompleta: solucao.descricaoCompleta,
    categoriaId: solucao.categoriaId,
    perfilCliente: solucao.perfilCliente,
    tecnologias: solucao.tecnologias,
    imagemCardUrl: solucao.imagemCardUrl,
    linkExterno: solucao.linkExterno,
    status: solucao.status,
    coberturaNacional: solucao.coberturaNacional,
  };
}

async function sincronizarVinculos(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  solucaoId: string,
  culturaIds?: string[],
  ufIds?: string[],
) {
  if (culturaIds) {
    await tx.solucaoCultura.deleteMany({ where: { solucaoId } });
    if (culturaIds.length > 0) {
      await tx.solucaoCultura.createMany({
        data: culturaIds.map((culturaId) => ({ solucaoId, culturaId })),
      });
    }
  }
  if (ufIds) {
    await tx.solucaoUf.deleteMany({ where: { solucaoId } });
    if (ufIds.length > 0) {
      await tx.solucaoUf.createMany({
        data: ufIds.map((ufId) => ({ solucaoId, ufId })),
      });
    }
  }
}

/** RN01 — cria solução somente para empresa em Aliada ativa. */
export async function criarSolucao(ator: Ator, empresaId: string, dados: DadosSolucao) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  if (!dados.nome?.trim()) {
    throw new ErroDeValidacao(["Nome da solução é obrigatório."]);
  }
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  if (!podeCriarSolucao(empresa.estagio)) {
    throw new ErroDeValidacao([
      "Soluções só podem ser criadas para empresas em estágio Aliada ativa (RN01).",
    ]);
  }
  const { culturaIds, ufIds, ...campos } = dados;
  return prisma.$transaction(async (tx) => {
    const solucao = await tx.solucao.create({
      data: { ...campos, nome: dados.nome!.trim(), empresaId },
    });
    await sincronizarVinculos(tx, solucao.id, culturaIds, ufIds);
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "solucao",
      entidadeId: solucao.id,
      autorId: ator.id,
      anterior: null,
      novo: { empresaId, ...estadoAuditavelSolucao(solucao) },
    });
    return solucao;
  });
}

export async function atualizarSolucao(ator: Ator, solucaoId: string, dados: DadosSolucao) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  const { culturaIds, ufIds, ...campos } = dados;
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.solucao.findUniqueOrThrow({ where: { id: solucaoId } });
    const solucao = await tx.solucao.update({ where: { id: solucaoId }, data: campos });
    await sincronizarVinculos(tx, solucaoId, culturaIds, ufIds);
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "solucao",
      entidadeId: solucaoId,
      autorId: ator.id,
      anterior: estadoAuditavelSolucao(anterior),
      novo: estadoAuditavelSolucao(solucao),
    });
    return solucao;
  });
}

/** Inativar solução pausa suas ofertas publicadas (RN04). */
export async function mudarStatusSolucao(
  ator: Ator,
  solucaoId: string,
  novoStatus: StatusSolucao,
) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.solucao.findUniqueOrThrow({ where: { id: solucaoId } });
    if (anterior.status === novoStatus) {
      return { solucao: anterior, ofertasPausadas: 0 };
    }
    const solucao = await tx.solucao.update({
      where: { id: solucaoId },
      data: { status: novoStatus },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "solucao",
      entidadeId: solucaoId,
      autorId: ator.id,
      anterior: estadoAuditavelSolucao(anterior),
      novo: estadoAuditavelSolucao(solucao),
    });

    let ofertasPausadas = 0;
    if (novoStatus === "INATIVA") {
      const ofertas = await tx.oferta.findMany({
        where: { solucaoId },
        select: { id: true, status: true, pendenteRepublicacao: true },
      });
      for (const acao of calcularCascata(ofertas)) {
        const ofertaAnterior = ofertas.find((oferta) => oferta.id === acao.ofertaId);
        await tx.oferta.update({
          where: { id: acao.ofertaId },
          data: { status: acao.novoStatus, pendenteRepublicacao: true },
        });
        await registrarMutacao(criarGravadorPrisma(tx), {
          entidade: "oferta",
          entidadeId: acao.ofertaId,
          autorId: ator.id,
          anterior: {
            status: ofertaAnterior?.status,
            pendenteRepublicacao: ofertaAnterior?.pendenteRepublicacao,
          },
          novo: { status: acao.novoStatus, pendenteRepublicacao: true },
        });
        ofertasPausadas += 1;
      }
    }
    return { solucao, ofertasPausadas };
  });
}
