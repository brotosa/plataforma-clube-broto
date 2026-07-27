/**
 * RN62 — **fonte única do saldo de patrocínio**.
 *
 * `saldo = adquiridas − vínculos vigentes`, e ele é **derivado, nunca
 * coluna**. A regra tem a mesma forma da RN51: a definição vive num lugar
 * só, e T32, T33, R1 e Dashboard leem dela com perguntas diferentes. Duas
 * telas contando vagas por caminhos próprios é como um número diverge do
 * outro sem ninguém perceber — foi o que a planilha fazia até esta onda.
 *
 * **Por que não é coluna.** Um `saldo` gravado envelhece no primeiro
 * vínculo encerrado, e envelhece calado: nada na tela denuncia que o número
 * parou de acompanhar os fatos. Um `ativadas` gravado tem o mesmo defeito
 * com uma agravante — ele *parece* um dado de contrato, quando é uma
 * contagem de outra tabela. A cerca de `infra/arquitetura/saldo-derivado.
 * test.ts` quebra o build se qualquer um dos dois reaparecer no schema.
 *
 * **Ausência não é zero.** Sem `assinaturasAdquiridas` confirmada não há
 * saldo — há desconhecimento. Zero afirmaria que não sobrou vaga; a
 * verdade é que ninguém sabe quantas foram compradas, porque os valores do
 * contrato Yamer são `[A CONFIRMAR — Marco]` (ficha §7). Herda a disciplina
 * da RN50 e da RN53: o traço vem com motivo escrito.
 *
 * Domínio puro: nada depende de banco, rede ou sessão. A data de referência
 * é sempre parâmetro — nunca `new Date()` aqui dentro.
 */

/** Por que o saldo não pôde ser apurado. Vira texto na tela, sem tradução. */
export const MOTIVO_SEM_ADQUIRIDAS =
  "aguarda o número de assinaturas adquiridas no contrato";

export type SaldoDePatrocinio =
  | {
      readonly estado: "APURADO";
      /** O que o contrato comprou. */
      readonly adquiridas: number;
      /** Vínculos com `fim` nulo — as vagas ocupadas AGORA. */
      readonly ativadas: number;
      /** `adquiridas − ativadas`. Pode ser negativo; ver abaixo. */
      readonly saldo: number;
      /**
       * Verdadeiro quando há mais vínculos vigentes do que vagas compradas.
       *
       * A plataforma **não impede** que isso aconteça e **não corrige** o
       * número para zero: se acontecer, é fato do negócio que alguém
       * precisa ver — contrato aditado sem atualizar o cadastro, vínculo
       * criado por engano, ou adquiridas digitadas errado. Esconder atrás
       * de um `Math.max(0, …)` transformaria um erro visível em um erro
       * invisível.
       */
      readonly excedido: boolean;
    }
  | {
      readonly estado: "INDISPONIVEL";
      /** Vínculos vigentes seguem contáveis mesmo sem adquiridas. */
      readonly ativadas: number;
      readonly motivo: string;
    };

export interface BaseDoSaldo {
  /** `contratos_patrocinio.assinaturas_adquiridas`; null = não confirmada. */
  readonly assinaturasAdquiridas: number | null;
  /** Contagem de `vinculos_patrocinio` com `fim IS NULL`. */
  readonly vinculosVigentes: number;
}

/**
 * A derivação. É a única no produto — quem precisar de saldo chama daqui,
 * inclusive o Dashboard da F20.
 */
export function derivarSaldo(base: BaseDoSaldo): SaldoDePatrocinio {
  const ativadas = base.vinculosVigentes;
  if (base.assinaturasAdquiridas === null) {
    return { estado: "INDISPONIVEL", ativadas, motivo: MOTIVO_SEM_ADQUIRIDAS };
  }
  const saldo = base.assinaturasAdquiridas - ativadas;
  return {
    estado: "APURADO",
    adquiridas: base.assinaturasAdquiridas,
    ativadas,
    saldo,
    excedido: saldo < 0,
  };
}

// ---------------------------------------------------------------------
// Vigência do contrato e seus selos (T32)
// ---------------------------------------------------------------------

/** Dias a partir dos quais o contrato entra em "vencendo" (prompt §4). */
export const DIAS_DE_ALERTA_DE_VIGENCIA = 30;

export type SituacaoDeVigencia =
  /** Sem `vigenciaFim` declarada — não há o que avaliar, e não se supõe. */
  | { readonly estado: "NAO_DECLARADA" }
  | { readonly estado: "VIGENTE"; readonly diasRestantes: number }
  | { readonly estado: "VENCENDO"; readonly diasRestantes: number }
  | { readonly estado: "VENCIDA"; readonly diasVencidos: number };

/** Diferença em dias de calendário (UTC), ignorando horas. */
function diasEntre(alvo: Date, hoje: Date): number {
  const umDia = 24 * 60 * 60 * 1000;
  const inicioAlvo = Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), alvo.getUTCDate());
  const inicioHoje = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((inicioAlvo - inicioHoje) / umDia);
}

/**
 * Situação da vigência na data de referência.
 *
 * O dia do vencimento ainda é vigente: um contrato que termina hoje vale
 * hoje. "Vencida" começa no dia seguinte — a mesma leitura que a RN37 já
 * usa para vencimento de assinatura.
 */
export function avaliarVigencia(
  vigenciaFim: Date | null,
  hoje: Date,
  diasDeAlerta: number = DIAS_DE_ALERTA_DE_VIGENCIA,
): SituacaoDeVigencia {
  if (vigenciaFim === null) {
    return { estado: "NAO_DECLARADA" };
  }
  const dias = diasEntre(vigenciaFim, hoje);
  if (dias < 0) {
    return { estado: "VENCIDA", diasVencidos: -dias };
  }
  if (dias <= diasDeAlerta) {
    return { estado: "VENCENDO", diasRestantes: dias };
  }
  return { estado: "VIGENTE", diasRestantes: dias };
}

/** Texto do selo da T32. Ausência de vigência tem texto próprio, não vazio. */
export function rotularVigencia(situacao: SituacaoDeVigencia): string {
  switch (situacao.estado) {
    case "NAO_DECLARADA":
      return "vigência não declarada";
    case "VENCIDA":
      return "vencida";
    case "VENCENDO":
      return `vencendo em ${situacao.diasRestantes} d`;
    case "VIGENTE":
      return "vigente";
  }
}

// ---------------------------------------------------------------------
// Vínculo
// ---------------------------------------------------------------------

/** Vínculo vigente = sem data de fim. É a definição, e só existe aqui. */
export function estaVigente(vinculo: { fim: Date | null }): boolean {
  return vinculo.fim === null;
}

/**
 * Encerrar um vínculo devolve a vaga ao saldo **e preserva o histórico**.
 *
 * Esta função existe para deixar a regra escrita em um lugar: encerrar é
 * datar o fim, jamais apagar a linha. A ficha §7 registra que a
 * rotatividade de vaga continua sendo pergunta de negócio em aberto — o
 * modelo a comporta sem decidi-la, e se a minuta proibir substituição
 * basta nunca encerrar vínculo, sem tocar em código.
 */
export function encerrar(
  vinculo: { inicio: Date; fim: Date | null },
  fim: Date,
): { inicio: Date; fim: Date } {
  if (vinculo.fim !== null) {
    throw new Error("Vínculo já encerrado.");
  }
  if (fim < vinculo.inicio) {
    throw new Error("O fim do vínculo não pode ser anterior ao início.");
  }
  return { inicio: vinculo.inicio, fim };
}
