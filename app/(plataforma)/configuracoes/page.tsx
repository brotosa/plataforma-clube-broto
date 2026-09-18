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
import {
  listarLoginsBloqueados,
  tentativasEmContasIsentas,
} from "@/infra/casos-de-uso/bloqueio-login";
import { listarOrigensBloqueadas } from "@/infra/casos-de-uso/bloqueio-origem";
import {
  resumirCredencialProvisoria,
  resumirPoliticaDeLogin,
  resumirPoliticaDeOrigem,
  resumirPoliticaDeSenha,
  resumirPoliticaDeSessao,
} from "@/dominio/usuarios/resumo-politicas";
import { historicoDasConfiguracoes } from "@/infra/consultas/configuracoes";
import { FormularioPoliticaSenha } from "./formulario-politica-senha";
import { FormularioTempoSessao } from "./formulario-tempo-sessao";
import { FormularioBloqueioLogin } from "./formulario-bloqueio-login";
import { ListaBloqueados } from "./lista-bloqueados";
import { FormularioBloqueioOrigem } from "./formulario-bloqueio-origem";
import { ListaOrigens } from "./lista-origens";
import { FaixaPanorama } from "./faixa-panorama";
import { ExigirTrocaDeTodos } from "./exigir-troca-de-todos";

export const metadata: Metadata = {
  title: "Configurações",
};

/**
 * As três abas da T35.
 *
 * Três, e não quatro: os dois bloqueios são irmãos — mesma mecânica, e é onde
 * se desbloqueia. Separá-los obrigaria quem vai liberar alguém a adivinhar, em
 * duas abas, se o que travou foi a conta ou o endereço.
 */
const ABAS = [
  { id: "senha", rotulo: "Senha" },
  { id: "sessao", rotulo: "Sessão" },
  { id: "bloqueios", rotulo: "Bloqueios" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

const ABA_PADRAO: AbaId = "senha";

/**
 * Configurações do portal — o irmão técnico/de segurança do Parametrizador.
 * Só o Administrador da Plataforma (CONFIGURAR_PORTAL): quem não é, é
 * redirecionado. Toda mudança é auditada.
 *
 * A tela cresceu de um bloco (política de senha) para quatro e passou a rolar
 * demais; as abas organizam. O que elas custam — esconder o que não está na
 * aba aberta — a **faixa de panorama** devolve, e é por isso que ela fica
 * acima delas, cobrindo as quatro proteções o tempo todo.
 *
 * A aba viaja na query (`?aba=`) e, por isso, a navegação é por **âncora
 * nativa, não `<Link>`** — convenção da casa, medida, e prendida pela cerca
 * `infra/arquitetura/navegacao-por-query.test.ts`, onde esta tela está
 * declarada.
 */
/**
 * A legenda de histórico sob cada formulário — o mesmo lugar e o mesmo tom
 * que o Parametrizador usa na T17 (`.pm-hist`).
 *
 * Fica **depois** do formulário de propósito: a pergunta "isto mudou?" vem
 * depois de ler o que está valendo, não antes. Posta acima, competiria com o
 * próprio campo pela atenção de quem veio configurar.
 */
function LegendaDeHistorico({ texto }: { texto: string }) {
  return (
    <p className="cap pm-hist" style={{ marginTop: 8 }}>
      {texto}
    </p>
  );
}

export default async function PaginaConfiguracoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  if (!podeExecutar(sessao.user.papel, "CONFIGURAR_PORTAL")) {
    // A área é exclusiva do Administrador — quem não pode configurar volta à HOME.
    redirect("/");
  }

  const parametros = await searchParams;
  // Aba vinda da URL é entrada de usuário: vale a que existir na lista, e
  // qualquer outra coisa cai no padrão — nunca em erro nem em tela vazia.
  const abaBruta = typeof parametros.aba === "string" ? parametros.aba : ABA_PADRAO;
  const aba: AbaId = ABAS.find((candidata) => candidata.id === abaBruta)?.id ?? ABA_PADRAO;

  /*
   * As quatro políticas e as duas listas são sempre lidas, mesmo fora da aba
   * ativa: a faixa de panorama mostra as quatro o tempo todo, e as contagens de
   * bloqueados são a informação mais operacional da tela — esconder "3 contas
   * bloqueadas" atrás de uma aba derrotaria o propósito da faixa. As listas são
   * curtas por natureza (quase sempre vazias), então não há o que economizar.
   */
  const [
    politica,
    politicaSessao,
    politicaLogin,
    bloqueados,
    politicaOrigem,
    origens,
    historico,
    tentativasIsentas,
  ] = await Promise.all([
    lerPoliticaDeSenha(),
    lerPoliticaDeSessao(),
    lerPoliticaDeLogin(),
    listarLoginsBloqueados(),
    lerPoliticaDeOrigem(),
    listarOrigensBloqueadas(),
    // Uma consulta só para os quatro grupos: a trilha é lida uma vez e
    // repartida em memória. Quatro consultas dariam o mesmo resultado e
    // quadruplicariam o custo de uma tela que se abre o tempo todo.
    historicoDasConfiguracoes(),
    // RN74 — a isenção de bloqueio não pode ser invisível. Agregação de uma
    // coluna, na mesma rodada das outras: não custa ida a mais ao banco.
    tentativasEmContasIsentas(),
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

      <FaixaPanorama
        senha={resumirPoliticaDeSenha(politica)}
        credencial={resumirCredencialProvisoria(politica)}
        sessao={resumirPoliticaDeSessao(politicaSessao)}
        login={resumirPoliticaDeLogin(politicaLogin)}
        origem={resumirPoliticaDeOrigem(politicaOrigem)}
        contasBloqueadas={bloqueados.length}
        origensBloqueadas={origens.length}
        tentativasIsentas={tentativasIsentas}
      />

      <nav
        style={{
          borderBottom: "1px solid var(--borda)",
          display: "flex",
          margin: "14px 0 22px",
          overflowX: "auto",
        }}
        aria-label="Seções das configurações"
      >
        {ABAS.map((candidata) => (
          <a
            key={candidata.id}
            href={`/configuracoes?aba=${candidata.id}`}
            className={candidata.id === aba ? "tab-it on" : "tab-it"}
            aria-current={candidata.id === aba ? "page" : undefined}
            style={{ textDecoration: "none" }}
          >
            {candidata.rotulo}
          </a>
        ))}
      </nav>

      {aba === "senha" ? (
        <>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Política de senha
          </h2>
          <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
            Vale para toda troca de senha feita pelo próprio usuário. Aperte o quanto quiser — o
            padrão preserva o comportamento anterior (mínimo de 10 caracteres, sem exigência de
            classe).
          </p>

          <FormularioPoliticaSenha inicial={politica} />
          <LegendaDeHistorico texto={historico.SENHA} />

          <h3 className="h-el" style={{ margin: "28px 0 4px", fontSize: "1rem" }}>
            Aplicar a política à base existente
          </h3>
          <p className="cap" style={{ margin: "0 0 12px", maxWidth: "74ch" }}>
            Apertar a política vale na próxima troca de cada pessoa. Se ninguém trocar, nada
            muda — e a validade em dias, em particular, só começa a contar depois da primeira
            troca. Este é o empurrão inicial.
          </p>

          <ExigirTrocaDeTodos />
        </>
      ) : null}

      {aba === "sessao" ? (
        <>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Tempo de sessão
          </h2>
          <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
            Por quanto tempo sem atividade a sessão permanece aberta. Cada ação reinicia a contagem,
            e o contador ao lado do sino mostra quanto falta. Vale para todos os papéis.
          </p>

          <FormularioTempoSessao inicial={politicaSessao} />
          <LegendaDeHistorico texto={historico.SESSAO} />
        </>
      ) : null}

      {aba === "bloqueios" ? (
        <>
          <h2 className="h-el" style={{ marginBottom: 4 }}>
            Bloqueio por tentativas de login
          </h2>
          <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
            Quantas senhas erradas seguidas bloqueiam a conta e por quanto tempo. O Administrador da
            Plataforma nunca é bloqueado — a conta que faz o desbloqueio não pode se trancar.
          </p>

          <FormularioBloqueioLogin inicial={politicaLogin} />
          <LegendaDeHistorico texto={historico.LOGIN} />

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
            Nasce desligado. O Administrador da Plataforma continua entrando de um endereço
            bloqueado — mas as falhas contra contas de Administrador também contam para a origem.
          </p>

          <FormularioBloqueioOrigem inicial={politicaOrigem} />
          <LegendaDeHistorico texto={historico.ORIGEM} />

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
        </>
      ) : null}
    </div>
  );
}
