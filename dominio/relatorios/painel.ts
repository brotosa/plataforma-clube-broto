import { assuntoPorSlug } from "./catalogo";
import {
  ErroDeRelatorioInvalido,
  compilarRelatorio,
  validarEstruturaDefinicao,
} from "./compilador";
import { type Visualizacao, validarVisualizacao } from "./visualizacao";
import type { DefinicaoRelatorio } from "./compilador";

/**
 * RN86–RN88 — o painel, como domínio puro.
 *
 * ## O que ele é
 *
 * Uma **lista ordenada de definições de relatório**, e mais nada. O painel
 * não consulta, não soma bloco com bloco, não deriva número de dois blocos
 * juntos e não inventa indicador: cada bloco é uma execução do mesmo caso de
 * uso que a T36 já usa.
 *
 * ## O que ele NÃO é, e é a distinção que mais importa
 *
 * **Não é o Dashboard (T26).** A T26 é institucional e cada indicador dela
 * vem de ficha validada (RN50); o painel é de quem o montou e só recompõe o
 * que a pessoa já podia executar. Ele não é uma porta para contornar a RN50 —
 * não há como pôr num bloco um número que não seja resultado de um relatório
 * do catálogo, e é assim de propósito.
 */

/**
 * Teto de blocos — decisão da TI de 18/09 (ficha da Onda 18 §6.1).
 *
 * Cada bloco é uma consulta. Doze é onde o painel deixa de abrir rápido; a
 * recusa nomeia o número (RN55) em vez de cortar em silêncio, porque cortar
 * silenciosamente faria o painel salvar menos do que a pessoa montou.
 *
 * Constante nomeada, e não coluna: apertar ou afrouxar depois não é migration.
 */
export const MAXIMO_DE_BLOCOS = 12;

export const LARGURAS_DE_BLOCO = ["INTEIRA", "METADE"] as const;
export type LarguraDeBloco = (typeof LARGURAS_DE_BLOCO)[number];

export interface BlocoDoPainel {
  titulo: string;
  definicao: DefinicaoRelatorio;
  visualizacao: Visualizacao;
  largura: LarguraDeBloco;
}

const TITULO_MAXIMO = 120;

/**
 * Valida a lista de blocos vinda do JSONB.
 *
 * **Entrada não confiável, sempre.** O que está guardado foi montado por
 * gente, num dia em que o catálogo era outro: um painel salvo há um mês pode
 * conter bloco de assunto que saiu, ou de campo que deixou de existir. Por
 * isso cada definição passa por `validarEstruturaDefinicao`, que é a mesma
 * porta do relatório salvo — e não uma segunda, mais frouxa.
 *
 * **Bloco inválido não derruba o painel** (mesma disciplina da RN87): ele é
 * devolvido como recusa, com a causa, e os demais seguem. Um painel que
 * falhasse inteiro por causa de um bloco tiraria de quem abre os onze que
 * continuam bons.
 */
export type BlocoValidado =
  | { ok: true; bloco: BlocoDoPainel }
  | { ok: false; titulo: string; motivo: string };

export function validarBlocos(entrada: unknown): ReadonlyArray<BlocoValidado> {
  if (!Array.isArray(entrada)) return [];
  return entrada.slice(0, MAXIMO_DE_BLOCOS).map((bruto) => validarBloco(bruto));
}

function validarBloco(bruto: unknown): BlocoValidado {
  const objeto = (bruto ?? {}) as Record<string, unknown>;
  const titulo = typeof objeto.titulo === "string" ? objeto.titulo.slice(0, TITULO_MAXIMO) : "";

  try {
    const definicao = validarEstruturaDefinicao(objeto.definicao);

    /*
     * O catálogo, e não só a estrutura.
     *
     * `validarEstruturaDefinicao` confere FORMA — que há assunto, que os
     * valores têm agregação. Ela não sabe se o assunto existe, de propósito:
     * quem cobra isso é o compilador, na execução, e o caso de uso, na
     * permissão.
     *
     * Aqui a conferência precisa vir antes. Um bloco de assunto que saiu do
     * catálogo falharia só ao executar, e a mensagem que a pessoa veria seria
     * a de uma consulta que não compila — em vez de "este assunto não existe
     * mais", que é o que ela precisa ler para saber que deve refazer o bloco.
     */
    if (!assuntoPorSlug(definicao.assunto)) {
      throw new ErroDeRelatorioInvalido([
        `O assunto "${definicao.assunto}" não existe mais no catálogo de relatórios.`,
      ]);
    }

    return {
      ok: true,
      bloco: {
        titulo: titulo || "Bloco sem título",
        definicao,
        visualizacao: validarVisualizacao(objeto.visualizacao),
        largura: ehLargura(objeto.largura) ? objeto.largura : "METADE",
      },
    };
  } catch (erro) {
    return {
      ok: false,
      titulo: titulo || "Bloco sem título",
      // Só a mensagem da classe conhecida do domínio chega à interface (RN55).
      motivo:
        erro instanceof ErroDeRelatorioInvalido
          ? erro.message
          : "Este bloco não pôde ser lido. Refaça-o a partir de um relatório.",
    };
  }
}

function ehLargura(valor: unknown): valor is LarguraDeBloco {
  return typeof valor === "string" && (LARGURAS_DE_BLOCO as ReadonlyArray<string>).includes(valor);
}

/**
 * O que a montagem cobra antes de gravar.
 *
 * Diferente de `validarBlocos`, que é leitura tolerante do que já está no
 * banco: aqui a pessoa está montando, e recusar com o motivo é melhor do que
 * guardar algo que vai recusar depois, na abertura.
 */
export function validarPainelParaGravar(dados: {
  nome: string;
  blocos: unknown;
}): { nome: string; blocos: ReadonlyArray<BlocoDoPainel> } {
  const erros: string[] = [];

  const nome = dados.nome?.trim() ?? "";
  if (nome.length < 3) erros.push("Dê ao painel um nome de ao menos 3 caracteres.");
  if (nome.length > TITULO_MAXIMO) {
    erros.push(`O nome do painel passa de ${TITULO_MAXIMO} caracteres.`);
  }

  if (!Array.isArray(dados.blocos)) {
    erros.push("O painel precisa de ao menos um bloco.");
    throw new ErroDeRelatorioInvalido(erros);
  }
  if (dados.blocos.length === 0) {
    erros.push("O painel precisa de ao menos um bloco.");
  }
  if (dados.blocos.length > MAXIMO_DE_BLOCOS) {
    // Nomeia o número em vez de cortar em silêncio: cortar faria o painel
    // salvar menos do que a pessoa montou, e ela só descobriria ao reabrir.
    erros.push(
      `O painel comporta até ${MAXIMO_DE_BLOCOS} blocos, e este tem ${dados.blocos.length}. Tire alguns ou monte um segundo painel.`,
    );
  }

  const validados = dados.blocos.map((bruto) => validarBloco(bruto));
  validados.forEach((item, indice) => {
    if (item.ok === false) {
      erros.push(`Bloco ${indice + 1} ("${item.titulo}"): ${item.motivo}`);
      return;
    }
    /*
     * Compila antes de guardar, pelo mesmo motivo que `salvarRelatorio`
     * executa antes de guardar: bloco que não roda é pior que bloco não
     * salvo, porque aparece no painel e só falha quando alguém abre.
     *
     * Compilar é puro — monta o texto do SQL e não toca o banco —, então
     * cabe aqui no domínio. Executar, não: isso é do caso de uso, onde a
     * permissão de quem grava é conferida.
     */
    try {
      compilarRelatorio(item.bloco.definicao, { teto: 1 });
    } catch (erro) {
      erros.push(
        `Bloco ${indice + 1} ("${item.bloco.titulo}"): ${
          erro instanceof ErroDeRelatorioInvalido
            ? erro.message
            : "não foi possível montar a consulta deste bloco."
        }`,
      );
    }
  });

  if (erros.length > 0) throw new ErroDeRelatorioInvalido(erros);

  return {
    nome,
    blocos: validados.flatMap((item) => (item.ok ? [item.bloco] : [])),
  };
}
