import type { JWT } from "next-auth/jwt";
import type { Papel } from "@prisma/client";
import { sessaoContinuaValida } from "@/dominio/usuarios/regras";
import {
  type PoliticaDeSessao,
  sessaoEstourouTeto,
  sessaoExpirouPorInatividade,
} from "@/dominio/usuarios/politica-sessao";
import { type PoliticaDeSenha, senhaVenceu } from "@/dominio/usuarios/politica-senha";

/**
 * A decisão que o callback `jwt` do Auth.js toma a cada requisição
 * autenticada, extraída para poder ser PROVADA.
 *
 * Antes isto vivia embutido na chamada `NextAuth({...})`, onde nenhum teste
 * alcançava: só as funções puras de baixo (`sessaoContinuaValida`,
 * `sessaoExpirouPorInatividade`) tinham cobertura, e a LIGAÇÃO entre elas —
 * a ordem das checagens, o que é lido do banco, quando a marca de atividade
 * é reiniciada — não tinha nenhuma. Era o pedaço mais importante da
 * expiração por inatividade e o único sem prova.
 *
 * Sem IO: quem lê banco é o callback, que passa o resultado aqui. Devolver
 * `null` significa, para o Auth.js, sessão inválida — o cookie é descartado.
 */

/** O que o callback leu do usuário para decidir. */
export interface UsuarioParaRevisao {
  ativo: boolean;
  papel: Papel;
  nome: string;
  sessaoEpoca: number;
  trocaSenhaObrigatoria: boolean;
  /** Quando a senha foi trocada — nulo = nunca vence (ver `senhaVenceu`). */
  senhaAlteradaEm?: Date | null;
}

/** Por que a sessão caiu — só para o log do servidor (RN55: não vai à tela). */
export type MotivoDaQueda = "revogada" | "inatividade" | "teto";

export interface ResultadoDaRevisao {
  token: JWT | null;
  motivo?: MotivoDaQueda;
}

/**
 * Revisa o token de uma requisição autenticada.
 *
 * Ordem deliberada: a revogação (RN47) vem ANTES da inatividade. Quem foi
 * inativado ou trocou de papel perde o acesso mesmo estando ativo no
 * instante — e o motivo registrado precisa ser esse, não "ficou parado".
 *
 * Quando o token sobrevive, a marca de atividade é reiniciada para `agora` e
 * papel/nome/credencial provisória são relidos, para a interface nunca ficar
 * com um retrato velho de quem é a pessoa.
 */
export function revisarTokenDeSessao(entrada: {
  token: JWT;
  usuarioAtual: UsuarioParaRevisao | null;
  politica: PoliticaDeSessao;
  politicaSenha?: PoliticaDeSenha;
  agora: number;
}): ResultadoDaRevisao {
  const { token, usuarioAtual, politica, politicaSenha, agora } = entrada;

  if (!usuarioAtual || !sessaoContinuaValida(token.sessaoEpoca, usuarioAtual)) {
    return { token: null, motivo: "revogada" };
  }

  // O teto ABSOLUTO vem antes da inatividade: ele não se renova com o uso, e
  // quem o estourou está fora mesmo tendo agido há um segundo. Reportar
  // "inatividade" nesse caso seria mentir no log.
  if (sessaoEstourouTeto(token.inicioSessao, agora, politica)) {
    return { token: null, motivo: "teto" };
  }

  if (sessaoExpirouPorInatividade(token.ultimaAtividade, agora, politica)) {
    return { token: null, motivo: "inatividade" };
  }

  // Validade periódica da senha: não derruba a sessão — marca a credencial
  // como provisória, e o layout do grupo (plataforma) já leva à tela de troca.
  // Reusar o caminho existente evita um segundo mecanismo de redirecionamento.
  const venceu = politicaSenha
    ? senhaVenceu(usuarioAtual.senhaAlteradaEm ?? null, new Date(agora), politicaSenha)
    : false;

  return {
    token: {
      ...token,
      ultimaAtividade: agora,
      papel: usuarioAtual.papel,
      nome: usuarioAtual.nome,
      trocaSenhaObrigatoria: usuarioAtual.trocaSenhaObrigatoria || venceu,
    },
  };
}
