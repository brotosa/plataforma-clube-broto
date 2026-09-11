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
}

/**
 * Padrão do domínio — usado quando ainda não há linha de configuração. 30
 * minutos é o padrão de back-office decidido para a plataforma.
 */
export const POLITICA_SESSAO_PADRAO: PoliticaDeSessao = {
  tempoSessaoMin: 30,
};

/** Faixa aceita para o tempo de sessão (minutos). */
export const TEMPO_SESSAO_MINIMO = 5;
export const TEMPO_SESSAO_MAXIMO = 480; // 8 horas — teto absoluto de conforto.

/** Valida a política de sessão. Devolve as mensagens de erro (vazio = ok). */
export function validarPoliticaDeSessao(politica: PoliticaDeSessao): string[] {
  const erros: string[] = [];
  const t = politica.tempoSessaoMin;
  if (!Number.isInteger(t)) {
    erros.push("O tempo de sessão deve ser um número inteiro de minutos.");
  } else if (t < TEMPO_SESSAO_MINIMO || t > TEMPO_SESSAO_MAXIMO) {
    erros.push(
      `O tempo de sessão deve ficar entre ${TEMPO_SESSAO_MINIMO} e ${TEMPO_SESSAO_MAXIMO} minutos.`,
    );
  }
  return erros;
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
  if (typeof ultimaAtividadeMs !== "number" || !Number.isFinite(ultimaAtividadeMs)) {
    return false;
  }
  return agoraMs - ultimaAtividadeMs > tempoSessaoEmMs(politica);
}

/** Descrição legível da política, para a tela de Configurações. */
export function descreverPolitica(politica: PoliticaDeSessao): string {
  return `A sessão expira após ${politica.tempoSessaoMin} minuto(s) sem atividade. Cada ação reinicia a contagem.`;
}
