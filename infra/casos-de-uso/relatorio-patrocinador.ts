import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  cardsDeConsumo,
  lerPatrocinador,
  listarCampanhasDoPatrocinador,
  type CardDeConsumo,
  type LeituraDoPatrocinador,
} from "@/infra/consultas/patrocinadores";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * RN66 — o Relatório do Patrocinador (R1).
 *
 * **Agregado por construção, não por revisão.** O corpo do relatório é
 * montado aqui, e o que ele carrega são contagens — nunca uma linha de
 * assinante. A garantia não é "lembrar de não incluir": é que este módulo
 * não consulta nome, CPF, e-mail ou telefone de ninguém, e o teste varre o
 * corpo gerado atrás dos três, no padrão do teste de vazamento da RN61.
 *
 * Listagem nominal existe e tem outro caminho: a exportação com finalidade
 * da Onda 5 (RN35), que já é auditada e exige permissão própria.
 *
 * **Toda geração é auditada com período e finalidade.** O registro fica em
 * `relatorios_patrocinador` — que a T33 lê para mostrar o histórico — e
 * também na trilha da RN49, pelo mesmo evento de mutação que todo o resto
 * do produto usa.
 */

export const ENTIDADE_RELATORIO = "RelatorioPatrocinador";

export interface PeriodoDoRelatorio {
  periodoInicio: Date;
  periodoFim: Date;
  finalidade: string;
}

export interface CorpoDoRelatorio {
  patrocinador: {
    razaoSocial: string;
    cnpj: string;
    segmento: string | null;
    status: string;
  };
  contrato: LeituraDoPatrocinador["contrato"];
  saldo: LeituraDoPatrocinador["saldo"];
  vigencia: LeituraDoPatrocinador["vigencia"];
  base: {
    vinculosVigentes: number;
    vinculosEncerrados: number;
  };
  campanhas: ReadonlyArray<{
    nome: string;
    estado: string;
    aprovacaoRegistrada: boolean;
  }>;
  consumo: ReadonlyArray<CardDeConsumo>;
  periodo: { inicio: Date; fim: Date };
  finalidade: string;
  geradoEm: Date;
  geradoPor: string;
}

/**
 * Monta o corpo do R1. Separado da gravação de propósito: é esta função
 * que o teste da RN66 varre atrás de dado pessoal, e ela não precisa de
 * transação nem de efeito colateral para ser exercida.
 */
export async function montarCorpoDoRelatorio(
  patrocinadorId: string,
  periodo: PeriodoDoRelatorio,
  geradoPor: string,
  geradoEm: Date,
): Promise<CorpoDoRelatorio> {
  const leitura = await lerPatrocinador(patrocinadorId, geradoEm);
  if (leitura === null) {
    throw new ErroDeValidacao(["Patrocinador não encontrado."]);
  }
  const [campanhas, consumo] = await Promise.all([
    listarCampanhasDoPatrocinador(patrocinadorId),
    cardsDeConsumo(patrocinadorId),
  ]);

  return {
    patrocinador: {
      razaoSocial: leitura.razaoSocial,
      cnpj: leitura.cnpj,
      segmento: leitura.segmento,
      status: leitura.status,
    },
    contrato: leitura.contrato,
    saldo: leitura.saldo,
    vigencia: leitura.vigencia,
    base: {
      vinculosVigentes: leitura.vinculosVigentes,
      vinculosEncerrados: leitura.vinculosEncerrados,
    },
    // Nome e estado da campanha, e SE a aprovação foi registrada. Não vai
    // o nome de quem aprovou: é pessoa física, e o R1 é agregado.
    campanhas: campanhas.map((campanha) => ({
      nome: campanha.nome,
      estado: campanha.estado,
      aprovacaoRegistrada: campanha.aprovacao !== null,
    })),
    consumo,
    periodo: { inicio: periodo.periodoInicio, fim: periodo.periodoFim },
    finalidade: periodo.finalidade,
    geradoEm,
    // Quem gerou é usuário INTERNO da plataforma, não titular de dado da
    // base — e é justamente o que a governança precisa registrar.
    geradoPor,
  };
}

/**
 * Registra a geração do R1 (RN66) e devolve o identificador do registro.
 *
 * O documento em si é renderizado pela tela a partir do corpo — não se
 * guarda PDF: o relatório é reprodutível a qualquer momento a partir do
 * mesmo registro, e guardar o binário criaria uma segunda verdade que
 * envelheceria sozinha.
 */
export async function gerarRelatorio(
  ator: Ator,
  patrocinadorId: string,
  periodo: PeriodoDoRelatorio,
): Promise<{ id: string }> {
  exigirPermissao(ator.papel, "GERAR_RELATORIO_PATROCINADOR");

  if (periodo.periodoFim < periodo.periodoInicio) {
    throw new ErroDeValidacao(["O fim do período não pode ser anterior ao início."]);
  }
  if (periodo.finalidade.trim() === "") {
    throw new ErroDeValidacao([
      "Declare a finalidade do relatório — ela fica registrada na trilha.",
    ]);
  }

  return prisma.$transaction(async (tx) => {
    const patrocinador = await tx.patrocinador.findUnique({
      where: { id: patrocinadorId },
      select: { id: true },
    });
    if (patrocinador === null) {
      throw new ErroDeValidacao(["Patrocinador não encontrado."]);
    }
    const registro = await tx.relatorioPatrocinador.create({
      data: {
        patrocinadorId,
        periodoInicio: periodo.periodoInicio,
        periodoFim: periodo.periodoFim,
        finalidade: periodo.finalidade.trim(),
        autorId: ator.id,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_RELATORIO,
      entidadeId: registro.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        patrocinadorId,
        periodoInicio: registro.periodoInicio,
        periodoFim: registro.periodoFim,
        finalidade: registro.finalidade,
      },
    });
    return { id: registro.id };
  });
}

/** Lê um registro de geração para reproduzir o documento. */
export async function lerRegistroDeRelatorio(ator: Ator, relatorioId: string) {
  exigirPermissao(ator.papel, "VISUALIZAR_PATROCINADORES");
  return prisma.relatorioPatrocinador.findUnique({
    where: { id: relatorioId },
    select: {
      id: true,
      patrocinadorId: true,
      periodoInicio: true,
      periodoFim: true,
      finalidade: true,
      criadoEm: true,
      autor: { select: { nome: true } },
    },
  });
}
