import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import {
  lerPoliticaDeLogin,
  lerPoliticaDeSenha,
  lerPoliticaDeSessao,
  lerPoliticaDeOrigem,
} from "@/infra/casos-de-uso/configuracoes";
import { listarLoginsBloqueados } from "@/infra/casos-de-uso/bloqueio-login";
import { listarOrigensBloqueadas } from "@/infra/casos-de-uso/bloqueio-origem";
import { FormularioPoliticaSenha } from "./formulario-politica-senha";
import { FormularioTempoSessao } from "./formulario-tempo-sessao";
import { FormularioBloqueioLogin } from "./formulario-bloqueio-login";
import { ListaBloqueados } from "./lista-bloqueados";
import { FormularioBloqueioOrigem } from "./formulario-bloqueio-origem";
import { ListaOrigens } from "./lista-origens";

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

  const [politica, politicaSessao, politicaLogin, bloqueados, politicaOrigem, origens] =
    await Promise.all([
      lerPoliticaDeSenha(),
      lerPoliticaDeSessao(),
      lerPoliticaDeLogin(),
      listarLoginsBloqueados(),
      lerPoliticaDeOrigem(),
      listarOrigensBloqueadas(),
    ]);

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

      <h2 className="h-el" style={{ margin: "28px 0 4px" }}>
        Tempo de sessão
      </h2>
      <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
        Por quanto tempo sem atividade a sessão permanece aberta. Cada ação reinicia a contagem, e o
        contador ao lado do sino mostra quanto falta. Vale para todos os papéis.
      </p>

      <FormularioTempoSessao inicial={politicaSessao} />

      <h2 className="h-el" style={{ margin: "28px 0 4px" }}>
        Bloqueio por tentativas de login
      </h2>
      <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
        Quantas senhas erradas seguidas bloqueiam a conta e por quanto tempo. O Administrador da
        Plataforma nunca é bloqueado — a conta que faz o desbloqueio não pode se trancar.
      </p>

      <FormularioBloqueioLogin inicial={politicaLogin} />

      <h3 className="h-el" style={{ margin: "20px 0 4px", fontSize: "1rem" }}>
        Contas bloqueadas
      </h3>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "74ch" }}>
        Libere o acesso antes de o tempo de bloqueio correr. O desbloqueio é auditado.
      </p>

      <ListaBloqueados
        itens={bloqueados.map((linha) => ({
          id: linha.id,
          nome: linha.nome,
          email: linha.email,
          rotuloPapel: linha.rotuloPapel,
          minutosRestantes: linha.minutosRestantes,
        }))}
      />

      <h2 className="h-el" style={{ margin: "28px 0 4px" }}>
        Bloqueio por origem de rede
      </h2>
      <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
        Tranca o endereço de onde vêm falhas repetidas de login, qualquer que seja a conta alvo.
        Nasce desligado. O Administrador da Plataforma continua entrando de um endereço bloqueado —
        mas as falhas contra contas de Administrador também contam para a origem.
      </p>

      <FormularioBloqueioOrigem inicial={politicaOrigem} />

      <h3 className="h-el" style={{ margin: "20px 0 4px", fontSize: "1rem" }}>
        Endereços bloqueados
      </h3>
      <p className="cap" style={{ margin: "0 0 12px", maxWidth: "74ch" }}>
        Libere um endereço antes de o tempo correr. A liberação é auditada.
      </p>

      <ListaOrigens
        itens={origens.map((linha) => ({
          id: linha.id,
          origem: linha.origem,
          minutosRestantes: linha.minutosRestantes,
        }))}
      />
    </div>
  );
}
