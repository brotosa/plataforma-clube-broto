import type { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { normalizarCnpj, validarCnpj } from "@/dominio/empresas/cnpj";
import {
  pendenciasDePromocao,
  podeTransicionar,
  validarSuspensao,
} from "@/dominio/empresas/estagio";
import { exigeAprovacao } from "@/dominio/aprovacao/motor";
import { calcularCascata } from "@/dominio/solucoes/regras";
import { type Ator, ErroDeValidacao } from "./contexto";
import { converterOfertasPretendidas } from "./ficha-m1";

/** Campos editáveis da identidade da Empresa (ficha §3.1). */
export interface DadosEmpresa {
  razaoSocial?: string | null;
  nomeFantasia?: string;
  cnpj?: string | null;
  enderecoCep?: string | null;
  enderecoLogradouro?: string | null;
  enderecoNumero?: string | null;
  enderecoComplemento?: string | null;
  enderecoBairro?: string | null;
  enderecoMunicipio?: string | null;
  enderecoUf?: string | null;
  logoUrl?: string | null;
  descricaoInstitucional?: string | null;
  site?: string | null;
  categoriaIds?: string[];
}

function validarDadosEmpresa(dados: DadosEmpresa): void {
  const erros: string[] = [];
  if (dados.nomeFantasia !== undefined && !dados.nomeFantasia.trim()) {
    erros.push("Nome fantasia (nome de exibição) é obrigatório.");
  }
  if (dados.cnpj) {
    if (!validarCnpj(dados.cnpj)) {
      erros.push("CNPJ inválido: dígito verificador não confere (RN08).");
    }
  }
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
}

/**
 * Estado auditável da empresa (snapshot dos campos de negócio, Ondas 1 e
 * 2). estagioDesde fica de fora de propósito: o carimbo de data do próprio
 * evento de auditoria é o registro de quando o estágio mudou.
 */
export function estadoAuditavel(empresa: {
  razaoSocial: string | null;
  nomeFantasia: string;
  cnpj: string | null;
  enderecoCep: string | null;
  enderecoLogradouro: string | null;
  enderecoNumero: string | null;
  enderecoComplemento: string | null;
  enderecoBairro: string | null;
  enderecoMunicipio: string | null;
  enderecoUf: string | null;
  logoUrl: string | null;
  descricaoInstitucional: string | null;
  site: string | null;
  estagio: string;
  motivoSuspensaoId: string | null;
  motivoSuspensaoDescricao: string | null;
  dataEntrada: Date | null;
  origem: string | null;
  dataEntradaRadar: Date | null;
  responsavelScoutId: string | null;
  responsavelComercialId: string | null;
  motivoDescarteId: string | null;
  motivoDescarteDescricao: string | null;
  motivoDescarteComentario: string | null;
}) {
  return {
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    cnpj: empresa.cnpj,
    enderecoCep: empresa.enderecoCep,
    enderecoLogradouro: empresa.enderecoLogradouro,
    enderecoNumero: empresa.enderecoNumero,
    enderecoComplemento: empresa.enderecoComplemento,
    enderecoBairro: empresa.enderecoBairro,
    enderecoMunicipio: empresa.enderecoMunicipio,
    enderecoUf: empresa.enderecoUf,
    logoUrl: empresa.logoUrl,
    descricaoInstitucional: empresa.descricaoInstitucional,
    site: empresa.site,
    estagio: empresa.estagio,
    motivoSuspensaoId: empresa.motivoSuspensaoId,
    motivoSuspensaoDescricao: empresa.motivoSuspensaoDescricao,
    dataEntrada: empresa.dataEntrada,
    origem: empresa.origem,
    dataEntradaRadar: empresa.dataEntradaRadar,
    responsavelScoutId: empresa.responsavelScoutId,
    responsavelComercialId: empresa.responsavelComercialId,
    motivoDescarteId: empresa.motivoDescarteId,
    motivoDescarteDescricao: empresa.motivoDescarteDescricao,
    motivoDescarteComentario: empresa.motivoDescarteComentario,
  };
}

/** Cria empresa em estágio EM_NEGOCIACAO (pré-aliança). */
export async function criarEmpresa(ator: Ator, dados: DadosEmpresa) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  if (!dados.nomeFantasia?.trim()) {
    throw new ErroDeValidacao(["Nome fantasia (nome de exibição) é obrigatório."]);
  }
  validarDadosEmpresa(dados);
  const { categoriaIds, ...campos } = dados;

  return prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: {
        ...campos,
        nomeFantasia: dados.nomeFantasia!.trim(),
        cnpj: dados.cnpj ? normalizarCnpj(dados.cnpj) : null,
        categorias: categoriaIds?.length
          ? { create: categoriaIds.map((categoriaId) => ({ categoriaId })) }
          : undefined,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresa.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/** Atualiza dados cadastrais (identidade e categorias). */
export async function atualizarEmpresa(
  ator: Ator,
  empresaId: string,
  dados: DadosEmpresa,
) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  validarDadosEmpresa(dados);
  const { categoriaIds, ...campos } = dados;

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: {
        ...campos,
        cnpj:
          dados.cnpj === undefined
            ? undefined
            : dados.cnpj
              ? normalizarCnpj(dados.cnpj)
              : null,
      },
    });
    if (categoriaIds) {
      await tx.empresaCategoria.deleteMany({ where: { empresaId } });
      if (categoriaIds.length > 0) {
        await tx.empresaCategoria.createMany({
          data: categoriaIds.map((categoriaId) => ({ empresaId, categoriaId })),
        });
      }
    }
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/** Reúne os dados avaliados pela régua de promoção (M2). */
export async function avaliarPromocao(empresaId: string) {
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    include: {
      contatos: true,
      contratos: { where: { status: "VIGENTE" }, orderBy: { criadoEm: "desc" } },
    },
  });
  const contrato = empresa.contratos[0] ?? null;
  return {
    empresa,
    pendencias: pendenciasDePromocao({
      razaoSocial: empresa.razaoSocial,
      nomeFantasia: empresa.nomeFantasia,
      cnpj: empresa.cnpj,
      enderecoMunicipio: empresa.enderecoMunicipio,
      enderecoUf: empresa.enderecoUf,
      quantidadeContatos: empresa.contatos.length,
      contratoVigente: contrato
        ? {
            temAnexo: Boolean(contrato.anexoS3Key),
            comissaoPctDefinida: contrato.comissaoPct !== null,
            ambientesDefinidos: true, // enum obrigatório no contrato
          }
        : null,
    }),
  };
}

/** Promove a Aliada ativa dentro de uma transação (uso interno + motor). */
export async function promoverDentroDaTransacao(
  tx: Prisma.TransactionClient,
  autorId: string,
  empresaId: string,
) {
  const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  if (!podeTransicionar(anterior.estagio, "ALIADA_ATIVA")) {
    throw new ErroDeValidacao([
      `Transição de ${anterior.estagio} para ALIADA_ATIVA não é permitida.`,
    ]);
  }
  const empresa = await tx.empresa.update({
    where: { id: empresaId },
    data: {
      estagio: "ALIADA_ATIVA",
      estagioDesde: new Date(),
      // Data de entrada preenchida na promoção (ficha §3.1); a carga
      // inicial traz a data da planilha (F3) e não passa por aqui.
      dataEntrada: anterior.dataEntrada ?? new Date(),
    },
  });
  await registrarMutacao(criarGravadorPrisma(tx), {
    entidade: "empresa",
    entidadeId: empresaId,
    autorId,
    anterior: estadoAuditavel(anterior),
    novo: estadoAuditavel(empresa),
  });
  // Aproveitamento automático da Ficha Cadastral v1 (seção F): cada oferta
  // pretendida vira rascunho de Solução + Oferta, pendente de curadoria —
  // completude visível, zero redigitação. Nada nasce publicado.
  await converterOfertasPretendidas(tx, autorId, empresaId);
  return empresa;
}

/**
 * Solicita a promoção a Aliada ativa. Com a regra do motor LIGADA
 * (estado de nascimento, RN06) cria solicitação pendente; desligada,
 * promove diretamente.
 */
export async function solicitarPromocao(ator: Ator, empresaId: string) {
  exigirPermissao(ator.papel, "SOLICITAR_PROMOCAO");
  const { empresa, pendencias } = await avaliarPromocao(empresaId);
  if (empresa.estagio !== "EM_NEGOCIACAO") {
    throw new ErroDeValidacao([
      "Somente empresas em negociação podem ser promovidas a Aliada ativa.",
    ]);
  }
  if (pendencias.length > 0) {
    throw new ErroDeValidacao(pendencias);
  }

  const regra = await prisma.aprovacaoRegra.findUniqueOrThrow({
    where: { tipoEntidade: "PROMOCAO_ALIADA_ATIVA" },
    include: { aprovadores: true },
  });

  return prisma.$transaction(async (tx) => {
    if (!exigeAprovacao({ exigida: regra.exigida, aprovadoresDesignados: [] })) {
      const promovida = await promoverDentroDaTransacao(tx, ator.id, empresaId);
      return { resultado: "PROMOVIDA" as const, empresa: promovida };
    }
    const jaPendente = await tx.aprovacaoSolicitacao.findFirst({
      where: {
        tipoEntidade: "PROMOCAO_ALIADA_ATIVA",
        entidadeId: empresaId,
        estado: "SOLICITADA",
      },
    });
    if (jaPendente) {
      throw new ErroDeValidacao([
        "Já existe uma solicitação de promoção pendente para este aliado.",
      ]);
    }
    // RN20 — o caso completo viaja com o pedido: a avaliação vigente (a
    // fechada de maior versão) e o dossiê vigente (o mais recente) ficam
    // fixados na solicitação. Fixar, e não consultar na hora de decidir,
    // preserva o que existia quando o pedido foi feito: enquanto ele
    // espera na fila, uma nova versão de avaliação pode ser aberta e um
    // novo dossiê pode ser gerado.
    const [avaliacaoVigente, dossieVigente] = await Promise.all([
      tx.avaliacaoScout.findFirst({
        where: { empresaId, status: "FECHADA" },
        orderBy: { versao: "desc" },
        select: { id: true },
      }),
      tx.dossie.findFirst({
        where: { empresaId, status: "PRONTO" },
        orderBy: { criadoEm: "desc" },
        select: { id: true },
      }),
    ]);

    const solicitacao = await tx.aprovacaoSolicitacao.create({
      data: {
        tipoEntidade: "PROMOCAO_ALIADA_ATIVA",
        entidadeId: empresaId,
        solicitanteId: ator.id,
        avaliacaoVigenteId: avaliacaoVigente?.id ?? null,
        dossieVigenteId: dossieVigente?.id ?? null,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "aprovacao_solicitacao",
      entidadeId: solicitacao.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        tipoEntidade: solicitacao.tipoEntidade,
        entidadeId: solicitacao.entidadeId,
        estado: solicitacao.estado,
        // Anexos da RN20 na trilha: dá para reconstruir o que o aprovador viu.
        avaliacaoVigenteId: solicitacao.avaliacaoVigenteId,
        dossieVigenteId: solicitacao.dossieVigenteId,
      },
    });
    // Onda 2 (pipeline da ficha §3.1): com o pedido pendente a empresa
    // fica Em aprovação; a devolução a traz de volta a Em negociação.
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const emAprovacao = await tx.empresa.update({
      where: { id: empresaId },
      data: { estagio: "EM_APROVACAO", estagioDesde: new Date() },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(emAprovacao),
    });
    return { resultado: "SOLICITADA" as const, solicitacao };
  });
}

/**
 * RN04 — aplica a cascata dentro da transação: pausa as ofertas
 * PUBLICADAS afetadas e as marca para despublicação no próximo export,
 * auditando cada uma.
 */
export async function aplicarCascataDaEmpresa(
  tx: Prisma.TransactionClient,
  autorId: string,
  empresaId: string,
) {
  const ofertas = await tx.oferta.findMany({
    where: { solucao: { empresaId } },
    select: { id: true, status: true, pendenteRepublicacao: true },
  });
  const acoes = calcularCascata(ofertas);
  for (const acao of acoes) {
    const anterior = ofertas.find((oferta) => oferta.id === acao.ofertaId);
    await tx.oferta.update({
      where: { id: acao.ofertaId },
      data: { status: acao.novoStatus, pendenteRepublicacao: true },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "oferta",
      entidadeId: acao.ofertaId,
      autorId,
      anterior: {
        status: anterior?.status,
        pendenteRepublicacao: anterior?.pendenteRepublicacao,
      },
      novo: { status: acao.novoStatus, pendenteRepublicacao: true },
    });
  }
  return acoes.length;
}

/** Suspende o aliado com motivo tipificado (RN12) e cascata (RN04). */
export async function suspenderEmpresa(
  ator: Ator,
  empresaId: string,
  motivo: { motivoSuspensaoId: string; descricao: string | null },
) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const motivoRegistro = await prisma.motivoSuspensao.findUniqueOrThrow({
    where: { id: motivo.motivoSuspensaoId },
  });
  const errosMotivo = validarSuspensao({
    motivoSlug: motivoRegistro.slug,
    descricao: motivo.descricao,
  });
  if (errosMotivo.length > 0) {
    throw new ErroDeValidacao(errosMotivo);
  }

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (!podeTransicionar(anterior.estagio, "SUSPENSA")) {
      throw new ErroDeValidacao([
        `Transição de ${anterior.estagio} para SUSPENSA não é permitida.`,
      ]);
    }
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: {
        estagio: "SUSPENSA",
        estagioDesde: new Date(),
        motivoSuspensaoId: motivo.motivoSuspensaoId,
        motivoSuspensaoDescricao: motivo.descricao,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    const ofertasPausadas = await aplicarCascataDaEmpresa(tx, ator.id, empresaId);
    return { empresa, ofertasPausadas };
  });
}

/** Reativa aliado suspenso (a republicação de ofertas é decisão manual). */
export async function reativarEmpresa(ator: Ator, empresaId: string) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (!podeTransicionar(anterior.estagio, "ALIADA_ATIVA")) {
      throw new ErroDeValidacao([
        `Transição de ${anterior.estagio} para ALIADA_ATIVA não é permitida.`,
      ]);
    }
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: {
        estagio: "ALIADA_ATIVA",
        estagioDesde: new Date(),
        motivoSuspensaoId: null,
        motivoSuspensaoDescricao: null,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/** Encerra o aliado (estado terminal) com cascata (RN04). */
export async function encerrarEmpresa(ator: Ator, empresaId: string) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (!podeTransicionar(anterior.estagio, "ENCERRADA")) {
      throw new ErroDeValidacao([
        `Transição de ${anterior.estagio} para ENCERRADA não é permitida.`,
      ]);
    }
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: { estagio: "ENCERRADA", estagioDesde: new Date() },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    const ofertasPausadas = await aplicarCascataDaEmpresa(tx, ator.id, empresaId);
    return { empresa, ofertasPausadas };
  });
}
