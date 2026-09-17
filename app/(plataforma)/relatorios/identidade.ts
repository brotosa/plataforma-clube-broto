import type { AssuntoRelatorio } from "@/dominio/relatorios/catalogo";

/**
 * A identidade visual de cada assunto na abertura do Gerador: cor, tom claro,
 * ícone e a etiqueta curta que aparece sobre cada relatório pronto.
 *
 * ## Por que isto não está no catálogo
 *
 * `dominio/relatorios/catalogo.ts` responde o que a plataforma **alcança** —
 * tabelas, campos, junções, permissão. Cor de cartão não é isso, e enfiá-la
 * lá obrigaria o domínio a saber que existe uma tela. O catálogo continua
 * sendo a fonte de quais assuntos existem; este arquivo só os veste.
 *
 * ## Por que há um padrão em vez de um erro
 *
 * Assunto novo sem entrada aqui sai no azul da marca, com o ícone genérico —
 * feio, nunca quebrado. A tela do Gerador não pode cair porque ninguém
 * escolheu uma cor, e um assunto que a pessoa tem direito de ver precisa
 * aparecer mesmo mal vestido (RN76). O esquecimento é pego pelo teste, que é
 * onde ele custa barato.
 *
 * ## As cores são as escuras, e isso é obrigatório
 *
 * Elas pintam **texto** — o nome do assunto no rodapé do cartão, a etiqueta
 * do relatório pronto, o ícone sobre o tom claro — e ainda recebem o branco
 * por cima quando o ícone acende no hover. Os tons vivos de cada família
 * (#465EFF, #1B8F5A…) não passam em AAA em nenhum dos dois papéis. O
 * `#3242C4` não é escolha nova: é o `--azul-superficie-aaa` que a plataforma
 * já reserva exatamente para branco sobre azul, e os outros quatro seguem a
 * mesma régua na sua própria família.
 */

export interface IdentidadeDeAssunto {
  /** Cor de texto e de traço. Escura por exigência de contraste — ver acima. */
  cor: string;
  /** Fundo do ícone em repouso e do relatório pronto em hover. */
  corClara: string;
  /** Etiqueta sobre cada relatório pronto — o nome inteiro não cabe ali. */
  curto: string;
  /** O `d` do traço do ícone, desenhado em `viewBox="0 0 24 24"`. */
  icone: string;
}

const GENERICO: IdentidadeDeAssunto = {
  cor: "#3242C4",
  corClara: "#F9F7FF",
  curto: "Relatório",
  icone: "M4 19.5h16M7 16V9M12 16V5.5M17 16v-4.5",
};

const POR_SLUG: Readonly<Record<string, IdentidadeDeAssunto>> = {
  ofertas: {
    cor: "#3242C4",
    corClara: "#F9F7FF",
    curto: "Ofertas",
    icone:
      "M20.6 13.4 12.5 5.3A2 2 0 0 0 11.1 4.7H5a1 1 0 0 0-1 1v6.1c0 .5.2 1 .6 1.4l8.1 8.1a2 2 0 0 0 2.8 0l5.1-5.1a2 2 0 0 0 0-2.8Z",
  },
  aliados: {
    cor: "#14603D",
    corClara: "#F2F8F5",
    curto: "Rede",
    icone: "M10.4 7.9 7.1 14.6M13.6 7.9l3.3 6.7M8 17h8",
  },
  funil: {
    cor: "#7A3E00",
    corClara: "#FCF6EF",
    curto: "Funil",
    icone: "M3.5 5h17l-6.5 7.6V20l-4-2.2v-5.2Z",
  },
  campanhas: {
    cor: "#4A1F7A",
    corClara: "#F8F4FC",
    curto: "Campanhas",
    icone: "M4 9h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8ZM9 9 10.5 4M15 9 13.5 4",
  },
  patrocinadores: {
    cor: "#0A4F5C",
    corClara: "#F1F8F9",
    curto: "Patrocínio",
    icone: "M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3.5 12.5h17M4.5 7.5h15v11h-15z",
  },
  /*
   * Os quatro da F26. **Os dois de telemetria ficam em famílias de cor
   * distantes de propósito** — ardósia e vinho —, e não em tons vizinhos da
   * mesma família. Eles são irmãos conceituais, e é exatamente por isso: a
   * RN68 existe para impedir que alguém os confunda, e vesti-los parecidos
   * trabalharia contra a regra que o catálogo separou em dois assuntos para
   * tornar estrutural.
   */
  "telemetria-catalogo": {
    cor: "#2E4057",
    corClara: "#F1F4F8",
    curto: "Contadores",
    icone: "M4 19.5h16M8 16.5V11M12.5 16.5V6.5M17 16.5v-3.5",
  },
  "telemetria-resgates": {
    cor: "#7A1F3D",
    corClara: "#FCF1F4",
    curto: "Resgates",
    icone: "M6 3.5h12v17l-3-1.7-3 1.7-3-1.7-3 1.7ZM9.5 8.5h5M9.5 12.5h5",
  },
  assinantes: {
    cor: "#5A5000",
    corClara: "#F8F7EC",
    curto: "Carteira",
    icone:
      "M9.6 10.8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3.5 19.2a6.1 6.1 0 0 1 12.2 0M16.4 10.2a2.5 2.5 0 1 0 0-5M18.2 19.2a5 5 0 0 0-2.4-4.3",
  },
  auditoria: {
    cor: "#44403C",
    corClara: "#F5F4F2",
    curto: "Trilha",
    icone: "M12 3.5 5 6.2v5c0 4.2 2.9 7.6 7 9.3 4.1-1.7 7-5.1 7-9.3v-5ZM9.3 12l2 2 3.4-3.7",
  },
};

export function identidadeDoAssunto(slug: string): IdentidadeDeAssunto {
  return POR_SLUG[slug] ?? GENERICO;
}

/** Os slugs vestidos — o teste confronta esta lista com a do catálogo. */
export const SLUGS_COM_IDENTIDADE = Object.keys(POR_SLUG);

/**
 * Os relatórios prontos de todos os assuntos que o papel alcança, achatados
 * numa lista só e já com a identidade do assunto de origem junto.
 *
 * A ordem é a do catálogo, e não alfabética: os assuntos estão declarados lá
 * na ordem em que as ondas os entregaram, que é também mais ou menos a ordem
 * de uso — Ofertas e Rede primeiro, Patrocinadores por último.
 */
export function relatoriosProntos(
  assuntos: ReadonlyArray<AssuntoRelatorio>,
): ReadonlyArray<{
  assuntoSlug: string;
  modeloSlug: string;
  nome: string;
  descricao: string;
  identidade: IdentidadeDeAssunto;
}> {
  return assuntos.flatMap((assunto) => {
    const identidade = identidadeDoAssunto(assunto.slug);
    return assunto.modelos.map((modelo) => ({
      assuntoSlug: assunto.slug,
      modeloSlug: modelo.slug,
      nome: modelo.nome,
      descricao: modelo.descricao,
      identidade,
    }));
  });
}
