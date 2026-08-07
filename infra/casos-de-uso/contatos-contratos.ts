import { createHash } from "node:crypto";
import type { AmbientePagamento, PapelContato, StatusContrato } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { validarAnexoContrato } from "@/dominio/contratos/anexo";
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

// ---------------------------------------------------------------------
// Anexo (PDF) do contrato comercial — Nível 2 do "editar contrato".
// Mesmo desenho da minuta do patrocínio: binário 1:1 no banco, tipo real
// pelo conteúdo, troca e remoção auditadas, servido como download. Substitui
// a chave S3 textual (`anexoS3Key`), que permanece só para compatibilidade.
// ---------------------------------------------------------------------

/** Nome da entidade na trilha de auditoria do anexo. */
export const ENTIDADE_ANEXO_CONTRATO = "AnexoContrato";

/** SHA-256 do conteúdo — identidade de versão do anexo para o ETag da rota. */
function hashDoAnexo(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * Estado auditável do anexo — nunca o binário, só a identidade. Devolve
 * sempre um objeto (campos nulos quando não há anexo), porque `novo` da
 * trilha exige estado não-nulo; o `null` de "não existia antes" é expresso
 * pelo próprio `anterior` no chamador, como na minuta.
 */
function estadoAuditavelAnexo(
  anexo: { nomeArquivo: string; tipoMime: string; bytes: number; hash: string } | null,
): Record<string, unknown> {
  return anexo === null
    ? { nomeArquivo: null, tipoMime: null, bytes: null, hash: null }
    : {
        nomeArquivo: anexo.nomeArquivo,
        tipoMime: anexo.tipoMime,
        bytes: anexo.bytes,
        hash: anexo.hash,
      };
}

/**
 * Envia (ou substitui) o anexo do contrato comercial. Mesma permissão de
 * edição do contrato (CRIAR_EDITAR — Gestor e Analista) e mesma trilha de
 * auditoria. Recusa de arquivo é erro de causa conhecida: a mensagem sobe
 * inteira até a tela (RN55), nomeando o motivo — inclusive a imagem
 * recusada, quando o arquivo está certo e o formato é que não serve.
 */
export async function enviarAnexoContrato(
  ator: Ator,
  contratoId: string,
  arquivo: { nome: string; conteudo: Uint8Array },
): Promise<{ hash: string }> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  const contrato = await prisma.contratoComercial.findUnique({
    where: { id: contratoId },
    select: { id: true },
  });
  if (contrato === null) {
    throw new ErroDeValidacao(["Contrato não encontrado — salve o contrato antes de anexar o PDF."]);
  }
  const validado = validarAnexoContrato(arquivo.conteudo, arquivo.nome);
  const hash = hashDoAnexo(validado.conteudo);

  await prisma.$transaction(async (tx) => {
    const anterior = await tx.anexoContrato.findUnique({
      where: { contratoId },
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });
    const dados = {
      conteudo: Buffer.from(validado.conteudo),
      tipoMime: validado.tipoMime,
      bytes: validado.bytes,
      hash,
      nomeArquivo: arquivo.nome,
      autorId: ator.id,
    };
    await tx.anexoContrato.upsert({
      where: { contratoId },
      create: { contratoId, ...dados },
      update: dados,
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_ANEXO_CONTRATO,
      entidadeId: contratoId,
      autorId: ator.id,
      anterior: anterior === null ? null : estadoAuditavelAnexo(anterior),
      novo: estadoAuditavelAnexo({
        nomeArquivo: arquivo.nome,
        tipoMime: validado.tipoMime,
        bytes: validado.bytes,
        hash,
      }),
    });
  });
  return { hash };
}

/** Remove o anexo; o contrato volta a exibir a pendência "sem anexo (PDF)". */
export async function removerAnexoContrato(ator: Ator, contratoId: string): Promise<void> {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  await prisma.$transaction(async (tx) => {
    const anterior = await tx.anexoContrato.findUnique({
      where: { contratoId },
      select: { nomeArquivo: true, tipoMime: true, bytes: true, hash: true },
    });
    if (anterior === null) {
      throw new ErroDeValidacao(["Este contrato não tem anexo para remover."]);
    }
    await tx.anexoContrato.delete({ where: { contratoId } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_ANEXO_CONTRATO,
      entidadeId: contratoId,
      autorId: ator.id,
      anterior: estadoAuditavelAnexo(anterior),
      novo: estadoAuditavelAnexo(null),
    });
  });
}

/**
 * Lê o anexo do contrato VIGENTE de um aliado, para servir pela rota. Só aqui
 * o binário sai do banco — todas as outras consultas selecionam a existência,
 * não o conteúdo. Recebe o id do aliado (empresa) porque é o que a URL da
 * rota carrega; resolve o contrato vigente por dentro.
 */
export async function lerAnexoDoContratoVigente(
  ator: Ator,
  empresaId: string,
): Promise<{ conteudo: Uint8Array; tipoMime: string; hash: string; nomeArquivo: string } | null> {
  exigirPermissao(ator.papel, "VISUALIZAR");
  const contrato = await prisma.contratoComercial.findFirst({
    where: { empresaId, status: "VIGENTE" },
    select: { id: true },
  });
  if (contrato === null) return null;
  const anexo = await prisma.anexoContrato.findUnique({
    where: { contratoId: contrato.id },
    select: { conteudo: true, tipoMime: true, hash: true, nomeArquivo: true },
  });
  if (anexo === null) return null;
  return {
    conteudo: new Uint8Array(anexo.conteudo),
    tipoMime: anexo.tipoMime,
    hash: anexo.hash,
    nomeArquivo: anexo.nomeArquivo,
  };
}
