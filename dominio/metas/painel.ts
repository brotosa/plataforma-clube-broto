/**
 * Painel de meta × realizado (RN22) como serviço puro: a aritmética do
 * atingimento e o vocabulário do resultado. O que conta como "realizado"
 * é decisão de negócio e está documentado aqui, porque é o ponto em que
 * um número errado passaria despercebido.
 *
 * **Realizado = promoções efetivadas no período.** Promoção é a empresa
 * que JÁ EXISTIA e mudou de estágio para Aliada ativa — aprovada pelo
 * motor (RN06/RN20) ou promovida direto quando a regra está desligada.
 * As 46 aliadas da carga inicial nasceram ativas e **não** são promoções:
 * a consulta as separa pelo evento de auditoria sem valor anterior.
 */

export interface LinhaDoPainel {
  /** Nulo na linha geral; preenchido nas linhas por categoria. */
  categoriaId: string | null;
  categoriaNome: string | null;
  meta: number;
  realizado: number;
}

export interface LinhaCalculada extends LinhaDoPainel {
  /** 0–100, limitado para a barra não estourar quando a meta é superada. */
  percentual: number;
  /** Percentual real, sem limite — o número que a tela mostra em texto. */
  percentualReal: number;
  atingida: boolean;
  faltam: number;
}

/** Percentual de atingimento, arredondado para inteiro. */
export function percentualDeAtingimento(realizado: number, meta: number): number {
  if (meta <= 0) {
    return 0;
  }
  return Math.round((realizado / meta) * 100);
}

export function calcularLinha(linha: LinhaDoPainel): LinhaCalculada {
  const percentualReal = percentualDeAtingimento(linha.realizado, linha.meta);
  return {
    ...linha,
    percentual: Math.min(percentualReal, 100),
    percentualReal,
    atingida: linha.meta > 0 && linha.realizado >= linha.meta,
    faltam: Math.max(linha.meta - linha.realizado, 0),
  };
}

/**
 * Frase de acompanhamento do painel. Sem meta configurada não se inventa
 * número: a tela diz que a meta ainda não foi definida.
 */
export function resumoDoAtingimento(linha: LinhaCalculada): string {
  if (linha.meta <= 0) {
    return "Meta do período ainda não definida.";
  }
  if (linha.atingida) {
    const excedente = linha.realizado - linha.meta;
    return excedente > 0
      ? `Meta atingida, com ${excedente} ${excedente === 1 ? "aliada" : "aliadas"} acima do previsto.`
      : "Meta atingida.";
  }
  const verbo = linha.faltam === 1 ? "Falta" : "Faltam";
  const substantivo = linha.faltam === 1 ? "nova aliada" : "novas aliadas";
  return `${verbo} ${linha.faltam} ${substantivo} para a meta do período.`;
}
