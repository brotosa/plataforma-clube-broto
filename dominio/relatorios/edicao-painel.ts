import { MAXIMO_DE_BLOCOS, type BlocoDoPainel, type LarguraDeBloco } from "./painel";

/**
 * RN94 — os atos de edição do painel, como domínio puro.
 *
 * ## Por que isto não mora no componente
 *
 * Mover, remover e trocar largura parecem manipulação de array, e são — mas
 * **o teto de 12 e o que cada recusa diz** são regra, e regra escrita duas
 * vezes diverge na primeira correção. A tela desenha o que estas funções
 * respondem; quem decide são elas.
 *
 * É a mesma razão pela qual `filtroDoClique` (RN91) vive no domínio e não no
 * gráfico: a decisão precisa ser a mesma no cliente e no servidor.
 *
 * ## Ordenar é por BOTÃO, não por arrasto (ficha §8.3)
 *
 * A lição da RN57 aplicada na ordem certa. Lá o arrasto foi acrescentado a um
 * menu que já existia, e o que sobrou foi *nenhuma função existe apenas no
 * arrasto*. Aqui o caminho por teclado **nasce primeiro** — e é por isso que
 * `rotuloDoMovimento` existe: uma seta sem nome é um botão que quem navega por
 * teclado não consegue distinguir de onze outros iguais.
 */

export const MOVIMENTOS = ["SUBIR", "DESCER"] as const;
export type Movimento = (typeof MOVIMENTOS)[number];

export type ResultadoDaEdicao =
  | { readonly pode: true; readonly blocos: ReadonlyArray<BlocoDoPainel> }
  | { readonly pode: false; readonly motivo: string };

/** Índice que não aponta para bloco nenhum — recusa, nunca no-op silencioso. */
function foraDeFaixa(blocos: ReadonlyArray<unknown>, indice: number): boolean {
  return !Number.isInteger(indice) || indice < 0 || indice >= blocos.length;
}

const FORA = "Este bloco não está mais no painel. Recarregue a tela.";

/**
 * Sobe ou desce um bloco uma posição.
 *
 * **Recusa nas pontas em vez de dar a volta.** Um "subir" que levasse o
 * primeiro bloco para o fim seria a mudança mais destrutiva possível num
 * clique repetido — e a tela não oferece o botão ali, então chegar aqui já
 * significa estado desencontrado.
 */
export function moverBloco(
  blocos: ReadonlyArray<BlocoDoPainel>,
  indice: number,
  movimento: Movimento,
): ResultadoDaEdicao {
  if (foraDeFaixa(blocos, indice)) return { pode: false, motivo: FORA };

  const destino = movimento === "SUBIR" ? indice - 1 : indice + 1;
  if (destino < 0 || destino >= blocos.length) {
    return {
      pode: false,
      motivo:
        movimento === "SUBIR"
          ? "Este bloco já é o primeiro."
          : "Este bloco já é o último.",
    };
  }

  const novos = [...blocos];
  const aqui = novos[indice]!;
  novos[indice] = novos[destino]!;
  novos[destino] = aqui;
  return { pode: true, blocos: novos };
}

export function removerBloco(
  blocos: ReadonlyArray<BlocoDoPainel>,
  indice: number,
): ResultadoDaEdicao {
  if (foraDeFaixa(blocos, indice)) return { pode: false, motivo: FORA };
  // Sem piso: o painel pode ficar vazio (ficha §8.2). Recusar a remoção do
  // último prenderia quem quer trocar todos os blocos.
  return { pode: true, blocos: blocos.filter((_, posicao) => posicao !== indice) };
}

export function alternarLargura(
  blocos: ReadonlyArray<BlocoDoPainel>,
  indice: number,
): ResultadoDaEdicao {
  if (foraDeFaixa(blocos, indice)) return { pode: false, motivo: FORA };
  const atual = blocos[indice]!;
  const largura: LarguraDeBloco = atual.largura === "METADE" ? "INTEIRA" : "METADE";
  return {
    pode: true,
    blocos: blocos.map((bloco, posicao) => (posicao === indice ? { ...bloco, largura } : bloco)),
  };
}

/**
 * Acrescenta um bloco ao fim — o caminho do "Pôr no painel" com destino.
 *
 * **O teto vale aqui, e não só na criação.** Um teto que só valesse ao criar
 * não é um teto: bastaria criar com um bloco e acrescentar vinte.
 */
export function acrescentarBloco(
  blocos: ReadonlyArray<BlocoDoPainel>,
  novo: BlocoDoPainel,
): ResultadoDaEdicao {
  if (blocos.length >= MAXIMO_DE_BLOCOS) {
    return {
      pode: false,
      motivo: `O painel comporta até ${MAXIMO_DE_BLOCOS} blocos, e este já tem ${blocos.length}. Tire algum ou monte um segundo painel.`,
    };
  }
  return { pode: true, blocos: [...blocos, novo] };
}

/**
 * O nome acessível do botão de mover — ele diz o destino, não uma seta.
 *
 * `null` quando o movimento não existe naquela posição, e a tela então **não
 * monta o botão**: oferecer e recusar é pior que não oferecer, porque quem
 * navega por teclado percorre um controle que nunca faz nada.
 */
export function rotuloDoMovimento(
  blocos: ReadonlyArray<{ titulo: string }>,
  indice: number,
  movimento: Movimento,
): string | null {
  if (foraDeFaixa(blocos, indice)) return null;
  const destino = movimento === "SUBIR" ? indice - 1 : indice + 1;
  if (destino < 0 || destino >= blocos.length) return null;
  const verbo = movimento === "SUBIR" ? "Subir" : "Descer";
  return `${verbo} ${blocos[indice]!.titulo} para a posição ${destino + 1} de ${blocos.length}`;
}
