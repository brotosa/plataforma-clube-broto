import type { ConteudoDossie } from "@/dominio/dossie/schema";

/**
 * Porta do dossiê assistido (ficha §6): o caso de uso conhece esta
 * interface, nunca um fornecedor concreto. Duas implementações na F8 —
 * `AnthropicDossieProvider` (API com busca na web) e
 * `ManualDossieProvider` (colar/anexar), este sempre disponível, como
 * alternativa e como plano B da automação.
 */

export interface PedidoDeDossie {
  nomeEmpresa: string;
  site?: string | null;
  /** Notas do analista — vão para {{contexto_adicional}} do template. */
  contextoAdicional?: string | null;
  /** Só o provedor manual usa: o conteúdo colado/anexado pelo analista. */
  conteudoColado?: string | null;
  /**
   * Custo máximo em reais que esta execução pode consumir. O provedor
   * automático interrompe a geração ao ultrapassá-lo e registra o gasto —
   * o teto vale durante a execução, não só antes dela.
   */
  custoMaximoBrl?: number | null;
}

/** Consumo de uma execução, para o registro de custo e telemetria. */
export interface UsoDaExecucao {
  tokensEntrada: number;
  tokensSaida: number;
  /** Buscas na web realizadas; null quando o provedor não faz buscas. */
  buscasWeb: number | null;
}

export interface ResultadoDaGeracao {
  conteudo: ConteudoDossie;
  /** Observações de completude — não bloqueiam; o revisor decide (RN19). */
  avisos: ReadonlyArray<string>;
  uso: UsoDaExecucao;
  modelo: string | null;
}

export type CodigoDeFalha =
  | "INDISPONIVEL"
  | "CONTEUDO_AUSENTE"
  | "RESPOSTA_INVALIDA"
  | "RECUSA"
  | "TETO_UNITARIO"
  | "FALHA_API";

/**
 * Falha de geração com mensagem pronta para a T11. Carrega o consumo já
 * realizado quando houver: mesmo a tentativa que falha gasta, e o gasto
 * precisa aparecer na telemetria.
 */
export class ErroDeProvedor extends Error {
  readonly codigo: CodigoDeFalha;
  readonly uso: UsoDaExecucao | null;
  readonly detalhes: ReadonlyArray<string>;

  constructor(
    codigo: CodigoDeFalha,
    mensagem: string,
    opcoes: { uso?: UsoDaExecucao | null; detalhes?: ReadonlyArray<string> } = {},
  ) {
    super(mensagem);
    this.name = "ErroDeProvedor";
    this.codigo = codigo;
    this.uso = opcoes.uso ?? null;
    this.detalhes = opcoes.detalhes ?? [];
  }
}

export interface DossieProvider {
  /** Identificação gravada na execução ("anthropic", "manual"). */
  readonly nome: string;
  /** Automático = consome orçamento e roda de forma assíncrona. */
  readonly automatico: boolean;
  /**
   * Pior caso em reais desta execução, apurado antes de executar — é o
   * número que o caso de uso compara aos tetos. Zero em provedor que não
   * consome orçamento.
   */
  estimarCustoMaximo(pedido: PedidoDeDossie): Promise<number>;
  gerar(pedido: PedidoDeDossie): Promise<ResultadoDaGeracao>;
}
