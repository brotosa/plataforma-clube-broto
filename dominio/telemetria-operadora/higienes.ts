/**
 * As higienes dos arquivos da operadora (RN67; prompt §3).
 *
 * Todas foram observadas em arquivo real e **são tratadas no parser, nunca
 * na origem**: pedir à operadora que mude o formato é negociação de meses,
 * e enquanto ela não muda a importação precisa funcionar. Corrigir o
 * arquivo à mão antes de subir seria pior ainda — a próxima geração viria
 * com o mesmo artefato e ninguém lembraria do passo manual.
 *
 * São quatro, e cada uma tem teste próprio:
 *
 * 1. **Coluna de índice sem nome na primeira posição.** Tratada em
 *    `infra/planilhas/leitor-tabular.ts`, que descarta coluna sem nome no
 *    cabeçalho — antes de qualquer parser vê-la. Coberta aqui do lado de
 *    quem depende dela.
 * 2. **Emoji no campo de status do seller** — "🟢 Seller com oferta ativa".
 * 3. **Apóstrofo à esquerda** (artefato de planilha: o Excel marca assim a
 *    célula forçada a texto, e o apóstrofo vaza na exportação).
 * 4. **`'-` significando vazio** — que é a higiene 3 aplicada a um traço.
 *
 * As funções são puras e compõem: `higienizarCelula` aplica 3 e depois 4,
 * nessa ordem, que é a única que resolve `'-`.
 */

/**
 * Remove emoji e seus acompanhantes invisíveis do início/meio do texto.
 *
 * O alvo declarado é o status do seller, mas a função não presume a
 * posição: a operadora pode passar a decorar outro campo, e um `replace`
 * ancorado no começo falharia calado.
 *
 * O que ela NÃO faz: mexer em acento, cedilha ou qualquer letra latina —
 * "Fundação de Estudos Agrários" atravessa intacta. O intervalo varrido é
 * o de símbolos e pictogramas, mais os seletores de variação e o
 * juntador de largura zero, que viajam junto com o emoji e sobrariam como
 * espaço fantasma se ficassem.
 */
export function removerEmoji(texto: string): string {
  return texto
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Remove o apóstrofo à esquerda que o Excel deixa em célula forçada a
 * texto — visto em telefone ("'11999998888").
 *
 * Só o PRIMEIRO caractere, e só se for apóstrofo: apóstrofo no meio é
 * conteúdo legítimo ("D'Ávila") e não se toca nele.
 */
export function removerApostrofoDePlanilha(texto: string): string {
  return texto.startsWith("'") ? texto.slice(1) : texto;
}

/**
 * Traço isolado significa vazio na fonte — chega como `'-` (o apóstrofo
 * da higiene 3 sobre um traço) e às vezes como `-` limpo.
 *
 * Devolve string vazia, que é o estado honesto: o campo não veio. Nunca
 * um zero nem um texto inventado — ausência é informação (RN53).
 */
export function vazioSeTraco(texto: string): string {
  const semApostrofo = removerApostrofoDePlanilha(texto).trim();
  return semApostrofo === "-" || semApostrofo === "--" ? "" : semApostrofo;
}

/**
 * As higienes 3 e 4 na ordem que resolve `'-`: tira o apóstrofo, depois
 * decide se o que sobrou é um traço.
 *
 * O emoji NÃO entra aqui de propósito: ele é decoração de um campo
 * específico e removê-lo de toda célula apagaria um emoji que fosse
 * conteúdo de verdade — nome de produto, por exemplo. Quem lê o status do
 * seller chama `removerEmoji` explicitamente.
 */
export function higienizarCelula(texto: string): string {
  return vazioSeTraco(removerApostrofoDePlanilha(texto));
}
