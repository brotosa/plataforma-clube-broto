import {
  type ArquivoValidado,
  type PerfilDeArquivo,
  rotularFormatos,
  validarArquivo,
} from "@/dominio/arquivos/arquivo-enviado";

/**
 * RN62 — a minuta do contrato de patrocínio, guardada pela plataforma.
 *
 * **Terceira calibragem do mesmo núcleo**, e por isso este arquivo é curto:
 * a F15 escreveu a régua para a marca do aliado, a F17 a generalizou para a
 * imagem do card, e a F19 só declara o que é do documento. Mecanismo
 * nenhum vive aqui — se viver, é duplicação.
 *
 * **Onde a minuta mora, e por quê.** A RN60 nomeou a decisão de arquitetura
 * para não se rediscutir a cada arquivo novo: *arquivo pequeno, pouco e
 * identitário vive no banco da plataforma; arquivo grande, numeroso e
 * descartável vive em armazenamento de objetos.* A minuta é do primeiro
 * tipo — uma por contrato, e ela **é** o contrato. As peças de campanha
 * continuam no S3 via `ExportAdapter`.
 */

/**
 * Teto por arquivo. 2 MB — cinco vezes o da imagem do card, e a premissa
 * da decisão de arquitetura continua de pé.
 *
 * A conta é a que sustenta guardar binário no banco: um contrato por
 * patrocinador, e patrocinadores são unidades comerciais, não catálogo.
 * Dezenas de arquivos de poucos MB é ordem de grandeza de anexo de e-mail,
 * não de repositório de documentos.
 *
 * 2 MB é o que cabe uma minuta assinada e digitalizada em resolução de
 * leitura. Acima disso o arquivo costuma ser digitalização em alta
 * resolução de algo que ninguém vai ampliar — e a recusa diz exatamente
 * isso, em vez de mandar "reduzir o arquivo" sem explicar como.
 */
export const TAMANHO_MAXIMO_EM_BYTES = 2 * 1024 * 1024;

/**
 * Formatos aceitos — **só PDF**, e isto é decisão, não omissão.
 *
 * Minuta é documento contratual: precisa abrir igual em qualquer leitor,
 * ser pesquisável e não depender de quem tirou a foto. Aceitar imagem aqui
 * convidaria a anexar a fotografia de uma folha, que é pior como registro
 * e não é melhor em nada. A evidência de aprovação da campanha (RN64) faz
 * a escolha oposta, e pelo motivo oposto — lá a captura de tela é o
 * artefato natural.
 *
 * Sem SVG, obviamente, e sem a superfície de higienização que ele traria.
 */
export const TIPOS_ACEITOS = ["application/pdf"] as const;

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = rotularFormatos(TIPOS_ACEITOS);

/** Calibragem da minuta do contrato. */
export const PERFIL_MINUTA: PerfilDeArquivo = {
  tamanhoMaximoEmBytes: TAMANHO_MAXIMO_EM_BYTES,
  tiposAceitos: TIPOS_ACEITOS,
  /**
   * O universo é maior que o aceito de propósito: reconhecer PNG, JPG,
   * WEBP e SVG aqui é o que permite recusar dizendo "a minuta não aceita
   * PNG" em vez do genérico "o conteúdo não é PDF" — quem fotografou o
   * contrato precisa saber que o problema é o formato, não o arquivo.
   */
  universoDeDeteccao: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  sujeito: "A minuta",
  complementoDeSelecao: "a minuta do contrato",
  fechoDeFormatoRecusado: "Exporte o documento em PDF e envie novamente.",
  dicaDeReducao:
    "Comprima o PDF antes de enviar — digitalização em alta resolução costuma ser a causa, e a leitura não depende dela.",
  // Sem higienização: PDF não passa por sanitizador de texto, e a rota que
  // o serve devolve `Content-Security-Policy: default-src 'none'`,
  // `X-Content-Type-Options: nosniff` e `Content-Disposition: attachment`
  // — o documento é baixado, nunca renderizado dentro da plataforma.
};

export type MinutaValidada = ArquivoValidado;

/** Régua completa do envio da minuta (RN62). */
export function validarMinuta(conteudo: Uint8Array, nomeArquivo: string): MinutaValidada {
  return validarArquivo(conteudo, nomeArquivo, PERFIL_MINUTA);
}
