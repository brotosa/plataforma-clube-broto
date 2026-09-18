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
  if (!Number.isInteger(maxTentativas) || maxTentativas < 0) {
    erros.push("O número de tentativas não pode ser negativo (use 0 para desligar).");
  } else if (
    maxTentativas !== 0 &&
    (maxTentativas < MAX_TENTATIVAS_MINIMO || maxTentativas > MAX_TENTATIVAS_MAXIMO)
  ) {
    erros.push(
      `O número de tentativas deve ser 0 (desligado) ou entre ${MAX_TENTATIVAS_MINIMO} e ${MAX_TENTATIVAS_MAXIMO}.`,
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
  // Bloqueio DESLIGADO (0): não conta e não bloqueia — nem sequer acumula
  // contador, para que religar a regra não puna falhas antigas.
  if (!politica.maxTentativas || politica.maxTentativas <= 0) {
    return atual;
  }
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

/**
 * Aplica UMA falha contra conta **isenta** de bloqueio (RN74).
 *
 * A conta que destranca as outras não pode se trancar, e por isso a isenção
 * existe. Só que, até aqui, ela não deixava rastro nenhum: o ramo de isenção
 * devolvia a recusa sem tocar contador nenhum, e **quem tentasse senhas contra
 * uma conta de Administrador podia fazê-lo indefinidamente, sem limite, sem
 * prazo e sem número em lugar algum**. A isenção não tinha contrapartida — e
 * pior, era invisível.
 *
 * Aqui a falha passa a **contar sem trancar**. Três diferenças deliberadas em
 * relação a `registrarFalha`:
 *
 * 1. **Nunca escreve `bloqueadoAte`.** Não é economia: é estrutura. Toda
 *    leitura de "está bloqueado" na plataforma olha essa coluna, e uma delas
 *    — a lista de contas a desbloquear — **não** filtra por isenção. Deixar a
 *    coluna nula mantém a conta isenta fora de todo caminho de bloqueio por
 *    construção, em vez de por alguém lembrar de guardar cada consulta nova.
 * 2. **O contador só cresce**, e só é zerado por um acesso bem-sucedido. É o
 *    que faz o número na tela significar "falhas desde o último acesso" em vez
 *    de um resto de janela.
 * 3. **Conta mesmo com a política desligada.** Contar aqui nunca pune ninguém
 *    — a conta é isenta, e continuará isenta se a política for religada —,
 *    então a cautela que faz `registrarFalha` não acumular com a regra
 *    desligada não se aplica: aqui o contador é o único sinal que existe.
 */
export function registrarFalhaSemBloquear(atual: EstadoBloqueio): EstadoBloqueio {
  return { tentativas: atual.tentativas + 1, bloqueadoAte: null };
}

/**
 * A falha que acabou de acontecer merece um evento na trilha?
 *
 * **Uma vez por rajada, não uma por tentativa.** Gravar toda falha faria o
 * volume da trilha ser escolhido por quem ataca — e a RN49 diz que auditoria
 * não se apaga, com a política de retenção ainda em aberto. Como o contador da
 * conta isenta só cresce até um acesso bem-sucedido, a travessia do limite
 * acontece **exatamente uma vez** entre dois acessos: o primeiro evento diz o
 * que precisa ser dito, e a repetição não diria mais nada.
 *
 * Com a política desligada não há limite a cruzar, e inventar um aqui seria
 * escrever política em código. O contador continua visível na tela.
 */
export function cruzouLimiteDeAlerta(
  anterior: EstadoBloqueio,
  novo: EstadoBloqueio,
  politica: PoliticaDeLogin,
): boolean {
  if (!politica.maxTentativas || politica.maxTentativas <= 0) return false;
  return anterior.tentativas < politica.maxTentativas && novo.tentativas >= politica.maxTentativas;
}

/**
 * A falha que acabou de acontecer **bloqueou** a conta agora?
 *
 * O momento em que uma conta é trancada por tentativas é um ato auditável, e
 * até aqui não chegava à trilha: nenhuma falha de autenticação, de conta
 * nenhuma, gravava evento. A transição é o sinal — estar bloqueado já era
 * visível na tela de desbloqueio, ter sido bloqueado não ficava em lugar
 * nenhum depois que o prazo passava.
 */
export function bloqueouAgora(anterior: EstadoBloqueio, novo: EstadoBloqueio): boolean {
  return anterior.bloqueadoAte === null && novo.bloqueadoAte !== null;
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
  if (!politica.maxTentativas || politica.maxTentativas <= 0) {
    return "O bloqueio por tentativas está desligado: errar a senha não tranca a conta.";
  }
  return `Após ${politica.maxTentativas} tentativas de senha erradas, o acesso fica bloqueado por ${politica.bloqueioMin} minuto(s). O Administrador da Plataforma nunca é bloqueado.`;
}
