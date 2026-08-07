import {
  type ArquivoValidado,
  type PerfilDeArquivo,
  rotularFormatos,
  validarArquivo,
} from "@/dominio/arquivos/arquivo-enviado";

/**
 * Anexo (PDF) do contrato comercial do aliado, guardado pela plataforma.
 *
 * **Quarta calibragem do mesmo núcleo**, e por isso este arquivo é curto: a
 * F15 escreveu a régua para a marca do aliado, a F17 a generalizou para a
 * imagem do card, a F19 para a minuta do patrocínio — e aqui só se declara
 * o que é do documento. Mecanismo nenhum vive aqui; se viver, é duplicação.
 *
 * **Onde o anexo mora, e por quê.** A RN60 nomeou a decisão de arquitetura:
 * *arquivo pequeno, pouco e identitário vive no banco da plataforma*. O
 * anexo é do primeiro tipo — um por contrato, e ele é a prova do próprio
 * contrato. É o mesmo caso da minuta do patrocínio (`MinutaContrato`), e
 * segue o mesmo desenho, com uma calibragem de tamanho própria.
 */

/**
 * Teto por arquivo. 5 MB — maior que os 2 MB da minuta de propósito: o
 * contrato comercial do aliado costuma reunir mais páginas (contrato,
 * aditivos, anexos assinados) num único PDF que a minuta, que é a peça
 * única. Continua na ordem de grandeza de anexo de e-mail — um contrato por
 * aliado, não catálogo —, que é a premissa que sustenta guardar binário no
 * banco (RN60).
 */
export const TAMANHO_MAXIMO_EM_BYTES = 5 * 1024 * 1024;

/**
 * Formatos aceitos — **só PDF**, e isto é decisão, não omissão. Contrato é
 * documento: precisa abrir igual em qualquer leitor, ser pesquisável e não
 * depender de quem digitalizou. Aceitar imagem convidaria a anexar a foto de
 * uma folha, pior como registro e melhor em nada. Sem SVG, e sem a
 * superfície de higienização que ele traria.
 */
export const TIPOS_ACEITOS = ["application/pdf"] as const;

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = rotularFormatos(TIPOS_ACEITOS);

/** Calibragem do anexo do contrato comercial. */
export const PERFIL_ANEXO_CONTRATO: PerfilDeArquivo = {
  tamanhoMaximoEmBytes: TAMANHO_MAXIMO_EM_BYTES,
  tiposAceitos: TIPOS_ACEITOS,
  /**
   * O universo é maior que o aceito de propósito: reconhecer PNG, JPG, WEBP
   * e SVG aqui é o que permite recusar dizendo "o anexo não aceita PNG" em
   * vez do genérico "o conteúdo não é PDF" — quem fotografou o contrato
   * precisa saber que o problema é o formato, não o arquivo.
   */
  universoDeDeteccao: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  sujeito: "O anexo",
  complementoDeSelecao: "o anexo do contrato",
  fechoDeFormatoRecusado: "Exporte o documento em PDF e envie novamente.",
  dicaDeReducao:
    "Comprima o PDF antes de enviar — digitalização em alta resolução costuma ser a causa, e a leitura não depende dela.",
  // Sem higienização: PDF não passa por sanitizador de texto, e a rota que o
  // serve devolve `Content-Security-Policy: default-src 'none'`,
  // `X-Content-Type-Options: nosniff` e `Content-Disposition: attachment` —
  // o documento é baixado, nunca renderizado dentro da plataforma.
};

export type AnexoContratoValidado = ArquivoValidado;

/** Régua completa do envio do anexo do contrato comercial. */
export function validarAnexoContrato(
  conteudo: Uint8Array,
  nomeArquivo: string,
): AnexoContratoValidado {
  return validarArquivo(conteudo, nomeArquivo, PERFIL_ANEXO_CONTRATO);
}
