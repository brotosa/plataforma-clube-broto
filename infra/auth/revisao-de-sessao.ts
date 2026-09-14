import type { JWT } from "next-auth/jwt";
import type { Papel } from "@prisma/client";
import { sessaoContinuaValida } from "@/dominio/usuarios/regras";
import {
  type PoliticaDeSessao,
  sessaoExpirouPorInatividade,
} from "@/dominio/usuarios/politica-sessao";

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
}

/** Por que a sessão caiu — só para o log do servidor (RN55: não vai à tela). */
export type MotivoDaQueda = "revogada" | "inatividade";

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
  agora: number;
}): ResultadoDaRevisao {
  const { token, usuarioAtual, politica, agora } = entrada;

  if (!usuarioAtual || !sessaoContinuaValida(token.sessaoEpoca, usuarioAtual)) {
    return { token: null, motivo: "revogada" };
  }

  if (sessaoExpirouPorInatividade(token.ultimaAtividade, agora, politica)) {
    return { token: null, motivo: "inatividade" };
  }

  return {
    token: {
      ...token,
      ultimaAtividade: agora,
      papel: usuarioAtual.papel,
      nome: usuarioAtual.nome,
      trocaSenhaObrigatoria: usuarioAtual.trocaSenhaObrigatoria,
    },
  };
}
