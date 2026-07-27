import {
  ErroDeImagem,
  type ImagemValidada,
  type PerfilDeImagem,
  type TipoDeImagem,
  rotularFormatos,
  validarImagem,
} from "@/dominio/imagens/imagem";

/**
 * RN54 — marca do aliado guardada pela própria plataforma.
 *
 * Este arquivo era, até a F17, a régua inteira do arquivo de imagem. Quando
 * a imagem do card da solução passou a precisar da mesma coisa (RN60), o
 * núcleo foi **movido** para `dominio/imagens/imagem.ts` e parametrizado
 * por perfil. Aqui ficou o que é da marca: a calibragem, e nada mais.
 *
 * A API pública não mudou de forma nenhuma — nomes, tipos e mensagens são
 * os mesmos —, e é de propósito: `dominio/marca/marca.test.ts` não foi
 * tocado na F17, então ele prova, sozinho, que a generalização não alterou
 * o comportamento da marca.
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

/**
 * Formatos aceitos na marca (RN54), pelo tipo real do conteúdo.
 *
 * SVG entra aqui, e **só aqui**: logotipo é vetor por natureza e vale a
 * superfície de higienização que ele traz junto. A imagem do card (RN60)
 * fica de fora dessa conta — ver `dominio/solucoes/imagem-card.ts`.
 */
export const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type TipoMarca = TipoDeImagem;

/** Rótulo humano dos formatos, para as mensagens de recusa e a tela. */
export const FORMATOS_ACEITOS_ROTULO = rotularFormatos(TIPOS_ACEITOS);

/** Calibragem da marca do aliado. */
export const PERFIL_MARCA: PerfilDeImagem = {
  tamanhoMaximoEmBytes: TAMANHO_MAXIMO_EM_BYTES,
  maiorDimensaoDeUso: MAIOR_DIMENSAO_DE_USO,
  tiposAceitos: TIPOS_ACEITOS,
  sujeito: "A marca",
  complementoDeSelecao: "a marca do aliado",
};

/**
 * Recusa de marca (RN55).
 *
 * É a mesma classe de `ErroDeImagem` — um alias, não uma subclasse: quem
 * captura `ErroDeMarca` continua capturando o que o núcleo lança, e o
 * mapeador de erro não precisa conhecer duas classes para a mesma coisa.
 */
export { ErroDeImagem as ErroDeMarca } from "@/dominio/imagens/imagem";

export { detectarTipoReal, higienizarSvg, EXTENSAO_POR_TIPO } from "@/dominio/imagens/imagem";

export type MarcaValidada = ImagemValidada;

/** Régua completa do envio da marca (RN54). */
export function validarMarca(conteudo: Uint8Array, nomeArquivo: string): MarcaValidada {
  return validarImagem(conteudo, nomeArquivo, PERFIL_MARCA);
}

// O import de `ErroDeImagem` acima é o que sustenta o alias re-exportado;
// declará-lo aqui evita que o "unused" do lint apague a ligação.
void ErroDeImagem;
