/**
 * Sumário do Guia da Plataforma (Onda 9, ficha §1.5).
 *
 * As doze entradas e seus identificadores de âncora são os do documento
 * original (`docs/referencias/Guia_da_Plataforma_v1.html`) — é por eles que
 * `/ajuda#j4` funciona, e é contra eles que o mapa contextual da RN59
 * aponta. Trocar um identificador aqui quebra endereço já compartilhado.
 *
 * Este é o **único** lugar onde o sumário existe: a rota e o documento
 * autônomo montam o índice a partir daqui, e nenhum dos dois guarda uma
 * lista própria. A ficha §1.6 chama isso de fonte única, e o teste de
 * `infra/arquitetura/guia-fonte-unica.test.ts` é quem cobra.
 */

export interface EntradaDoIndice {
  /** Grupo editorial — repete entre entradas vizinhas, e abre no primeiro. */
  readonly grupo: string;
  /** Identificador da âncora, idêntico ao `id` da `<section>`. */
  readonly id: string;
  /** Rótulo exibido no sumário, com a numeração do documento. */
  readonly rotulo: string;
}

export const INDICE_DO_GUIA: ReadonlyArray<EntradaDoIndice> = [
  { grupo: "Fundamentos", id: "oquee", rotulo: "1 · O que é e o que não é" },
  { grupo: "Fundamentos", id: "vocab", rotulo: "2 · Vocabulário" },
  { grupo: "Fundamentos", id: "princ", rotulo: "3 · Os seis princípios" },
  { grupo: "Como usar", id: "j1", rotulo: "4.1 · Trazer um aliado novo" },
  { grupo: "Como usar", id: "j2", rotulo: "4.2 · Publicar e manter ofertas" },
  { grupo: "Como usar", id: "j3", rotulo: "4.3 · Base de assinantes" },
  { grupo: "Como usar", id: "j4", rotulo: "4.4 · Rodar uma campanha" },
  { grupo: "Como usar", id: "j5", rotulo: "4.5 · Acompanhar a rede" },
  { grupo: "Como usar", id: "j6", rotulo: "4.6 · Configurar a plataforma" },
  { grupo: "Referência", id: "papeis", rotulo: "5 · Papéis e permissões" },
  { grupo: "Referência", id: "faltam", rotulo: "6 · Por que alguns números não aparecem" },
  { grupo: "Referência", id: "glossario", rotulo: "7 · Glossário" },
];

/**
 * Seção de abertura — destino de quem chega sem contexto e de todo módulo
 * que o `MAPA_AJUDA` não mapeia. A RN59 é explícita: nunca erro, nunca
 * tela vazia.
 */
export const SECAO_DE_ABERTURA = "oquee";

/** Identificadores válidos de seção, para validar âncora vinda da URL. */
export function ehSecaoConhecida(id: string): boolean {
  return INDICE_DO_GUIA.some((entrada) => entrada.id === id);
}
