import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { listarUsuarios } from "@/infra/consultas/usuarios";
import { TabelaUsuarios } from "./tabela-usuarios";

export const metadata: Metadata = {
  title: "Usuários",
};

/**
 * T27 — Usuários (Onda 6, ficha §3).
 *
 * A leitura é de todos os papéis: saber quem tem acesso à plataforma é
 * parte da governança que esta onda torna visível. A escrita é só do
 * Administrador (RN46) — quem não é vê a tabela com o aviso de somente
 * leitura, e a API recusaria de todo jeito.
 */
export default async function PaginaUsuarios() {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const podeGerir = podeExecutar(sessao.user.papel, "GERIR_USUARIOS");
  const usuarios = await listarUsuarios();

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <TabelaUsuarios usuarios={usuarios} podeGerir={podeGerir} />
    </div>
  );
}
