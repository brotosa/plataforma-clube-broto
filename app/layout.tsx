import type { Metadata } from "next";
import "@/design/tokens.css";
import "@/design/dseed-admin.css";
import "./fontes.css";

export const metadata: Metadata = {
  title: {
    default: "Plataforma de administração · Clube Broto",
    template: "%s · Clube Broto",
  },
  description:
    "Plataforma de Administração e Gestão do Clube Broto — Onda 1: Aliados, Soluções e Ofertas.",
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
