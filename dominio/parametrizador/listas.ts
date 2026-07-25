/**
 * Famílias de listas de domínio do Parametrizador (Onda 3, ficha §3.1) e a
 * RN24 como serviço puro.
 *
 * A ficha lista suspensão e descarte como duas listas ("Motivos de
 * suspensão (RN12) e de descarte (RN17)"), e é assim que o editor as trata
 * — o protótipo v6.1 as agrupa num único cartão de hub, mas cada uma tem a
 * sua tabela, o seu uso e a sua contagem, e fundi-las tornaria "criar item"
 * ambíguo. A ficha vence sobre o protótipo em matéria de estrutura.
 *
 * Mecânicas de resgate NÃO aparecem aqui: são tabela, mas estruturais
 * (ficha §3.3) e vivem na seção somente leitura do hub.
 */

export type FamiliaLista =
  | "indicadores"
  | "categorias"
  | "culturas"
  | "cobertura"
  | "motivos-suspensao"
  | "motivos-descarte"
  | "tipos-beneficio"
  | "perfil-cliente";

export interface DefinicaoFamilia {
  id: FamiliaLista;
  /** Módulo a que a lista serve — vira a tarja do cartão no hub (T15). */
  secao: string;
  rotulo: string;
  /** Subtítulo da T16. */
  descricao: string;
  /** Substantivo da contagem ("11 categorias"). */
  unidade: string;
  /** Texto do estado vazio — só as listas que podem nascer vazias o usam. */
  textoVazio?: string;
  /**
   * Indicadores têm grupo, dimensão e peso além do nome: é o caso rico do
   * editor e o único que dispara nova versão de configuração (RN25).
   */
  afetaScore?: boolean;
}

export const FAMILIAS_DE_LISTA: ReadonlyArray<DefinicaoFamilia> = [
  {
    id: "indicadores",
    secao: "Mercado & Scout",
    rotulo: "Indicadores de scout",
    descricao:
      "Nome, grupo, dimensão de medição e peso · seed = as duas tabelas do ScoutCB com pesos v1",
    unidade: "indicadores",
    afetaScore: true,
  },
  {
    id: "categorias",
    secao: "Aliados & Soluções",
    rotulo: "Categorias de solução",
    descricao: "As categorias da vitrine · renomear propaga para soluções, ofertas e filtros",
    unidade: "categorias",
  },
  {
    id: "culturas",
    secao: "Aliados & Soluções",
    rotulo: "Culturas",
    descricao: "Lista simples — usada na ficha da solução",
    unidade: "culturas",
  },
  {
    id: "cobertura",
    secao: "Aliados & Soluções",
    rotulo: "Abrangência",
    descricao: "UFs usadas na abrangência de atuação de aliados e soluções",
    unidade: "UFs",
  },
  {
    id: "motivos-suspensao",
    secao: "Aliados & Soluções",
    rotulo: "Motivos de suspensão",
    descricao: "Motivos tipificados exigidos ao suspender um aliado (RN12)",
    unidade: "motivos",
  },
  {
    id: "motivos-descarte",
    secao: "Mercado & Scout",
    rotulo: "Motivos de descarte",
    descricao: "Motivos tipificados exigidos ao descartar no funil (RN17)",
    unidade: "motivos",
  },
  {
    id: "tipos-beneficio",
    secao: "Ofertas",
    rotulo: "Tipos de benefício",
    descricao: "Natureza do benefício oferecido na vitrine",
    unidade: "tipos",
  },
  {
    id: "perfil-cliente",
    secao: "Assinantes",
    rotulo: "Perfil de cliente",
    descricao: "Porte × natureza (PF/PJ) — seed a definir com o negócio",
    unidade: "perfis",
    textoVazio:
      "O seed de porte × natureza (PF/PJ) ainda não foi definido pelo negócio. Criar itens aqui já os disponibiliza nas seleções.",
  },
];

const POR_ID: ReadonlyMap<string, DefinicaoFamilia> = new Map(
  FAMILIAS_DE_LISTA.map((f) => [f.id, f]),
);

export function familiaDe(id: string): DefinicaoFamilia | null {
  return POR_ID.get(id) ?? null;
}

export const MENSAGEM_RN24_SEM_EXCLUSAO =
  "Itens em uso nunca são excluídos — apenas inativados (RN24). Inativos saem das seleções novas e permanecem nos registros históricos com etiqueta.";

/**
 * RN24 — Frase de uso exibida ANTES de inativar. A contagem vem sempre de
 * uma consulta viva; a ficha proíbe desnormalizar contadores, justamente
 * para que ninguém decida sobre um número velho.
 */
export function textoDeUso(
  quantidade: number,
  unidadeDeUso: string,
  unidadePlural: string,
): string {
  if (quantidade === 0) {
    return "Sem uso registrado — inativar não afeta nenhum registro.";
  }
  if (quantidade === 1) {
    return `Em uso em 1 ${unidadeDeUso}.`;
  }
  return `Em uso em ${quantidade} ${unidadePlural}.`;
}

/**
 * RN24 — Inativar é sempre permitido (não é exclusão: registros históricos
 * seguem apontando para o item). O que a regra exige é que a contagem de
 * uso tenha sido apurada e mostrada antes da ação: um `null` aqui é
 * chamada de código que pulou a etapa, e não passa.
 */
export function validarInativacao(usosApurados: number | null): string[] {
  if (usosApurados === null) {
    return [
      "Inativar exige apurar e exibir a contagem de uso antes da ação (RN24).",
    ];
  }
  return [];
}

/**
 * RN24 — Renomear é update simples: todo o schema referencia os itens por
 * id, então a propagação é automática e não há nada a migrar. A UI apenas
 * avisa que o nome novo passa a aparecer também nos registros antigos.
 */
export const MENSAGEM_RN24_RENOMEAR =
  "Renomear altera o nome em todos os usos — registros históricos passam a exibir o nome novo.";

/** Nome de item de lista: obrigatório e sem duplicata na mesma família. */
export function validarNomeDeItem(
  nome: string,
  nomesExistentes: ReadonlyArray<string>,
): string[] {
  const limpo = nome.trim();
  if (!limpo) {
    return ["Informe o nome do item."];
  }
  const normalizar = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
  if (nomesExistentes.some((existente) => normalizar(existente) === normalizar(limpo))) {
    return [`Já existe um item chamado "${limpo}" nesta lista.`];
  }
  return [];
}
