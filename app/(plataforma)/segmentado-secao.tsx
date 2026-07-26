/**
 * Segmentado de seção — o alternador entre as leituras de um mesmo módulo.
 *
 * Nasceu na F14 para a seção Aliados & Soluções (Lista · Cobertura · Mapa da
 * rede) e passou a servir também Mercado & Scout (Funil · Cobertura · Metas),
 * que já tinha o mesmo padrão escrito à mão numa linha própria. **Um
 * componente para as duas seções**: enquanto o padrão vivia duplicado, ele
 * divergia — e foi exatamente o que aconteceu, com um segmentado no cabeçalho
 * e o outro embaixo dele.
 *
 * Por isso o módulo subiu um nível na árvore: pertencer a `aliados/` era
 * verdade quando só aquela seção o usava, e deixou de ser.
 *
 * Âncoras e não botões: a troca é navegação de rota, funciona sem JS,
 * preserva histórico e foco do teclado — mesmo padrão que a F6 adotou no
 * alternador Kanban ⇄ Tabela da T8 (`.seg a` em `dseed-admin.css`).
 *
 * **`<a>` e não `<Link>`, e isto é decisão medida.** Em Mercado as três
 * visões diferem apenas na querystring (`/mercado`, `/mercado?aba=…`), e o
 * `<Link>` do App Router **não confirma** essa transição: ele intercepta o
 * clique, busca o payload RSC (200, `text/x-component`) e descarta — a URL
 * não muda e a tela não repinta. Medido em 12 tentativas: 12 falhas com
 * `<Link>`, 0 com `<a>`. A âncora faz navegação de documento, sempre
 * funciona e não custa nada numa tela renderizada no servidor.
 */

export interface VisaoDeSecao {
  /** Identidade estável da visão; casa com o `ativa` de quem renderiza. */
  chave: string;
  rotulo: string;
  href: string;
}

/** Aliados & Soluções — T1 · T29 · T30. */
export const VISOES_DE_ALIADOS: ReadonlyArray<VisaoDeSecao> = [
  { chave: "LISTA", rotulo: "Lista", href: "/aliados" },
  { chave: "COBERTURA", rotulo: "Cobertura", href: "/aliados/cobertura" },
  { chave: "MAPA", rotulo: "Mapa da rede", href: "/aliados/mapa" },
];

/**
 * Mercado & Scout — T8 · T13 · T14.
 *
 * As chaves são os próprios valores do parâmetro `aba` da rota, para o
 * chamador passar `ativa={aba}` sem tradução no meio — tradução é onde as
 * duas listas voltariam a divergir.
 */
export const VISOES_DE_MERCADO: ReadonlyArray<VisaoDeSecao> = [
  { chave: "funil", rotulo: "Funil", href: "/mercado" },
  { chave: "cobertura", rotulo: "Cobertura", href: "/mercado?aba=cobertura" },
  { chave: "metas", rotulo: "Metas", href: "/mercado?aba=metas" },
];

export function SegmentadoDaSecao({
  nome,
  visoes,
  ativa,
}: {
  /** Nome acessível do grupo — há mais de um `.seg` por tela em algumas. */
  nome: string;
  visoes: ReadonlyArray<VisaoDeSecao>;
  /** `chave` da visão corrente. */
  ativa: string;
}) {
  return (
    <nav className="seg" aria-label={nome}>
      {visoes.map(({ chave, rotulo, href }) => (
        <a
          key={chave}
          href={href}
          className={chave === ativa ? "on" : ""}
          aria-current={chave === ativa ? "page" : undefined}
        >
          {rotulo}
        </a>
      ))}
    </nav>
  );
}
