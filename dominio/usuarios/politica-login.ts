/**
 * Política de bloqueio por tentativas de login (Configurações). Domínio puro:
 * sem Prisma, sem Auth.js. Conta falhas consecutivas e, ao estourar o limite,
 * bloqueia o acesso por um tempo. O Administrador da Plataforma NUNCA é
 * bloqueado — essa exceção é aplicada em quem conhece o papel (a camada de
 * autenticação), não aqui, porque estas funções não recebem o papel.
 */

/** Política de bloqueio vigente. */
export interface PoliticaDeLogin {
  /** Falhas consecutivas que disparam o bloqueio. */
  maxTentativas: number;
  /** Duração do bloqueio, em minutos. */
  bloqueioMin: number;
}

/** Padrão do domínio — usado quando ainda não há linha de configuração. */
export const POLITICA_LOGIN_PADRAO: PoliticaDeLogin = {
  maxTentativas: 5,
  bloqueioMin: 15,
};

export const MAX_TENTATIVAS_MINIMO = 3;
export const MAX_TENTATIVAS_MAXIMO = 20;
export const BLOQUEIO_MIN_MINIMO = 1;
export const BLOQUEIO_MIN_MAXIMO = 1440; // 24 horas.

/** Valida a política de bloqueio. Devolve as mensagens de erro (vazio = ok). */
export function validarPoliticaDeLogin(politica: PoliticaDeLogin): string[] {
  const erros: string[] = [];
  const { maxTentativas, bloqueioMin } = politica;
  if (!Number.isInteger(maxTentativas)) {
    erros.push("O número de tentativas deve ser um inteiro.");
  } else if (maxTentativas < MAX_TENTATIVAS_MINIMO || maxTentativas > MAX_TENTATIVAS_MAXIMO) {
    erros.push(
      `O número de tentativas deve ficar entre ${MAX_TENTATIVAS_MINIMO} e ${MAX_TENTATIVAS_MAXIMO}.`,
    );
  }
  if (!Number.isInteger(bloqueioMin)) {
    erros.push("O tempo de bloqueio deve ser um inteiro de minutos.");
  } else if (bloqueioMin < BLOQUEIO_MIN_MINIMO || bloqueioMin > BLOQUEIO_MIN_MAXIMO) {
    erros.push(
      `O tempo de bloqueio deve ficar entre ${BLOQUEIO_MIN_MINIMO} e ${BLOQUEIO_MIN_MAXIMO} minutos.`,
    );
  }
  return erros;
}

/** Estado dos contadores de bloqueio de um usuário. */
export interface EstadoBloqueio {
  tentativas: number;
  bloqueadoAte: Date | null;
}

/** `true` se a conta está bloqueada agora (bloqueadoAte no futuro). */
export function estaBloqueado(
  bloqueadoAte: Date | null | undefined,
  agora: Date,
): boolean {
  return bloqueadoAte instanceof Date && bloqueadoAte.getTime() > agora.getTime();
}

/**
 * Aplica UMA falha de login ao estado atual e devolve o novo estado.
 *
 * A contagem que importa é a de falhas consecutivas: se havia um bloqueio já
 * EXPIRADO, ele não conta mais — a janela recomeça. Ao alcançar o limite, grava
 * `bloqueadoAte` e zera o contador (o bloqueio é o próprio estado; quando
 * expirar, a pessoa recomeça do zero).
 */
export function registrarFalha(
  atual: EstadoBloqueio,
  politica: PoliticaDeLogin,
  agora: Date,
): EstadoBloqueio {
  // Bloqueio ainda vigente: nada muda (a falha nem deveria ter chegado aqui).
  if (estaBloqueado(atual.bloqueadoAte, agora)) {
    return atual;
  }
  const base = atual.bloqueadoAte ? 0 : atual.tentativas; // bloqueio expirado zera a janela
  const tentativas = base + 1;
  if (tentativas >= politica.maxTentativas) {
    return {
      tentativas: 0,
      bloqueadoAte: new Date(agora.getTime() + politica.bloqueioMin * 60_000),
    };
  }
  return { tentativas, bloqueadoAte: null };
}

/** Estado após um login bem-sucedido (ou um desbloqueio): contadores zerados. */
export function estadoLimpo(): EstadoBloqueio {
  return { tentativas: 0, bloqueadoAte: null };
}

/** Minutos que faltam para o bloqueio expirar (arredonda para cima; 0 se livre). */
export function minutosRestantesDeBloqueio(
  bloqueadoAte: Date | null | undefined,
  agora: Date,
): number {
  if (!estaBloqueado(bloqueadoAte, agora)) return 0;
  return Math.ceil(((bloqueadoAte as Date).getTime() - agora.getTime()) / 60_000);
}

/** Descrição legível da política, para a tela de Configurações. */
export function descreverPolitica(politica: PoliticaDeLogin): string {
  return `Após ${politica.maxTentativas} tentativas de senha erradas, o acesso fica bloqueado por ${politica.bloqueioMin} minuto(s). O Administrador da Plataforma nunca é bloqueado.`;
}
