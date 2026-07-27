import {
  type ImagemValidada,
  type PerfilDeImagem,
  rotularFormatos,
  validarImagem,
} from "@/dominio/imagens/imagem";

/**
 * RN60 — imagem do card da solução, guardada pela própria plataforma.
 *
 * Mesmo desenho da marca do aliado (RN54) e o **mesmo** núcleo de
 * validação; o que muda é a calibragem, e ela muda porque o uso é outro.
 */

/**
 * Teto por arquivo (RN60). 400 KB — o dobro da marca.
 *
 * O card da vitrine é uma ilustração fotográfica de 300 px em 16/10, não
 * um logotipo: 200 KB apertariam a qualidade de uma foto no dobro da
 * densidade. Continua sendo arquivo pequeno, e a premissa da decisão de
 * arquitetura — poucas dezenas de arquivos leves no banco — segue de pé.
 */
export const TAMANHO_MAXIMO_EM_BYTES = 400 * 1024;

/**
 * Maior dimensão em que a imagem do card é exibida, em pixels.
 *
 * Vem da maior caixa de exibição: os 300 px de largura do `.vcard`,
 * dobrados para tela de alta densidade e arredondados para 640. Acima
 * disto o arquivo só carrega peso que nenhuma tela aproveita.
 */
export const MAIOR_DIMENSAO_DE_USO = 640;

/**
 * Formatos aceitos (RN60) — **sem SVG**, e isto é decisão, não omissão.
 *
 * Imagem de card é fotográfica por natureza: o vetor não traz ganho
 * nenhum aqui e traria de volta toda a superfície de higienização que a
 * marca precisa manter. A recusa nomeia o motivo, em vez de dizer
 * genericamente que o arquivo é inválido.
 */
export const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"] as const;

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = rotularFormatos(TIPOS_ACEITOS);

/** Calibragem da imagem do card da solução. */
export const PERFIL_IMAGEM_CARD: PerfilDeImagem = {
  tamanhoMaximoEmBytes: TAMANHO_MAXIMO_EM_BYTES,
  maiorDimensaoDeUso: MAIOR_DIMENSAO_DE_USO,
  tiposAceitos: TIPOS_ACEITOS,
  sujeito: "A imagem do card",
  complementoDeSelecao: "a imagem do card da solução",
};

export type ImagemDeCardValidada = ImagemValidada;

/** Régua completa do envio da imagem do card (RN60). */
export function validarImagemDeCard(
  conteudo: Uint8Array,
  nomeArquivo: string,
): ImagemDeCardValidada {
  return validarImagem(conteudo, nomeArquivo, PERFIL_IMAGEM_CARD);
}
