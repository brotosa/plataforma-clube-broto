import type { EstagioEmpresa } from "@prisma/client";

/**
 * Mapa de cobertura (T13) como serviço puro: a matriz categoria ×
 * (aliadas ativas · funil por estágio) e a marcação de gap.
 *
 * **Gap de portfólio = categoria sem nenhuma aliada ativa** (ficha Onda 2
 * §5: "célula vazia = gap de portfólio"). O protótipo v6.1 marca duas
 * categorias fixas por nome e mostra travessão na coluna de aliadas —
 * ele próprio diz, no rodapé, que aqueles gaps são ilustrativos "até a
 * carga". A carga já aconteceu (F3), então aqui o gap é derivado do dado
 * real, que é o que a ficha pede.
 *
 * A distinção que a tela precisa fazer: gap **coberto no funil** (ninguém
 * ativo, mas há empresas caminhando) é diferente de gap **descoberto**
 * (nada ativo e nada no funil) — o segundo é o que exige scouting.
 */

/** Colunas de funil da matriz, na ordem do pipeline (protótipo v6.1). */
export const ESTAGIOS_DA_MATRIZ: ReadonlyArray<EstagioEmpresa> = [
  "MAPEADA",
  "EM_AVALIACAO",
  "PRIORIZADA",
  "EM_NEGOCIACAO",
  "EM_APROVACAO",
];

export interface ContagemPorCategoria {
  categoriaId: string;
  categoriaNome: string;
  aliadasAtivas: number;
  /** Contagem por estágio do funil; ausente = zero. */
  funil: Readonly<Partial<Record<EstagioEmpresa, number>>>;
}

export interface LinhaDaMatriz {
  categoriaId: string;
  categoriaNome: string;
  aliadasAtivas: number;
  celulas: ReadonlyArray<{ estagio: EstagioEmpresa; quantidade: number }>;
  /** Total de empresas no funil (soma das cinco colunas). */
  totalNoFunil: number;
  /** Sem aliada ativa na categoria. */
  gap: boolean;
  /** Sem aliada ativa E sem ninguém no funil — o gap que ninguém está atacando. */
  gapDescoberto: boolean;
}

export interface ResumoDaCobertura {
  categorias: number;
  categoriasCobertas: number;
  gaps: number;
  gapsDescobertos: number;
  aliadasAtivas: number;
  empresasNoFunil: number;
}

export function montarMatriz(
  contagens: ReadonlyArray<ContagemPorCategoria>,
): LinhaDaMatriz[] {
  return contagens.map((contagem) => {
    const celulas = ESTAGIOS_DA_MATRIZ.map((estagio) => ({
      estagio,
      quantidade: contagem.funil[estagio] ?? 0,
    }));
    const totalNoFunil = celulas.reduce((soma, celula) => soma + celula.quantidade, 0);
    const gap = contagem.aliadasAtivas === 0;
    return {
      categoriaId: contagem.categoriaId,
      categoriaNome: contagem.categoriaNome,
      aliadasAtivas: contagem.aliadasAtivas,
      celulas,
      totalNoFunil,
      gap,
      gapDescoberto: gap && totalNoFunil === 0,
    };
  });
}

export function resumirCobertura(linhas: ReadonlyArray<LinhaDaMatriz>): ResumoDaCobertura {
  return {
    categorias: linhas.length,
    categoriasCobertas: linhas.filter((linha) => !linha.gap).length,
    gaps: linhas.filter((linha) => linha.gap).length,
    gapsDescobertos: linhas.filter((linha) => linha.gapDescoberto).length,
    aliadasAtivas: linhas.reduce((soma, linha) => soma + linha.aliadasAtivas, 0),
    empresasNoFunil: linhas.reduce((soma, linha) => soma + linha.totalNoFunil, 0),
  };
}

/** Célula vazia é travessão, nunca zero — o protótipo é explícito nisso. */
export function textoDaCelula(quantidade: number): string {
  return quantidade === 0 ? "—" : String(quantidade);
}
