import type { EstagioEmpresa, GrupoIndicador, RecomendacaoAvaliacao } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { DIMENSOES_MEDICAO, ROTULOS_GRUPO_INDICADOR } from "@/dominio/avaliacao/dimensoes";
import { podeAvaliarNoEstagio } from "@/dominio/avaliacao/regras";
import { type SubtotalDimensao, subtotaisDoJson } from "@/dominio/avaliacao/score";
import { ROTULOS_ESTAGIO_FUNIL } from "@/dominio/funil/regras";

/**
 * Consulta de leitura da T10 (avaliação): indicadores ativos agrupados
 * pelas dimensões de medição na ordem canônica do ScoutCB, rascunho aberto
 * com suas notas e histórico de versões fechadas (com os subtotais
 * congelados no fechamento, para a comparação entre versões).
 */

export interface IndicadorDaTela {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  dimensao: string;
  /** Peso numérico (Decimal do banco convertido) — exibido discretamente. */
  peso: number;
}

export interface DimensaoDaTela {
  dimensao: string;
  grupo: GrupoIndicador | null;
  rotuloGrupo: string | null;
  indicadores: IndicadorDaTela[];
}

export interface NotaDaTela {
  /** 1–5; null quando "não se aplica". */
  nota: number | null;
  naoSeAplica: boolean;
  evidencia: string | null;
}

export interface VersaoFechada {
  id: string;
  versao: number;
  total: number | null;
  recomendacao: RecomendacaoAvaliacao | null;
  fechadaEm: Date | null;
  avaliadorNome: string;
  subtotais: SubtotalDimensao[];
}

export interface TelaAvaliacao {
  empresa: {
    id: string;
    nomeFantasia: string;
    estagio: EstagioEmpresa;
    rotuloEstagio: string;
    scoreScouting: number | null;
    reavaliacaoPendente: boolean;
    responsavelScoutNome: string | null;
  };
  /** Dimensões com indicadores ativos, na ordem canônica do ScoutCB. */
  dimensoes: DimensaoDaTela[];
  /** Rascunho aberto (se houver) com as notas por indicador. */
  rascunho: {
    id: string;
    versao: number;
    notas: Record<string, NotaDaTela>;
  } | null;
  /** Versões fechadas, da mais recente para a mais antiga. */
  fechadas: VersaoFechada[];
  /**
   * Notas da última versão fechada, por indicador — espelha na tela o
   * pré-preenchimento que iniciarAvaliacao fará na próxima versão e
   * explica o score fechado quando não há rascunho.
   */
  notasDaUltimaFechada: Record<string, NotaDaTela> | null;
  /** Estágio atual permite avaliar (abrir/continuar rascunho)? */
  podeAvaliarAgora: boolean;
}

export async function telaAvaliacao(empresaId: string): Promise<TelaAvaliacao | null> {
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      nomeFantasia: true,
      estagio: true,
      scoreScouting: true,
      reavaliacaoPendente: true,
      responsavelScout: { select: { nome: true } },
    },
  });
  if (!empresa) {
    return null;
  }

  const indicadores = await prisma.indicador.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
  });
  const paraTela = (indicador: (typeof indicadores)[number]): IndicadorDaTela => ({
    id: indicador.id,
    slug: indicador.slug,
    nome: indicador.nome,
    descricao: indicador.descricao,
    dimensao: indicador.dimensao,
    peso: Number(indicador.peso),
  });

  const dimensoes: DimensaoDaTela[] = DIMENSOES_MEDICAO.map((dimensao) => ({
    dimensao: dimensao.nome,
    grupo: dimensao.grupo,
    rotuloGrupo: ROTULOS_GRUPO_INDICADOR[dimensao.grupo],
    indicadores: indicadores
      .filter((indicador) => indicador.dimensao === dimensao.nome)
      .map(paraTela),
  })).filter((dimensao) => dimensao.indicadores.length > 0);

  // Defensivo (pós-Onda 3 o editor pode criar dimensões novas): indicadores
  // fora das 14 canônicas aparecem ao final, agrupados pela própria dimensão.
  const canonicas = new Set(DIMENSOES_MEDICAO.map((d) => d.nome));
  const foraDoCanone = indicadores.filter((indicador) => !canonicas.has(indicador.dimensao));
  for (const indicador of foraDoCanone) {
    const existente = dimensoes.find((d) => d.dimensao === indicador.dimensao);
    if (existente) {
      existente.indicadores.push(paraTela(indicador));
    } else {
      dimensoes.push({
        dimensao: indicador.dimensao,
        grupo: null,
        rotuloGrupo: null,
        indicadores: [paraTela(indicador)],
      });
    }
  }

  const rascunho = await prisma.avaliacaoScout.findFirst({
    where: { empresaId, status: "RASCUNHO" },
    include: { notas: true },
  });
  const fechadas = await prisma.avaliacaoScout.findMany({
    where: { empresaId, status: "FECHADA" },
    orderBy: { versao: "desc" },
    include: { avaliador: { select: { nome: true } } },
  });
  const notasUltimaFechada =
    fechadas.length > 0
      ? await prisma.avaliacaoNota.findMany({ where: { avaliacaoId: fechadas[0]!.id } })
      : null;

  return {
    empresa: {
      id: empresa.id,
      nomeFantasia: empresa.nomeFantasia,
      estagio: empresa.estagio,
      rotuloEstagio: ROTULOS_ESTAGIO_FUNIL[empresa.estagio],
      scoreScouting: empresa.scoreScouting,
      reavaliacaoPendente: empresa.reavaliacaoPendente,
      responsavelScoutNome: empresa.responsavelScout?.nome ?? null,
    },
    dimensoes,
    rascunho: rascunho
      ? {
          id: rascunho.id,
          versao: rascunho.versao,
          notas: Object.fromEntries(
            rascunho.notas.map((nota) => [
              nota.indicadorId,
              { nota: nota.nota, naoSeAplica: nota.naoSeAplica, evidencia: nota.evidencia },
            ]),
          ),
        }
      : null,
    fechadas: fechadas.map((avaliacao) => ({
      id: avaliacao.id,
      versao: avaliacao.versao,
      total: avaliacao.total,
      recomendacao: avaliacao.recomendacao,
      fechadaEm: avaliacao.fechadaEm,
      avaliadorNome: avaliacao.avaliador.nome,
      subtotais: subtotaisDoJson(avaliacao.subtotais),
    })),
    notasDaUltimaFechada: notasUltimaFechada
      ? Object.fromEntries(
          notasUltimaFechada.map((nota) => [
            nota.indicadorId,
            { nota: nota.nota, naoSeAplica: nota.naoSeAplica, evidencia: nota.evidencia },
          ]),
        )
      : null,
    podeAvaliarAgora: podeAvaliarNoEstagio(empresa.estagio),
  };
}
