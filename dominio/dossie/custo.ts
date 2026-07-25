/**
 * Custo e tetos do dossiê automático (prompt da Onda 2, F8) como serviços
 * puros. Três valores são **[A CONFIRMAR TI]** e vivem exclusivamente em
 * variáveis de ambiente, sem nenhum default embutido: o teto mensal, o
 * custo máximo por dossiê e a tarifa em reais por milhão de tokens (a
 * tabela da Anthropic é em dólar; a conversão é decisão da TI, não do
 * código). Sem tarifa configurada não há como apurar custo nem respeitar
 * teto — e o provedor automático fica indisponível, por construção.
 *
 * A leitura do ambiente é da infraestrutura (infra/dossie/configuracao.ts);
 * aqui ficam apenas a aritmética e a decisão de bloqueio, testáveis sem
 * ambiente.
 */

/** Tarifa em reais por milhão de tokens, conforme configurado pela TI. */
export interface TarifaDossie {
  entradaBrlPorMilhao: number;
  saidaBrlPorMilhao: number;
}

/** Tetos de gasto, em reais. */
export interface TetosDossie {
  mensalBrl: number;
  unitarioBrl: number;
}

/** Consumo informado pelo provedor ao final de uma execução. */
export interface UsoDeTokens {
  tokensEntrada: number;
  tokensSaida: number;
}

const TOKENS_POR_MILHAO = 1_000_000;

/** Arredonda para centavos de real (4 casas — a coluna é DECIMAL(12,4)). */
function arredondar(valor: number): number {
  return Math.round(valor * 10_000) / 10_000;
}

/** Custo em reais de um consumo, pela tarifa configurada. */
export function apurarCusto(uso: UsoDeTokens, tarifa: TarifaDossie): number {
  const entrada = (uso.tokensEntrada / TOKENS_POR_MILHAO) * tarifa.entradaBrlPorMilhao;
  const saida = (uso.tokensSaida / TOKENS_POR_MILHAO) * tarifa.saidaBrlPorMilhao;
  return arredondar(entrada + saida);
}

/**
 * Custo do pior caso de uma execução, apurado ANTES de chamar a API: o
 * prompt inteiro na entrada e o limite de saída inteiro consumido. É o
 * número comparado ao teto unitário — estimar por baixo transformaria o
 * teto em decoração.
 */
export function estimarCustoMaximo(
  limites: { tokensEntradaEstimados: number; tokensSaidaMaximos: number },
  tarifa: TarifaDossie,
): number {
  return apurarCusto(
    {
      tokensEntrada: limites.tokensEntradaEstimados,
      tokensSaida: limites.tokensSaidaMaximos,
    },
    tarifa,
  );
}

export type VeredictoTeto =
  | { liberado: true }
  | { liberado: false; motivo: "TETO_MENSAL" | "TETO_UNITARIO"; mensagem: string };

/** Formata reais no padrão brasileiro para as mensagens de bloqueio. */
export function formatarBrl(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Decide se uma nova geração cabe nos tetos. O teto mensal considera o
 * gasto já realizado no mês somado ao pior caso da execução pedida — a
 * geração é bloqueada ANTES de gastar, com mensagem clara de quanto resta.
 */
export function verificarTetos(parametros: {
  custoEstimado: number;
  gastoNoMes: number;
  tetos: TetosDossie;
}): VeredictoTeto {
  const { custoEstimado, gastoNoMes, tetos } = parametros;

  if (custoEstimado > tetos.unitarioBrl) {
    return {
      liberado: false,
      motivo: "TETO_UNITARIO",
      mensagem:
        `Geração bloqueada: o custo máximo desta execução (${formatarBrl(custoEstimado)}) ultrapassa o teto por dossiê ` +
        `(${formatarBrl(tetos.unitarioBrl)}, DOSSIE_CUSTO_MAX_UNITARIO_BRL). Ajuste o teto com a TI ou use a inserção manual.`,
    };
  }

  if (gastoNoMes + custoEstimado > tetos.mensalBrl) {
    const restante = Math.max(tetos.mensalBrl - gastoNoMes, 0);
    return {
      liberado: false,
      motivo: "TETO_MENSAL",
      mensagem:
        `Geração bloqueada: o teto mensal de dossiês (${formatarBrl(tetos.mensalBrl)}, DOSSIE_TETO_MENSAL_BRL) foi atingido — ` +
        `${formatarBrl(gastoNoMes)} já consumidos no mês e ${formatarBrl(restante)} disponíveis, ` +
        `abaixo dos ${formatarBrl(custoEstimado)} desta execução. Use a inserção manual ou fale com a TI.`,
    };
  }

  return { liberado: true };
}

/** Primeiro instante do mês de uma data — janela do teto mensal. */
export function inicioDoMes(referencia: Date): Date {
  return new Date(referencia.getFullYear(), referencia.getMonth(), 1, 0, 0, 0, 0);
}

/** Primeiro instante do mês seguinte — fim exclusivo da janela. */
export function inicioDoMesSeguinte(referencia: Date): Date {
  return new Date(referencia.getFullYear(), referencia.getMonth() + 1, 1, 0, 0, 0, 0);
}
