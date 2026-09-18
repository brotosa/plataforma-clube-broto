import type { CampoRelatorio, OperadorRelatorio } from "./catalogo";
import type { Celula } from "./pivo";

/**
 * RN91 — clicar num ponto do resultado filtra o resto.
 *
 * ## O que este módulo garante, e por que ele existe separado da tela
 *
 * O clique é **um atalho para o filtro que a pessoa poderia ter montado à
 * mão**, e não uma segunda porta para a consulta. Quem decide se ele vira
 * filtro é esta função, no domínio, lendo o catálogo — a tela só desenha o
 * que ela responde. Se a decisão morasse no componente, a RN75 passaria a
 * depender de o cliente se comportar, e o cliente é entrada não confiável.
 *
 * ## O valor que viaja é o BRUTO, nunca o rótulo
 *
 * O que está na tela passou por `rotularDimensao`: "Benefício (Checkout
 * Broto)" na tela é `BENEFICIO` na coluna, e meia dúzia de outros mapas fazem
 * o mesmo. Filtrar pelo texto exibido **não acharia nada, e acharia zero em
 * silêncio** — o relatório voltaria vazio com toda a cara de resposta.
 *
 * ## Três recusas, e cada uma responde a uma pergunta diferente
 *
 * Recusar é um resultado de primeira classe aqui, com motivo escrito para
 * gente ler (RN55). As duas primeiras estavam na ficha; a terceira apareceu
 * na implementação e é mais restritiva do que ela previa.
 *
 * 1. **Campo fora do catálogo ou indisponível** (RN75, RN77).
 * 2. **Lacuna em campo que não declara o operador de vazio.** A RN53 obriga a
 *    lacuna a aparecer como traço, e ela aparece — mas 34 das 71 dimensões
 *    usáveis não declaram `vazio`. Filtrar por texto vazio no lugar seria
 *    **outra pergunta devolvendo outro número com a mesma cara**.
 * 3. **Dimensão de data.** O compilador trata `igual` sobre data como
 *    *"naquele dia"*, deliberadamente — num `timestamp`, `= '18/09'` só
 *    casaria com a meia-noite exata. Só que a célula do pivô pode ser um
 *    **instante**, e aí o clique alargaria a seleção de um instante para um
 *    dia **sem dizer**: o número voltaria diferente do que estava na célula
 *    clicada, que é precisamente o defeito que esta regra existe para
 *    impedir. O catálogo não distingue coluna de data de coluna de instante,
 *    então a recusa vale para as duas — conservadora de propósito, e alargar
 *    depois é aditivo.
 */

/**
 * O mínimo que a decisão precisa saber sobre um campo.
 *
 * **Deliberadamente menor que `CampoRelatorio`**, e a razão é dura: o
 * catálogo carrega a expressão SQL de cada campo e por isso é código de
 * servidor — ele não atravessa para o cliente, e não pode. A tela recebe
 * `CampoSerializado`, que tem estes cinco atributos e nenhum SQL. Tipando
 * pela forma mínima, a mesma função serve os dois lados **sem** que a
 * segunda cópia da regra nasça no componente.
 */
export type CampoParaClique = Pick<
  CampoRelatorio,
  "slug" | "rotulo" | "tipo" | "operadores" | "indisponivel"
>;

/** Um filtro no formato que a definição do relatório já usa. */
export interface FiltroDeClique {
  campo: string;
  operador: OperadorRelatorio;
  valores: ReadonlyArray<string>;
}

export type ResultadoDoClique =
  | { readonly pode: true; readonly filtro: FiltroDeClique }
  | { readonly pode: false; readonly motivo: string };

/** A célula está vazia para efeito de filtro? */
function eLacuna(valor: Celula): boolean {
  return valor === null || valor === "";
}

/**
 * O filtro que este clique produz — ou o motivo de ele não produzir nenhum.
 *
 * `campoSlug` e `valor` vêm do resultado já projetado: o slug de
 * `ColunaProjetada.campo` e o valor **bruto** de `linha.chaves[i]`. Nada aqui
 * vem do texto da tela.
 *
 * `campos` é a lista do assunto — a do catálogo no servidor, a serializada no
 * cliente. São a mesma lista; o que muda é só o que atravessa.
 */
export function filtroDoClique(
  campos: ReadonlyArray<CampoParaClique>,
  campoSlug: string,
  valor: Celula,
): ResultadoDoClique {
  const campo = campos.find((candidato) => candidato.slug === campoSlug);

  // Chave fora do catálogo é RECUSADA, não ignorada (RN75). Ignorar devolveria
  // o relatório sem o filtro, e o número sairia diferente sem ninguém saber.
  if (!campo) {
    return { pode: false, motivo: "Este campo não existe no assunto do relatório." };
  }
  if (campo.indisponivel) {
    return { pode: false, motivo: campo.indisponivel };
  }

  if (campo.tipo === "DATA") {
    return {
      pode: false,
      motivo: `O filtro por data recorta o dia inteiro, e esta célula pode ser um instante dentro dele — o resultado viria diferente do número que você clicou. Use o filtro de período de ${campo.rotulo} no construtor.`,
    };
  }

  if (eLacuna(valor)) {
    if (!campo.operadores.includes("vazio")) {
      return {
        pode: false,
        motivo: `${campo.rotulo} não permite filtrar por ausência de valor, então esta lacuna não abre.`,
      };
    }
    return { pode: true, filtro: { campo: campo.slug, operador: "vazio", valores: [] } };
  }

  if (!campo.operadores.includes("igual")) {
    return {
      pode: false,
      motivo: `${campo.rotulo} não permite filtrar por um valor exato.`,
    };
  }

  return { pode: true, filtro: { campo: campo.slug, operador: "igual", valores: [String(valor)] } };
}

/**
 * Este filtro já está na definição?
 *
 * Clicar duas vezes no mesmo ponto não deve empilhar o mesmo recorte: o
 * segundo não estreita nada e a lista de filtros passa a mostrar duas linhas
 * idênticas, que é como se perde a noção do que se está olhando.
 */
export function filtroJaAplicado(
  filtros: ReadonlyArray<FiltroDeClique>,
  candidato: FiltroDeClique,
): boolean {
  return filtros.some(
    (filtro) =>
      filtro.campo === candidato.campo &&
      filtro.operador === candidato.operador &&
      filtro.valores.length === candidato.valores.length &&
      filtro.valores.every((valor, indice) => valor === candidato.valores[indice]),
  );
}

/**
 * O nome acessível do ponto clicável.
 *
 * **"São Paulo" não basta como nome de um botão.** Quem navega por teclado
 * ouve o nome antes de decidir acionar, e um gráfico que reage ao clique sem
 * dizer que reage é um gráfico em que ninguém clica. O texto diz o que vai
 * acontecer, e quando não vai acontecer nada diz por quê.
 */
export function rotuloDaAcaoDeClique(
  rotuloDoCampo: string,
  rotuloDoValor: string,
  resultado: ResultadoDoClique,
): string {
  if (!resultado.pode) return `${rotuloDoCampo}: ${rotuloDoValor} — não é possível filtrar aqui`;
  if (resultado.filtro.operador === "vazio") {
    return `Filtrar por ${rotuloDoCampo} sem valor`;
  }
  return `Filtrar por ${rotuloDoCampo}: ${rotuloDoValor}`;
}

/**
 * RN92 — descer de nível.
 *
 * Descer troca a dimensão pelo nível seguinte da hierarquia **e** acrescenta o
 * filtro do valor de onde se desceu. As duas metades são obrigatórias: descer
 * em "São Paulo" sem filtrar por São Paulo mostraria os municípios do país
 * inteiro, que não é descer — é trocar de pergunta.
 *
 * Por isso a descida **compõe com `filtroDoClique`** em vez de repetir a
 * decisão: se aquele valor não pode virar filtro (uma lacuna num campo sem o
 * operador de vazio, por exemplo), a descida não acontece, e pelo mesmo
 * motivo. Duas listas de recusa divergiriam na primeira correção.
 */
export interface DescidaPossivel {
  readonly pode: true;
  /** O campo que sai das Linhas. */
  readonly de: string;
  /** O campo que entra no lugar. */
  readonly para: string;
  readonly rotuloDestino: string;
  /** O recorte do valor de onde se desceu. */
  readonly filtro: FiltroDeClique;
}

export type ResultadoDaDescida = DescidaPossivel | { readonly pode: false; readonly motivo: string };

/** Uma hierarquia, na forma mínima — mesma razão de `CampoParaClique`. */
export interface HierarquiaParaDescida {
  chave: string;
  rotulo: string;
  niveis: ReadonlyArray<string>;
}

/**
 * O nível seguinte a este campo, em alguma hierarquia declarada.
 *
 * `null` quando o campo não está em hierarquia nenhuma **ou** já é o último
 * nível. Os dois casos significam a mesma coisa para quem olha — não há para
 * onde descer — e distingui-los na interface só acrescentaria uma explicação
 * que ninguém pediu.
 */
export function nivelSeguinte(
  hierarquias: ReadonlyArray<HierarquiaParaDescida> | undefined,
  campoSlug: string,
): { hierarquia: HierarquiaParaDescida; para: string } | null {
  for (const hierarquia of hierarquias ?? []) {
    const posicao = hierarquia.niveis.indexOf(campoSlug);
    if (posicao === -1 || posicao === hierarquia.niveis.length - 1) continue;
    const para = hierarquia.niveis[posicao + 1];
    if (para) return { hierarquia, para };
  }
  return null;
}

/**
 * A descida que este clique produz — ou o motivo de não produzir nenhuma.
 *
 * **Campo sem hierarquia não desce, e a interface não finge que desce**: o
 * caminho simplesmente não aparece, em vez de aparecer e recusar. Recusar com
 * motivo é para o que a pessoa poderia razoavelmente esperar que funcionasse.
 */
export function descidaDoClique(
  campos: ReadonlyArray<CampoParaClique>,
  hierarquias: ReadonlyArray<HierarquiaParaDescida> | undefined,
  campoSlug: string,
  valor: Celula,
): ResultadoDaDescida {
  const seguinte = nivelSeguinte(hierarquias, campoSlug);
  if (!seguinte) {
    return { pode: false, motivo: "Não há nível abaixo deste campo." };
  }

  const destino = campos.find((candidato) => candidato.slug === seguinte.para);
  if (!destino || destino.indisponivel) {
    // Hierarquia declarada sobre campo que sumiu do catálogo. A cerca de
    // arquitetura existe para isto não chegar aqui — mas se chegar, recusa.
    return { pode: false, motivo: "O nível abaixo não está disponível neste assunto." };
  }

  // A metade do recorte. Sem ela não é descida.
  const recorte = filtroDoClique(campos, campoSlug, valor);
  if (!recorte.pode) return { pode: false, motivo: recorte.motivo };

  return {
    pode: true,
    de: campoSlug,
    para: destino.slug,
    rotuloDestino: destino.rotulo,
    filtro: recorte.filtro,
  };
}

/** O nome acessível do botão de descer — ele diz o destino, não uma seta. */
export function rotuloDaDescida(
  rotuloDoValor: string,
  resultado: ResultadoDaDescida,
): string | null {
  if (!resultado.pode) return null;
  return `Descer para ${resultado.rotuloDestino} em ${rotuloDoValor}`;
}
