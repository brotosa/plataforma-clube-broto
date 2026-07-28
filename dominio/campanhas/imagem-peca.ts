import {
  type ArquivoValidado,
  type PerfilDeArquivo,
  rotularFormatos,
  validarArquivo,
} from "@/dominio/arquivos/arquivo-enviado";
import { TETO_POR_ARTEFATO } from "@/dominio/arquivos/artefato-derivado";

/**
 * RN71 — a imagem da peça de campanha, o único dos três artefatos
 * derivados que alguém envia.
 *
 * **Quarta calibragem do mesmo núcleo**, e por isso este arquivo é curto,
 * como o da minuta: a régua já existe em `dominio/arquivos/`, e aqui só se
 * declara o que é da peça. Até a F21 a imagem da peça não passava por
 * régua nenhuma — ia direto do formulário para o disco, sem conferência de
 * tipo real nem de tamanho. Era o único caminho de arquivo da plataforma
 * sem validação, e o motivo é histórico: quando a F12 escreveu a peça, o
 * núcleo de validação ainda não existia (ele nasceu na F15).
 */

/**
 * Teto por arquivo (RN71). 1 MB — a tabela da regra vive em
 * `artefato-derivado.ts` e este módulo a lê, para o número existir **uma
 * vez só**: quem grava confere o mesmo limite que quem valida no envio.
 *
 * 1 MB é folgado para arte de e-mail, que raramente passa de algumas
 * centenas de KB, e aperta o suficiente para não entrar aqui o TIFF ou o
 * PNG de 4000 px exportado sem pensar — que o cliente de e-mail iria
 * reduzir de qualquer jeito, depois de fazer alguém baixá-lo inteiro.
 */
export const TAMANHO_MAXIMO_EM_BYTES = TETO_POR_ARTEFATO.IMAGEM_DE_PECA;

/**
 * Formatos aceitos — **sem SVG**, e isto é decisão da ficha §4, não
 * omissão: cliente de e-mail não renderiza SVG, e a peça existe justamente
 * para consumo externo. Aceitá-lo entregaria ao aliado um kit com uma arte
 * que não aparece no destino.
 *
 * É a mesma escolha da imagem do card (RN60) por um motivo diferente: lá o
 * vetor não traz ganho porque a imagem é fotográfica; aqui ele traz
 * prejuízo porque o destino não o exibe.
 */
export const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"] as const;

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = rotularFormatos(TIPOS_ACEITOS);

/** Calibragem da imagem da peça de campanha. */
export const PERFIL_IMAGEM_DE_PECA: PerfilDeArquivo = {
  tamanhoMaximoEmBytes: TAMANHO_MAXIMO_EM_BYTES,
  tiposAceitos: TIPOS_ACEITOS,
  /**
   * O universo é maior que o aceito, como nos demais perfis: reconhecer
   * SVG e PDF aqui é o que permite dizer "a peça não aceita SVG" em vez do
   * genérico "o conteúdo não é PNG, JPG ou WEBP" — quem exportou o vetor
   * precisa saber que o problema é o destino, não o arquivo.
   */
  universoDeDeteccao: ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf"],
  sujeito: "A imagem da peça",
  complementoDeSelecao: "a imagem da peça",
  fechoDeFormatoRecusado: "Exporte a arte em um deles — é o que o cliente de e-mail renderiza.",
  dicaDeReducao:
    "Reduza a imagem antes de enviar — exportar em WEBP ou diminuir a largura resolve na maioria dos casos.",
  // Sem higienização: os três formatos aceitos são binários de imagem, e
  // nenhum deles carrega script. A superfície que o SVG traria é justamente
  // uma das razões de ele ficar de fora.
};

export type ImagemDePecaValidada = ArquivoValidado;

/** Régua completa do envio da imagem da peça (RN71). */
export function validarImagemDePeca(
  conteudo: Uint8Array,
  nomeArquivo: string,
): ImagemDePecaValidada {
  return validarArquivo(conteudo, nomeArquivo, PERFIL_IMAGEM_DE_PECA);
}
