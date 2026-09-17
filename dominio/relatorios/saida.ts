import {
  ROTULOS_OPERADOR,
  assuntoPorSlug,
  campoPorSlug,
  type CampoRelatorio,
} from "./catalogo";
import type { DefinicaoRelatorio } from "./compilador";
import { TETO_LINHAS_MAXIMO, TETO_LINHAS_PADRAO } from "./compilador";
import { rotularDimensao, type Celula, type TabelaPivotada } from "./pivo";

/**
 * RN83–RN85 — o que a plataforma produz quando o resultado sai dela.
 *
 * ## O que este módulo é, e o que ele deliberadamente não é
 *
 * Ele decide **o que** cada formato carrega: o teto de linhas, a procedência
 * que acompanha o arquivo, o texto do aviso de corte e a serialização que não
 * precisa de biblioteca (TSV).
 *
 * Ele **não** consulta nada. Não importa o Prisma, não importa a camada de
 * consultas, e não monta SQL — recebe uma tabela pronta e devolve texto. É a
 * metade em domínio da RN83, e a cerca de
 * `infra/arquitetura/saida-por-renderizacao.test.ts` prende a outra metade.
 *
 * O defeito que a separação existe para impedir tem nome: uma rota de XLSX
 * que monte a própria consulta "porque a planilha precisa de todas as
 * linhas". No dia em que isso acontecer, o alcance por papel (RN76) deixa de
 * valer para quem souber pedir em `.xlsx`.
 */

export const FORMATOS_DE_SAIDA = ["CSV", "HTML", "XLSX", "AREA_TRANSFERENCIA"] as const;
export type FormatoDeSaida = (typeof FORMATOS_DE_SAIDA)[number];

export const ROTULOS_DE_FORMATO: Readonly<Record<FormatoDeSaida, string>> = {
  CSV: "CSV",
  HTML: "Abrir para impressão",
  XLSX: "Planilha (XLSX)",
  AREA_TRANSFERENCIA: "Copiar",
};

/**
 * Teto de linhas por formato — decisão da TI de 17/09 (ficha da Onda 20 §7.1).
 *
 * O HTML é o único que precisa de número próprio, e a razão é física: é o
 * único formato que um **navegador** tem de paginar para imprimir. Cinquenta
 * mil linhas viram um documento que trava a janela antes de sair a primeira
 * página, e o estrago é pior que a recusa — a pessoa perde o trabalho e não
 * entende por quê.
 *
 * XLSX e CSV são consumidos por programa, e programa não engasga com 50 mil
 * linhas. Ficam no teto cheio da RN79.
 *
 * A área de transferência segue o teto do HTML pelo mesmo motivo invertido:
 * o destino é uma colagem que alguém vai olhar, e a própria API de área de
 * transferência fica lenta com megabytes de texto.
 */
export const TETO_POR_FORMATO: Readonly<Record<FormatoDeSaida, number>> = {
  CSV: TETO_LINHAS_MAXIMO,
  XLSX: TETO_LINHAS_MAXIMO,
  HTML: TETO_LINHAS_PADRAO,
  AREA_TRANSFERENCIA: TETO_LINHAS_PADRAO,
};

/** Formatos que um ser humano abre e lê — recebem o aviso de corte por dentro. */
const PARA_GENTE: ReadonlySet<FormatoDeSaida> = new Set<FormatoDeSaida>([
  "HTML",
  "XLSX",
  "AREA_TRANSFERENCIA",
]);

/**
 * RN85 — quem leva o aviso de corte **dentro** do arquivo.
 *
 * O CSV não leva, e isso é escolha: acrescentar uma linha de aviso a um CSV
 * quebra quem o consome por máquina, que é justamente para quem o CSV existe.
 * Ele mantém o aviso no cabeçalho HTTP, como sempre teve.
 */
export function levaAvisoPorDentro(formato: FormatoDeSaida): boolean {
  return PARA_GENTE.has(formato);
}

export interface Procedencia {
  /** O que foi perguntado, em texto corrido. */
  assunto: string;
  /** Uma linha por filtro, já rotulada — nunca o slug do campo. */
  filtros: ReadonlyArray<string>;
  autor: string;
  geradoEm: Date;
  /** Só quando o assunto a exigiu (RN78). */
  finalidade?: string;
  linhas: number;
  truncado: boolean;
  teto: number;
}

/**
 * RN85 — o texto do corte, e por que ele existe em vez de um número solto.
 *
 * Arquivo truncado em silêncio é indistinguível de arquivo completo. E, ao
 * contrário da tela, ele é aberto uma semana depois, por outra pessoa, sem o
 * contexto de quem o gerou — não há a quem perguntar "veio tudo?".
 */
export function avisoDeCorte(procedencia: Procedencia): string | null {
  if (!procedencia.truncado) return null;
  return (
    `Resultado cortado: este arquivo traz as primeiras ${procedencia.linhas.toLocaleString("pt-BR")} ` +
    `linhas, e há mais registros atendendo aos filtros. O limite deste formato é de ` +
    `${procedencia.teto.toLocaleString("pt-BR")}. Estreite os filtros para levar o conjunto inteiro.`
  );
}

/**
 * Os filtros aplicados, em texto que se lê — "Situação é Publicada", não
 * `oferta-status igual PUBLICADA`.
 *
 * Relatório sem a pergunta que o originou é um monte de número solto, e o
 * arquivo circula muito além de quem o pediu. O de-para de rótulo é o mesmo
 * que o CSV já usa nas células, pela mesma razão registrada lá: um valor de
 * enum cru sai da plataforma e continua errado depois, onde ninguém mais
 * pode consertá-lo.
 */
export function descreverFiltros(definicao: DefinicaoRelatorio): ReadonlyArray<string> {
  const assunto = assuntoPorSlug(definicao.assunto);
  if (!assunto) return [];

  return definicao.filtros.map((filtro) => {
    const campo = campoPorSlug(assunto, filtro.campo);
    const rotuloCampo = campo?.rotulo ?? filtro.campo;
    const operador = ROTULOS_OPERADOR[filtro.operador] ?? filtro.operador;
    if (filtro.valores.length === 0) return `${rotuloCampo} ${operador}`;
    const valores = filtro.valores.map((valor) => rotularValor(valor, campo)).join(" e ");
    return `${rotuloCampo} ${operador} ${valores}`;
  });
}

/**
 * O de-para do catálogo, lido da lista de valores do próprio campo.
 *
 * Sem ele a procedência sairia com `PUBLICADA` e `CUPOM_DESCONTO` — que é o
 * que o banco guarda e não o que o catálogo já sabe chamar de "Publicada" e
 * "Cupom de desconto". É o mesmo defeito que o pivô levou um print de tela
 * real para descobrir, e não há razão para redescobri-lo aqui.
 */
function rotularValor(valor: string, campo?: CampoRelatorio): string {
  return campo?.valores?.find((item) => item.valor === valor)?.rotulo ?? valor;
}

/**
 * O resultado como TSV, para colar em planilha.
 *
 * Tabulação em vez de ponto e vírgula porque é o que Excel e Sheets colam
 * **em colunas** sem pedir nada a ninguém; o CSV com ponto e vírgula, colado
 * direto, cai tudo numa coluna só.
 *
 * Sem aspas e sem BOM, de propósito. O destino não é um arquivo: é uma
 * colagem, e aspas escapadas apareceriam literalmente na célula. Em troca,
 * tabulação e quebra de linha **dentro** de um valor são trocadas por espaço
 * — perder um espaçamento é melhor que desalinhar a tabela inteira a partir
 * daquela célula, que é o que aconteceria se elas passassem.
 */
export function tabelaParaTsv(tabela: TabelaPivotada): string {
  const limpar = (valor: Celula): string => {
    if (valor === null) return "";
    return String(valor).replace(/[\t\r\n]+/g, " ");
  };

  const cabecalho = [
    ...tabela.dimensoes.map((dimensao) => dimensao.rotulo),
    ...tabela.medidas.map((medida) => medida.rotulo),
  ]
    .map(limpar)
    .join("\t");

  const corpo = tabela.linhas.map((linha) =>
    [
      ...linha.chaves.map((chave, indice) =>
        rotularDimensao(chave, tabela.dimensoes[indice]?.rotulosDeValor),
      ),
      ...tabela.medidas.map((medida) => linha.celulas[medida.chave] ?? null),
    ]
      .map(limpar)
      .join("\t"),
  );

  return [cabecalho, ...corpo].join("\n");
}

/** Nome do arquivo — pendência 5.5 da ficha: permanece o conservador. */
export function nomeDoArquivo(definicao: DefinicaoRelatorio, extensao: string): string {
  const assunto = assuntoPorSlug(definicao.assunto);
  const carimbo = new Date().toISOString().slice(0, 10);
  const base = (assunto?.rotulo ?? definicao.assunto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `relatorio-${base}-${carimbo}.${extensao}`;
}
