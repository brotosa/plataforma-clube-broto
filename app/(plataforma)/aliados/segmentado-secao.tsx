import Link from "next/link";

/**
 * Segmentado da seção Aliados & Soluções — Lista · Cobertura · Mapa da rede.
 *
 * As três telas (T1, T29, T30) são leituras do MESMO cadastro, e o protótipo
 * v9.1 as trata como abas de um módulo só. Componente compartilhado porque
 * duplicar três âncoras em três arquivos é como uma delas fica para trás
 * quando a quarta leitura chegar.
 *
 * Âncoras e não botões: a troca é navegação de rota, funciona sem JS,
 * preserva histórico e foco do teclado — mesmo padrão que a F6 adotou no
 * alternador Kanban ⇄ Tabela da T8 (`.seg a` em `dseed-admin.css`).
 */

export type VisaoDaSecao = "LISTA" | "COBERTURA" | "MAPA";

const VISOES: ReadonlyArray<{ visao: VisaoDaSecao; rotulo: string; href: string }> = [
  { visao: "LISTA", rotulo: "Lista", href: "/aliados" },
  { visao: "COBERTURA", rotulo: "Cobertura", href: "/aliados/cobertura" },
  { visao: "MAPA", rotulo: "Mapa da rede", href: "/aliados/mapa" },
];

export function SegmentadoDaSecao({ ativa }: { ativa: VisaoDaSecao }) {
  return (
    <nav className="seg" aria-label="Visões de Aliados &amp; Soluções">
      {VISOES.map(({ visao, rotulo, href }) => (
        <Link
          key={visao}
          href={href}
          className={visao === ativa ? "on" : ""}
          aria-current={visao === ativa ? "page" : undefined}
        >
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}
