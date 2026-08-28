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
export const PERIODOS_DASHBOARD = ["30", "90", "12m", "TODOS"] as const;
export type PeriodoDashboard = (typeof PERIODOS_DASHBOARD)[number];

export const ROTULOS_PERIODO: Readonly<Record<PeriodoDashboard, string>> = {
  "30": "Últimos 30 dias",
  "90": "Últimos 90 dias",
  "12m": "Últimos 12 meses",
  TODOS: "Todos os períodos",
};

export const PERIODO_PADRAO: PeriodoDashboard = "90";

export interface JanelaDashboard {
  inicio: Date;
  fim: Date;
  /**
   * Duração da janela em dias, ou `null` quando o período é "Todos" — o
   * `null` é o sinal, lido pelas consultas, de que NÃO há recorte por data:
   * a célula conta a base inteira. Com `inicio`/`fim` cobrindo do epoch a
   * um futuro distante, as consultas que filtram por intervalo já contam
   * tudo sem caso especial; as que precisam INCLUIR quem não tem a data
   * (aliado sem contrato assinado) checam `dias === null` e omitem o filtro.
   */
  dias: number | null;
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
  if (periodo === "TODOS") {
    // Intervalo que engloba qualquer data real (inclusive eventos com data
    // futura em relação a "agora"), para as consultas por intervalo contarem
    // tudo; `dias: null` sinaliza "sem recorte" a quem precisa distinguir.
    return {
      inicio: new Date("1970-01-01T00:00:00.000Z"),
      fim: new Date("9999-12-31T23:59:59.999Z"),
      dias: null,
      rotulo: ROTULOS_PERIODO.TODOS,
    };
  }
  const dias = periodo === "30" ? 30 : periodo === "90" ? 90 : 365;
  const inicio = new Date(agora);
  inicio.setUTCDate(inicio.getUTCDate() - dias);
  return { inicio, fim: agora, dias, rotulo: ROTULOS_PERIODO[periodo] };
}
