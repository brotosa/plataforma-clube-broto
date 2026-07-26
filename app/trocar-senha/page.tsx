import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { FormularioTroca } from "./formulario-troca";

export const metadata: Metadata = {
  title: "Trocar senha",
};

/**
 * Troca obrigatória no primeiro acesso (ficha §3).
 *
 * Mora FORA do grupo (plataforma), e é isso que faz a guarda funcionar sem
 * gambiarra: o layout do grupo redireciona para cá enquanto a credencial
 * for provisória, e como esta página não está sob aquele layout, não há
 * laço de redirecionamento — nenhum dos dois precisa saber em que rota
 * está. O caminho de volta é a checagem inversa aqui embaixo.
 *
 * A sessão continua exigida pelo middleware: trocar a senha é ato de quem
 * já entrou.
 */
export default async function PaginaTrocarSenha() {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  if (!sessao.user.trocaSenhaObrigatoria) {
    redirect("/");
  }

  return (
    <main className="tela" style={{ padding: "26px 32px 40px", maxWidth: 560, margin: "0 auto" }}>
      <h1 className="h-page">Defina sua senha</h1>
      <p className="cap" style={{ marginTop: 6, maxWidth: "52ch" }}>
        Sua credencial foi emitida pelo Administrador da Plataforma e é provisória. Escolha uma
        senha própria para continuar — enquanto ela não for definida, o acesso fica restrito a
        esta tela.
      </p>
      <div className="card" style={{ padding: "20px 22px", marginTop: 16 }}>
        <FormularioTroca />
      </div>
    </main>
  );
}
