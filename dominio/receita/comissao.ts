import type { NaturezaOferta } from "@prisma/client";

/**
 * Economia da oferta (ficha §6): Receita Broto = valor efetivamente pago ×
 * comissão % do aliado — Benefícios apenas. Recompensas não comissionam.
 *
 * [A CONFIRMAR] — a regra de comissão do Cupom de desconto está em
 * confirmação de negócio. Enquanto a constante abaixo não for substituída
 * pela regra definitiva, NENHUM cálculo de receita é feito para cupom.
 */
export const COMISSAO_CUPOM = "EM_CONFIRMACAO" as const;

export type ResultadoReceita =
  | { aplicavel: true; valor: number }
  | { aplicavel: false; motivo: string };

/** Calcula a receita Broto de uma transação paga. */
export function calcularReceitaBroto(parametros: {
  natureza: NaturezaOferta;
  valorPago: number;
  comissaoPct: number | null;
}): ResultadoReceita {
  const { natureza, valorPago, comissaoPct } = parametros;
  if (natureza === "RECOMPENSA") {
    return { aplicavel: false, motivo: "Recompensas não geram comissão (definição contratual)." };
  }
  if (natureza === "CUPOM_DESCONTO") {
    return {
      aplicavel: false,
      motivo: `Comissão do cupom ${COMISSAO_CUPOM}: sem cálculo de receita até definição de negócio.`,
    };
  }
  if (comissaoPct === null) {
    return { aplicavel: false, motivo: "Comissão % do aliado não definida no bloco comercial." };
  }
  return { aplicavel: true, valor: (valorPago * comissaoPct) / 100 };
}
