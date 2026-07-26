/**
 * Seletor de período da T26 (ficha Onda 6 §2).
 *
 * Vive no domínio, e não junto das consultas, por um motivo concreto: o
 * seletor é um componente de cliente. Importar as constantes de
 * `infra/consultas/dashboard.ts` arrastaria Prisma e a proteção de CPF
 * (node:crypto) para o bundle do navegador — o build falha, e com razão.
 */

/**
 * Os três períodos computáveis.
 *
 * O protótipo v8.1 FINAL mostra um quarto — "Safra 25/26". O recorte de
 * safra é definição de negócio: início e fim variam por cultura e por
 * região, e essa janela não consta de nenhuma ficha nem do Parametrizador.
 * Fica declarada como [A CONFIRMAR] no README em vez de virar um Jul→Jun
 * inventado no código.
 */
export const PERIODOS_DASHBOARD = ["30", "90", "12m"] as const;
export type PeriodoDashboard = (typeof PERIODOS_DASHBOARD)[number];

export const ROTULOS_PERIODO: Readonly<Record<PeriodoDashboard, string>> = {
  "30": "Últimos 30 dias",
  "90": "Últimos 90 dias",
  "12m": "Últimos 12 meses",
};

export const PERIODO_PADRAO: PeriodoDashboard = "90";

export interface JanelaDashboard {
  inicio: Date;
  fim: Date;
  dias: number;
  rotulo: string;
}

/** Querystring é entrada de usuário: o que não for período conhecido vira o padrão. */
export function periodoValido(valor: unknown): PeriodoDashboard {
  return PERIODOS_DASHBOARD.includes(valor as PeriodoDashboard)
    ? (valor as PeriodoDashboard)
    : PERIODO_PADRAO;
}

export function janelaDoDashboard(
  periodo: PeriodoDashboard,
  agora: Date = new Date(),
): JanelaDashboard {
  const dias = periodo === "30" ? 30 : periodo === "90" ? 90 : 365;
  const inicio = new Date(agora);
  inicio.setUTCDate(inicio.getUTCDate() - dias);
  return { inicio, fim: agora, dias, rotulo: ROTULOS_PERIODO[periodo] };
}
