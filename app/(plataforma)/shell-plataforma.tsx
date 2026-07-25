"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Shell da plataforma — reprodução fiel do protótipo v2.1: sidebar azul
 * colapsável com os dez módulos (somente os da Onda 1 ativos), faixa de
 * marca clara, header com busca global, notificações e usuário.
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
  { rotulo: "Dashboard", href: null, icone: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" },
  { rotulo: "Mercado & Scout", href: null, icone: "m21 21-4.3-4.3M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0" },
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
  { rotulo: "Campanhas & Cestas", href: null, icone: "m5 11 4-7M19 11l-4-7M2 11h20l-2 9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" },
  {
    rotulo: "Assinantes",
    href: null,
    icone: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M16 11l2 2 4-4",
  },
  { rotulo: "Aprovações", href: "/aprovacoes", icone: "M22 11.1V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" },
  {
    rotulo: "Parametrizador",
    href: null,
    icone: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  },
  { rotulo: "Usuários", href: null, icone: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0" },
  { rotulo: "Auditoria", href: null, icone: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" },
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
  children,
}: {
  usuario: { nome: string; rotuloPapel: string };
  /** Server action de logout (Auth.js). */
  sair: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [recolhida, setRecolhida] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const rota = usePathname();

  const classeAside = ["aside", recolhida ? "col" : "", menuAberto ? "open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--off)" }}>
      <aside className={classeAside}>
        {recolhida ? (
          <div
            style={{
              height: 59,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--branco)",
              borderBottom: "1px solid var(--borda)",
              margin: "0 -6px 14px 0",
              boxShadow: "0 1px 0 var(--borda)",
            }}
          >
            <Image
              src="/logos/logo-broto-simbolo-azul.svg"
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
              gap: 3,
              background: "var(--branco)",
              borderBottom: "1px solid var(--borda)",
              paddingLeft: 20,
              margin: "0 -12px 14px 0",
              boxShadow: "0 1px 0 var(--borda)",
            }}
          >
            <Image
              src="/logos/logo-broto-azul-verde.svg"
              alt="Broto"
              width={100}
              height={19}
              style={{ height: 19, width: "auto", display: "block" }}
            />
            <div className="cap" style={{ color: "var(--paragrafo-aaa)", fontSize: 11 }}>
              Plataforma de administração
            </div>
          </div>
        )}

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }} aria-label="Módulos">
          {ITENS_NAVEGACAO.map((item) =>
            item.href ? (
              <Link
                key={item.rotulo}
                href={item.href}
                className={rota.startsWith(item.href) ? "sidebar-it on" : "sidebar-it"}
                aria-current={rota.startsWith(item.href) ? "page" : undefined}
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
          {/* fix AAA: no protótipo esta legenda usa --azul-claro (3,7:1 sobre
              o azul); branco é o maior contraste possível neste fundo */}
          {!recolhida ? (
            <div style={{ paddingLeft: 20, color: "var(--branco)" }} className="cap">
              Onda 1 · Aliados, Soluções e Ofertas
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

          <form
            role="search"
            style={{ position: "relative", width: "min(420px,40vw)" }}
            onSubmit={(evento) => evento.preventDefault()}
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
              name="busca"
            />
          </form>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 38, height: 38, padding: 0, borderRadius: "50%" }}
            aria-label="Notificações"
            title="Alertas de vigência e janela contratual chegam com a carga de dados"
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
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </button>

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
        </header>

        <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
      </div>
    </div>
  );
}
