import { redirect } from "next/navigation";
import { auth, signOut } from "@/infra/auth";
import { ROTULOS_PAPEL } from "@/dominio/autorizacao/papeis";
import { ShellPlataforma } from "./shell-plataforma";

async function sair() {
  "use server";
  await signOut({ redirectTo: "/entrar" });
}

export default async function LayoutPlataforma({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }

  return (
    <ShellPlataforma
      usuario={{
        nome: sessao.user.nome,
        rotuloPapel: ROTULOS_PAPEL[sessao.user.papel],
      }}
      sair={sair}
    >
      {children}
    </ShellPlataforma>
  );
}
