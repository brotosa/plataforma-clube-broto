import type {
  DestinacaoOferta,
  ModalidadePagamento,
  NaturezaOferta,
  Prisma,
  StatusOferta,
} from "@prisma/client";
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
  /** Benefício com Tipo = Percentual de desconto: inteiro 1–100. */
  percentualDesconto?: number | null;
  cupomCodigoRegras?: string | null;
  modalidadePagamento?: ModalidadePagamento | null;
  mecanicaId?: string;
  urlResgateExterno?: string | null;
  instrucoesResgate?: string | null;
  vigenciaInicio?: Date;
  vigenciaFim?: Date | null;
  limiteResgates?: number | null;
  /**
   * Id da oferta na Minutrade — chave que liga a telemetria importada a esta
   * oferta (coluna `id_oferta` do arquivo). `@unique`. A carga inicial já o
   * traz; para ofertas nascidas na plataforma, é informado à mão (ou pela
   * importação). `undefined` = não mexer; `null` = limpar; string = definir.
   */
  idExternoMinutrade?: string | null;
  /** Onda 4 (ficha §3): destinação e vínculo opcional — a publicação
   *  Minutrade segue inalterada; o vínculo serve à gestão e à medição. */
  destinacao?: DestinacaoOferta;
  destinacaoCampanhaId?: string | null;
  destinacaoCestaId?: string | null;
}

function estadoAuditavelOferta(oferta: {
  titulo: string;
  natureza: NaturezaOferta;
  tipoBeneficioId: string;
  precoDe: unknown;
  precoPor: unknown;
  percentualDesconto: number | null;
  cupomCodigoRegras: string | null;
  modalidadePagamento: ModalidadePagamento | null;
  mecanicaId: string;
  urlResgateExterno: string | null;
  instrucoesResgate: string | null;
  vigenciaInicio: Date;
  vigenciaFim: Date | null;
  limiteResgates: number | null;
  idExternoMinutrade: string | null;
  status: StatusOferta;
  pendenteRepublicacao: boolean;
  destinacao?: DestinacaoOferta;
  destinacaoCampanhaId?: string | null;
  destinacaoCestaId?: string | null;
}) {
  return {
    titulo: oferta.titulo,
    natureza: oferta.natureza,
    tipoBeneficioId: oferta.tipoBeneficioId,
    precoDe: oferta.precoDe,
    precoPor: oferta.precoPor,
    percentualDesconto: oferta.percentualDesconto,
    cupomCodigoRegras: oferta.cupomCodigoRegras,
    modalidadePagamento: oferta.modalidadePagamento,
    mecanicaId: oferta.mecanicaId,
    urlResgateExterno: oferta.urlResgateExterno,
    instrucoesResgate: oferta.instrucoesResgate,
    vigenciaInicio: oferta.vigenciaInicio,
    vigenciaFim: oferta.vigenciaFim,
    limiteResgates: oferta.limiteResgates,
    // Auditado, mas fora de CAMPOS_PUBLICAVEIS (regras.ts): mudar o id externo
    // não liga a flag de republicação — não é campo do card nem do export.
    idExternoMinutrade: oferta.idExternoMinutrade,
    status: oferta.status,
    pendenteRepublicacao: oferta.pendenteRepublicacao,
    destinacao: oferta.destinacao ?? null,
    destinacaoCampanhaId: oferta.destinacaoCampanhaId ?? null,
    destinacaoCestaId: oferta.destinacaoCestaId ?? null,
  };
}

/**
 * `idExternoMinutrade` é `@unique`: reusar o de outra oferta viola a
 * restrição e cairia como exceção genérica na interface. Conferir antes e
 * lançar `ErroDeValidacao` nomeia a causa (RN55) — a mensagem diz qual id
 * colidiu. `null`/vazio nunca colide (limpar é sempre permitido).
 */
async function garantirIdExternoUnico(
  tx: Prisma.TransactionClient,
  idExterno: string | null,
  ofertaIdAtual: string | null,
) {
  if (!idExterno) return;
  const existente = await tx.oferta.findFirst({
    where: {
      idExternoMinutrade: idExterno,
      ...(ofertaIdAtual ? { id: { not: ofertaIdAtual } } : {}),
    },
    select: { id: true },
  });
  if (existente) {
    throw new ErroDeValidacao([
      `O Id externo (Minutrade) "${idExterno}" já está em uso por outra oferta.`,
    ]);
  }
}

async function validarConsistencia(dados: {
  natureza: NaturezaOferta;
  tipoBeneficioId: string;
  precoDe: number | null;
  precoPor: number | null;
  percentualDesconto: number | null;
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
    percentualDesconto: dados.percentualDesconto,
    cupomCodigoRegras: dados.cupomCodigoRegras,
    modalidadePagamento: dados.modalidadePagamento,
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }
  return { tipoSlug: tipo.slug };
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
  const { tipoSlug } = await validarConsistencia({
    natureza: dados.natureza!,
    tipoBeneficioId: dados.tipoBeneficioId!,
    precoDe: dados.precoDe ?? null,
    precoPor: dados.precoPor ?? null,
    percentualDesconto: dados.percentualDesconto ?? null,
    cupomCodigoRegras: dados.cupomCodigoRegras ?? null,
    modalidadePagamento: dados.modalidadePagamento ?? null,
  });

  // Percentual de desconto substitui preço de/por: quando o tipo é Percentual,
  // grava o % e zera os preços; nos demais tipos, o % fica vazio (o servidor é
  // a autoridade — não depende só de a tela ter escondido os campos).
  const ehPercentual = tipoSlug === "PCT_DESCONTO";
  const precoDeFinal = ehPercentual ? null : (dados.precoDe ?? null);
  const precoPorFinal = ehPercentual ? null : (dados.precoPor ?? null);
  const percentualFinal = ehPercentual ? (dados.percentualDesconto ?? null) : null;
  const idExterno = dados.idExternoMinutrade?.trim() || null;

  return prisma.$transaction(async (tx) => {
    await garantirIdExternoUnico(tx, idExterno, null);
    const oferta = await tx.oferta.create({
      data: {
        solucaoId,
        titulo: dados.titulo!.trim(),
        natureza: dados.natureza!,
        tipoBeneficioId: dados.tipoBeneficioId!,
        precoDe: precoDeFinal,
        precoPor: precoPorFinal,
        percentualDesconto: percentualFinal,
        cupomCodigoRegras: dados.cupomCodigoRegras ?? null,
        modalidadePagamento: dados.modalidadePagamento ?? null,
        mecanicaId: dados.mecanicaId!,
        urlResgateExterno: dados.urlResgateExterno ?? null,
        instrucoesResgate: dados.instrucoesResgate ?? null,
        vigenciaInicio: dados.vigenciaInicio!,
        vigenciaFim: dados.vigenciaFim ?? null,
        limiteResgates: dados.limiteResgates ?? null,
        idExternoMinutrade: idExterno,
        // Onda 4: destinação não é campo publicável (não entra em
        // CAMPOS_PUBLICAVEIS) — a vitrine e o export seguem iguais.
        destinacao: dados.destinacao ?? "VITRINE",
        destinacaoCampanhaId: dados.destinacaoCampanhaId ?? null,
        destinacaoCestaId: dados.destinacaoCestaId ?? null,
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
    // `undefined` = a chamada não mexe no id externo; `null`/string = trocar.
    // Só confere unicidade quando o campo veio na atualização (RN55).
    if (dados.idExternoMinutrade !== undefined) {
      await garantirIdExternoUnico(tx, dados.idExternoMinutrade?.trim() || null, ofertaId);
    }
    await validarConsistencia({
      natureza: dados.natureza ?? anterior.natureza,
      tipoBeneficioId: dados.tipoBeneficioId ?? anterior.tipoBeneficioId,
      precoDe: dados.precoDe === undefined ? decimalParaNumero(anterior.precoDe) : dados.precoDe,
      precoPor: dados.precoPor === undefined ? decimalParaNumero(anterior.precoPor) : dados.precoPor,
      percentualDesconto:
        dados.percentualDesconto === undefined
          ? anterior.percentualDesconto
          : dados.percentualDesconto,
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
      tipoBeneficio: true,
      solucao: {
        include: {
          culturas: true,
          ufs: true,
          // Só a existência da imagem interessa aqui (RN09/RN60): o
          // binário fica fora da consulta, como o da marca.
          imagemCard: { select: { solucaoId: true } },
          empresa: {
            include: {
              contratos: { where: { status: "VIGENTE" } },
              // Só a existência da marca interessa aqui (RN09): selecionar
              // um escalar barato mantém o binário fora desta consulta.
              marca: { select: { empresaId: true } },
            },
          },
        },
      },
    },
  });
  const empresa = oferta.solucao.empresa;
  const contratoVigente = empresa.contratos[0] ?? null;
  const completude = calcularCompletudeCard({
    aliado: {
      nomeFantasia: empresa.nomeFantasia,
      temMarca: empresa.marca !== null,
      logoUrl: empresa.logoUrl,
    },
    solucao: {
      nome: oferta.solucao.nome,
      descricaoCurta: oferta.solucao.descricaoCurta,
      temCategoria: Boolean(oferta.solucao.categoriaId),
      quantidadeCulturas: oferta.solucao.culturas.length,
      coberturaNacional: oferta.solucao.coberturaNacional,
      quantidadeUfs: oferta.solucao.ufs.length,
      temImagem: oferta.solucao.imagemCard !== null,
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

export interface ResumoPublicacaoEmMassa {
  /** Ofertas que estavam em rascunho/pausada — universo considerado. */
  candidatas: number;
  /** Foram ao ar direto (regra de aprovação desligada). */
  publicadas: number;
  /** Entraram na fila de aprovação (RN06 — regra ligada). */
  solicitadas: number;
  /** Recusadas com a causa nomeada (RN02/RN09/RN11 ou já pendente). */
  inelegiveis: Array<{ id: string; titulo: string; motivos: string[] }>;
}

/**
 * Publica em massa todas as ofertas elegíveis (rascunho ou pausada).
 *
 * **Não duplica nenhuma regra**: chama `publicarOferta` para cada oferta,
 * então cada uma passa exatamente pelas mesmas verificações (RN02/RN09/
 * RN11), pelo mesmo roteamento da porta de aprovação (PUBLICACAO_OFERTA) e
 * pela mesma auditoria — é o padrão da RN57 (o caminho em massa reusa o
 * caso de uso único, não reescreve a validação).
 *
 * Cada oferta é sua própria transação: uma inelegível **não derruba** as
 * demais. O resultado é um resumo — publicadas, enfileiradas e as recusadas
 * com o motivo nomeado —, no mesmo espírito da quarentena da importação:
 * o que não entrou aparece com a causa, nunca em silêncio.
 */
export async function publicarTodasElegiveis(ator: Ator): Promise<ResumoPublicacaoEmMassa> {
  exigirPermissao(ator.papel, "PUBLICAR_PAUSAR_ENCERRAR_OFERTA");

  const candidatas = await prisma.oferta.findMany({
    where: { status: { in: ["RASCUNHO", "PAUSADA"] } },
    select: { id: true, titulo: true },
    orderBy: { criadoEm: "asc" },
  });

  const resumo: ResumoPublicacaoEmMassa = {
    candidatas: candidatas.length,
    publicadas: 0,
    solicitadas: 0,
    inelegiveis: [],
  };

  for (const candidata of candidatas) {
    try {
      const resultado = await publicarOferta(ator, candidata.id);
      if (resultado.resultado === "PUBLICADA") {
        resumo.publicadas += 1;
      } else {
        resumo.solicitadas += 1;
      }
    } catch (erro) {
      if (erro instanceof ErroDeValidacao) {
        // Causa nomeada (RN55): os impedimentos sobem inteiros ao resumo.
        resumo.inelegiveis.push({
          id: candidata.id,
          titulo: candidata.titulo,
          motivos: [...erro.erros],
        });
      } else {
        throw erro;
      }
    }
  }

  return resumo;
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
