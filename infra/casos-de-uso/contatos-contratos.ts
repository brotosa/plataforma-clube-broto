import type { AmbientePagamento, PapelContato, StatusContrato } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { aplicarCascataDaEmpresa } from "./empresas";
import { type Ator, ErroDeValidacao } from "./contexto";

// ---------------------------------------------------------------------
// Contatos com papel tipado (ficha §3.1)
// ---------------------------------------------------------------------

export interface DadosContato {
  papel: PapelContato;
  nome: string;
  cargo?: string | null;
  email: string;
  telefone?: string | null;
}

export async function criarContato(ator: Ator, empresaId: string, dados: DadosContato) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  if (!dados.nome.trim() || !dados.email.trim()) {
    throw new ErroDeValidacao(["Contato exige nome e e-mail."]);
  }
  return prisma.$transaction(async (tx) => {
    const contato = await tx.contatoEmpresa.create({
      data: { ...dados, empresaId },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "contato_empresa",
      entidadeId: contato.id,
      autorId: ator.id,
      anterior: null,
      novo: { empresaId, ...dados },
    });
    return contato;
  });
}

export async function atualizarContato(ator: Ator, contatoId: string, dados: Partial<DadosContato>) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.contatoEmpresa.findUniqueOrThrow({ where: { id: contatoId } });
    const contato = await tx.contatoEmpresa.update({ where: { id: contatoId }, data: dados });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "contato_empresa",
      entidadeId: contatoId,
      autorId: ator.id,
      anterior: {
        papel: anterior.papel,
        nome: anterior.nome,
        cargo: anterior.cargo,
        email: anterior.email,
        telefone: anterior.telefone,
      },
      novo: {
        papel: contato.papel,
        nome: contato.nome,
        cargo: contato.cargo,
        email: contato.email,
        telefone: contato.telefone,
      },
    });
    return contato;
  });
}

export async function removerContato(ator: Ator, contatoId: string) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.contatoEmpresa.findUniqueOrThrow({ where: { id: contatoId } });
    await tx.contatoEmpresa.delete({ where: { id: contatoId } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "contato_empresa",
      entidadeId: contatoId,
      autorId: ator.id,
      anterior: {
        papel: anterior.papel,
        nome: anterior.nome,
        cargo: anterior.cargo,
        email: anterior.email,
        telefone: anterior.telefone,
      },
      novo: {},
    });
  });
}

// ---------------------------------------------------------------------
// Bloco comercial — contratos (ficha §3.1; histórico de renovações)
// ---------------------------------------------------------------------

export interface DadosContrato {
  anexoS3Key?: string | null;
  dataAssinatura?: Date | null;
  hashVerificacao?: string | null;
  vigenciaBase: Date;
  comissaoPct?: number | null;
  ambientesPagamento: AmbientePagamento;
}

function estadoAuditavelContrato(contrato: {
  anexoS3Key: string | null;
  dataAssinatura: Date | null;
  hashVerificacao: string | null;
  vigenciaBase: Date;
  status: StatusContrato;
  comissaoPct: unknown;
  ambientesPagamento: AmbientePagamento;
  emJanelaNaoRenovacao: boolean;
}) {
  return {
    anexoS3Key: contrato.anexoS3Key,
    dataAssinatura: contrato.dataAssinatura,
    hashVerificacao: contrato.hashVerificacao,
    vigenciaBase: contrato.vigenciaBase,
    status: contrato.status,
    comissaoPct: contrato.comissaoPct,
    ambientesPagamento: contrato.ambientesPagamento,
    emJanelaNaoRenovacao: contrato.emJanelaNaoRenovacao,
  };
}

export async function criarContrato(ator: Ator, empresaId: string, dados: DadosContrato) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const vigente = await tx.contratoComercial.findFirst({
      where: { empresaId, status: "VIGENTE" },
    });
    if (vigente) {
      throw new ErroDeValidacao([
        "Já existe contrato vigente para este aliado. Encerre ou denuncie o atual antes de registrar um novo (histórico de renovações).",
      ]);
    }
    const contrato = await tx.contratoComercial.create({
      data: { ...dados, empresaId },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "contrato_comercial",
      entidadeId: contrato.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavelContrato(contrato),
    });
    return contrato;
  });
}

export async function atualizarContrato(
  ator: Ator,
  contratoId: string,
  dados: Partial<DadosContrato>,
) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.contratoComercial.findUniqueOrThrow({ where: { id: contratoId } });
    const contrato = await tx.contratoComercial.update({
      where: { id: contratoId },
      data: dados,
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "contrato_comercial",
      entidadeId: contratoId,
      autorId: ator.id,
      anterior: estadoAuditavelContrato(anterior),
      novo: estadoAuditavelContrato(contrato),
    });
    return contrato;
  });
}

/**
 * Encerra ou denuncia o contrato. Encerramento cancela acessos e
 * despublica em cascata (RN04, ficha §3.1).
 */
export async function mudarStatusContrato(
  ator: Ator,
  contratoId: string,
  novoStatus: Extract<StatusContrato, "DENUNCIADO" | "ENCERRADO">,
) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.contratoComercial.findUniqueOrThrow({ where: { id: contratoId } });
    if (anterior.status !== "VIGENTE") {
      throw new ErroDeValidacao(["Somente contratos vigentes podem ser encerrados ou denunciados."]);
    }
    const contrato = await tx.contratoComercial.update({
      where: { id: contratoId },
      data: { status: novoStatus },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "contrato_comercial",
      entidadeId: contratoId,
      autorId: ator.id,
      anterior: estadoAuditavelContrato(anterior),
      novo: estadoAuditavelContrato(contrato),
    });
    const ofertasPausadas = await aplicarCascataDaEmpresa(tx, ator.id, anterior.empresaId);
    return { contrato, ofertasPausadas };
  });
}
