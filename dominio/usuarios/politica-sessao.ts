/**
 * Política de sessão do portal (Configurações) — o tempo de inatividade após o
 * qual a sessão expira. Domínio puro: sem Prisma, sem Auth.js. A janela é
 * DESLIZANTE — cada atividade reinicia a contagem —, e a autoridade é o
 * servidor (o callback `jwt` do Auth.js); o contador ao lado do sino é só o
 * reflexo visível dela.
 */

/** Política de sessão vigente. */
export interface PoliticaDeSessao {
  /** Minutos de inatividade tolerados antes de expirar. */
  tempoSessaoMin: number;
  /**
   * Teto ABSOLUTO da sessão, em minutos, contado do login — **0 desativa**.
   * Diferente do tempo de inatividade, este não se renova com o uso: passado
   * o prazo, a sessão cai mesmo com alguém trabalhando nela.
   */
  tetoMin: number;
}

/**
 * Padrão do domínio — usado quando ainda não há linha de configuração. 30
 * minutos é o padrão de back-office decidido para a plataforma.
 */
export const POLITICA_SESSAO_PADRAO: PoliticaDeSessao = {
  tempoSessaoMin: 30,
  // Desligado por padrão: ligar o teto é decisão do Administrador, e subir a
  // fase não pode encurtar a sessão de ninguém sem aviso.
  tetoMin: 0,
};

/** Faixa aceita para o tempo de sessão (minutos). */
export const TEMPO_SESSAO_MINIMO = 5;
export const TEMPO_SESSAO_MAXIMO = 480; // 8 horas — teto absoluto de conforto.

/**
 * Faixa do teto absoluto. **0 é o único valor abaixo do mínimo**, e significa
 * desligado. O piso de 30 min existe para o teto não ficar mais curto que a
 * janela de inatividade típica e virar expulsão inexplicável.
 */
export const TETO_MINIMO = 30;
export const TETO_MAXIMO = 10_080; // 7 dias.

/** Valida a política de sessão. Devolve as mensagens de erro (vazio = ok). */
export function validarPoliticaDeSessao(politica: PoliticaDeSessao): string[] {
  const erros: string[] = [];
  const t = politica.tempoSessaoMin;
  if (!Number.isInteger(t)) {
    erros.push("O tempo de sessão deve ser um número inteiro de minutos.");
  } else if (t !== 0 && (t < TEMPO_SESSAO_MINIMO || t > TEMPO_SESSAO_MAXIMO)) {
    erros.push(
      `O tempo de sessão deve ser 0 (desligado) ou entre ${TEMPO_SESSAO_MINIMO} e ${TEMPO_SESSAO_MAXIMO} minutos.`,
    );
  } else if (t < 0) {
    erros.push("O tempo de sessão não pode ser negativo (use 0 para desligar).");
  }

  const teto = politica.tetoMin;
  if (!Number.isInteger(teto) || teto < 0) {
    erros.push("O teto de sessão não pode ser negativo (use 0 para desligar).");
  } else if (teto !== 0 && (teto < TETO_MINIMO || teto > TETO_MAXIMO)) {
    erros.push(
      `O teto de sessão deve ser 0 (desligado) ou entre ${TETO_MINIMO} e ${TETO_MAXIMO} minutos.`,
    );
  } else if (teto !== 0 && Number.isInteger(t) && teto < t) {
    // Teto menor que a janela de inatividade tornaria a janela inalcançável:
    // a sessão cairia pelo teto antes de a inatividade sequer contar.
    erros.push("O teto de sessão não pode ser menor que o tempo de inatividade.");
  }

  return erros;
}

/**
 * A sessão estourou o teto absoluto? Função pura.
 *
 * Duas ausências significam **não estourou**: teto `0` (desligado) e
 * `inicioSessaoMs` ausente — este último é o token emitido antes desta fase,
 * e derrubá-lo seria expulsar quem já estava logado por falta de um campo
 * novo. A marca passa a existir no próximo login.
 */
export function sessaoEstourouTeto(
  inicioSessaoMs: number | undefined,
  agoraMs: number,
  politica: PoliticaDeSessao,
): boolean {
  if (!politica.tetoMin || politica.tetoMin <= 0) return false;
  if (typeof inicioSessaoMs !== "number" || !Number.isFinite(inicioSessaoMs)) return false;
  return agoraMs - inicioSessaoMs > politica.tetoMin * 60_000;
}

/** O tempo de sessão em milissegundos — a unidade que o token e o contador usam. */
export function tempoSessaoEmMs(politica: PoliticaDeSessao): number {
  return politica.tempoSessaoMin * 60_000;
}

/**
 * Avalia a inatividade: `true` quando o intervalo desde a última atividade já
 * ultrapassou o tempo tolerado. Função pura — é o coração da expiração, testado
 * isoladamente e reusado pelo callback `jwt`.
 *
 * `ultimaAtividadeMs` ausente (sessão sem marca de atividade — token antigo,
 * anterior a esta fase) NÃO expira: a próxima atividade grava a marca, e barrar
 * quem já estava logado por falta de um campo novo seria expulsar sem causa.
 */
export function sessaoExpirouPorInatividade(
  ultimaAtividadeMs: number | undefined,
  agoraMs: number,
  politica: PoliticaDeSessao,
): boolean {
  // 0 = expiração por inatividade DESLIGADA.
  if (!politica.tempoSessaoMin || politica.tempoSessaoMin <= 0) {
    return false;
  }
  if (typeof ultimaAtividadeMs !== "number" || !Number.isFinite(ultimaAtividadeMs)) {
    return false;
  }
  return agoraMs - ultimaAtividadeMs > tempoSessaoEmMs(politica);
}

/** Descrição legível da política, para a tela de Configurações. */
export function descreverPolitica(politica: PoliticaDeSessao): string {
  const partes: string[] = [];
  partes.push(
    politica.tempoSessaoMin > 0
      ? `A sessão expira após ${politica.tempoSessaoMin} minuto(s) sem atividade. Cada ação reinicia a contagem.`
      : "A expiração por inatividade está desligada: a sessão não cai por ficar parada.",
  );
  partes.push(
    politica.tetoMin > 0
      ? `Independentemente do uso, a sessão termina ${politica.tetoMin} minuto(s) após o login.`
      : "O teto absoluto está desligado: a sessão com uso contínuo não tem prazo final.",
  );
  return partes.join(" ");
}
