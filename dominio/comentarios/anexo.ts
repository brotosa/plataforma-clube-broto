import {
  type ArquivoValidado,
  type PerfilDeArquivo,
  rotularFormatos,
  validarArquivo,
} from "@/dominio/arquivos/arquivo-enviado";

/**
 * Anexo de um comentário do painel de atividades (aliado ou patrocinador),
 * guardado pela plataforma.
 *
 * **Quinta calibragem do mesmo núcleo**, e por isso este arquivo é curto: a
 * régua de validação vive em `dominio/arquivos/arquivo-enviado.ts` desde a
 * F15 (marca), passou por imagem do card (F17), minuta (F19) e anexo do
 * contrato (F19). Aqui só se declara o que é do anexo do comentário —
 * mecanismo nenhum se copia; se copiar, é o defeito que a RN54/RN60 existem
 * para impedir.
 *
 * **Onde o anexo mora, e por quê.** A RN60 nomeou a decisão de arquitetura:
 * *arquivo pequeno, pouco e identitário vive no banco da plataforma; grande,
 * numeroso e descartável vive em armazenamento de objetos.* O anexo do
 * comentário é do primeiro tipo — um por comentário, poucos por ficha, e é
 * a prova do que a equipe registrou. É o mesmo caso da minuta e do anexo do
 * contrato: binário em tabela própria 1:1, com o mesmo desenho e uma
 * calibragem de formato própria. Sem S3 no caminho.
 */

/**
 * Teto por arquivo. 5 MB — a mesma ordem de grandeza do anexo do contrato:
 * um print ou um PDF de poucas páginas cabe com folga, e continua no tamanho
 * de um anexo de e-mail, que é a premissa que sustenta guardar binário no
 * banco (RN60). Não é régua de negócio, é condição de arquitetura: muda por
 * PR, nunca pela tela (a mesma razão do núcleo).
 */
export const TAMANHO_MAXIMO_EM_BYTES = 5 * 1024 * 1024;

/**
 * Formatos aceitos — **PDF e imagem (PNG, JPG, WEBP)**, e a ausência de SVG
 * é decisão, não omissão. Um anexo de atividade é "um PDF ou um print": o
 * documento e a captura de tela cobrem o uso real. SVG traria de volta toda
 * a superfície de higienização (a mesma da marca do aliado) sem ganho — um
 * print nunca é vetor —, então fica fora, como no card de solução (RN60).
 */
export const TIPOS_ACEITOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = rotularFormatos(TIPOS_ACEITOS);

/** Calibragem do anexo do comentário. */
export const PERFIL_ANEXO_COMENTARIO: PerfilDeArquivo = {
  tamanhoMaximoEmBytes: TAMANHO_MAXIMO_EM_BYTES,
  tiposAceitos: TIPOS_ACEITOS,
  /**
   * O universo inclui o SVG só para RECONHECÊ-LO e recusar nomeando —
   * "o anexo não aceita SVG" é mais útil que o genérico "o conteúdo não é
   * PDF, PNG, JPG ou WEBP" para quem tentou anexar um vetor.
   */
  universoDeDeteccao: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  sujeito: "O anexo",
  complementoDeSelecao: "o anexo do comentário",
  fechoDeFormatoRecusado: "Anexe um PDF ou uma imagem (print) e envie novamente.",
  dicaDeReducao:
    "Comprima o arquivo antes de anexar — PDF digitalizado em alta resolução costuma ser a causa, e a leitura não depende dela.",
  // Sem higienização: PDF e imagem rasterizada não passam por sanitizador de
  // texto, e a rota que serve o anexo devolve `Content-Security-Policy:
  // default-src 'none'`, `X-Content-Type-Options: nosniff` e
  // `Content-Disposition: attachment` — o arquivo é baixado, nunca
  // renderizado dentro da plataforma.
};

export type AnexoComentarioValidado = ArquivoValidado;

/** Régua completa do envio do anexo do comentário. */
export function validarAnexoComentario(
  conteudo: Uint8Array,
  nomeArquivo: string,
): AnexoComentarioValidado {
  return validarArquivo(conteudo, nomeArquivo, PERFIL_ANEXO_COMENTARIO);
}
