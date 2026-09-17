import type { TabelaPivotada } from "./pivo";

/**
 * RN80–RN82 — a visualização do Gerador: que desenho serve, o que ele ajusta,
 * e quando ele **se recusa** a desenhar.
 *
 * ## O que este módulo NÃO faz
 *
 * Não desenha. Ele decide — e a separação é a mesma que o catálogo e o
 * compilador já usam: a regra vive no domínio, sem SVG, sem React e sem DOM,
 * e por isso é testável sem navegador. O desenho é da tela.
 *
 * ## Por que a decisão não é do usuário sozinho
 *
 * Um gráfico mente com mais facilidade que uma tabela, porque a **forma
 * convence antes de o número ser lido**. Barras de altura parecida sugerem
 * empate; uma barra ausente sugere zero; duas séries no mesmo eixo sugerem
 * que são comparáveis. Nenhuma dessas sugestões passa pela leitura — elas
 * chegam antes.
 *
 * Então a escolha é fechada (RN80) e há recusas (RN82). Não é desconfiança de
 * quem usa: é que o desenho errado não parece errado.
 */

export const TIPOS_DE_VISUALIZACAO = [
  "TABELA",
  "BARRAS",
  "COLUNAS",
  "LINHA",
  "AREA",
  "ROSCA",
  "NUMERO",
] as const;
export type TipoDeVisualizacao = (typeof TIPOS_DE_VISUALIZACAO)[number];

export const ROTULOS_DE_VISUALIZACAO: Readonly<Record<TipoDeVisualizacao, string>> = {
  TABELA: "Tabela",
  BARRAS: "Barras",
  COLUNAS: "Colunas",
  LINHA: "Linha",
  AREA: "Área",
  ROSCA: "Rosca",
  NUMERO: "Número",
};

/**
 * Teto de fatias da rosca (RN82).
 *
 * Acima disto ela deixa de ser legível: as fatias pequenas viram fios, a
 * legenda cresce mais que o desenho, e a ordem de leitura se perde. Seis é
 * onde a rosca ainda responde "qual é a maior" num relance, que é a única
 * pergunta que ela responde bem.
 */
export const MAXIMO_DE_FATIAS = 6;

/** Ajustes possíveis. Cada tipo admite um subconjunto — ver `AJUSTES_DO_TIPO`. */
export interface AjustesDeVisualizacao {
  /** Barras: horizontal (padrão) ou vertical. */
  orientacao?: "HORIZONTAL" | "VERTICAL";
  /** Ordenação das categorias. */
  ordenar?: "MAIOR" | "MENOR" | "ROTULO";
  /** Quantas categorias desenhar; o resto fica só na tabela. */
  limite?: number;
  /** Escrever o valor ao lado de cada marca. */
  rotulosDeDado?: boolean;
  /** Colunas cruzadas: agrupadas, empilhadas ou 100%. */
  empilhamento?: "AGRUPADO" | "EMPILHADO" | "CEM_POR_CENTO";
  /** Linha e área: marcar cada ponto. */
  marcadores?: boolean;
}

/** Que ajustes cada tipo admite. O painel da tela desenha só estes. */
export const AJUSTES_DO_TIPO: Readonly<
  Record<TipoDeVisualizacao, ReadonlyArray<keyof AjustesDeVisualizacao>>
> = {
  TABELA: [],
  BARRAS: ["orientacao", "ordenar", "limite", "rotulosDeDado"],
  COLUNAS: ["ordenar", "limite", "rotulosDeDado", "empilhamento"],
  LINHA: ["marcadores", "rotulosDeDado"],
  AREA: ["marcadores", "rotulosDeDado"],
  ROSCA: ["ordenar", "limite"],
  NUMERO: [],
};

export interface Visualizacao {
  tipo: TipoDeVisualizacao;
  ajustes: AjustesDeVisualizacao;
}

/** O padrão, e o que um relatório salvo antes desta onda recebe. */
export const VISUALIZACAO_PADRAO: Visualizacao = { tipo: "TABELA", ajustes: {} };

/**
 * A forma do resultado — o que a RN80 consulta para decidir.
 *
 * Deriva da tabela pivotada, e não da definição: é o resultado que manda.
 * Uma definição com duas dimensões cujo cruzamento devolveu uma coluna só
 * não é, na prática, um cruzamento.
 */
export interface FormaDoResultado {
  /** Dimensões nas linhas. */
  dimensoes: number;
  /** Medidas (medida × combinação de colunas). */
  medidas: number;
  /** Linhas de dado. */
  linhas: number;
  /** A primeira dimensão é de data? Governa linha e área. */
  primeiraDimensaoEhData: boolean;
  /** Há mais de um nível de atribuição entre as medidas? (RN43) */
  niveisDeAtribuicaoMisturados: boolean;
  /** O resultado bateu no teto e foi cortado (RN79). */
  truncado: boolean;
}

export function formaDoResultado(
  tabela: TabelaPivotada,
  opcoes: { truncado?: boolean; niveisDeAtribuicaoMisturados?: boolean } = {},
): FormaDoResultado {
  const primeira = tabela.dimensoes[0];
  return {
    dimensoes: tabela.dimensoes.length,
    medidas: tabela.medidas.length,
    linhas: tabela.linhas.length,
    primeiraDimensaoEhData: primeira?.tipo === "DATA",
    niveisDeAtribuicaoMisturados: opcoes.niveisDeAtribuicaoMisturados ?? false,
    truncado: opcoes.truncado ?? false,
  };
}

/** Um tipo, e por que ele não serve — quando não serve. */
export interface Disponibilidade {
  tipo: TipoDeVisualizacao;
  disponivel: boolean;
  /** Preenchido quando `disponivel` é falso. Texto para gente ler (RN55). */
  motivo?: string;
}

/**
 * RN80 + RN82 — quais tipos servem para esta forma, e por que os outros não.
 *
 * A ordem das recusas importa: as que valem para **todos** os tipos vêm
 * primeiro, senão a pessoa conserta a forma e descobre a segunda recusa
 * depois — dois passos onde cabia um.
 *
 * `TABELA` nunca é recusada. Ela é o estado de repouso do módulo e a
 * alternativa textual do desenho (RN81): não há forma de resultado em que
 * exibir a tabela seja errado.
 */
export function tiposDisponiveis(forma: FormaDoResultado): ReadonlyArray<Disponibilidade> {
  const recusaGeral = recusaQueValeParaTodos(forma);

  return TIPOS_DE_VISUALIZACAO.map((tipo) => {
    if (tipo === "TABELA") return { tipo, disponivel: true };
    if (recusaGeral) return { tipo, disponivel: false, motivo: recusaGeral };

    const motivo = recusaDoTipo(tipo, forma);
    return motivo ? { tipo, disponivel: false, motivo } : { tipo, disponivel: true };
  });
}

/**
 * As recusas que derrubam qualquer desenho, em ordem de gravidade.
 *
 * **Truncado primeiro**, porque é a que mais engana: o resultado existe, tem
 * linhas, desenha bonito — e a barra mais alta pode não estar ali. Um gráfico
 * sobre amostra cortada não é aproximado, é arbitrário: o corte segue a
 * ordenação da consulta, não a relevância.
 */
function recusaQueValeParaTodos(forma: FormaDoResultado): string | undefined {
  if (forma.truncado) {
    return (
      "o resultado bateu no teto e foi cortado, então o desenho mostraria uma " +
      "parte arbitrária — a maior barra pode nem estar nela. Estreite os filtros ou " +
      "exporte a lista completa; a tabela continua disponível."
    );
  }
  if (forma.niveisDeAtribuicaoMisturados) {
    return (
      "as medidas escolhidas têm níveis de atribuição diferentes (RN43) e não " +
      "dividem eixo: lado a lado na mesma escala, viram um número só. Na tabela elas " +
      "convivem porque o nível está colado em cada valor."
    );
  }
  if (forma.medidas === 0) {
    return "não há o que desenhar sem um número. Ponha uma medida em Valores.";
  }
  if (forma.linhas === 0) {
    return "não há linha nenhuma no resultado.";
  }
  return undefined;
}

/** A recusa própria de cada tipo, quando a forma não o comporta (RN80). */
function recusaDoTipo(
  tipo: Exclude<TipoDeVisualizacao, "TABELA">,
  forma: FormaDoResultado,
): string | undefined {
  switch (tipo) {
    case "NUMERO":
      /*
       * Número grande é para UM valor. Com dimensões, cada linha tem o seu, e
       * exibir o primeiro seria escolher um por ordem de consulta — que é
       * arbitrário e parece deliberado.
       */
      if (forma.dimensoes > 0 || forma.linhas !== 1 || forma.medidas !== 1) {
        return "o número grande mostra um valor só: tire as dimensões das gavetas e deixe uma medida.";
      }
      return undefined;

    case "ROSCA":
      if (forma.dimensoes !== 1) {
        return "a rosca reparte um total entre categorias, então precisa de exatamente uma dimensão.";
      }
      if (forma.medidas !== 1) {
        return "a rosca mostra uma medida só — o total que ela reparte.";
      }
      if (forma.linhas > MAXIMO_DE_FATIAS) {
        return (
          `são ${forma.linhas} categorias, e acima de ${MAXIMO_DE_FATIAS} fatias a rosca ` +
          "deixa de ser legível: as menores viram fios. Use barras com Top-N."
        );
      }
      return undefined;

    case "LINHA":
    case "AREA":
      /*
       * Linha liga pontos, e ligar pontos afirma CONTINUIDADE entre eles. Isso
       * é verdade no tempo e falso em categoria: unir "Paraná" a "Mato Grosso"
       * sugere uma progressão que não existe.
       */
      if (!forma.primeiraDimensaoEhData) {
        return (
          "linha e área ligam os pontos, e ligar pontos afirma que há continuidade " +
          "entre eles — o que só vale no tempo. Ponha um campo de data em Linhas, ou use barras."
        );
      }
      if (forma.linhas < 2) {
        return "uma linha precisa de ao menos dois pontos.";
      }
      return undefined;

    case "BARRAS":
    case "COLUNAS":
      if (forma.dimensoes === 0) {
        return "barras e colunas comparam categorias: ponha ao menos uma dimensão em Linhas.";
      }
      return undefined;
  }
}

/** Atalho: este tipo serve para esta forma? */
export function tipoDisponivel(tipo: TipoDeVisualizacao, forma: FormaDoResultado): boolean {
  return tiposDisponiveis(forma).find((item) => item.tipo === tipo)?.disponivel ?? false;
}

/**
 * O tipo que a tela deve exibir, dado o escolhido e a forma atual.
 *
 * **Cai para tabela em vez de mostrar erro, e isso é deliberado.** A pessoa
 * monta o relatório arrastando campos, e a forma muda a cada arrasto: um
 * gráfico de barras vira inválido no instante em que ela tira a última
 * dimensão. Travar a tela num erro nesse meio-caminho puniria o ato de
 * construir. A escolha dela **não se perde** — volta assim que a forma
 * comportar de novo —, e o motivo fica visível no seletor.
 */
export function tipoEfetivo(
  escolhido: TipoDeVisualizacao,
  forma: FormaDoResultado,
): TipoDeVisualizacao {
  return tipoDisponivel(escolhido, forma) ? escolhido : "TABELA";
}

/**
 * Valida o bloco de visualização vindo de fora — do formulário ou do JSONB de
 * um relatório salvo.
 *
 * Desconhecido vira o padrão em vez de recusar: um relatório salvo hoje pode
 * ser aberto depois de um tipo sair do catálogo, e naquele dia a pessoa
 * prefere ver a tabela a ver uma tela de erro. Mesma escolha que a T36 já faz
 * com `?modelo=` desconhecido.
 */
export function validarVisualizacao(entrada: unknown): Visualizacao {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    return VISUALIZACAO_PADRAO;
  }
  const bruto = entrada as Record<string, unknown>;
  const tipo = TIPOS_DE_VISUALIZACAO.includes(bruto.tipo as TipoDeVisualizacao)
    ? (bruto.tipo as TipoDeVisualizacao)
    : "TABELA";

  const ajustesBrutos =
    typeof bruto.ajustes === "object" && bruto.ajustes !== null && !Array.isArray(bruto.ajustes)
      ? (bruto.ajustes as Record<string, unknown>)
      : {};

  /*
   * Só as chaves que ESTE tipo admite atravessam. Sem o recorte, um relatório
   * salvo como barras e trocado para rosca carregaria `orientacao` para
   * sempre — invisível na tela, viva no JSONB, e pronta para confundir quem
   * for depurar o documento guardado.
   */
  const permitidas = new Set<string>(AJUSTES_DO_TIPO[tipo]);
  const ajustes: AjustesDeVisualizacao = {};
  if (permitidas.has("orientacao") && ajustesBrutos.orientacao === "VERTICAL") {
    ajustes.orientacao = "VERTICAL";
  }
  if (permitidas.has("ordenar")) {
    const valor = ajustesBrutos.ordenar;
    if (valor === "MENOR" || valor === "ROTULO") ajustes.ordenar = valor;
  }
  if (permitidas.has("limite")) {
    const valor = Number(ajustesBrutos.limite);
    if (Number.isFinite(valor) && valor >= 1 && valor <= 50) {
      ajustes.limite = Math.trunc(valor);
    }
  }
  if (permitidas.has("rotulosDeDado") && ajustesBrutos.rotulosDeDado === false) {
    ajustes.rotulosDeDado = false;
  }
  if (permitidas.has("empilhamento")) {
    const valor = ajustesBrutos.empilhamento;
    if (valor === "EMPILHADO" || valor === "CEM_POR_CENTO") ajustes.empilhamento = valor;
  }
  if (permitidas.has("marcadores") && ajustesBrutos.marcadores === false) {
    ajustes.marcadores = false;
  }
  return { tipo, ajustes };
}

/** Uma marca do desenho: categoria, valor e a série a que pertence. */
export interface MarcaDoDesenho {
  rotulo: string;
  /** `null` é LACUNA, nunca zero (RN82) — a tela desenha hachura. */
  valor: number | null;
  serie: string;
}

/**
 * Converte a tabela pivotada nas marcas do desenho, já ordenadas e cortadas.
 *
 * **O `null` atravessa inteiro até aqui**, e é o ponto do módulo: em nenhum
 * lugar deste caminho um cruzamento sem registro vira zero. A tela desenha
 * lacuna; a soma do empilhado ignora; o eixo não conta.
 */
export function marcasDoDesenho(
  tabela: TabelaPivotada,
  visual: Visualizacao,
  rotularCategoria: (linha: TabelaPivotada["linhas"][number]) => string,
): ReadonlyArray<MarcaDoDesenho> {
  const marcas: MarcaDoDesenho[] = [];
  for (const linha of tabela.linhas) {
    const categoria = rotularCategoria(linha);
    for (const medida of tabela.medidas) {
      const bruto = linha.celulas[medida.chave];
      const valor = typeof bruto === "number" ? bruto : null;
      marcas.push({ rotulo: categoria, valor, serie: medida.rotulo });
    }
  }

  const ordenar = visual.ajustes.ordenar ?? "MAIOR";
  if (ordenar !== "ROTULO" && tabela.medidas.length === 1) {
    /*
     * Ordena só com UMA medida. Com várias, ordenar por uma delas reordenaria
     * as outras junto, e a segunda série passaria a parecer bagunçada sem que
     * nada tivesse acontecido com ela.
     */
    marcas.sort((a, b) => {
      // Lacuna vai para o fim em qualquer ordenação: ela não é "o menor".
      if (a.valor === null) return 1;
      if (b.valor === null) return -1;
      return ordenar === "MENOR" ? a.valor - b.valor : b.valor - a.valor;
    });
  }

  const limite = visual.ajustes.limite;
  if (limite === undefined) return marcas;
  const categorias = [...new Set(marcas.map((marca) => marca.rotulo))].slice(0, limite);
  const mantidas = new Set(categorias);
  return marcas.filter((marca) => mantidas.has(marca.rotulo));
}
