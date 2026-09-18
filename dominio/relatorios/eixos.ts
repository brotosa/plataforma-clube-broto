import type { AssuntoRelatorio } from "./catalogo";
import type { DefinicaoRelatorio, FiltroDeRelatorio } from "./compilador";

/**
 * RN89 — o filtro do painel age por **eixo declarado**, não por nome de campo.
 *
 * ## Por que não por nome de campo
 *
 * Porque não haveria em que pegar. Medido no catálogo dos nove assuntos:
 * `aliado-uf` aparece em dois, `solucao-nome` em dois, e é só. Um filtro
 * global por slug se aplicaria a quase nada — e, pior, **se aplicaria em
 * silêncio a uns blocos e não a outros**.
 *
 * O silêncio é o defeito que esta regra existe para impedir, e ele é grave:
 * dois blocos lado a lado, um filtrado e outro não, **parecem** responder à
 * mesma pergunta. Quem olha compara os dois números e tira uma conclusão que
 * nenhum deles sustenta.
 *
 * ## Como funciona
 *
 * Um conjunto fechado de eixos. Cada assunto declara, no catálogo, **qual
 * campo seu responde a cada eixo** — e assunto que não declara **não é
 * filtrado, e o bloco diz isso**.
 *
 * É a mesma disciplina da RN51 (cobertura com fonte única) e da RN63 (de-para
 * de perfil declarado): o que liga duas coisas é uma declaração, nunca uma
 * coincidência de nome.
 */

export const EIXOS_DO_PAINEL = ["PERIODO", "UF"] as const;
export type EixoDoPainel = (typeof EIXOS_DO_PAINEL)[number];

export const ROTULOS_DE_EIXO: Readonly<Record<EixoDoPainel, string>> = {
  PERIODO: "Período",
  UF: "UF",
};

/**
 * O que cada assunto declara.
 *
 * Ausente = o eixo não se aplica àquele assunto, e o bloco avisa. Declarar o
 * que não responde à pergunta do eixo seria pior que não declarar: o filtro
 * agiria, o número mudaria, e ninguém saberia que mudou por outro critério.
 */
export type EixosDoAssunto = Partial<Readonly<Record<EixoDoPainel, string>>>;

export interface FiltroDoPainel {
  periodo?: { de?: string; ate?: string };
  uf?: ReadonlyArray<string>;
}

export interface DefinicaoComEixos {
  definicao: DefinicaoRelatorio;
  /** Os eixos que o filtro trazia e que este assunto **não** comporta. */
  naoAplicados: ReadonlyArray<EixoDoPainel>;
}

/**
 * Aplica o filtro do painel à definição de um bloco.
 *
 * **Acrescenta filtros à definição; não monta consulta nenhuma.** O que sai
 * daqui volta a passar pelo compilador e pelo caso de uso, com a permissão de
 * quem abre — a RN86 continua valendo inteira.
 *
 * **O que acontece com registro sem a data declarada é o de sempre.** Um
 * filtro de período exclui linha cujo campo é nulo, porque é assim que o
 * operador funciona — e é exatamente o que a T36 já faz quando alguém filtra
 * por data à mão. O painel não inventa semântica nova: ele alcança o mesmo
 * filtro por um nome declarado.
 */
export function aplicarFiltroDoPainel(
  definicao: DefinicaoRelatorio,
  assunto: AssuntoRelatorio,
  filtro: FiltroDoPainel | null | undefined,
): DefinicaoComEixos {
  if (!filtro) return { definicao, naoAplicados: [] };

  const eixos = assunto.eixos ?? {};
  const acrescentados: FiltroDeRelatorio[] = [];
  const naoAplicados: EixoDoPainel[] = [];

  const temPeriodo = Boolean(filtro.periodo?.de || filtro.periodo?.ate);
  if (temPeriodo) {
    const campo = eixos.PERIODO;
    if (!campo) {
      naoAplicados.push("PERIODO");
    } else {
      if (filtro.periodo?.de) {
        acrescentados.push({ campo, operador: "maior_ou_igual", valores: [filtro.periodo.de] });
      }
      if (filtro.periodo?.ate) {
        acrescentados.push({ campo, operador: "menor_ou_igual", valores: [filtro.periodo.ate] });
      }
    }
  }

  const ufs = (filtro.uf ?? []).filter((valor) => valor.trim() !== "");
  if (ufs.length > 0) {
    const campo = eixos.UF;
    if (!campo) {
      naoAplicados.push("UF");
    } else {
      /*
       * `igual` com vários valores, e não um filtro por UF: o compilador já
       * trata lista como "qualquer um destes", e escrever N filtros
       * separados produziria um E entre eles — que não devolveria nada,
       * porque uma linha não é de duas UFs ao mesmo tempo.
       */
      acrescentados.push({ campo, operador: "igual", valores: [...ufs] });
    }
  }

  if (acrescentados.length === 0) {
    return { definicao, naoAplicados };
  }

  return {
    /*
     * Os filtros do painel entram DEPOIS dos do bloco, e por conjunção.
     * O painel estreita o que o bloco já perguntou; ele nunca alarga, e
     * nunca substitui — um filtro de painel que apagasse o do bloco faria
     * o bloco responder outra pergunta, com o mesmo título.
     */
    definicao: { ...definicao, filtros: [...definicao.filtros, ...acrescentados] },
    naoAplicados,
  };
}

/**
 * O texto do aviso, para o bloco que não pôde ser filtrado.
 *
 * Nomeia **qual** eixo não se aplicou, e não "o filtro não se aplica": num
 * painel filtrado por período e UF, saber que a UF pegou e o período não é a
 * diferença entre confiar e não confiar no número.
 */
export function avisoDeEixoNaoAplicado(
  naoAplicados: ReadonlyArray<EixoDoPainel>,
): string | null {
  if (naoAplicados.length === 0) return null;
  const nomes = naoAplicados.map((eixo) => ROTULOS_DE_EIXO[eixo]);
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
  const plural = nomes.length > 1;
  return `${lista} ${plural ? "não se aplicam" : "não se aplica"} a este bloco — os números abaixo são do conjunto inteiro.`;
}

/**
 * Valida o filtro vindo do JSONB.
 *
 * Entrada não confiável, como toda a definição: um painel salvo pode ter
 * sido gravado por uma versão anterior, ou editado à mão.
 */
export function validarFiltroDoPainel(entrada: unknown): FiltroDoPainel | null {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) return null;
  const bruto = entrada as Record<string, unknown>;
  const filtro: FiltroDoPainel = {};

  const periodo = bruto.periodo as Record<string, unknown> | undefined;
  if (periodo && typeof periodo === "object") {
    const de = ehDataSolta(periodo.de) ? periodo.de : undefined;
    const ate = ehDataSolta(periodo.ate) ? periodo.ate : undefined;
    if (de || ate) filtro.periodo = { ...(de ? { de } : {}), ...(ate ? { ate } : {}) };
  }

  if (Array.isArray(bruto.uf)) {
    // Duas letras maiúsculas, e nada mais: o valor vai para um parâmetro, mas
    // recortar aqui evita guardar lixo que ninguém consegue explicar depois.
    const ufs = bruto.uf.filter(
      (valor): valor is string => typeof valor === "string" && /^[A-Z]{2}$/.test(valor),
    );
    if (ufs.length > 0) filtro.uf = ufs;
  }

  return filtro.periodo || filtro.uf ? filtro : null;
}

function ehDataSolta(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}
