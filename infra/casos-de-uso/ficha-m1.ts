import type { NaturezaOferta, NaturezaPublico, PorteProdutor, Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  normalizarDiferenciais,
  validarIndicadoresDeclarados,
  validarOfertaPretendida,
} from "@/dominio/ficha-cadastral/m1";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do formulário M1 da Ficha Cadastral do Aliado v1 (T12,
 * estágio *Em negociação*).
 *
 * O documento em Word morre aqui: cada seção grava em campo tipado do
 * cadastro que já existe desde a Onda 1 (A/B/C/E), a seção D vira
 * declaração datada e a seção F nasce estruturada — e, na promoção, cada
 * linha de F vira rascunho de Solução + Oferta, sem redigitação.
 */

const ESTAGIOS_DO_M1 = ["EM_NEGOCIACAO", "PRIORIZADA", "EM_AVALIACAO", "MAPEADA"] as const;

function estadoAuditavelM1(empresa: {
  razaoSocial: string | null;
  nomeFantasia: string;
  site: string | null;
  descricaoInstitucional: string | null;
  diferenciais: string[];
  modeloNegocio: string | null;
  publicoPorte: PorteProdutor[];
  publicoNatureza: NaturezaPublico | null;
}) {
  return {
    razaoSocial: empresa.razaoSocial,
    nomeFantasia: empresa.nomeFantasia,
    site: empresa.site,
    descricaoInstitucional: empresa.descricaoInstitucional,
    diferenciais: empresa.diferenciais,
    modeloNegocio: empresa.modeloNegocio,
    publicoPorte: empresa.publicoPorte,
    publicoNatureza: empresa.publicoNatureza,
  };
}

export interface DadosIdentificacaoM1 {
  empresaId: string;
  razaoSocial: string | null;
  nomeFantasia: string;
  site: string | null;
  descricaoInstitucional: string | null;
  /** Texto com um diferencial por linha (até 5). */
  diferenciais: string;
  modeloNegocio: string | null;
  publicoPorte: PorteProdutor[];
  publicoNatureza: NaturezaPublico | null;
}

/** Seções A e B — identificação e classificação, no cadastro-mestre. */
export async function salvarIdentificacaoM1(ator: Ator, dados: DadosIdentificacaoM1) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  if (!dados.nomeFantasia.trim()) {
    throw new ErroDeValidacao(["Nome fantasia é o nome de exibição na vitrine e é obrigatório."]);
  }

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: dados.empresaId } });
    const atualizada = await tx.empresa.update({
      where: { id: dados.empresaId },
      data: {
        razaoSocial: dados.razaoSocial?.trim() || null,
        nomeFantasia: dados.nomeFantasia.trim(),
        site: dados.site?.trim() || null,
        descricaoInstitucional: dados.descricaoInstitucional?.trim() || null,
        diferenciais: normalizarDiferenciais(dados.diferenciais),
        modeloNegocio: dados.modeloNegocio?.trim() || null,
        publicoPorte: dados.publicoPorte,
        publicoNatureza: dados.publicoNatureza,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: dados.empresaId,
      autorId: ator.id,
      anterior: estadoAuditavelM1(anterior),
      novo: estadoAuditavelM1(atualizada),
    });
    return atualizada;
  });
}

export interface DeclaracaoM1 {
  empresaId: string;
  dataDeclaracao: Date;
  ticketMedio: number | null;
  nps: number | null;
  churnMensalPct: number | null;
  numeroClientes: number | null;
  anoFundacao: number | null;
}

/**
 * Seção D — registra uma declaração datada. Cada envio é uma declaração
 * nova: o histórico fica, porque "ticket médio de 2026" e "ticket médio
 * de 2025" são fatos diferentes, não correção um do outro.
 */
export async function registrarIndicadoresDeclarados(ator: Ator, dados: DeclaracaoM1) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const erros = validarIndicadoresDeclarados(
    {
      ticketMedio: dados.ticketMedio,
      nps: dados.nps,
      churnMensalPct: dados.churnMensalPct,
      numeroClientes: dados.numeroClientes,
      anoFundacao: dados.anoFundacao,
    },
    dados.dataDeclaracao.getFullYear(),
  );
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  return prisma.$transaction(async (tx) => {
    const declaracao = await tx.indicadorDeclarado.create({
      data: {
        empresaId: dados.empresaId,
        dataDeclaracao: dados.dataDeclaracao,
        ticketMedio: dados.ticketMedio,
        nps: dados.nps,
        churnMensalPct: dados.churnMensalPct,
        numeroClientes: dados.numeroClientes,
        anoFundacao: dados.anoFundacao,
        registradoPorId: ator.id,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "indicador_declarado",
      entidadeId: declaracao.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        empresaId: declaracao.empresaId,
        dataDeclaracao: declaracao.dataDeclaracao,
        ticketMedio: declaracao.ticketMedio,
        nps: declaracao.nps,
        churnMensalPct: declaracao.churnMensalPct,
        numeroClientes: declaracao.numeroClientes,
        anoFundacao: declaracao.anoFundacao,
        // Autodeclarado: o grau de confiança é diferente do apurado em
        // pesquisa, e a trilha registra isso explicitamente.
        autodeclarado: true,
      },
    });
    return declaracao;
  });
}

export interface OfertaPretendidaM1 {
  empresaId: string;
  natureza: NaturezaOferta;
  titulo: string;
  descricao: string | null;
  tipoBeneficioId: string | null;
  mecanicaId: string | null;
  precoDe: number | null;
  precoPor: number | null;
  instrucoesResgate: string | null;
  vigenciaInicio: Date | null;
  vigenciaFim: Date | null;
}

/** Seção F — cadastra uma oferta pretendida já estruturada. */
export async function adicionarOfertaPretendida(ator: Ator, dados: OfertaPretendidaM1) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  const erros = validarOfertaPretendida({
    natureza: dados.natureza,
    titulo: dados.titulo,
    precoDe: dados.precoDe,
    precoPor: dados.precoPor,
    instrucoesResgate: dados.instrucoesResgate,
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  return prisma.$transaction(async (tx) => {
    const oferta = await tx.ofertaPretendida.create({
      data: {
        empresaId: dados.empresaId,
        natureza: dados.natureza,
        titulo: dados.titulo.trim(),
        descricao: dados.descricao?.trim() || null,
        tipoBeneficioId: dados.tipoBeneficioId,
        mecanicaId: dados.mecanicaId,
        precoDe: dados.precoDe,
        precoPor: dados.precoPor,
        instrucoesResgate: dados.instrucoesResgate?.trim() || null,
        vigenciaInicio: dados.vigenciaInicio,
        vigenciaFim: dados.vigenciaFim,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "oferta_pretendida",
      entidadeId: oferta.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        empresaId: oferta.empresaId,
        natureza: oferta.natureza,
        titulo: oferta.titulo,
        status: oferta.status,
      },
    });
    return oferta;
  });
}

/** Remove uma oferta pretendida ainda não convertida. */
export async function removerOfertaPretendida(ator: Ator, ofertaPretendidaId: string) {
  exigirPermissao(ator.papel, "CRIAR_EDITAR");

  return prisma.$transaction(async (tx) => {
    const oferta = await tx.ofertaPretendida.findUniqueOrThrow({
      where: { id: ofertaPretendidaId },
    });
    if (oferta.status === "CONVERTIDA") {
      throw new ErroDeValidacao([
        "Esta oferta pretendida já virou rascunho de oferta na promoção — edite a oferta real.",
      ]);
    }
    await tx.ofertaPretendida.delete({ where: { id: ofertaPretendidaId } });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "oferta_pretendida",
      entidadeId: ofertaPretendidaId,
      autorId: ator.id,
      anterior: { empresaId: oferta.empresaId, titulo: oferta.titulo, status: oferta.status },
      // Nada é apagado da trilha: a remoção é registrada como estado.
      novo: { empresaId: oferta.empresaId, titulo: oferta.titulo, status: "REMOVIDA" },
    });
  });
}

/**
 * Aproveitamento automático da seção F na promoção (Ficha Cadastral v1):
 * cada oferta pretendida vira um **rascunho** de Solução + Oferta,
 * pendente de curadoria. Roda dentro da transação da promoção.
 *
 * Rascunho é a palavra-chave: nada nasce publicado — a publicação segue
 * exigindo a régua de completude do card (RN09) e, quando ligada, a
 * aprovação (RN06). Conversão sem tipo de benefício ou mecânica definidos
 * é pulada: seria inventar dado que o aliado não deu.
 */
export async function converterOfertasPretendidas(
  tx: Prisma.TransactionClient,
  autorId: string,
  empresaId: string,
): Promise<{ convertidas: number; pendentesDeDados: number }> {
  const pretendidas = await tx.ofertaPretendida.findMany({
    where: { empresaId, status: "RASCUNHO" },
    orderBy: { criadoEm: "asc" },
  });
  if (pretendidas.length === 0) {
    return { convertidas: 0, pendentesDeDados: 0 };
  }

  const empresa = await tx.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    include: { categorias: { select: { categoriaId: true } } },
  });

  let convertidas = 0;
  let pendentesDeDados = 0;

  for (const pretendida of pretendidas) {
    if (!pretendida.tipoBeneficioId || !pretendida.mecanicaId) {
      // Sem tipo de benefício e mecânica não há oferta válida — a linha
      // fica como pretendida, visível na ficha, esperando o dado.
      pendentesDeDados += 1;
      continue;
    }

    // A Solução não tem estado "rascunho" no modelo (ATIVA/INATIVA); quem
    // nasce rascunho — e portanto fora da vitrine até a curadoria — é a
    // Oferta, que é o objeto publicável. A solução entra no estado padrão.
    const solucao = await tx.solucao.create({
      data: {
        empresaId,
        nome: pretendida.titulo,
        descricaoCurta: pretendida.descricao,
        categoriaId: empresa.categorias[0]?.categoriaId ?? null,
      },
    });
    const oferta = await tx.oferta.create({
      data: {
        solucaoId: solucao.id,
        titulo: pretendida.titulo,
        natureza: pretendida.natureza,
        tipoBeneficioId: pretendida.tipoBeneficioId,
        mecanicaId: pretendida.mecanicaId,
        precoDe: pretendida.precoDe,
        precoPor: pretendida.precoPor,
        instrucoesResgate: pretendida.instrucoesResgate,
        vigenciaInicio: pretendida.vigenciaInicio ?? new Date(),
        vigenciaFim: pretendida.vigenciaFim,
        status: "RASCUNHO",
      },
    });
    await tx.ofertaPretendida.update({
      where: { id: pretendida.id },
      data: { status: "CONVERTIDA", solucaoId: solucao.id, ofertaId: oferta.id },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "oferta_pretendida",
      entidadeId: pretendida.id,
      autorId,
      anterior: { status: "RASCUNHO", solucaoId: null, ofertaId: null },
      novo: {
        status: "CONVERTIDA",
        solucaoId: solucao.id,
        ofertaId: oferta.id,
        origem: "ficha_m1",
      },
    });
    convertidas += 1;
  }

  return { convertidas, pendentesDeDados };
}

export function estagioAceitaM1(estagio: string): boolean {
  return (ESTAGIOS_DO_M1 as ReadonlyArray<string>).includes(estagio);
}
