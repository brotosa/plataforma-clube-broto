import type { RecomendacaoAvaliacao } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  MENSAGEM_RN18,
  podeAvaliarNoEstagio,
  podeEditarAvaliacao,
  validarFechamento,
  validarNota,
} from "@/dominio/avaliacao/regras";
import { calcularScore } from "@/dominio/avaliacao/score";
import { ROTULOS_ESTAGIO_FUNIL } from "@/dominio/funil/regras";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso da avaliação de scout (F7 — T10). Versões são criadas como
 * rascunho, recebem notas 1–5 com evidência e fecham com recomendação;
 * fechada é imutável (RN18) — correção abre nova versão pré-preenchida.
 * O fechamento congela subtotais/total e atualiza o score da empresa;
 * nenhum caminho daqui move a empresa no funil — priorizar segue sendo
 * decisão humana explícita na T8 (RN15).
 */

function estadoAuditavelAvaliacao(avaliacao: {
  empresaId: string;
  versao: number;
  avaliadorId: string;
  status: string;
  recomendacao: string | null;
  total: number | null;
  fechadaEm: Date | null;
}) {
  return {
    empresaId: avaliacao.empresaId,
    versao: avaliacao.versao,
    avaliadorId: avaliacao.avaliadorId,
    status: avaliacao.status,
    recomendacao: avaliacao.recomendacao,
    total: avaliacao.total,
    fechadaEm: avaliacao.fechadaEm,
  };
}

/**
 * T10 — devolve o rascunho aberto da empresa ou cria a próxima versão.
 * A nova versão nasce pré-preenchida com as notas da última fechada
 * (correção RN18 parte do que foi pontuado; indicadores inativados ficam
 * de fora). Em empresa nunca avaliada, nasce vazia.
 */
export async function iniciarAvaliacao(ator: Ator, empresaId: string) {
  exigirPermissao(ator.papel, "ASSUMIR_E_AVALIAR");

  return prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (!podeAvaliarNoEstagio(empresa.estagio)) {
      throw new ErroDeValidacao([
        `Empresa em estágio ${ROTULOS_ESTAGIO_FUNIL[empresa.estagio]} não recebe avaliação — assuma a empresa no funil (RN14) ou aguarde a reavaliação anual (RN21).`,
      ]);
    }

    const rascunhoAberto = await tx.avaliacaoScout.findFirst({
      where: { empresaId, status: "RASCUNHO" },
      include: { notas: true },
    });
    if (rascunhoAberto) {
      return rascunhoAberto;
    }

    const ultimaFechada = await tx.avaliacaoScout.findFirst({
      where: { empresaId, status: "FECHADA" },
      orderBy: { versao: "desc" },
      include: { notas: { include: { indicador: { select: { ativo: true } } } } },
    });
    const maiorVersao = await tx.avaliacaoScout.aggregate({
      where: { empresaId },
      _max: { versao: true },
    });
    const versao = (maiorVersao._max.versao ?? 0) + 1;

    const notasCopiadas = (ultimaFechada?.notas ?? [])
      .filter((nota) => nota.indicador.ativo)
      .map((nota) => ({
        indicadorId: nota.indicadorId,
        nota: nota.nota,
        evidencia: nota.evidencia,
      }));

    const criada = await tx.avaliacaoScout.create({
      data: {
        empresaId,
        versao,
        avaliadorId: ator.id,
        notas: { create: notasCopiadas },
      },
      include: { notas: true },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "avaliacao_scout",
      entidadeId: criada.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        ...estadoAuditavelAvaliacao(criada),
        // Proveniência do pré-preenchimento (as notas copiadas seguem
        // auditáveis na versão de origem; edições novas auditam por nota).
        notasCopiadasDaVersao: ultimaFechada?.versao ?? null,
        notasCopiadas: notasCopiadas.length,
      },
    });
    return criada;
  });
}

export interface NotaInformada {
  indicadorId: string;
  nota: number;
  evidencia?: string | null;
}

/**
 * T10 — grava (cria/atualiza) notas do rascunho, uma auditoria por nota
 * alterada. Avaliação fechada não aceita nota (RN18); indicador inativo
 * não recebe nota nova.
 */
export async function salvarNotas(
  ator: Ator,
  avaliacaoId: string,
  notas: ReadonlyArray<NotaInformada>,
) {
  exigirPermissao(ator.papel, "ASSUMIR_E_AVALIAR");
  const errosDeEscala = [...new Set(notas.flatMap((n) => validarNota(n.nota)))];
  if (errosDeEscala.length > 0) {
    throw new ErroDeValidacao(errosDeEscala);
  }

  return prisma.$transaction(async (tx) => {
    const avaliacao = await tx.avaliacaoScout.findUniqueOrThrow({
      where: { id: avaliacaoId },
    });
    if (!podeEditarAvaliacao(avaliacao.status)) {
      throw new ErroDeValidacao([MENSAGEM_RN18]);
    }

    const idsInformados = [...new Set(notas.map((n) => n.indicadorId))];
    const indicadores = await tx.indicador.findMany({
      where: { id: { in: idsInformados } },
    });
    if (indicadores.length !== idsInformados.length) {
      throw new ErroDeValidacao(["Indicador desconhecido na avaliação."]);
    }
    const inativos = indicadores.filter((indicador) => !indicador.ativo);
    if (inativos.length > 0) {
      throw new ErroDeValidacao([
        `Indicador inativo não recebe nota: ${inativos.map((i) => i.nome).join(", ")}.`,
      ]);
    }

    for (const informada of notas) {
      const chave = { avaliacaoId, indicadorId: informada.indicadorId };
      const anterior = await tx.avaliacaoNota.findUnique({
        where: { avaliacaoId_indicadorId: chave },
      });
      const evidencia = informada.evidencia?.trim() || null;
      const gravada = await tx.avaliacaoNota.upsert({
        where: { avaliacaoId_indicadorId: chave },
        update: { nota: informada.nota, evidencia },
        create: { ...chave, nota: informada.nota, evidencia },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "avaliacao_nota",
        entidadeId: gravada.id,
        autorId: ator.id,
        anterior: anterior ? { nota: anterior.nota, evidencia: anterior.evidencia } : null,
        novo: anterior
          ? { nota: gravada.nota, evidencia: gravada.evidencia }
          : {
              avaliacaoId,
              indicadorId: informada.indicadorId,
              nota: gravada.nota,
              evidencia: gravada.evidencia,
            },
      });
    }

    return tx.avaliacaoScout.findUniqueOrThrow({
      where: { id: avaliacaoId },
      include: { notas: true },
    });
  });
}

/**
 * T10 — fecha a versão: congela subtotais por dimensão e total 0–100
 * (RN18/antecipação da RN25 — reponderações futuras não re-pontuam),
 * grava a recomendação e atualiza o score vigente da empresa. Fechar não
 * move a empresa no funil: o score recomenda, a decisão é humana (RN15).
 * Zera a marca de reavaliação (RN21): o ciclo anual reinicia aqui.
 */
export async function fecharAvaliacao(
  ator: Ator,
  avaliacaoId: string,
  recomendacao: RecomendacaoAvaliacao | null,
) {
  exigirPermissao(ator.papel, "ASSUMIR_E_AVALIAR");

  return prisma.$transaction(async (tx) => {
    const avaliacao = await tx.avaliacaoScout.findUniqueOrThrow({
      where: { id: avaliacaoId },
      include: { notas: { include: { indicador: true } } },
    });
    if (!podeEditarAvaliacao(avaliacao.status)) {
      throw new ErroDeValidacao([MENSAGEM_RN18]);
    }
    const erros = validarFechamento({
      quantidadeNotas: avaliacao.notas.length,
      recomendacao,
    });
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }

    const score = calcularScore(
      avaliacao.notas.map((nota) => ({
        dimensao: nota.indicador.dimensao,
        peso: Number(nota.indicador.peso),
        nota: nota.nota,
      })),
    );
    const fechada = await tx.avaliacaoScout.update({
      where: { id: avaliacaoId },
      data: {
        status: "FECHADA",
        recomendacao,
        subtotais: JSON.parse(JSON.stringify(score.subtotais)),
        total: score.totalInteiro,
        fechadaEm: new Date(),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "avaliacao_scout",
      entidadeId: avaliacaoId,
      autorId: ator.id,
      anterior: estadoAuditavelAvaliacao(avaliacao),
      novo: estadoAuditavelAvaliacao(fechada),
    });

    const empresaAnterior = await tx.empresa.findUniqueOrThrow({
      where: { id: avaliacao.empresaId },
    });
    const empresaNova = await tx.empresa.update({
      where: { id: avaliacao.empresaId },
      data: { scoreScouting: score.totalInteiro, reavaliacaoPendente: false },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaAnterior.id,
      autorId: ator.id,
      anterior: {
        scoreScouting: empresaAnterior.scoreScouting,
        reavaliacaoPendente: empresaAnterior.reavaliacaoPendente,
      },
      novo: {
        scoreScouting: empresaNova.scoreScouting,
        reavaliacaoPendente: empresaNova.reavaliacaoPendente,
      },
    });

    return fechada;
  });
}
