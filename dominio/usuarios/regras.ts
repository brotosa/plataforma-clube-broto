import type { Papel } from "@prisma/client";

/**
 * Regras puras da gestão de usuários (Onda 6, ficha §3 e §5).
 *
 * RN46 — proteção do último administrador (anti-lockout): o sistema impede
 * rebaixar ou inativar o único usuário com papel Administrador.
 * RN47 — a inativação revoga o acesso imediatamente e preserva o histórico.
 *
 * Nada aqui toca banco: as funções recebem o retrato de quem existe e
 * devolvem a decisão. Quem lê o retrato dentro da transação é o caso de uso
 * (infra/casos-de-uso/usuarios.ts) — a corrida de dois administradores se
 * rebaixando ao mesmo tempo é fechada lá, com a leitura travada.
 */

/** Retrato mínimo de um usuário para as decisões desta camada. */
export interface UsuarioEmAvaliacao {
  id: string;
  papel: Papel;
  ativo: boolean;
}

/** Mudança pedida na T27 — campos ausentes ficam como estão. */
export interface MudancaDeUsuario {
  papel?: Papel;
  ativo?: boolean;
}

const PAPEL_ADMINISTRADOR: Papel = "ADMINISTRADOR_PLATAFORMA";

/** Administrador que conta para a RN46: tem o papel E está ativo. */
export function eAdministradorEfetivo(usuario: UsuarioEmAvaliacao): boolean {
  return usuario.papel === PAPEL_ADMINISTRADOR && usuario.ativo;
}

/**
 * Quantos administradores ativos existem além do usuário informado.
 * O alvo é excluído por id — não por identidade de objeto — porque a lista
 * vem do banco e o alvo pode ter sido lido em outra consulta.
 */
export function outrosAdministradoresAtivos(
  alvo: UsuarioEmAvaliacao,
  todos: ReadonlyArray<UsuarioEmAvaliacao>,
): number {
  return todos.filter((u) => u.id !== alvo.id && eAdministradorEfetivo(u)).length;
}

/**
 * A mudança tira do alvo a condição de administrador efetivo?
 * É o que a RN46 protege: tanto rebaixar (troca de papel) quanto inativar
 * deixam a plataforma com um administrador a menos.
 */
export function removeCondicaoDeAdministrador(
  alvo: UsuarioEmAvaliacao,
  mudanca: MudancaDeUsuario,
): boolean {
  if (!eAdministradorEfetivo(alvo)) {
    return false;
  }
  const papelDepois = mudanca.papel ?? alvo.papel;
  const ativoDepois = mudanca.ativo ?? alvo.ativo;
  return !eAdministradorEfetivo({ ...alvo, papel: papelDepois, ativo: ativoDepois });
}

/**
 * Mensagem única da RN46. A ficha pede que a UI explique o caminho, não só
 * recuse: quem esbarra nisso quase sempre quer trocar de administrador, e a
 * ordem certa é designar antes de sair.
 */
export const MENSAGEM_ULTIMO_ADMINISTRADOR =
  "Este é o único Administrador da Plataforma ativo. Designe outro administrador antes de rebaixar ou inativar este usuário.";

/**
 * Avalia a mudança pedida contra a RN46. Devolve a lista de impedimentos —
 * vazia quando a mudança pode seguir.
 */
export function avaliarMudancaDeUsuario(parametros: {
  alvo: UsuarioEmAvaliacao;
  mudanca: MudancaDeUsuario;
  todos: ReadonlyArray<UsuarioEmAvaliacao>;
}): string[] {
  const { alvo, mudanca, todos } = parametros;
  const erros: string[] = [];
  if (
    removeCondicaoDeAdministrador(alvo, mudanca) &&
    outrosAdministradoresAtivos(alvo, todos) === 0
  ) {
    erros.push(MENSAGEM_ULTIMO_ADMINISTRADOR);
  }
  return erros;
}

/**
 * RN47 — a mudança exige nova época de sessão?
 *
 * Inativar revoga o acesso. Trocar o papel também derruba: o papel viaja
 * dentro do JWT e é o que a UI usa para decidir o que mostrar; sem derrubar,
 * um usuário rebaixado continuaria vendo (e podendo pedir) o que o papel
 * antigo permitia até o token expirar. Reativar NÃO derruba nada — não há o
 * que revogar em quem estava fora.
 */
export function exigeNovaEpocaDeSessao(
  alvo: UsuarioEmAvaliacao,
  mudanca: MudancaDeUsuario,
): boolean {
  const inativando = mudanca.ativo === false && alvo.ativo;
  const trocandoPapel = mudanca.papel !== undefined && mudanca.papel !== alvo.papel;
  return inativando || trocandoPapel;
}

/** Estado do usuário que o portador de um token precisa ter para seguir. */
export interface PortadorDeSessao {
  ativo: boolean;
  sessaoEpoca: number;
}

/**
 * RN47 no ponto em que a revogação acontece: a sessão do token é válida?
 *
 * Chamada a cada leitura de sessão no runtime Node (callback jwt do
 * Auth.js). Falso derruba a sessão — o cookie é descartado e a requisição
 * seguinte já não autentica.
 *
 * Token sem época (emitido antes desta fase) é tratado como época 0, que é
 * o padrão da coluna: sessões abertas na virada da F13 continuam válidas
 * até que alguém as revogue de fato. Rejeitá-las seria derrubar todo mundo
 * no deploy — revogação sem ato de revogar.
 */
export function sessaoContinuaValida(
  epocaDoToken: number | undefined,
  usuario: PortadorDeSessao | null,
): boolean {
  if (!usuario || !usuario.ativo) {
    return false;
  }
  return (epocaDoToken ?? 0) === usuario.sessaoEpoca;
}

/**
 * Motivo institucional da derrubada, para a tela de login. Distinguir os
 * dois casos importa: "sua conta foi inativada" é definitivo e manda
 * procurar o administrador; "seu acesso mudou" é transitório e basta
 * entrar de novo.
 */
export type MotivoDeRevogacao = "INATIVADO" | "ACESSO_ALTERADO";

export function motivoDaRevogacao(
  epocaDoToken: number | undefined,
  usuario: PortadorDeSessao | null,
): MotivoDeRevogacao | null {
  if (sessaoContinuaValida(epocaDoToken, usuario)) {
    return null;
  }
  if (!usuario || !usuario.ativo) {
    return "INATIVADO";
  }
  return "ACESSO_ALTERADO";
}

export const MENSAGENS_DE_REVOGACAO: Readonly<Record<MotivoDeRevogacao, string>> = {
  INATIVADO:
    "Seu acesso à plataforma foi encerrado. Procure o Administrador da Plataforma.",
  ACESSO_ALTERADO: "Seu perfil de acesso mudou. Entre novamente para continuar.",
};
