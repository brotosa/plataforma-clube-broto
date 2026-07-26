import type { Metadata } from "next";
import "@/design/tokens.css";
import "@/design/dseed-admin.css";
import "./fontes.css";

export const metadata: Metadata = {
  title: {
    default: "Gestão do Clube Broto",
    template: "%s · Clube Broto",
  },
  // F15 — a descrição citava "Onda 1", obsoleta desde a Onda 2. O texto
  // novo nomeia os módulos que existem hoje, na ordem do menu lateral.
  description:
    "Gestão do Clube Broto — mercado e scout, aliados e soluções, ofertas, campanhas e cestas, assinantes, aprovações, parametrizador, usuários e auditoria.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
