/**
 * Peças compartilhadas das telas T15–T17 (protótipo v6.1). Componentes de
 * servidor: só marcação e texto — nenhum estado.
 */

const TEXTO_LEITURA: Record<"hub" | "lista" | "valores", string> = {
  hub: "Visualização — a edição de parâmetros é restrita ao Administrador da Plataforma. Tudo aqui é visível a todos os papéis por transparência da configuração vigente.",
  lista: "Visualização — edição restrita ao Administrador da Plataforma.",
  valores: "Visualização — edição restrita ao Administrador da Plataforma.",
};

/** Banner de leitura para quem não é Administrador (RN23). */
export function AvisoDeLeitura({ contexto }: { contexto: "hub" | "lista" | "valores" }) {
  return (
    <div className="aviso-inline">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ flex: "none" }}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span>{TEXTO_LEITURA[contexto]}</span>
    </div>
  );
}

export function IconeCadeado() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <rect x="4" y="11" width="16" height="10" rx="1" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Aviso neutro com ícone à esquerda (escudo, relógio ou informação). */
export function AvisoNeutro({
  icone,
  children,
}: {
  icone: "escudo" | "relogio";
  children: React.ReactNode;
}) {
  return (
    <div
      className="aviso-inline"
      style={{ background: "var(--off)", borderColor: "var(--borda)" }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ flex: "none" }}
      >
        {icone === "escudo" ? (
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        ) : (
          <>
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </>
        )}
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** Estado vazio no padrão institucional das demais telas. */
export function EstadoVazio({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="vazio">
        <h2 className="h-el">{titulo}</h2>
        <p className="cap" style={{ maxWidth: "46ch", margin: 0 }}>
          {texto}
        </p>
        {children}
      </div>
    </div>
  );
}
