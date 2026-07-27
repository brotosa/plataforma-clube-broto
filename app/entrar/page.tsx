import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/infra/auth";

export const metadata: Metadata = {
  title: "Entrar",
};

async function autenticar(dados: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: dados.get("email"),
      senha: dados.get("senha"),
      // T26 é a HOME da plataforma (ficha Onda 6 §2).
      redirectTo: "/",
    });
  } catch (erro) {
    if (erro instanceof AuthError) {
      redirect("/entrar?erro=credenciais");
    }
    throw erro; // NEXT_REDIRECT do fluxo de sucesso passa adiante
  }
}

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sessao = await auth();
  if (sessao?.user) {
    redirect("/");
  }
  const { erro } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--off)",
      }}
    >
      <div
        className="card"
        style={{
          width: "min(400px, 100%)",
          padding: "36px 32px 32px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
          <Image
            src="/logos/logo-broto-azul-verde.svg"
            alt="Broto"
            width={137}
            height={26}
            priority
            style={{ height: 26, width: "auto" }}
          />
          {/* F15 — descritivo da marca. Aqui vai o nome inteiro, diferente
              da lateral: naquela o logo logo acima já diz "Broto", e repetir
              soaria redundante; nesta o logo é a marca institucional
              isolada, então o descritivo precisa nomear o sistema por
              completo.
              F16 (ficha §2) — o rótulo de interface passa a "Plataforma de
              gestão do Clube Broto". O nome formal do sistema ("Plataforma
              de Administração e Gestão do Clube Broto") não muda: ele
              continua na documentação e no cabeçalho do kit da Minutrade. */}
          <p className="cap" style={{ margin: 0 }}>
            Plataforma de gestão do Clube Broto
          </p>
        </div>

        <h1 className="h-el" style={{ marginBottom: 16 }}>
          Entrar
        </h1>

        {erro === "credenciais" ? (
          <p
            role="alert"
            className="cap"
            style={{
              color: "var(--erro-texto-aaa)",
              background: "var(--erro-claro)",
              border: "1px solid var(--erro)",
              borderRadius: "var(--r-sm)",
              padding: "10px 12px",
              margin: "0 0 16px",
            }}
          >
            E-mail ou senha inválidos. Verifique os dados e tente novamente.
          </p>
        ) : null}

        <form action={autenticar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label htmlFor="campo-email">E-mail</label>
            <input
              id="campo-email"
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="campo-senha">Senha</label>
            <input
              id="campo-senha"
              className="input"
              type="password"
              name="senha"
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="btn btn-azul" style={{ marginTop: 4 }}>
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
