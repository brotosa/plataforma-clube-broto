import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Carregador do conteúdo do Guia da Plataforma (Onda 9, ficha §1.6).
 *
 * O texto do guia é **um único artefato**, consumido pela rota `/ajuda` e
 * pelo documento autônomo que circula e vira PDF pelo navegador. Duas
 * cópias seriam defeito, não atalho: divergem na primeira correção, e o
 * documento que já saiu de casa envelhece sem ninguém notar.
 *
 * Por isso os dois destinos passam por aqui. O que difere entre eles é a
 * moldura — o shell da plataforma de um lado, um HTML fechado do outro —,
 * nunca o texto.
 *
 * Leitura de arquivo do repositório, no mesmo padrão de
 * `infra/dossie/template.ts`: o código não guarda cópia do conteúdo, lê do
 * disco e memoriza. Como o caminho é resolvido por `process.cwd()`, o
 * Dockerfile copia `conteudo/` para a imagem explicitamente — a mesma
 * precaução que `dados/` já recebia.
 */

export const PASTA_DO_GUIA = "conteudo/guia-plataforma";

export interface ConteudoDoGuia {
  /** Capa do documento: título, subtítulo e a régua de abertura. */
  readonly capa: string;
  /** As doze seções, na ordem do documento. */
  readonly secoes: string;
}

let cache: ConteudoDoGuia | null = null;

/**
 * Lê (e memoriza) o conteúdo do guia. O texto é imutável nesta onda: a
 * implementação transcreve o documento acabado, não o reescreve — e o
 * teste de integridade compara, frase a frase, com
 * `docs/referencias/Guia_da_Plataforma_v1.html`.
 */
export function carregarGuia(): ConteudoDoGuia {
  if (cache) {
    return cache;
  }
  const raiz = join(process.cwd(), PASTA_DO_GUIA);
  cache = {
    capa: readFileSync(join(raiz, "capa.html"), "utf8"),
    secoes: readFileSync(join(raiz, "secoes.html"), "utf8"),
  };
  return cache;
}

/** Só para os testes: esquece o conteúdo memorizado. */
export function limparCacheDoGuia(): void {
  cache = null;
}
