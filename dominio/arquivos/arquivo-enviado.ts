/**
 * Régua de arquivo sob controle da plataforma — o núcleo, agora sem
 * suposição de que arquivo é imagem (RN54, RN60, RN62).
 *
 * **Terceira generalização do mesmo código.** A F15 escreveu esta régua em
 * `dominio/marca/marca.ts`, para a marca do aliado. A F17 a moveu para
 * `dominio/imagens/imagem.ts` e a parametrizou por perfil, quando a imagem
 * do card passou a precisar dela. A F19 a move mais um degrau, porque a
 * minuta do contrato é um **PDF** — e um documento não tem maior dimensão
 * de uso, não se redimensiona e não se higieniza como um SVG.
 *
 * O critério das três vezes é o mesmo: **generalizar, não copiar**. Um
 * segundo caminho paralelo para "validar arquivo enviado" divergiria na
 * primeira correção de segurança, e a correção iria para um lado só.
 *
 * O que é do arquivo, e vive aqui:
 *   - apuração do tipo REAL pelo conteúdo, nunca pela extensão;
 *   - coerência entre a extensão informada e o conteúdo;
 *   - teto de tamanho, medido sobre o que será GRAVADO;
 *   - a ordem das recusas, que é o que faz a mensagem ser útil.
 *
 * O que é da entidade, e vive no perfil dela: teto, formatos aceitos,
 * universo de detecção, o substantivo das mensagens e a higienização —
 * quando existir.
 *
 * Domínio puro: nada depende de banco, rede ou sessão.
 *
 * **Por que os limites não são parâmetros do Parametrizador.** A RN23 manda
 * toda régua, teto e meta de NEGÓCIO vir do Serviço de Configuração. Estes
 * números não são régua de negócio: são a condição de arquitetura que torna
 * guardar o binário no banco uma decisão defensável. Afrouxá-los pela tela
 * derrubaria a premissa — poucos arquivos pequenos — sem que ninguém
 * revisse a decisão. Mudança aqui é mudança de código, com PR.
 */

/** Os cinco tipos que a plataforma sabe reconhecer pelo conteúdo. */
export const TIPOS_DE_ARQUIVO = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
] as const;

export type TipoDeArquivo = (typeof TIPOS_DE_ARQUIVO)[number];

/** Extensão canônica por tipo — usada no nome do arquivo dentro do kit. */
export const EXTENSAO_POR_TIPO_DE_ARQUIVO: Record<TipoDeArquivo, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
};

/** Extensões que combinam com cada tipo real (JPEG aceita as duas formas). */
const EXTENSOES_COERENTES: Record<TipoDeArquivo, ReadonlyArray<string>> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/svg+xml": [".svg"],
  "application/pdf": [".pdf"],
};

/** Nome curto do formato, para compor o rótulo humano. */
export const ROTULO_POR_TIPO_DE_ARQUIVO: Record<TipoDeArquivo, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/webp": "WEBP",
  "image/svg+xml": "SVG",
  "application/pdf": "PDF",
};

/** Rótulo humano dos formatos de um perfil ("PNG, JPG, WEBP ou SVG"). */
export function rotularFormatos(tipos: ReadonlyArray<TipoDeArquivo>): string {
  const nomes = tipos.map((tipo) => ROTULO_POR_TIPO_DE_ARQUIVO[tipo]);
  if (nomes.length <= 1) {
    return nomes[0] ?? "";
  }
  return `${nomes.slice(0, -1).join(", ")} ou ${nomes[nomes.length - 1]}`;
}

/**
 * Recusa de arquivo enviado: erro de causa conhecida, então a mensagem sobe
 * até a interface inteira (RN55). Toda recusa nomeia o motivo — nunca
 * "arquivo inválido".
 *
 * **É UMA classe, exposta sob vários nomes** (`ErroDeImagem`, `ErroDeMarca`,
 * `ErroDeMinuta`), e isso é decisão da F17 que a F19 mantém: quem captura
 * qualquer um dos aliases captura o que o núcleo lança, e o mapeador de
 * erro da RN55 não precisa conhecer uma classe por entidade.
 */
export class ErroDeEnvioDeArquivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeEnvioDeArquivo";
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
const ASSINATURA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/**
 * Decide se o conteúdo é SVG. Diferente dos formatos binários, SVG é
 * texto: não há número mágico, então a prova é estrutural — o documento
 * precisa abrir uma tag `<svg` depois de, no máximo, declaração XML,
 * doctype, comentários e espaço. Isso recusa "HTML com um `<svg>` no
 * meio", que é o vetor clássico de renomear .html para .svg.
 */
export function pareceSvg(conteudo: Uint8Array): boolean {
  // BOM UTF-8, se houver, não atrapalha a leitura.
  const semBom = comecaCom(conteudo, [0xef, 0xbb, 0xbf]) ? conteudo.subarray(3) : conteudo;
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

/** Reconhecedor de cada tipo, pelo conteúdo. */
const RECONHECEDORES: Readonly<Record<TipoDeArquivo, (conteudo: Uint8Array) => boolean>> = {
  "image/png": (c) => comecaCom(c, ASSINATURA_PNG),
  "image/jpeg": (c) => comecaCom(c, ASSINATURA_JPEG),
  "image/webp": (c) => comecaCom(c, ASSINATURA_RIFF) && comecaCom(c, ASSINATURA_WEBP, 8),
  "image/svg+xml": pareceSvg,
  /**
   * PDF: `%PDF-` nos primeiros bytes. O rodapé `%%EOF` NÃO é exigido, de
   * propósito — PDF assinado digitalmente, com atualização incremental ou
   * com lixo depois do último trailer continua sendo PDF válido, e é
   * exatamente o formato em que uma minuta assinada costuma chegar.
   * Recusá-lo por causa do rodapé seria rigor sem ganho.
   */
  "application/pdf": (c) => comecaCom(c, ASSINATURA_PDF),
};

/**
 * Tipo real do arquivo dentro de um **universo declarado**, apurado pelo
 * conteúdo. Devolve `null` quando não é nenhum dos tipos do universo — a
 * extensão do nome enviado não participa da decisão em momento algum.
 *
 * O universo é parâmetro, e não a lista inteira de tipos conhecidos, por
 * duas razões:
 *
 * 1. **Compatibilidade provada.** `dominio/imagens/imagem.ts` chama com os
 *    quatro tipos de imagem, e por isso `detectarTipoReal("%PDF-1.7")`
 *    continua devolvendo `null` — que é o que `dominio/marca/marca.test.ts`
 *    afirma desde a F15, e essa suíte não foi tocada nesta fase.
 * 2. **Recusa informativa.** O universo é maior que os tipos ACEITOS de
 *    propósito: reconhecer o formato que o perfil não aceita é o que
 *    permite dizer "a minuta não aceita PNG" em vez do genérico "não é
 *    PDF".
 */
export function detectarTipoRealEntre<T extends TipoDeArquivo>(
  conteudo: Uint8Array,
  universo: ReadonlyArray<T>,
): T | null {
  for (const tipo of universo) {
    if (RECONHECEDORES[tipo](conteudo)) return tipo;
  }
  return null;
}

// ---------------------------------------------------------------------
// Perfil e validação
// ---------------------------------------------------------------------

/**
 * Calibragem de um arquivo por entidade.
 *
 * Os campos de texto existem porque a RN55 manda a falha nomear a causa: "O
 * arquivo tem 500 KB" é pior do que "A minuta tem 500 KB" quando a tela tem
 * mais de um campo de arquivo.
 */
export interface PerfilDeArquivo {
  /** Teto do que será GRAVADO, em bytes. */
  readonly tamanhoMaximoEmBytes: number;
  /** Formatos aceitos nesta entidade, pelo tipo real do conteúdo. */
  readonly tiposAceitos: ReadonlyArray<TipoDeArquivo>;
  /**
   * Tipos que a validação sabe RECONHECER aqui, para recusar nomeando o
   * formato. Superconjunto de `tiposAceitos`.
   */
  readonly universoDeDeteccao: ReadonlyArray<TipoDeArquivo>;
  /** Sujeito das mensagens: "A marca", "A imagem do card", "A minuta". */
  readonly sujeito: string;
  /** Complemento de "Selecione …": "a marca do aliado", "a minuta do contrato". */
  readonly complementoDeSelecao: string;
  /** Fecho da recusa de formato: "Envie a imagem em um deles." */
  readonly fechoDeFormatoRecusado: string;
  /** Fecho da recusa de tamanho: "Reduza a imagem antes de enviar — …" */
  readonly dicaDeReducao: string;
  /**
   * Higienização antes de gravar, quando o formato exigir. Recebe o
   * conteúdo e o tipo real; devolve o que efetivamente se grava. Só a
   * marca do aliado usa (SVG); documento e foto não têm o que higienizar.
   */
  readonly higienizar?: (conteudo: Uint8Array, tipo: TipoDeArquivo) => Uint8Array;
}

export interface ArquivoValidado {
  conteudo: Uint8Array;
  tipoMime: TipoDeArquivo;
  bytes: number;
}

/** Tamanho legível: KB até 1 MB, MB acima — nunca "2048 KB". */
export function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`.replace(".", ",");
  }
  return `${Math.round((bytes / 1024) * 10) / 10} KB`.replace(".", ",");
}

/** "os formatos aceitos aqui são X, Y ou Z" / "o formato aceito aqui é X". */
function listarAceitos(tipos: ReadonlyArray<TipoDeArquivo>): string {
  const formatos = rotularFormatos(tipos);
  return tipos.length === 1
    ? `o formato aceito aqui é ${formatos}`
    : `os formatos aceitos aqui são ${formatos}`;
}

/**
 * Régua completa do envio, na ordem em que as recusas fazem sentido para
 * quem enviou. Devolve o conteúdo **já higienizado** quando o perfil pede —
 * é ele que se grava, nunca o original.
 *
 * Roda SEMPRE no servidor. O redimensionamento por canvas que a tela de
 * imagem faz antes de enviar é conveniência de cliente: encolhe o arquivo
 * comum para caber, e nada mais. Tamanho, tipo real e higienização são
 * decididos aqui, sobre os bytes que efetivamente chegaram.
 */
export function validarArquivo(
  conteudo: Uint8Array,
  nomeArquivo: string,
  perfil: PerfilDeArquivo,
): ArquivoValidado {
  if (conteudo.length === 0) {
    throw new ErroDeEnvioDeArquivo(
      `O arquivo enviado está vazio. Selecione ${perfil.complementoDeSelecao} e envie novamente.`,
    );
  }

  const formatos = rotularFormatos(perfil.tiposAceitos);
  const tipoReal = detectarTipoRealEntre(conteudo, perfil.universoDeDeteccao);
  if (tipoReal === null) {
    throw new ErroDeEnvioDeArquivo(
      `O conteúdo de "${nomeArquivo}" não é ${formatos}. A plataforma confere o tipo real do arquivo, não a extensão do nome — renomear não muda o que ele é.`,
    );
  }

  /**
   * Formato reconhecido, mas fora deste perfil. Recusa própria, porque a
   * genérica mentiria: dizer "não é PNG, JPG ou WEBP" sobre um SVG válido
   * manda a pessoa conferir o arquivo em vez de trocar de formato.
   */
  if (!perfil.tiposAceitos.includes(tipoReal)) {
    throw new ErroDeEnvioDeArquivo(
      `${perfil.sujeito} não aceita ${ROTULO_POR_TIPO_DE_ARQUIVO[tipoReal]} — ${listarAceitos(perfil.tiposAceitos)}. ` +
        perfil.fechoDeFormatoRecusado,
    );
  }

  const extensaoInformada = nomeArquivo.includes(".")
    ? nomeArquivo.slice(nomeArquivo.lastIndexOf(".")).toLowerCase()
    : "";
  const extensaoDoTipo = EXTENSAO_POR_TIPO_DE_ARQUIVO[tipoReal];
  if (extensaoInformada !== "" && !EXTENSOES_COERENTES[tipoReal].includes(extensaoInformada)) {
    // Divergência não é fatal — o que vale é o conteúdo —, mas avisar é
    // honesto: quem envia "logo.png" que na verdade é WEBP precisa saber.
    throw new ErroDeEnvioDeArquivo(
      `O arquivo "${nomeArquivo}" tem extensão ${extensaoInformada}, mas o conteúdo é ${tipoReal} (o correto seria ${extensaoDoTipo}). Renomeie o arquivo ou exporte-o no formato que a extensão promete.`,
    );
  }

  const conteudoFinal = perfil.higienizar ? perfil.higienizar(conteudo, tipoReal) : conteudo;

  // O teto vale sobre o que será GRAVADO: para SVG, depois de higienizar
  // (que só encolhe); para os demais, o próprio arquivo.
  if (conteudoFinal.length > perfil.tamanhoMaximoEmBytes) {
    throw new ErroDeEnvioDeArquivo(
      `${perfil.sujeito} tem ${formatarTamanho(conteudoFinal.length)} e o limite é ${formatarTamanho(perfil.tamanhoMaximoEmBytes)}. ` +
        perfil.dicaDeReducao,
    );
  }

  return { conteudo: conteudoFinal, tipoMime: tipoReal, bytes: conteudoFinal.length };
}
