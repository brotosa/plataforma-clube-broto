/**
 * Janela de não-renovação contratual (ficha §3.1): padrão de 12 meses com
 * renovação automática; o alerta acende a ≤30 dias do aniversário da
 * data-base de vigência (marcado pelo job diário, exibido em T1/T2).
 */

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Próximo aniversário anual da data-base a partir de "hoje" (em UTC). */
export function proximoAniversario(vigenciaBase: Date, hoje: Date): Date {
  const base = new Date(vigenciaBase);
  const corrente = new Date(hoje);
  corrente.setUTCHours(0, 0, 0, 0);
  const aniversario = new Date(
    Date.UTC(corrente.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()),
  );
  if (aniversario.getTime() < corrente.getTime()) {
    aniversario.setUTCFullYear(aniversario.getUTCFullYear() + 1);
  }
  return aniversario;
}

/** Dias (inteiros) até o próximo aniversário contratual. */
export function diasParaAniversario(vigenciaBase: Date, hoje: Date): number {
  const corrente = new Date(hoje);
  corrente.setUTCHours(0, 0, 0, 0);
  return Math.round(
    (proximoAniversario(vigenciaBase, hoje).getTime() - corrente.getTime()) / DIA_EM_MS,
  );
}

/** Contrato entra na janela de não-renovação a ≤30 dias do aniversário. */
export function estaNaJanelaDeNaoRenovacao(vigenciaBase: Date, hoje: Date): boolean {
  return diasParaAniversario(vigenciaBase, hoje) <= 30;
}
