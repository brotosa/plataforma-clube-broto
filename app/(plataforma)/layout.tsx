import { redirect } from "next/navigation";
import { auth, signOut } from "@/infra/auth";
import { ROTULOS_PAPEL } from "@/dominio/autorizacao/papeis";
import { pendenciasDeHoje } from "@/infra/consultas/dashboard";
import { contarPendenciasQueMencionam } from "@/infra/consultas/comentarios";
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
  // Ficha §3 — credencial provisória só navega para a troca de senha. A
  // tela de troca mora fora deste grupo, então não há laço: ela não passa
  // por aqui, e redireciona de volta assim que a senha deixa de ser
  // provisória.
  if (sessao.user.trocaSenhaObrigatoria) {
    redirect("/trocar-senha");
  }

  // Sino do cabeçalho (Onda 7 §7): as MESMAS seis contagens que a HOME
  // exibe como cartões, apuradas aqui e passadas prontas. O sino não
  // consulta por conta própria — é o que garante que ele não possa divergir
  // da HOME, e o que o teste da igualdade cobra.
  // As pendências operacionais (== HOME) e, à parte, as pendências pessoais
  // que mencionam quem está logado — esta última é derivada e some sozinha
  // quando a pendência é resolvida (não é fila nem lido/não-lido).
  const [pendencias, mencoesAbertas] = await Promise.all([
    pendenciasDeHoje(),
    contarPendenciasQueMencionam(sessao.user.id),
  ]);

  return (
    <ShellPlataforma
      usuario={{
        nome: sessao.user.nome,
        rotuloPapel: ROTULOS_PAPEL[sessao.user.papel],
      }}
      sair={sair}
      pendencias={pendencias}
      mencoesAbertas={mencoesAbertas}
    >
      {children}
    </ShellPlataforma>
  );
}
