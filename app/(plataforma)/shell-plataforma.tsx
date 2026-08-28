"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { PendenciaApurada } from "@/dominio/dashboard/indicadores";
import { secaoParaOrigem } from "@/dominio/ajuda/mapa-contextual";
import { SinoPendencias } from "./sino-pendencias";

/**
 * Shell da plataforma — reprodução fiel do protótipo: sidebar azul
 * colapsável com os dez módulos, área de marca no azul institucional,
 * header com busca global, sino de pendências e usuário.
 *
 * F13 (Onda 6): os três últimos itens desligados — Dashboard, Usuários e
 * Auditoria — ganham rota. Com eles a sidebar fica inteira ativa, e o
 * Dashboard passa a ser a HOME (rota `/`).
 *
 * F14 (Onda 7, ficha §5) — **correção de fidelidade da marca**. O
 * implementado divergia do protótipo aprovado: a área de marca dentro da
 * `<aside>` era branca, e somada ao header branco produzia uma faixa clara
 * atravessando o topo inteiro, com o logo na variante azul/verde. O
 * protótipo define o contrário — o azul institucional da lateral **sobe até
 * o topo**, envolvendo a marca, e o header branco vive só na área de
 * conteúdo, à direita da lateral.
 *
 * A troca do logo não é preferência: a variante amarelo/verde existe
 * justamente para fundo azul, e usar a azul/verde exige fundo claro. Foi
 * essa inversão que produziu a faixa branca.
 *
 * A entrega do Design ofereceu duas variantes de topo (clara e azul).
 * Decisão da Superintendência: **apenas a azul permanece** — sem
 * alternador e sem código morto, então a variante clara simplesmente não
 * existe aqui.
 */

interface ItemNavegacao {
  rotulo: string;
  /** Rota do módulo; null = módulo de onda futura (desabilitado). */
  href: string | null;
  /** Path do ícone (stroke 24×24), copiado do protótipo v2.1. */
  icone: string;
}

/** Ordem e ícones idênticos ao navDefs do protótipo v2.1. */
const ITENS_NAVEGACAO: ReadonlyArray<ItemNavegacao> = [
  { rotulo: "Dashboard", href: "/", icone: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { rotulo: "Mercado & Scout", href: "/mercado", icone: "m21 21-4.3-4.3M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0" },
  {
    rotulo: "Aliados & Soluções",
    href: "/aliados",
    icone:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M12.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
  },
  {
    rotulo: "Ofertas",
    href: "/ofertas",
    icone: "M12 2H2v10l9.3 9.3a1.5 1.5 0 0 0 2.1 0l7.9-7.9a1.5 1.5 0 0 0 0-2.1zM7 7h.01",
  },
  {
    rotulo: "Campanhas & Cestas",
    href: "/campanhas",
    icone: "m5 11 4-7M19 11l-4-7M2 11h20l-2 9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
  },
  {
    rotulo: "Assinantes",
    href: "/assinantes",
    icone: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M16 11l2 2 4-4",
  },
  {
    // Onda 12 — logo APÓS Assinantes (prompt §4): o patrocinador é quem
    // paga a assinatura patrocinada, e a leitura natural é a base primeiro,
    // quem a custeia em seguida.
    rotulo: "Patrocinadores",
    href: "/patrocinadores",
    icone: "M20 7h-3V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2M9 5h6v2H9zM2 12h20",
  },
  { rotulo: "Aprovações", href: "/aprovacoes", icone: "M22 11.1V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" },
  {
    rotulo: "Parametrizador",
    href: "/parametrizador",
    icone: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  },
  { rotulo: "Usuários", href: "/usuarios", icone: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0" },
  { rotulo: "Auditoria", href: "/auditoria", icone: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" },
];

function Icone({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Item ativo da sidebar. O Dashboard mora em `/` (é a HOME), e prefixo não
 * serve para ele: toda rota começa com "/" e o item ficaria aceso em todas
 * as telas. Raiz casa por igualdade; os demais, por prefixo de segmento —
 * `/aliados` não pode acender em uma futura `/aliados-externos`.
 */
function estaAtivo(rota: string, href: string): boolean {
  if (href === "/") {
    return rota === "/";
  }
  return rota === href || rota.startsWith(`${href}/`);
}

/**
 * Rodapé institucional (ficha Onda 7 §4).
 *
 * A versão vem do `version` do `package.json`, injetada no build por
 * `next.config.ts` — nunca digitada aqui. O rótulo anterior ("Ondas 1–2 ·
 * Aliados, Ofertas e Mercado") era factualmente incorreto desde a Onda 3 e
 * impróprio para usuário final; a lição é que texto de produto que descreve
 * o estado do desenvolvimento envelhece calado.
 */
const versao = process.env.NEXT_PUBLIC_VERSAO_APP ?? "—";
const ambiente = process.env.NEXT_PUBLIC_AMBIENTE ?? "";
const commitCurto = process.env.NEXT_PUBLIC_COMMIT_CURTO ?? "";

/**
 * Segunda linha só fora de produção: serve para ninguém apresentar uma
 * preview acreditando estar na plataforma no ar. Em produção é string
 * vazia, e a linha não é renderizada.
 */
const ambienteVisivel =
  ambiente && ambiente !== "production"
    ? [ambiente, commitCurto].filter(Boolean).join(" · ")
    : "";

function iniciaisDe(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .map((parte) => parte.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  const primeira = partes[0]?.charAt(0) ?? "";
  const segunda = partes[1]?.charAt(0) ?? "";
  return (primeira + segunda).toUpperCase() || "?";
}

export function ShellPlataforma({
  usuario,
  sair,
  pendencias,
  mencoesAbertas = 0,
  children,
}: {
  usuario: { nome: string; rotuloPapel: string };
  /** Server action de logout (Auth.js). */
  sair: () => Promise<void>;
  /**
   * As mesmas seis contagens que a HOME exibe como cartões — apuradas no
   * layout e passadas prontas. O sino não consulta nada por conta própria:
   * é a garantia estrutural de que ele não pode divergir da HOME.
   */
  pendencias: ReadonlyArray<PendenciaApurada>;
  /** Pendências que mencionam o usuário — linha pessoal, à parte das da HOME. */
  mencoesAbertas?: number;
  children: React.ReactNode;
}) {
  const [recolhida, setRecolhida] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const rota = usePathname();
  const busca = useSearchParams();

  /**
   * Endereço da ajuda contextual (Onda 9, RN59).
   *
   * A origem carrega a query porque em algumas seções ela *é* a tela: em
   * Mercado & Scout, Funil, Cobertura e Metas diferem só pelo `?aba=`, e a
   * ficha §1.3 manda as três abrirem seções diferentes do guia. Sem a
   * query, Metas abriria em 4.1 e a volta devolveria ao Funil.
   *
   * A seção vai na âncora, e não em parâmetro: `/ajuda#j4` é endereço que
   * se compartilha, que o navegador reposiciona sozinho e que sobrevive à
   * impressão.
   */
  const consulta = busca.toString();
  const origemDaAjuda = consulta ? `${rota}?${consulta}` : rota;
  const enderecoDaAjuda = `/ajuda?de=${encodeURIComponent(origemDaAjuda)}#${secaoParaOrigem(origemDaAjuda)}`;
  const rotuloDaAjuda = "Ajuda — abrir o guia da plataforma";

  const classeAside = ["aside", recolhida ? "col" : "", menuAberto ? "open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--off)" }}>
      {/* Onda 14 — primeiro elemento focável do shell, antes da lateral.
          Âncora nativa, e não `<Link>`: o destino é um id da própria
          página, então não há rota a trocar nem payload a buscar. */}
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      {/* fix AAA (F5): há mais de um landmark `complementary` nas telas com
          painel lateral (régua da T3, pré-visualização da T5) — sem nome
          acessível eles ficam indistinguíveis (axe: landmark-unique). */}
      <aside className={classeAside} aria-label="Menu lateral">
        {/* Área de marca SEM fundo próprio: o azul da lateral atravessa até o
            topo, que é o desenho aprovado. Sem borda e sem sombra — elas
            existiam para separar a faixa branca do resto e agora só sujariam
            o azul contínuo. */}
        {recolhida ? (
          <div
            style={{
              height: 59,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 -6px 14px 0",
            }}
          >
            <Image
              src="/logos/logo-broto-simbolo-amarelo.svg"
              alt="Broto"
              width={40}
              height={23}
              style={{ height: 23, width: "auto", display: "block" }}
            />
          </div>
        ) : (
          <div
            style={{
              height: 59,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              // fix de fidelidade (pós-Onda 7): sem isto o `align-items` do
              // flex é `stretch`, o <img> ocupa a largura inteira da lateral
              // (216px) e o SVG — que não declara `preserveAspectRatio` —
              // assume o padrão `xMidYMid` e desenha a marca CENTRADA dentro
              // dessa caixa. O logo aparecia ~58px à direita do recuo dos
              // itens do menu. `flex-start` faz caixa e conteúdo coincidirem.
              alignItems: "flex-start",
              gap: 3,
              // Mesmo recuo dos ícones do menu (`.sidebar-it`), para a marca
              // e a navegação compartilharem a mesma coluna de leitura.
              paddingLeft: 20,
              margin: "0 -12px 14px 0",
            }}
          >
            <Image
              src="/logos/logo-broto-amarelo-verde.svg"
              alt="Broto"
              width={100}
              height={19}
              // `max-content` é o que o protótipo v9.1 usa: com a altura
              // definida, a largura sai da proporção do SVG (295×56 → 100px),
              // e não da caixa disponível.
              style={{ height: 19, width: "max-content", display: "block" }}
            />
            {/* fix AAA (F14): o protótipo pinta este descritivo em
                --azul-claro, que mede 3,7:1 sobre o azul da lateral e reprova
                em AAA. Branco é o maior contraste possível neste fundo —
                mesma decisão que a F5 já havia tomado para a legenda do
                rodapé. Medição em docs/acessibilidade-aaa.md. */}
            {/* F16 (ficha §2) — o descritivo passa a "Plataforma de gestão
                do Clube". É mais longo do que o anterior e a lateral tem
                largura fixa, então a quebra é controlada em vez de sorteada:
                o espaço entre "do" e "Clube" é inquebrável, de modo que a
                segunda linha, quando existir, seja "do Clube" e nunca
                "Clube" sozinho. `lineHeight` apertado porque duas linhas de
                legenda não podem empurrar o menu para baixo. */}
            <div
              className="cap"
              style={{ color: "var(--branco)", fontSize: 11, lineHeight: 1.25, maxWidth: "100%" }}
            >
              Plataforma de gestão do&nbsp;Clube
            </div>
          </div>
        )}

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Módulos">
          {ITENS_NAVEGACAO.map((item) =>
            item.href ? (
              <Link
                key={item.rotulo}
                href={item.href}
                className={estaAtivo(rota, item.href) ? "sidebar-it on" : "sidebar-it"}
                aria-current={estaAtivo(rota, item.href) ? "page" : undefined}
                title={item.rotulo}
                style={{ textDecoration: "none" }}
                onClick={() => setMenuAberto(false)}
              >
                <Icone path={item.icone} />
                <span className="sit-label">{item.rotulo}</span>
              </Link>
            ) : (
              <button
                key={item.rotulo}
                type="button"
                className="sidebar-it off"
                aria-disabled="true"
                title="Disponível em onda futura"
              >
                <Icone path={item.icone} />
                <span className="sit-label">{item.rotulo}</span>
              </button>
            ),
          )}
        </nav>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Manual do usuário no menu lateral — só no modo mobile
              (`.manual-no-menu`), porque a 380px o botão do cabeçalho é
              escondido para o "?" caber na ponta direita (RN da Onda 10). No
              desktop o acesso continua sendo o botão do cabeçalho, ao lado do
              "?". */}
          <Link
            href="/manual"
            className="sidebar-it manual-no-menu"
            title="Manual do usuário — o que cada papel pode fazer"
            style={{ textDecoration: "none" }}
            onClick={() => setMenuAberto(false)}
          >
            <Icone path="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <span className="sit-label">Manual do usuário</span>
          </Link>
          {/* fix AAA: no protótipo esta legenda usa --azul-claro (3,7:1 sobre
              o azul); branco é o maior contraste possível neste fundo */}
          {!recolhida ? (
            <div style={{ paddingLeft: 20, color: "var(--branco)" }} className="cap">
              Elaborado por Broto S.A. · v{versao}
              {ambienteVisivel ? (
                <span style={{ display: "block", opacity: 0.8 }}>{ambienteVisivel}</span>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="sidebar-it"
            onClick={() => setRecolhida((r) => !r)}
            aria-label="Recolher ou expandir menu"
            aria-expanded={!recolhida}
          >
            <Icone path={recolhida ? "m13 17 5-5-5-5M6 17l5-5-5-5" : "m11 17-5-5 5-5M18 17l-5-5 5-5"} />
            <span className="sit-label">Recolher</span>
          </button>
        </div>
      </aside>

      {menuAberto ? (
        <button className="backdrop" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
      ) : null}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: "var(--branco)",
            borderBottom: "1px solid var(--borda)",
            padding: "10px 28px",
            flex: "none",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost menu-btn"
            style={{ width: 38, height: 38, padding: 0, borderRadius: "50%", flex: "none" }}
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Busca global: form GET nativo para a rota de resultados. Antes
              o `onSubmit` só chamava preventDefault e o campo não buscava
              nada — agora navega para /busca?q=, que consulta aliados,
              soluções e ofertas. GET nativo funciona sem JavaScript e troca
              de rota (não é navegação só-query, então não cai na ressalva do
              Router Cache). */}
          <form
            role="search"
            action="/busca"
            method="get"
            style={{ position: "relative", width: "min(420px,40vw)" }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="var(--paragrafo)"
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="input"
              style={{ borderRadius: "var(--r-pill)", paddingLeft: 38, height: 38 }}
              placeholder="Buscar aliados, soluções e ofertas…"
              aria-label="Busca global"
              type="search"
              name="q"
            />
          </form>

          <div style={{ flex: 1 }} />


          {/* F14: o `title` antigo prometia "alertas de vigência e janela
              contratual chegam com a carga de dados" — alertas que nunca
              existiriam. Saiu junto com o botão decorativo. */}
          <SinoPendencias pendencias={pendencias} mencoesAbertas={mencoesAbertas} />

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="dot-avatar" aria-hidden="true">
              {iniciaisDe(usuario.nome)}
            </span>
            <div className="user-meta">
              <div style={{ font: "var(--font-body-label-bold)" }}>{usuario.nome}</div>
              <div className="cap">{usuario.rotuloPapel}</div>
            </div>
            <form action={sair}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Sair
              </button>
            </form>
          </div>

          {/*
            F17 (ficha Onda 10 §2) — a ajuda passa para a EXTREMIDADE
            DIREITA, como último elemento da barra, depois do bloco de
            identidade e do papel. Inverte o racional da Onda 9 ("ajuda
            antes do alerta") por decisão da Superintendência, e a
            consequência é desejável: a ajuda vira o último item na ordem
            de tabulação do cabeçalho, o que é apropriado para algo que
            não é ação urgente.

            Âncora e não `<Link>`: o endereço leva query (`?de=`) e âncora
            (`#secao`), e a convenção do repositório manda âncora sempre
            que a query participa da navegação. A navegação de documento
            também é o que faz o navegador posicionar a seção sozinho.
          */}
          {/* Manual do usuário — ao lado do "?", antes dele para o "?" seguir
              sendo o último item da barra (decisão F17). Rota fixa, sem query
              e sem contexto: `<Link>` é o padrão para troca de rota.

              `btn-manual-topo`: a 380px o cabeçalho não comporta mais um
              botão sem empurrar o "?" para fora da tela — e a RN da Onda 10
              exige o "?" alcançável na ponta direita a 380px. No modo mobile
              (≤760px, onde o hambúrguer assume) este botão some do cabeçalho
              e reaparece como item do menu lateral (`.manual-no-menu`). */}
          <Link
            className="btn btn-ghost btn-manual-topo"
            style={{ width: 38, height: 38, padding: 0, borderRadius: "50%", flex: "none" }}
            href="/manual"
            aria-label="Manual do usuário — o que cada papel pode fazer"
            title="Manual do usuário — o que cada papel pode fazer"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </Link>
          <a
            className="btn btn-ghost"
            style={{ width: 38, height: 38, padding: 0, borderRadius: "50%", flex: "none" }}
            href={enderecoDaAjuda}
            aria-label={rotuloDaAjuda}
            title={rotuloDaAjuda}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
              <path d="M12 17h.01" />
            </svg>
          </a>
        </header>

        {/* `tabIndex={-1}` é o que faz o atalho entregar o FOCO, e não só
            a rolagem: sem ele o navegador move a viewport e o próximo Tab
            recomeça do topo do documento, na lateral que se quis pular. */}
        <main id="conteudo" tabIndex={-1} style={{ flex: 1, overflow: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
