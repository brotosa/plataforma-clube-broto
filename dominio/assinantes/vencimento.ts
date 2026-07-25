/**
 * RN37 — vencimento é visibilidade e filtro ("vence em 30/60/90 dias");
 * NENHUMA ação de cobrança ou disparo na v1. As janelas do filtro são
 * cumulativas (vence em 90 inclui quem vence em 30); a janela exibida no
 * perfil (T19) é a mais apertada em que o vencimento cabe.
 */

export const JANELAS_VENCIMENTO = [30, 60, 90] as const;
export type JanelaVencimento = (typeof JANELAS_VENCIMENTO)[number];

/** Diferença em dias de calendário (UTC), ignorando horas. */
export function diasAteVencimento(vencimento: Date, hoje: Date): number {
  const umDia = 24 * 60 * 60 * 1000;
  const inicioVencimento = Date.UTC(
    vencimento.getUTCFullYear(),
    vencimento.getUTCMonth(),
    vencimento.getUTCDate(),
  );
  const inicioHoje = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((inicioVencimento - inicioHoje) / umDia);
}

/**
 * Janela mais apertada em que o vencimento cabe: 30, 60 ou 90 dias à
 * frente. null = já vencido ou além de 90 dias (fora das janelas da v1).
 */
export function janelaVencimento(vencimento: Date, hoje: Date): JanelaVencimento | null {
  const dias = diasAteVencimento(vencimento, hoje);
  if (dias < 0) {
    return null;
  }
  for (const janela of JANELAS_VENCIMENTO) {
    if (dias <= janela) {
      return janela;
    }
  }
  return null;
}

/**
 * Predicado do filtro cumulativo "vence em N dias" (segmentação e T18):
 * hoje ≤ vencimento ≤ hoje + N. Vencidos não contam — "vence em" fala do
 * futuro; inadimplência é assunto de status, quando a origem do dado da
 * assinatura for confirmada.
 */
export function venceEm(vencimento: Date, hoje: Date, janela: JanelaVencimento): boolean {
  const dias = diasAteVencimento(vencimento, hoje);
  return dias >= 0 && dias <= janela;
}
