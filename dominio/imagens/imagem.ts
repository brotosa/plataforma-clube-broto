import {
  type ArquivoValidado,
  ErroDeEnvioDeArquivo,
  EXTENSAO_POR_TIPO_DE_ARQUIVO,
  type PerfilDeArquivo,
  rotularFormatos as rotularFormatosDeArquivo,
  type TipoDeArquivo,
  detectarTipoRealEntre,
  pareceSvg,
  validarArquivo,
} from "@/dominio/arquivos/arquivo-enviado";

/**
 * Régua de arquivo de **imagem** sob controle da plataforma (RN54, RN60).
 *
 * Este arquivo era, até a F19, o núcleo inteiro. Quando a minuta do contrato
 * (RN62) passou a precisar da mesma régua para um **PDF**, o que era comum a
 * qualquer arquivo — tipo real pelo conteúdo, coerência de extensão, teto,
 * ordem das recusas — subiu para `dominio/arquivos/arquivo-enviado.ts`, e
 * aqui ficou o que é de imagem: a maior dimensão de uso, a higienização de
 * SVG e o texto das recusas em linguagem de imagem.
 *
 * **A API pública deste módulo não mudou de forma nenhuma** — nomes, tipos e
 * mensagens são os mesmos —, e é de propósito: `dominio/marca/marca.test.ts`
 * e `dominio/solucoes/imagem-card.test.ts` não foram tocados nesta fase,
 * então eles provam, sozinhos, que a terceira generalização não alterou o
 * comportamento das duas primeiras. É a mesma prova que a F17 usou quando
 * generalizou pela primeira vez.
 *
 * Domínio puro: nada depende de banco, rede ou sessão.
 *
 * **Por que os limites não são parâmetros do Parametrizador:** ver o
 * cabeçalho de `arquivo-enviado.ts` — a razão é a mesma e vale para os dois.
 */

/** Os quatro formatos de IMAGEM que a plataforma sabe reconhecer. */
export const TIPOS_CONHECIDOS = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export type TipoDeImagem = (typeof TIPOS_CONHECIDOS)[number];

/** Extensão canônica por tipo — usada no nome do arquivo dentro do kit. */
export const EXTENSAO_POR_TIPO: Record<TipoDeImagem, string> = {
  "image/png": EXTENSAO_POR_TIPO_DE_ARQUIVO["image/png"],
  "image/jpeg": EXTENSAO_POR_TIPO_DE_ARQUIVO["image/jpeg"],
  "image/webp": EXTENSAO_POR_TIPO_DE_ARQUIVO["image/webp"],
  "image/svg+xml": EXTENSAO_POR_TIPO_DE_ARQUIVO["image/svg+xml"],
};

/** Rótulo humano dos formatos de um perfil ("PNG, JPG, WEBP ou SVG"). */
export function rotularFormatos(tipos: ReadonlyArray<TipoDeImagem>): string {
  return rotularFormatosDeArquivo(tipos);
}

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

/**
 * Recusa de imagem: erro de causa conhecida, então a mensagem sobe até a
 * interface inteira (RN55). Toda recusa nomeia o motivo — nunca "arquivo
 * inválido".
 *
 * É a mesma classe que o núcleo lança, exposta com o nome que esta camada
 * usa — alias, não subclasse. Quem captura `ErroDeImagem` continua
 * capturando o que `validarArquivo` lança, e o mapeador da RN55 não precisa
 * conhecer uma classe por entidade.
 */
export { ErroDeEnvioDeArquivo as ErroDeImagem } from "@/dominio/arquivos/arquivo-enviado";

/**
 * Tipo real do arquivo, apurado pelo conteúdo. Devolve `null` quando não é
 * nenhum dos quatro formatos de imagem conhecidos — a extensão do nome
 * enviado não participa da decisão em momento algum.
 *
 * **O universo é o das imagens, e só.** Um PDF continua devolvendo `null`
 * aqui, como `marca.test.ts` afirma desde a F15: a generalização da F19
 * ensinou o núcleo a reconhecer PDF, mas quem decide o universo é o
 * chamador, e o desta camada não mudou.
 *
 * Reconhece SVG mesmo em perfil que não o aceita, de propósito: assim a
 * recusa pode dizer "SVG não é aceito aqui, e por quê", em vez do genérico
 * "não é PNG, JPG ou WEBP".
 */
export function detectarTipoReal(conteudo: Uint8Array): TipoDeImagem | null {
  return detectarTipoRealEntre(conteudo, TIPOS_CONHECIDOS);
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
 * superfície (RN60), e a minuta do contrato (RN62) é PDF, que não passa
 * por aqui. A mensagem de recusa fala em "marca" porque é a única imagem
 * que chega até aqui; quando um segundo perfil aceitar vetor, ela passa a
 * compor pelo `sujeito` do perfil.
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
  svg = svg.replace(
    /\s(?:xlink:)?(?:src|from|to|values|base|action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    (inteiro) => (/https?:|\/\/|javascript:|data:(?!image\/)/i.test(inteiro) ? "" : inteiro),
  );

  // 6. CSS que importa ou baixa: @import e url() apontando para fora.
  svg = svg.replace(/@import[^;}]*[;}]?/gi, "");
  svg = svg.replace(/url\(\s*(['"]?)(?!#|data:image\/)[^)]*\1\s*\)/gi, "none");

  // 7. Rede de segurança: esquema executável em qualquer atributo restante.
  svg = svg.replace(
    /\s[\w:-]+\s*=\s*("[^"]*javascript:[^"]*"|'[^']*javascript:[^']*'|[^\s>]*javascript:[^\s>]*)/gi,
    "",
  );

  // 8. `<style>` e `<a>` não são removidos: o primeiro já perdeu @import e
  //    url() externo, o segundo já perdeu href não-local, e ambos aparecem
  //    em SVG legítimo exportado por ferramenta de design.

  // A raiz precisa ter sobrevivido E o documento precisa fechar. A segunda
  // condição pega o caso em que um `<script>` sem fechamento levou o resto
  // do arquivo embora: aí o certo é recusar com motivo, não gravar um
  // desenho truncado que a tela renderizaria pela metade.
  const fechaDireito =
    /<\/(?:[A-Za-z_][\w.-]*:)?svg\s*>\s*$/i.test(svg.trimEnd()) ||
    /^[\s\S]*<(?:[A-Za-z_][\w.-]*:)?svg\b[^>]*\/\s*>\s*$/i.test(svg.trim());
  if (!pareceSvg(new TextEncoder().encode(svg)) || !fechaDireito) {
    throw new ErroDeEnvioDeArquivo(
      "O SVG enviado não pôde ser higienizado com segurança — o que restou depois de remover script, manipuladores de evento e referências externas não é mais um SVG válido. Exporte a marca novamente pela ferramenta de design, ou envie em PNG.",
    );
  }
  return svg;
}

// ---------------------------------------------------------------------
// Validação completa do envio
// ---------------------------------------------------------------------

export type ImagemValidada = ArquivoValidado & { tipoMime: TipoDeImagem };

/**
 * Traduz a calibragem de imagem para a do núcleo. É aqui que mora tudo o
 * que é dito "em linguagem de imagem": o fecho da recusa de formato e a
 * dica de redução, que num PDF seriam outras.
 */
function comoPerfilDeArquivo(perfil: PerfilDeImagem): PerfilDeArquivo {
  return {
    tamanhoMaximoEmBytes: perfil.tamanhoMaximoEmBytes,
    tiposAceitos: perfil.tiposAceitos,
    // Universo das imagens: PDF não é reconhecido por esta camada.
    universoDeDeteccao: TIPOS_CONHECIDOS,
    sujeito: perfil.sujeito,
    complementoDeSelecao: perfil.complementoDeSelecao,
    fechoDeFormatoRecusado: "Envie a imagem em um deles.",
    dicaDeReducao: `Reduza a imagem antes de enviar — a maior dimensão que a plataforma usa é ${perfil.maiorDimensaoDeUso} px.`,
    higienizar: perfil.tiposAceitos.includes("image/svg+xml")
      ? (conteudo: Uint8Array, tipo: TipoDeArquivo) => {
          if (tipo !== "image/svg+xml") return conteudo;
          const original = new TextDecoder("utf-8", { fatal: false }).decode(conteudo);
          return new TextEncoder().encode(higienizarSvg(original));
        }
      : undefined,
  };
}

/**
 * Régua completa do envio de imagem, na ordem em que as recusas fazem
 * sentido para quem enviou. Devolve o conteúdo **já higienizado** quando é
 * SVG — é ele que se grava, nunca o original.
 *
 * Roda SEMPRE no servidor. O redimensionamento por canvas que a tela faz
 * antes de enviar é conveniência de cliente: encolhe o arquivo comum para
 * caber, e nada mais. Tamanho, tipo real e higienização são decididos no
 * núcleo, sobre os bytes que efetivamente chegaram.
 */
export function validarImagem(
  conteudo: Uint8Array,
  nomeArquivo: string,
  perfil: PerfilDeImagem,
): ImagemValidada {
  const validado = validarArquivo(conteudo, nomeArquivo, comoPerfilDeArquivo(perfil));
  // O universo de detecção é o das imagens, então o tipo devolvido é sempre
  // um dos quatro — o estreitamento aqui é consequência, não suposição.
  return { ...validado, tipoMime: validado.tipoMime as TipoDeImagem };
}
