import {
  type ArquivoValidado,
  type PerfilDeArquivo,
  rotularFormatos,
  validarArquivo,
} from "@/dominio/arquivos/arquivo-enviado";

/**
 * RN64 — evidência da aprovação externa da campanha.
 *
 * Quarta calibragem do núcleo de `dominio/arquivos/arquivo-enviado.ts`, e a
 * primeira que **mistura documento e imagem** — o que é justamente a prova
 * de que a generalização da F19 valeu a pena: o perfil declara os dois
 * conjuntos de tipos e nada no mecanismo precisou saber disso.
 *
 * A aprovação pode acontecer fora da plataforma, e a RN64 é explícita: não
 * há workflow novo, registra-se quem aprovou, quando e a evidência. A
 * evidência real é tanto um PDF assinado quanto a captura de tela de um
 * e-mail — e recusar a segunda forçaria a operação a converter arquivo
 * antes de anexar, o que ninguém faz: o que acontece é que a evidência não
 * é anexada, e o registro se perde.
 */

/**
 * Teto por arquivo. 2 MB — o mesmo da minuta, e pela mesma conta: uma
 * evidência por campanha, arquivo de anexo de e-mail.
 */
export const TAMANHO_MAXIMO_EM_BYTES = 2 * 1024 * 1024;

/**
 * Formatos aceitos: PDF e as três imagens rasterizadas.
 *
 * **Sem SVG**, pela razão da RN60: o vetor não é formato de captura de
 * tela nem de documento assinado, e traria de volta toda a superfície de
 * higienização sem ganho nenhum aqui.
 */
export const TIPOS_ACEITOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = rotularFormatos(TIPOS_ACEITOS);

/** Calibragem da evidência de aprovação externa. */
export const PERFIL_EVIDENCIA: PerfilDeArquivo = {
  tamanhoMaximoEmBytes: TAMANHO_MAXIMO_EM_BYTES,
  tiposAceitos: TIPOS_ACEITOS,
  // SVG entra no universo só para poder ser recusado nomeando o formato.
  universoDeDeteccao: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  sujeito: "A evidência",
  complementoDeSelecao: "a evidência da aprovação",
  fechoDeFormatoRecusado: "Envie o documento ou a captura de tela em um deles.",
  dicaDeReducao:
    "Reduza o arquivo antes de enviar — captura de tela em PNG costuma encolher bastante salva como JPG.",
};

export type EvidenciaValidada = ArquivoValidado;

/** Régua completa do envio da evidência (RN64). */
export function validarEvidencia(conteudo: Uint8Array, nomeArquivo: string): EvidenciaValidada {
  return validarArquivo(conteudo, nomeArquivo, PERFIL_EVIDENCIA);
}
