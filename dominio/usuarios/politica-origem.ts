/**
 * Política de bloqueio por ORIGEM de rede (Configurações).
 *
 * **Isto não é rate limiting.** Rate limiting mede requisições por unidade de
 * tempo e recusa o excesso; isto conta FALHAS CONSECUTIVAS de login vindas do
 * mesmo endereço e, ao estourar o limite, tranca aquele endereço por um tempo.
 * Serve contra força bruta dirigida a partir de um endereço; **não** protege
 * contra inundação, porque cada falha ainda custa uma gravação no banco — a
 * defesa contra volume pertence à borda (WAF/balanceador), não a esta camada.
 * A distinção está escrita aqui de propósito, para ninguém confundir o que
 * esta regra promete com o que ela não faz.
 *
 * A contagem em si é a MESMA da política por conta (`politica-login`), e é
 * reusada de lá em vez de reescrita: duas cópias divergiriam na primeira
 * correção. O que muda é o sujeito (endereço, não conta) e o padrão.
 */

/** Política de bloqueio por origem — mesma forma da política por conta. */
export interface PoliticaDeOrigem {
  /** Falhas consecutivas da mesma origem que disparam o bloqueio (0 desliga). */
  maxTentativas: number;
  /** Duração do bloqueio, em minutos. */
  bloqueioMin: number;
}

/**
 * Padrão do domínio: **DESLIGADO**.
 *
 * Diferente do bloqueio por conta, que nasce ligado, este atinge todo mundo
 * atrás do mesmo endereço — um escritório com saída única, por exemplo. Ligar
 * é decisão consciente do Administrador, nunca padrão de entrega.
 */
export const POLITICA_ORIGEM_PADRAO: PoliticaDeOrigem = {
  maxTentativas: 0,
  bloqueioMin: 15,
};

export const ORIGEM_MAX_TENTATIVAS_MINIMO = 5;
export const ORIGEM_MAX_TENTATIVAS_MAXIMO = 100;
export const ORIGEM_BLOQUEIO_MIN_MINIMO = 1;
export const ORIGEM_BLOQUEIO_MIN_MAXIMO = 1440;

/** Valida a política de origem. Devolve as mensagens de erro (vazio = ok). */
export function validarPoliticaDeOrigem(politica: PoliticaDeOrigem): string[] {
  const erros: string[] = [];
  const { maxTentativas, bloqueioMin } = politica;

  if (!Number.isInteger(maxTentativas) || maxTentativas < 0) {
    erros.push("As tentativas por origem não podem ser negativas (use 0 para desligar).");
  } else if (
    maxTentativas !== 0 &&
    (maxTentativas < ORIGEM_MAX_TENTATIVAS_MINIMO || maxTentativas > ORIGEM_MAX_TENTATIVAS_MAXIMO)
  ) {
    erros.push(
      `As tentativas por origem devem ser 0 (desligado) ou entre ${ORIGEM_MAX_TENTATIVAS_MINIMO} e ${ORIGEM_MAX_TENTATIVAS_MAXIMO}.`,
    );
  }

  if (!Number.isInteger(bloqueioMin)) {
    erros.push("O tempo de bloqueio da origem deve ser um inteiro de minutos.");
  } else if (
    bloqueioMin < ORIGEM_BLOQUEIO_MIN_MINIMO ||
    bloqueioMin > ORIGEM_BLOQUEIO_MIN_MAXIMO
  ) {
    erros.push(
      `O tempo de bloqueio da origem deve ficar entre ${ORIGEM_BLOQUEIO_MIN_MINIMO} e ${ORIGEM_BLOQUEIO_MIN_MAXIMO} minutos.`,
    );
  }

  return erros;
}

/** Descrição legível da política, para a tela de Configurações. */
export function descreverPolitica(politica: PoliticaDeOrigem): string {
  if (!politica.maxTentativas || politica.maxTentativas <= 0) {
    return "O bloqueio por origem está desligado: nenhum endereço é trancado por errar senha.";
  }
  return `Após ${politica.maxTentativas} falhas de login vindas do mesmo endereço, aquele endereço fica bloqueado por ${politica.bloqueioMin} minuto(s) — para todas as contas. O Administrador da Plataforma continua entrando, mas as falhas contra contas de Administrador também contam para a origem.`;
}
