/**
 * Régua de arquivo de imagem sob controle da plataforma (RN54, RN60).
 *
 * Este núcleo nasceu em `dominio/marca/marca.ts` na F15, para a marca do
 * aliado, e foi **generalizado** na F17 quando a imagem do card da solução
 * passou a precisar do mesmo tratamento. Generalizado, e não copiado: um
 * segundo caminho paralelo para "validar imagem enviada" divergiria na
 * primeira correção de segurança, e a correção iria para um lado só.
 *
 * O que varia entre uma imagem e outra é **calibragem**, não mecanismo:
 * teto, formatos aceitos, maior dimensão de uso e o substantivo das
 * mensagens. Tudo isso vive no `PerfilDeImagem` de cada entidade. O que não
 * varia — apuração do tipo real pelo conteúdo, higienização de SVG, ordem
 * das recusas — vive aqui, uma vez.
 *
 * Domínio puro: nada depende de banco, rede ou sessão.
 *
 * **Por que os limites não são parâmetros do Parametrizador.** A RN23 manda
 * toda régua, teto e meta de NEGÓCIO vir do Serviço de Configuração. Estes
 * números não são régua de negócio: são a condição de arquitetura que
 * torna guardar o binário no banco uma decisão defensável (ficha Onda 8 §1
 * — "limites, que são a condição da decisão"). Afrouxá-los pela tela
 * derrubaria a premissa — poucas dezenas de arquivos pequenos — sem que
 * ninguém revisse a decisão. Mudança aqui é mudança de código, com PR.
 */

/** Os quatro formatos que a plataforma sabe reconhecer pelo conteúdo. */
export const TIPOS_CONHECIDOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type TipoDeImagem = (typeof TIPOS_CONHECIDOS)[number];

/** Extensão canônica por tipo — usada no nome do arquivo dentro do kit. */
export const EXTENSAO_POR_TIPO: Record<TipoDeImagem, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

/** Extensões que combinam com cada tipo real (JPEG aceita as duas formas). */
const EXTENSOES_COERENTES: Record<TipoDeImagem, ReadonlyArray<string>> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/svg+xml": [".svg"],
};

/** Nome curto do formato, para compor o rótulo humano. */
const ROTULO_POR_TIPO: Record<TipoDeImagem, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/svg+xml": "SVG",
};

/**
 * Calibragem de uma imagem por entidade.
 *
 * As duas últimas propriedades existem só para as mensagens de recusa: a
 * RN55 manda a falha nomear a causa, e "A imagem tem 500 KB" é pior do que
 * "A imagem do card tem 500 KB" quando a tela tem dois campos de arquivo.
 */
export interface PerfilDeImagem {
  /** Teto do que será GRAVADO, em bytes. */
  readonly tamanhoMaximoEmBytes: number;
  /** Maior dimensão em que a imagem é exibida, em pixels. Alvo do redimensionamento de conveniência. */
  readonly maiorDimensaoDeUso: number;
  /** Formatos aceitos nesta entidade, pelo tipo real do conteúdo. */
  readonly tiposAceitos: ReadonlyArray<TipoDeImagem>;
  /** Sujeito das mensagens de tamanho: "A marca", "A imagem do card". */
  readonly sujeito: string;
  /** Complemento de "Selecione …": "a marca do aliado", "a imagem do card". */
  readonly complementoDeSelecao: string;
}

/** Rótulo humano dos formatos de um perfil ("PNG, JPG, WEBP ou SVG"). */
export function rotularFormatos(tipos: ReadonlyArray<TipoDeImagem>): string {
  const nomes = tipos.map((tipo) => ROTULO_POR_TIPO[tipo]);
  if (nomes.length <= 1) {
    return nomes[0] ?? "";
  }
  return `${nomes.slice(0, -1).join(", ")} ou ${nomes[nomes.length - 1]}`;
}

/**
 * Recusa de imagem: erro de causa conhecida, então a mensagem sobe até a
 * interface inteira (RN55). Toda recusa nomeia o motivo — nunca "arquivo
 * inválido".
 */
export class ErroDeImagem extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeImagem";
  }
}

// ---------------------------------------------------------------------
// Tipo real pelo conteúdo — nunca pela extensão
// ---------------------------------------------------------------------

function comecaCom(conteudo: Uint8Array, assinatura: readonly number[], deslocamento = 0): boolean {
  if (conteudo.length < deslocamento + assinatura.length) return false;
  return assinatura.every((byte, i) => conteudo[deslocamento + i] === byte);
}

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ASSINATURA_JPEG = [0xff, 0xd8, 0xff];
const ASSINATURA_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const ASSINATURA_WEBP = [0x57, 0x45, 0x42, 0x50]; // "WEBP", no deslocamento 8

/**
 * Decide se o conteúdo é SVG. Diferente dos três formatos binários, SVG é
 * texto: não há número mágico, então a prova é estrutural — o documento
 * precisa abrir uma tag `<svg` depois de, no máximo, declaração XML,
 * doctype, comentários e espaço. Isso recusa "HTML com um `<svg>` no
 * meio", que é o vetor clássico de renomear .html para .svg.
 */
function pareceSvg(conteudo: Uint8Array): boolean {
  // BOM UTF-8, se houver, não atrapalha a leitura.
  const semBom =
    comecaCom(conteudo, [0xef, 0xbb, 0xbf]) ? conteudo.subarray(3) : conteudo;
  // Só o começo importa e o resto pode ser grande: 4 KB bastam para passar
  // por declaração, doctype e comentários de qualquer SVG real.
  const inicio = new TextDecoder("utf-8", { fatal: false }).decode(semBom.subarray(0, 4096));
  let resto = inicio.trimStart();
  // Consome, em ordem livre, o prólogo permitido antes da raiz.
  for (;;) {
    if (resto.startsWith("<?xml")) {
      const fim = resto.indexOf("?>");
      if (fim === -1) return false;
      resto = resto.slice(fim + 2).trimStart();
      continue;
    }
    if (resto.startsWith("<!--")) {
      const fim = resto.indexOf("-->");
      if (fim === -1) return false;
      resto = resto.slice(fim + 3).trimStart();
      continue;
    }
    if (/^<!DOCTYPE/i.test(resto)) {
      const fim = resto.indexOf(">");
      if (fim === -1) return false;
      resto = resto.slice(fim + 1).trimStart();
      continue;
    }
    break;
  }
  // A raiz precisa ser <svg — com ou sem prefixo de namespace (<svg:svg>).
  return /^<(?:[A-Za-z_][\w.-]*:)?svg[\s/>]/i.test(resto);
}

/**
 * Tipo real do arquivo, apurado pelo conteúdo. Devolve `null` quando não é
 * nenhum dos quatro formatos conhecidos — a extensão do nome enviado não
 * participa da decisão em momento algum.
 *
 * Reconhece SVG mesmo em perfil que não o aceita, de propósito: assim a
 * recusa pode dizer "SVG não é aceito aqui, e por quê", em vez do genérico
 * "não é PNG, JPG ou WEBP".
 */
export function detectarTipoReal(conteudo: Uint8Array): TipoDeImagem | null {
  if (comecaCom(conteudo, ASSINATURA_PNG)) return "image/png";
  if (comecaCom(conteudo, ASSINATURA_JPEG)) return "image/jpeg";
  if (comecaCom(conteudo, ASSINATURA_RIFF) && comecaCom(conteudo, ASSINATURA_WEBP, 8)) {
    return "image/webp";
  }
  if (pareceSvg(conteudo)) return "image/svg+xml";
  return null;
}

// ---------------------------------------------------------------------
// Higienização de SVG
// ---------------------------------------------------------------------

/**
 * Elementos que saem inteiros, com o conteúdo que carregam.
 *
 * `executaSeAberto` distingue os dois riscos. Em `script` e nos que embutem
 * documento, uma tag aberta e nunca fechada é o truque clássico: o
 * navegador trata todo o resto do arquivo como corpo dela e executa —
 * então ali a remoção vai do ponto de abertura até o fim do arquivo. Nos
 * elementos de animação o risco é outro (`<set attributeName="href"
 * to="javascript:...">` troca atributo em tempo de execução) e basta
 * remover a própria tag, sem levar o desenho junto.
 */
const ELEMENTOS_PROIBIDOS: ReadonlyArray<{ nome: string; executaSeAberto: boolean }> = [
  { nome: "script", executaSeAberto: true },
  { nome: "foreignObject", executaSeAberto: true },
  { nome: "iframe", executaSeAberto: true },
  { nome: "embed", executaSeAberto: true },
  { nome: "object", executaSeAberto: true },
  { nome: "handler", executaSeAberto: true },
  { nome: "set", executaSeAberto: false },
  { nome: "animate", executaSeAberto: false },
  { nome: "animateTransform", executaSeAberto: false },
  { nome: "animateMotion", executaSeAberto: false },
];

function removerElemento(svg: string, nome: string, executaSeAberto: boolean): string {
  const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Com prefixo de namespace opcional; par aberto/fechado e forma vazia.
  const prefixo = "(?:[A-Za-z_][\\w.-]*:)?";
  let limpo = svg
    .replace(new RegExp(`<${prefixo}${escapado}\\b[^>]*/\\s*>`, "gi"), "")
    .replace(
      new RegExp(`<${prefixo}${escapado}\\b[\\s\\S]*?<\\/${prefixo}${escapado}\\s*>`, "gi"),
      "",
    );
  limpo = executaSeAberto
    ? limpo.replace(new RegExp(`<${prefixo}${escapado}\\b[\\s\\S]*$`, "gi"), "")
    : limpo.replace(new RegExp(`<${prefixo}${escapado}\\b[^>]*>`, "gi"), "");
  // Fechamento órfão, se o par já tiver sido desfeito acima.
  return limpo.replace(new RegExp(`<\\/${prefixo}${escapado}\\s*>`, "gi"), "");
}

/** Referência que a imagem pode carregar sem sair buscar nada de fora. */
function referenciaLocalPermitida(valor: string): boolean {
  // Espaço e caracteres de controle no meio do valor são recurso conhecido
  // para disfarçar o esquema ("java\tscript:"): saem antes da conferência.
  const limpo = valor.replace(/[\u0000-\u0020]/g, "");
  if (limpo === "") return true;
  // Âncora interna do próprio documento (<use href="#simbolo">).
  if (limpo.startsWith("#")) return true;
  // Imagem embutida — é conteúdo, não requisição de rede.
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(limpo)) return true;
  return false;
}

/**
 * Higieniza o SVG antes de gravar (RN54): fora `<script>`, manipuladores de
 * evento, `<foreignObject>` e qualquer referência externa. O que sai é o
 * que se grava — o arquivo cru nunca chega ao banco.
 *
 * Só é chamada por perfil que aceita SVG. Hoje é um só, a marca do aliado
 * — a imagem do card ficou de fora justamente para não reabrir esta
 * superfície (RN60). A mensagem de recusa fala em "marca" porque é a única
 * imagem que chega até aqui; quando um segundo perfil aceitar vetor, ela
 * passa a compor pelo `sujeito` do perfil.
 *
 * **A higienização não é a única barreira, de propósito.** A rota que serve
 * o arquivo devolve `Content-Security-Policy: default-src 'none'` e
 * `X-Content-Type-Options: nosniff`, e as telas exibem por `<img>`, onde
 * script em SVG não executa. Um sanitizador por texto é bom, não
 * infalível; as três camadas juntas é que sustentam a decisão.
 *
 * Recusa com motivo (`ErroDeImagem`) quando o que sobra não é mais um SVG.
 */
export function higienizarSvg(svgOriginal: string): string {
  let svg = svgOriginal;

  // 1. Comentários e CDATA primeiro: os dois escondem marcação de dentro
  //    das buscas seguintes, e nenhum dos dois é útil numa marca.
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");
  svg = svg.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

  // 2. Elementos que executam, embutem documento ou animam atributo.
  for (const { nome, executaSeAberto } of ELEMENTOS_PROIBIDOS) {
    svg = removerElemento(svg, nome, executaSeAberto);
  }

  // 3. Manipuladores de evento (onload, onclick, onmouseover, …), com aspas
  //    duplas, simples ou sem aspas.
  svg = svg.replace(/\son[a-z-]+\s*=\s*"[^"]*"/gi, "");
  svg = svg.replace(/\son[a-z-]+\s*=\s*'[^']*'/gi, "");
  svg = svg.replace(/\son[a-z-]+\s*=\s*[^\s>]+/gi, "");

  // 4. Referências externas em href/xlink:href — só fica âncora interna e
  //    imagem embutida em data:.
  svg = svg.replace(
    /\s(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (inteiro, _bruto, aspasDuplas, aspasSimples, semAspas) => {
      const valor = aspasDuplas ?? aspasSimples ?? semAspas ?? "";
      return referenciaLocalPermitida(valor) ? inteiro : "";
    },
  );

  // 5. Demais atributos que buscam recurso de fora.
  svg = svg.replace(/\s(?:xlink:)?(?:src|from|to|values|base|action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (inteiro) =>
    /https?:|\/\/|javascript:|data:(?!image\/)/i.test(inteiro) ? "" : inteiro,
  );

  // 6. CSS que importa ou baixa: @import e url() apontando para fora.
  svg = svg.replace(/@import[^;}]*[;}]?/gi, "");
  svg = svg.replace(/url\(\s*(['"]?)(?!#|data:image\/)[^)]*\1\s*\)/gi, "none");

  // 7. Rede de segurança: esquema executável em qualquer atributo restante.
  svg = svg.replace(/\s[\w:-]+\s*=\s*("[^"]*javascript:[^"]*"|'[^']*javascript:[^']*'|[^\s>]*javascript:[^\s>]*)/gi, "");

  // 8. `<style>` e `<a>` não são removidos: o primeiro já perdeu @import e
  //    url() externo, o segundo já perdeu href não-local, e ambos aparecem
  //    em SVG legítimo exportado por ferramenta de design.

  // A raiz precisa ter sobrevivido E o documento precisa fechar. A segunda
  // condição pega o caso em que um `<script>` sem fechamento levou o resto
  // do arquivo embora: aí o certo é recusar com motivo, não gravar um
  // desenho truncado que a tela renderizaria pela metade.
  const fechaDireito = /<\/(?:[A-Za-z_][\w.-]*:)?svg\s*>\s*$/i.test(svg.trimEnd()) ||
    /^[\s\S]*<(?:[A-Za-z_][\w.-]*:)?svg\b[^>]*\/\s*>\s*$/i.test(svg.trim());
  if (!pareceSvg(new TextEncoder().encode(svg)) || !fechaDireito) {
    throw new ErroDeImagem(
      "O SVG enviado não pôde ser higienizado com segurança — o que restou depois de remover script, manipuladores de evento e referências externas não é mais um SVG válido. Exporte a marca novamente pela ferramenta de design, ou envie em PNG.",
    );
  }
  return svg;
}

// ---------------------------------------------------------------------
// Validação completa do envio
// ---------------------------------------------------------------------

export interface ImagemValidada {
  conteudo: Uint8Array;
  tipoMime: TipoDeImagem;
  bytes: number;
}

function formatarKb(bytes: number): string {
  return `${Math.round((bytes / 1024) * 10) / 10} KB`.replace(".", ",");
}

/**
 * Régua completa do envio, na ordem em que as recusas fazem sentido para
 * quem enviou. Devolve o conteúdo **já higienizado** quando é SVG — é ele
 * que se grava, nunca o original.
 *
 * Roda SEMPRE no servidor. O redimensionamento por canvas que a tela faz
 * antes de enviar é conveniência de cliente: encolhe o arquivo comum para
 * caber, e nada mais. Tamanho, tipo real e higienização são decididos
 * aqui, sobre os bytes que efetivamente chegaram.
 */
export function validarImagem(
  conteudo: Uint8Array,
  nomeArquivo: string,
  perfil: PerfilDeImagem,
): ImagemValidada {
  if (conteudo.length === 0) {
    throw new ErroDeImagem(
      `O arquivo enviado está vazio. Selecione ${perfil.complementoDeSelecao} e envie novamente.`,
    );
  }

  const formatos = rotularFormatos(perfil.tiposAceitos);
  const tipoReal = detectarTipoReal(conteudo);
  if (tipoReal === null) {
    throw new ErroDeImagem(
      `O conteúdo de "${nomeArquivo}" não é ${formatos}. A plataforma confere o tipo real do arquivo, não a extensão do nome — renomear não muda o que ele é.`,
    );
  }

  /**
   * Formato reconhecido, mas fora deste perfil. Recusa própria, porque a
   * genérica mentiria: dizer "não é PNG, JPG ou WEBP" sobre um SVG válido
   * manda a pessoa conferir o arquivo em vez de trocar de formato.
   */
  if (!perfil.tiposAceitos.includes(tipoReal)) {
    throw new ErroDeImagem(
      `${perfil.sujeito} não aceita ${ROTULO_POR_TIPO[tipoReal]} — os formatos aceitos aqui são ${formatos}. ` +
        `Envie a imagem em um deles.`,
    );
  }

  const extensaoInformada = nomeArquivo.includes(".")
    ? nomeArquivo.slice(nomeArquivo.lastIndexOf(".")).toLowerCase()
    : "";
  const extensaoDoTipo = EXTENSAO_POR_TIPO[tipoReal];
  if (extensaoInformada !== "" && !EXTENSOES_COERENTES[tipoReal].includes(extensaoInformada)) {
    // Divergência não é fatal — o que vale é o conteúdo —, mas avisar é
    // honesto: quem envia "logo.png" que na verdade é WEBP precisa saber.
    throw new ErroDeImagem(
      `O arquivo "${nomeArquivo}" tem extensão ${extensaoInformada}, mas o conteúdo é ${tipoReal} (o correto seria ${extensaoDoTipo}). Renomeie o arquivo ou exporte-o no formato que a extensão promete.`,
    );
  }

  let conteudoFinal = conteudo;
  if (tipoReal === "image/svg+xml") {
    const original = new TextDecoder("utf-8", { fatal: false }).decode(conteudo);
    conteudoFinal = new TextEncoder().encode(higienizarSvg(original));
  }

  // O teto vale sobre o que será GRAVADO: para SVG, depois de higienizar
  // (que só encolhe); para os demais, o próprio arquivo.
  if (conteudoFinal.length > perfil.tamanhoMaximoEmBytes) {
    throw new ErroDeImagem(
      `${perfil.sujeito} tem ${formatarKb(conteudoFinal.length)} e o limite é ${formatarKb(perfil.tamanhoMaximoEmBytes)}. Reduza a imagem antes de enviar — a maior dimensão que a plataforma usa é ${perfil.maiorDimensaoDeUso} px.`,
    );
  }

  return { conteudo: conteudoFinal, tipoMime: tipoReal, bytes: conteudoFinal.length };
}
