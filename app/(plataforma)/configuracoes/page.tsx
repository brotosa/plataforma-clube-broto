import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { lerPoliticaDeSenha } from "@/infra/casos-de-uso/configuracoes";
import { FormularioPoliticaSenha } from "./formulario-politica-senha";

export const metadata: Metadata = {
  title: "Configurações",
};

/**
 * Configurações do portal — o irmão técnico/de segurança do Parametrizador.
 * Só o Administrador da Plataforma (CONFIGURAR_PORTAL): quem não é, é
 * redirecionado. Primeiro bloco: a política de senha (comprimento, classes de
 * caractere e histórico de senhas). Toda mudança é auditada.
 */
export default async function PaginaConfiguracoes() {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  if (!podeExecutar(sessao.user.papel, "CONFIGURAR_PORTAL")) {
    // A área é exclusiva do Administrador — quem não pode configurar volta à HOME.
    redirect("/");
  }

  const politica = await lerPoliticaDeSenha();

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 className="h-page">Configurações</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          Segurança e ajustes técnicos do portal · exclusivo do Administrador da Plataforma · toda
          escrita é auditada
        </div>
      </div>

      <h2 className="h-el" style={{ marginBottom: 4 }}>
        Política de senha
      </h2>
      <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
        Vale para toda troca de senha feita pelo próprio usuário. Aperte o quanto quiser — o padrão
        preserva o comportamento anterior (mínimo de 10 caracteres, sem exigência de classe).
      </p>

      <FormularioPoliticaSenha inicial={politica} />
    </div>
  );
}
