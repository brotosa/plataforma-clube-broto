import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { lerPoliticaDeSenha } from "@/infra/casos-de-uso/configuracoes";
import { descreverPolitica } from "@/dominio/usuarios/politica-senha";
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

  const [politica, usuario] = await Promise.all([
    lerPoliticaDeSenha(),
    prisma.usuario.findUnique({
      where: { id: sessao.user.id },
      select: { trocaSenhaObrigatoria: true },
    }),
  ]);

  /*
   * POR QUE a pessoa está aqui — e são dois motivos, não um.
   *
   * O `trocaSenhaObrigatoria` da SESSÃO é a soma de duas coisas: a marca
   * gravada na conta (credencial provisória emitida pelo Administrador) e o
   * vencimento periódico (RN72), que o callback `jwt` calcula a cada
   * requisição sem gravar nada. Quando a marca está apagada e mesmo assim a
   * pessoa chegou aqui, o motivo só pode ser o vencimento.
   *
   * A distinção não é enfeite: o texto único dizia a quem teve a senha
   * vencida que "sua credencial foi emitida pelo Administrador da
   * Plataforma", o que é simplesmente falso — essa pessoa escolheu a própria
   * senha, ninguém lhe transmitiu nada, e ela ficaria procurando um
   * administrador que não fez nada.
   */
  const porVencimento = usuario !== null && !usuario.trocaSenhaObrigatoria;

  return (
    <main className="tela" style={{ padding: "26px 32px 40px", maxWidth: 560, margin: "0 auto" }}>
      <h1 className="h-page">{porVencimento ? "Sua senha venceu" : "Defina sua senha"}</h1>
      <p className="cap" style={{ marginTop: 6, maxWidth: "52ch" }}>
        {porVencimento ? (
          <>
            A política do portal exige troca a cada {politica.validadeDias} dias, e o prazo da sua
            senha passou. Escolha uma nova para continuar — enquanto ela não for definida, o acesso
            fica restrito a esta tela. Sua sessão não caiu: nada do que você já salvou se perdeu.
          </>
        ) : (
          <>
            Sua credencial foi emitida pelo Administrador e é provisória. Escolha uma
            senha própria para continuar — enquanto ela não for definida, o acesso fica restrito a
            esta tela.
          </>
        )}
      </p>
      <div className="card" style={{ padding: "20px 22px", marginTop: 16 }}>
        <FormularioTroca
          descricao={descreverPolitica(politica)}
          comprimentoMin={politica.comprimentoMin}
        />
      </div>
    </main>
  );
}
