import type { EstagioEmpresa } from "@prisma/client";

/**
 * RN51 — **fonte única de cobertura**.
 *
 * Antes da Onda 7 a definição de cobertura morava em `dominio/metas/cobertura.ts`
 * e só a T13 a usava. A T29 precisa da mesma verdade com outra pergunta, e o
 * Dashboard já consumia a primeira: três telas contando lacunas por caminhos
 * próprios é como um número diverge do outro sem ninguém perceber. Este módulo
 * é o único lugar onde "coberta", "frágil", "sem cobertura" e "descoberta no
 * funil" existem.
 *
 * A arquitetura é deliberada e tem duas camadas:
 *
 * 1. **Fato** (`FatoDeCategoria`) — o que o cadastro declara sobre a categoria,
 *    apurado por UMA consulta: quantos aliados ativos, quantas soluções
 *    publicadas, quantas empresas em cada estágio do funil. Nenhum juízo.
 * 2. **Lentes** — cada tela deriva do MESMO fato o recorte que a sua pergunta
 *    pede. A RN51 é explícita nisso: "A T13 mantém sua lente (pipeline: o que
 *    está no funil para preencher) e a T29 a sua (ativo: profundidade do
 *    portfólio) — lentes diferentes, fonte idêntica".
 *
 * Por que as lentes não colapsam em uma só: a T13 pergunta *onde falta gente*
 * (gap = categoria sem aliado ativo) e a T29 pergunta *onde a prateleira é
 * rasa* (uma categoria com um único aliado, ou com aliados mas nada publicado,
 * não é um gap — é uma fragilidade). Forçar as duas no mesmo predicado mudaria
 * os números que a T13 já exibe em produção, o que a F14 tem ordem explícita
 * de não fazer.
 */

// ---------------------------------------------------------------------
// Fato: o que o cadastro declara
// ---------------------------------------------------------------------

/** Colunas de funil da matriz, na ordem do pipeline (protótipo v6.1). */
export const ESTAGIOS_DA_MATRIZ: ReadonlyArray<EstagioEmpresa> = [
  "MAPEADA",
  "EM_AVALIACAO",
  "PRIORIZADA",
  "EM_NEGOCIACAO",
  "EM_APROVACAO",
];

/**
 * O que a categoria tem, segundo o cadastro. Uma linha por categoria ativa
 * da taxonomia — inclusive as vazias, porque ausência é informação (RN53).
 */
export interface FatoDeCategoria {
  categoriaId: string;
  categoriaNome: string;
  /** Empresas em ALIADA_ATIVA vinculadas à categoria. */
  aliadosAtivos: number;
  /**
   * Soluções da categoria com ao menos uma oferta PUBLICADA.
   *
   * "Publicada" é o mesmo critério que a T1 já usa em "sem oferta ativa"
   * (`ofertas: { some: { status: PUBLICADA } }`): é o que está na vitrine.
   * Solução cadastrada sem oferta publicada existe no sistema mas não existe
   * para o assinante, e a T29 mede prateleira, não cadastro.
   */
  solucoesPublicadas: number;
  /** Contagem por estágio pré-aliança; ausente = zero. */
  funil: Readonly<Partial<Record<EstagioEmpresa, number>>>;
}

/** Volumes que ficam FORA da distribuição e precisam ser declarados (RN53). */
export interface VolumeExcluido {
  /** Aliados ativos sem categoria-alvo. */
  aliadosSemCategoria: number;
  /** Empresas do funil (pré-aliança) sem categoria-alvo. */
  empresasDoFunilSemCategoria: number;
  /** Soluções publicadas cuja solução não tem categoria. */
  solucoesSemCategoria: number;
}

// ---------------------------------------------------------------------
// Situação da categoria — o vocabulário da Onda 7
// ---------------------------------------------------------------------

/**
 * As quatro situações que a ficha da Onda 7 nomeia (§1: "o que a rede cobre,
 * onde ela é frágil ou inexistente"), em ordem crescente de saúde.
 */
export type SituacaoCobertura =
  | "SEM_COBERTURA"
  | "DESCOBERTA_NO_FUNIL"
  | "FRAGIL"
  | "COBERTA";

export const ROTULOS_SITUACAO: Readonly<Record<SituacaoCobertura, string>> = {
  SEM_COBERTURA: "sem cobertura",
  DESCOBERTA_NO_FUNIL: "descoberta no funil",
  FRAGIL: "frágil",
  COBERTA: "coberta",
};

/**
 * O critério de cada situação, em texto — a tela **exibe** isto, porque
 * "frágil" sem régua declarada é adjetivo, não medida. O prompt da Onda 7
 * manda declarar o que se adotou; declarar na UI é a forma de não virar
 * conhecimento tribal.
 */
export const CRITERIOS_SITUACAO: Readonly<Record<SituacaoCobertura, string>> = {
  SEM_COBERTURA: "nenhum aliado ativo e ninguém no funil",
  DESCOBERTA_NO_FUNIL: "nenhum aliado ativo, mas há empresa em prospecção",
  FRAGIL: "um único aliado ativo, ou aliados sem nenhuma solução publicada",
  COBERTA: "dois ou mais aliados ativos e ao menos uma solução publicada",
};

/**
 * Situação da categoria (lente de portfólio, T29).
 *
 * **Frágil** é o único critério que a ficha não fecha em número, e o prompt
 * manda declarar o adotado. São duas fragilidades distintas que o cadastro
 * sustenta, e ambas contam:
 *
 * - **um único aliado ativo** — a categoria existe apoiada em um fornecedor
 *   só; a saída dele zera a categoria. É risco de dependência, o mesmo que o
 *   painel de concentração mede no agregado.
 * - **aliado ativo sem solução publicada** — há quem atenda, mas não há nada
 *   na vitrine. Para o assinante, a categoria está vazia.
 *
 * O que NÃO entra no critério: número de ofertas, preço, telemetria de
 * resgate. Nada disso está na ficha da Onda 7, e RN53 não admite indicador
 * sem lastro no cadastro.
 */
export function situacaoDaCategoria(fato: FatoDeCategoria): SituacaoCobertura {
  if (fato.aliadosAtivos === 0) {
    return totalNoFunil(fato) > 0 ? "DESCOBERTA_NO_FUNIL" : "SEM_COBERTURA";
  }
  if (fato.solucoesPublicadas === 0 || fato.aliadosAtivos === 1) {
    return "FRAGIL";
  }
  return "COBERTA";
}

/** Soma das colunas de funil da categoria. */
export function totalNoFunil(fato: FatoDeCategoria): number {
  return ESTAGIOS_DA_MATRIZ.reduce((soma, estagio) => soma + (fato.funil[estagio] ?? 0), 0);
}

/** Situações que a T29 lista em "Onde faltam" — vazios e fragilidades. */
export const SITUACOES_QUE_EXIGEM_ACAO: ReadonlyArray<SituacaoCobertura> = [
  "SEM_COBERTURA",
  "DESCOBERTA_NO_FUNIL",
  "FRAGIL",
];

export function exigeAcao(situacao: SituacaoCobertura): boolean {
  return SITUACOES_QUE_EXIGEM_ACAO.includes(situacao);
}

// ---------------------------------------------------------------------
// Lente 1 — pipeline (T13 e Dashboard)
// ---------------------------------------------------------------------

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

/**
 * Matriz categoria × (aliadas ativas · funil por estágio) — a lente da T13.
 *
 * Gap de portfólio = categoria sem nenhuma aliada ativa (ficha Onda 2 §5:
 * "célula vazia = gap de portfólio"). **A definição não mudou na Onda 7**: a
 * T13 está em produção e a extração para cá é de endereço, não de regra. O
 * teste de regressão em `infra/consultas/cobertura.regressao.test.ts` existe
 * exatamente para provar isso a cada execução.
 *
 * Note que `gap` NÃO é `situacaoDaCategoria() !== "COBERTA"`: uma categoria
 * com um aliado ativo e nada publicado é FRAGIL para a T29 e **não é gap**
 * para a T13. Lentes diferentes, fato idêntico — que é o que a RN51 pede.
 */
export function montarMatriz(fatos: ReadonlyArray<FatoDeCategoria>): LinhaDaMatriz[] {
  return fatos.map((fato) => {
    const celulas = ESTAGIOS_DA_MATRIZ.map((estagio) => ({
      estagio,
      quantidade: fato.funil[estagio] ?? 0,
    }));
    const total = celulas.reduce((soma, celula) => soma + celula.quantidade, 0);
    const gap = fato.aliadosAtivos === 0;
    return {
      categoriaId: fato.categoriaId,
      categoriaNome: fato.categoriaNome,
      aliadasAtivas: fato.aliadosAtivos,
      celulas,
      totalNoFunil: total,
      gap,
      gapDescoberto: gap && total === 0,
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

// ---------------------------------------------------------------------
// Lente 2 — portfólio (T29)
// ---------------------------------------------------------------------

export interface LinhaDePortfolio {
  categoriaId: string;
  categoriaNome: string;
  aliadosAtivos: number;
  solucoesPublicadas: number;
  empresasNoFunil: number;
  situacao: SituacaoCobertura;
}

export interface ResumoDoPortfolio {
  /** Categorias ativas da vitrine — o denominador de tudo. */
  categorias: number;
  cobertas: number;
  fragis: number;
  descobertasNoFunil: number;
  semCobertura: number;
  aliadosAtivos: number;
  solucoesPublicadas: number;
}

export function montarPortfolio(fatos: ReadonlyArray<FatoDeCategoria>): LinhaDePortfolio[] {
  return fatos.map((fato) => ({
    categoriaId: fato.categoriaId,
    categoriaNome: fato.categoriaNome,
    aliadosAtivos: fato.aliadosAtivos,
    solucoesPublicadas: fato.solucoesPublicadas,
    empresasNoFunil: totalNoFunil(fato),
    situacao: situacaoDaCategoria(fato),
  }));
}

function contar(
  linhas: ReadonlyArray<LinhaDePortfolio>,
  situacao: SituacaoCobertura,
): number {
  return linhas.filter((linha) => linha.situacao === situacao).length;
}

export function resumirPortfolio(
  linhas: ReadonlyArray<LinhaDePortfolio>,
): ResumoDoPortfolio {
  return {
    categorias: linhas.length,
    cobertas: contar(linhas, "COBERTA"),
    fragis: contar(linhas, "FRAGIL"),
    descobertasNoFunil: contar(linhas, "DESCOBERTA_NO_FUNIL"),
    semCobertura: contar(linhas, "SEM_COBERTURA"),
    aliadosAtivos: linhas.reduce((soma, linha) => soma + linha.aliadosAtivos, 0),
    solucoesPublicadas: linhas.reduce((soma, linha) => soma + linha.solucoesPublicadas, 0),
  };
}

/**
 * Ordenação da distribuição por categoria (ficha §2: "ordenada por volume,
 * com o critério de ordenação declarado em texto").
 *
 * Volume decrescente; empate desfeito por soluções e depois por nome, para a
 * ordem ser estável entre execuções — lista que dança a cada recarga não é
 * lida como a mesma lista.
 */
export function ordenarPorVolume(
  linhas: ReadonlyArray<LinhaDePortfolio>,
  visao: VisaoDaCobertura,
): LinhaDePortfolio[] {
  const volume = (linha: LinhaDePortfolio) =>
    visao === "ALIADOS" ? linha.aliadosAtivos : linha.solucoesPublicadas;
  return [...linhas].sort(
    (a, b) =>
      volume(b) - volume(a) ||
      b.solucoesPublicadas - a.solucoesPublicadas ||
      a.categoriaNome.localeCompare(b.categoriaNome, "pt-BR"),
  );
}

/** Leitura da T29: contar aliados ou contar soluções (ficha §2, filtros). */
export type VisaoDaCobertura = "ALIADOS" | "SOLUCOES";

export const ROTULOS_VISAO: Readonly<Record<VisaoDaCobertura, string>> = {
  ALIADOS: "Aliados",
  SOLUCOES: "Soluções",
};

export const CRITERIO_DE_ORDENACAO: Readonly<Record<VisaoDaCobertura, string>> = {
  ALIADOS: "ordenado por aliados ativos na categoria, do maior para o menor",
  SOLUCOES: "ordenado por soluções publicadas na categoria, do maior para o menor",
};

// ---------------------------------------------------------------------
// Concentração (ficha §2)
// ---------------------------------------------------------------------

export interface Concentracao {
  /** Percentual do portfólio nas três maiores categorias; null sem base. */
  percentual: number | null;
  /** As três maiores, já nomeadas e posicionadas. */
  maiores: ReadonlyArray<{ posicao: number; categoriaNome: string; volume: number }>;
  total: number;
  /** Quantas categorias entraram no cálculo — pode ser < 3 numa rede pequena. */
  consideradas: number;
}

/**
 * Percentual do portfólio nas três maiores categorias — leitura de risco de
 * dependência.
 *
 * Total zero devolve `percentual: null`, não 0%: "0% concentrado" descreveria
 * uma rede distribuída, quando a verdade é que não há portfólio para
 * concentrar (RN53, mesma disciplina do `percentual()` do Dashboard).
 */
export function calcularConcentracao(
  linhas: ReadonlyArray<LinhaDePortfolio>,
  visao: VisaoDaCobertura,
): Concentracao {
  const volume = (linha: LinhaDePortfolio) =>
    visao === "ALIADOS" ? linha.aliadosAtivos : linha.solucoesPublicadas;
  const total = linhas.reduce((soma, linha) => soma + volume(linha), 0);
  const tres = ordenarPorVolume(linhas, visao)
    .filter((linha) => volume(linha) > 0)
    .slice(0, 3);
  const somaDasTres = tres.reduce((soma, linha) => soma + volume(linha), 0);

  return {
    percentual: total > 0 ? Math.round((somaDasTres / total) * 1000) / 10 : null,
    maiores: tres.map((linha, indice) => ({
      posicao: indice + 1,
      categoriaNome: linha.categoriaNome,
      volume: volume(linha),
    })),
    total,
    consideradas: tres.length,
  };
}
