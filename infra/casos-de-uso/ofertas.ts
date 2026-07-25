import type { ModalidadePagamento, NaturezaOferta, Prisma, StatusOferta } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  type MecanicaSlug,
  calcularCompletudeCard,
  deveMarcarRepublicacao,
  impedimentosDePublicacao,
  mecanicaCompativelComAmbiente,
  validarNatureza,
} from "@/dominio/ofertas/regras";
import { exigeAprovacao } from "@/dominio/aprovacao/motor";
import { type Ator, ErroDeValidacao } from "./contexto";

export interface DadosOferta {
  titulo?: string;
  natureza?: NaturezaOferta;
  tipoBeneficioId?: string;
  precoDe?: number | null;
  precoPor?: number | null;
  cupomCodigoRegras?: string | null;
  modalidadePagamento?: ModalidadePagamento | null;
  mecanicaId?: string;
  urlResgateExterno?: string | null;
  instrucoesResgate?: string | null;
  vigenciaInicio?: Date;
  vigenciaFim?: Date | null;
  limiteResgates?: number | null;
}

function estadoAuditavelOferta(oferta: {
  titulo: string;
  natureza: NaturezaOferta;
  tipoBeneficioId: string;
  precoDe: unknown;
  precoPor: unknown;
  cupomCodigoRegras: string | null;
  modalidadePagamento: ModalidadePagamento | null;
  mecanicaId: string;
  urlResgateExterno: string | null;
  instrucoesResgate: string | null;
  vigenciaInicio: Date;
  vigenciaFim: Date | null;
  limiteResgates: number | null;
  status: StatusOferta;
  pendenteRepublicacao: boolean;
}) {
  return {
    titulo: oferta.titulo,
    natureza: oferta.natureza,
    tipoBeneficioId: oferta.tipoBeneficioId,
    precoDe: oferta.precoDe,
    precoPor: oferta.precoPor,
    cupomCodigoRegras: oferta.cupomCodigoRegras,
    modalidadePagamento: oferta.modalidadePagamento,
    mecanicaId: oferta.mecanicaId,
    urlResgateExterno: oferta.urlResgateExterno,
    instrucoesResgate: oferta.instrucoesResgate,
    vigenciaInicio: oferta.vigenciaInicio,
    vigenciaFim: oferta.vigenciaFim,
    limiteResgates: oferta.limiteResgates,
    status: oferta.status,
    pendenteRepublicacao: oferta.pendenteRepublicacao,
  };
}

async function validarConsistencia(dados: {
  natureza: NaturezaOferta;
  tipoBeneficioId: string;
  precoDe: number | null;
  precoPor: number | null;
  cupomCodigoRegras: string | null;
  modalidadePagamento: ModalidadePagamento | null;
}) {
  const tipo = await prisma.tipoBeneficio.findUniqueOrThrow({
    where: { id: dados.tipoBeneficioId },
  });
  const erros = validarNatureza({
    natureza: dados.natureza,
    tipoBeneficioSlug: tipo.slug,
    precoDe: dados.precoDe,
    precoPor: dados.precoPor,
    cupomCodigoRegras: dados.cupomCodigoRegras,
    modalidadePagamento: dados.modalidadePagamento,
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
}

export async function criarOferta(ator: Ator, solucaoId: string, dados: DadosOferta) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  const obrigatorios: string[] = [];
  if (!dados.titulo?.trim()) obrigatorios.push("Título comercial é obrigatório.");
  if (!dados.natureza) obrigatorios.push("Natureza é obrigatória.");
  if (!dados.tipoBeneficioId) obrigatorios.push("Tipo de benefício é obrigatório.");
  if (!dados.mecanicaId) obrigatorios.push("Mecânica de resgate é obrigatória.");
  if (!dados.vigenciaInicio) obrigatorios.push("Início de vigência é obrigatório.");
  if (obrigatorios.length > 0) {
    throw new ErroDeValidacao(obrigatorios);
  }
  await validarConsistencia({
    natureza: dados.natureza!,
    tipoBeneficioId: dados.tipoBeneficioId!,
    precoDe: dados.precoDe ?? null,
    precoPor: dados.precoPor ?? null,
    cupomCodigoRegras: dados.cupomCodigoRegras ?? null,
    modalidadePagamento: dados.modalidadePagamento ?? null,
  });

  return prisma.$transaction(async (tx) => {
    const oferta = await tx.oferta.create({
      data: {
        solucaoId,
        titulo: dados.titulo!.trim(),
        natureza: dados.natureza!,
        tipoBeneficioId: dados.tipoBeneficioId!,
        precoDe: dados.precoDe ?? null,
        precoPor: dados.precoPor ?? null,
        cupomCodigoRegras: dados.cupomCodigoRegras ?? null,
        modalidadePagamento: dados.modalidadePagamento ?? null,
        mecanicaId: dados.mecanicaId!,
        urlResgateExterno: dados.urlResgateExterno ?? null,
        instrucoesResgate: dados.instrucoesResgate ?? null,
        vigenciaInicio: dados.vigenciaInicio!,
        vigenciaFim: dados.vigenciaFim ?? null,
        limiteResgates: dados.limiteResgates ?? null,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "oferta",
      entidadeId: oferta.id,
      autorId: ator.id,
      anterior: null,
      novo: { solucaoId, ...estadoAuditavelOferta(oferta) },
    });
    return oferta;
  });
}

/** Atualiza campos da oferta, aplicando a RN10 quando publicada. */
export async function atualizarOferta(ator: Ator, ofertaId: string, dados: DadosOferta) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
    await validarConsistencia({
      natureza: dados.natureza ?? anterior.natureza,
      tipoBeneficioId: dados.tipoBeneficioId ?? anterior.tipoBeneficioId,
      precoDe: dados.precoDe === undefined ? decimalParaNumero(anterior.precoDe) : dados.precoDe,
      precoPor: dados.precoPor === undefined ? decimalParaNumero(anterior.precoPor) : dados.precoPor,
      cupomCodigoRegras:
        dados.cupomCodigoRegras === undefined ? anterior.cupomCodigoRegras : dados.cupomCodigoRegras,
      modalidadePagamento:
        dados.modalidadePagamento === undefined
          ? anterior.modalidadePagamento
          : dados.modalidadePagamento,
    });

    const oferta = await tx.oferta.update({ where: { id: ofertaId }, data: dados });

    const eventos = await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "oferta",
      entidadeId: ofertaId,
      autorId: ator.id,
      anterior: estadoAuditavelOferta(anterior),
      novo: estadoAuditavelOferta(oferta),
    });

    // RN10 — alterar campo publicável de oferta Publicada liga a flag.
    const camposAlterados = eventos.map((evento) => evento.campo);
    if (deveMarcarRepublicacao(anterior.status, camposAlterados) && !oferta.pendenteRepublicacao) {
      await tx.oferta.update({
        where: { id: ofertaId },
        data: { pendenteRepublicacao: true },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "oferta",
        entidadeId: ofertaId,
        autorId: ator.id,
        anterior: { pendenteRepublicacao: false },
        novo: { pendenteRepublicacao: true },
      });
    }
    return oferta;
  });
}

function decimalParaNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  return Number(valor);
}

/** Condições estruturais e régua da oferta, para o serviço e para a UI (T5). */
export async function avaliarPublicacao(ofertaId: string) {
  const oferta = await prisma.oferta.findUniqueOrThrow({
    where: { id: ofertaId },
    include: {
      mecanica: true,
      solucao: {
        include: {
          culturas: true,
          ufs: true,
          empresa: {
            include: { contratos: { where: { status: "VIGENTE" } } },
          },
        },
      },
    },
  });
  const empresa = oferta.solucao.empresa;
  const contratoVigente = empresa.contratos[0] ?? null;
  const completude = calcularCompletudeCard({
    aliado: { nomeFantasia: empresa.nomeFantasia, logoUrl: empresa.logoUrl },
    solucao: {
      nome: oferta.solucao.nome,
      descricaoCurta: oferta.solucao.descricaoCurta,
      temCategoria: Boolean(oferta.solucao.categoriaId),
      quantidadeCulturas: oferta.solucao.culturas.length,
      coberturaNacional: oferta.solucao.coberturaNacional,
      quantidadeUfs: oferta.solucao.ufs.length,
      imagemCardUrl: oferta.solucao.imagemCardUrl,
    },
  });
  const mecanicaCompativel = mecanicaCompativelComAmbiente(
    oferta.mecanica.slug as MecanicaSlug,
    contratoVigente?.ambientesPagamento ?? null,
  );
  const impedimentos = impedimentosDePublicacao({
    estagioEmpresa: empresa.estagio,
    statusContrato: contratoVigente?.status ?? null,
    statusSolucao: oferta.solucao.status,
    completudeCard: completude.completa,
    mecanicaCompativel,
  });
  return { oferta, completude, impedimentos };
}

async function mudarStatusDentroDaTransacao(
  tx: Prisma.TransactionClient,
  autorId: string,
  ofertaId: string,
  novoStatus: StatusOferta,
) {
  const anterior = await tx.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
  const oferta = await tx.oferta.update({
    where: { id: ofertaId },
    data: {
      status: novoStatus,
      // Toda mudança de status pós-export interessa ao próximo pacote.
      pendenteRepublicacao: anterior.status === "PUBLICADA" || novoStatus === "PUBLICADA"
        ? true
        : anterior.pendenteRepublicacao,
    },
  });
  await registrarMutacao(criarGravadorPrisma(tx), {
    entidade: "oferta",
    entidadeId: ofertaId,
    autorId,
    anterior: { status: anterior.status, pendenteRepublicacao: anterior.pendenteRepublicacao },
    novo: { status: oferta.status, pendenteRepublicacao: oferta.pendenteRepublicacao },
  });
  return oferta;
}

/** Publica dentro da transação (uso interno + efeito de aprovação do motor). */
export async function publicarDentroDaTransacao(
  tx: Prisma.TransactionClient,
  autorId: string,
  ofertaId: string,
) {
  return mudarStatusDentroDaTransacao(tx, autorId, ofertaId, "PUBLICADA");
}

/**
 * Publica a oferta: RN02 + RN09 + RN11 verificadas; porta do motor
 * (PUBLICACAO_OFERTA — nasce desligada; ligável em T7 sem código).
 */
export async function publicarOferta(ator: Ator, ofertaId: string) {
  exigirPermissao(ator.papel, "PUBLICAR_PAUSAR_ENCERRAR_OFERTA");
  const { oferta, impedimentos } = await avaliarPublicacao(ofertaId);
  if (oferta.status !== "RASCUNHO" && oferta.status !== "PAUSADA") {
    throw new ErroDeValidacao([
      `Oferta em status ${oferta.status} não pode ser publicada (somente rascunhos e pausadas).`,
    ]);
  }
  if (impedimentos.length > 0) {
    throw new ErroDeValidacao(impedimentos);
  }

  const regra = await prisma.aprovacaoRegra.findUniqueOrThrow({
    where: { tipoEntidade: "PUBLICACAO_OFERTA" },
  });

  return prisma.$transaction(async (tx) => {
    if (!exigeAprovacao({ exigida: regra.exigida, aprovadoresDesignados: [] })) {
      const publicada = await publicarDentroDaTransacao(tx, ator.id, ofertaId);
      return { resultado: "PUBLICADA" as const, oferta: publicada };
    }
    const jaPendente = await tx.aprovacaoSolicitacao.findFirst({
      where: { tipoEntidade: "PUBLICACAO_OFERTA", entidadeId: ofertaId, estado: "SOLICITADA" },
    });
    if (jaPendente) {
      throw new ErroDeValidacao(["Já existe solicitação de publicação pendente para esta oferta."]);
    }
    const solicitacao = await tx.aprovacaoSolicitacao.create({
      data: {
        tipoEntidade: "PUBLICACAO_OFERTA",
        entidadeId: ofertaId,
        solicitanteId: ator.id,
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
      },
    });
    return { resultado: "SOLICITADA" as const, solicitacao };
  });
}

/** Pausa manual de oferta publicada. */
export async function pausarOferta(ator: Ator, ofertaId: string) {
  exigirPermissao(ator.papel, "PUBLICAR_PAUSAR_ENCERRAR_OFERTA");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
    if (anterior.status !== "PUBLICADA") {
      throw new ErroDeValidacao(["Somente ofertas publicadas podem ser pausadas."]);
    }
    return mudarStatusDentroDaTransacao(tx, ator.id, ofertaId, "PAUSADA");
  });
}

/** Encerramento (RN05: nada é excluído; encerra-se). */
export async function encerrarOferta(ator: Ator, ofertaId: string) {
  exigirPermissao(ator.papel, "PUBLICAR_PAUSAR_ENCERRAR_OFERTA");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
    if (anterior.status === "ENCERRADA") {
      return anterior;
    }
    return mudarStatusDentroDaTransacao(tx, ator.id, ofertaId, "ENCERRADA");
  });
}
