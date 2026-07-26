/**
 * RN54 — marca do aliado guardada pela própria plataforma.
 *
 * Aqui vive a régua do arquivo: teto de tamanho, formatos aceitos, apuração
 * do tipo REAL pelo conteúdo e higienização do SVG. Nada disto depende de
 * banco, rede ou sessão — é domínio puro, testável caso a caso.
 *
 * **Por que os limites não são parâmetros do Parametrizador.** A RN23 manda
 * toda régua, teto e meta de NEGÓCIO vir do Serviço de Configuração. Estes
 * números não são régua de negócio: são a condição de arquitetura que
 * torna guardar o binário no banco uma decisão defensável (ficha §1 —
 * "limites, que são a condição da decisão"). Afrouxá-los pela tela
 * derrubaria a premissa — poucas dezenas de arquivos pequenos — sem que
 * ninguém revisse a decisão. Mudança aqui é mudança de código, com PR.
 */

/** Teto por arquivo (RN54). 200 KB = 200 × 1024 bytes. */
export const TAMANHO_MAXIMO_EM_BYTES = 200 * 1024;

/**
 * Maior dimensão em que a marca é efetivamente usada, em pixels.
 *
 * Vem da maior caixa de exibição do produto — os 132 px de largura do
 * cabeçalho da ficha do aliado (T2) — dobrados para tela de alta
 * densidade e arredondados. Serve de alvo ao redimensionamento de
 * conveniência no cliente; acima disto o arquivo só carrega peso que
 * nenhuma tela aproveita.
 */
export const MAIOR_DIMENSAO_DE_USO = 320;

/** Formatos aceitos (RN54), pelo tipo real do conteúdo. */
export const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type TipoMarca = (typeof TIPOS_ACEITOS)[number];

/** Extensão canônica por tipo — usada no nome do arquivo dentro do kit. */
export const EXTENSAO_POR_TIPO: Record<TipoMarca, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = "PNG, JPG, WEBP ou SVG";

/**
 * Recusa de marca: erro de causa conhecida, então a mensagem sobe até a
 * interface inteira (RN55). Toda recusa nomeia o motivo — nunca "arquivo
 * inválido".
 */
export class ErroDeMarca extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeMarca";
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
 * Tipo real do arquivo, apurado pelo conteúdo (RN54). Devolve `null` quando
 * não é nenhum dos quatro formatos aceitos — a extensão do nome enviado
 * não participa da decisão em momento algum.
 */
export function detectarTipoReal(conteudo: Uint8Array): TipoMarca | null {
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

/** Referência que a marca pode carregar sem sair buscar nada de fora. */
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
 * **A higienização não é a única barreira, de propósito.** A rota que serve
 * a marca devolve `Content-Security-Policy: default-src 'none'` e
 * `X-Content-Type-Options: nosniff`, e as telas exibem a marca por `<img>`,
 * onde script em SVG não executa. Um sanitizador por texto é bom, não
 * infalível; as três camadas juntas é que sustentam a decisão.
 *
 * Recusa com motivo (`ErroDeMarca`) quando o que sobra não é mais um SVG.
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
    throw new ErroDeMarca(
      "O SVG enviado não pôde ser higienizado com segurança — o que restou depois de remover script, manipuladores de evento e referências externas não é mais um SVG válido. Exporte a marca novamente pela ferramenta de design, ou envie em PNG.",
    );
  }
  return svg;
}

// ---------------------------------------------------------------------
// Validação completa do envio
// ---------------------------------------------------------------------

export interface MarcaValidada {
  conteudo: Uint8Array;
  tipoMime: TipoMarca;
  bytes: number;
}

function formatarKb(bytes: number): string {
  return `${Math.round((bytes / 1024) * 10) / 10} KB`.replace(".", ",");
}

/**
 * Régua completa do envio (RN54), na ordem em que as recusas fazem sentido
 * para quem enviou. Devolve o conteúdo **já higienizado** — é ele que se
 * grava, nunca o original.
 *
 * Roda SEMPRE no servidor. O redimensionamento por canvas que a tela faz
 * antes de enviar é conveniência de cliente: encolhe o arquivo comum para
 * caber, e nada mais. Tamanho, tipo real e higienização são decididos
 * aqui, sobre os bytes que efetivamente chegaram.
 */
export function validarMarca(conteudo: Uint8Array, nomeArquivo: string): MarcaValidada {
  if (conteudo.length === 0) {
    throw new ErroDeMarca("O arquivo enviado está vazio. Selecione a marca do aliado e envie novamente.");
  }

  const tipoReal = detectarTipoReal(conteudo);
  if (tipoReal === null) {
    throw new ErroDeMarca(
      `O conteúdo de "${nomeArquivo}" não é ${FORMATOS_ACEITOS_ROTULO}. A plataforma confere o tipo real do arquivo, não a extensão do nome — renomear não muda o que ele é.`,
    );
  }

  const extensaoInformada = nomeArquivo.includes(".")
    ? nomeArquivo.slice(nomeArquivo.lastIndexOf(".")).toLowerCase()
    : "";
  const extensaoDoTipo = EXTENSAO_POR_TIPO[tipoReal];
  const extensoesCoerentes: Record<TipoMarca, string[]> = {
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/webp": [".webp"],
    "image/svg+xml": [".svg"],
  };
  if (extensaoInformada !== "" && !extensoesCoerentes[tipoReal].includes(extensaoInformada)) {
    // Divergência não é fatal — o que vale é o conteúdo —, mas avisar é
    // honesto: quem envia "logo.png" que na verdade é WEBP precisa saber.
    throw new ErroDeMarca(
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
  if (conteudoFinal.length > TAMANHO_MAXIMO_EM_BYTES) {
    throw new ErroDeMarca(
      `A marca tem ${formatarKb(conteudoFinal.length)} e o limite é ${formatarKb(TAMANHO_MAXIMO_EM_BYTES)}. Reduza a imagem antes de enviar — a maior dimensão que a plataforma usa é ${MAIOR_DIMENSAO_DE_USO} px.`,
    );
  }

  return { conteudo: conteudoFinal, tipoMime: tipoReal, bytes: conteudoFinal.length };
}
