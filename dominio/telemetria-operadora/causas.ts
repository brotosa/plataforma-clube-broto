/**
 * As causas de recusa de linha (RN67/RN69), contadas **separadamente**.
 *
 * Contar recusas num número só esconde justamente o que a operação
 * precisa saber: "300 linhas recusadas" não diz se o arquivo veio sem a
 * coluna de chave, se a origem está suja ou se a base está desalinhada —
 * e cada uma dessas leva a uma ação diferente, com um interlocutor
 * diferente.
 */

export type CausaDeRecusa =
  // --- As três da junção nominal (RN69), que o prompt §6 exige distintas
  /** Layout incompleto: o arquivo não traz coluna de CPF. Fala com a operadora. */
  | "SEM_COLUNA_DE_CPF"
  /** Dado sujo na origem: CPF presente, dígito verificador não fecha. */
  | "CPF_INVALIDO"
  /** Base desalinhada: CPF válido, sem assinante correspondente aqui. */
  | "CPF_SEM_ASSINANTE"
  // --- Catálogo
  /** Linha sem o identificador que a liga ao cadastro (id da oferta/seller). */
  | "SEM_IDENTIFICADOR"
  /** O item existe no arquivo e não no cadastro — vira divergência (RN70). */
  | "ITEM_DESCONHECIDO_NA_PLATAFORMA"
  /** Contador ou data ilegível na linha. */
  | "VALOR_ILEGIVEL"
  // --- Comum
  /** Linha repetida dentro do MESMO arquivo. */
  | "LINHA_DUPLICADA_NO_ARQUIVO";

/**
 * Texto de cada causa, para a T34 e para o resultado da importação.
 *
 * Nomeiam a causa e **não sugerem repetir o envio** (RN55): reenviar o
 * mesmo arquivo produz exatamente o mesmo resultado, e "tente novamente"
 * seria conselho errado em todas elas.
 */
export const TEXTO_DA_CAUSA: Readonly<Record<CausaDeRecusa, string>> = {
  SEM_COLUNA_DE_CPF:
    "sem coluna de CPF — o arquivo não traz a chave que liga a linha ao assinante (RN69); é layout incompleto, e quem resolve é a operadora",
  CPF_INVALIDO:
    "CPF inválido — o dígito verificador não confere; é dado sujo na origem, e a correção se faz lá",
  CPF_SEM_ASSINANTE:
    "CPF sem assinante correspondente — a chave é válida, mas a pessoa não está na base da plataforma; é desalinhamento entre as duas bases",
  SEM_IDENTIFICADOR:
    "linha sem identificador — não traz o id que a liga ao cadastro da plataforma",
  ITEM_DESCONHECIDO_NA_PLATAFORMA:
    "item desconhecido na plataforma — existe no arquivo da operadora e não no cadastro; foi registrado como divergência (RN70), não corrigido",
  VALOR_ILEGIVEL: "valor ilegível — contador ou data que não se lê como número/data",
  LINHA_DUPLICADA_NO_ARQUIVO:
    "linha repetida dentro do próprio arquivo — só a primeira ocorrência foi considerada",
};

/** Contagem por causa; ausência de uma causa é ausência da chave, não zero. */
export type RecusasPorCausa = Partial<Record<CausaDeRecusa, number>>;

export function contarRecusa(
  acumulado: RecusasPorCausa,
  causa: CausaDeRecusa,
): RecusasPorCausa {
  acumulado[causa] = (acumulado[causa] ?? 0) + 1;
  return acumulado;
}

export function totalDeRecusas(recusas: RecusasPorCausa): number {
  return Object.values(recusas).reduce((soma: number, n) => soma + (n ?? 0), 0);
}

/**
 * Lê o Json gravado em `importacoes_telemetria.recusas_por_causa` de volta
 * para o tipo, descartando chave desconhecida.
 *
 * Descartar, e não falhar: uma causa removida do código em fase futura
 * deixaria o histórico ilegível, e histórico de importação não se
 * reescreve.
 */
export function lerRecusasPorCausa(valor: unknown): RecusasPorCausa {
  if (!valor || typeof valor !== "object") return {};
  const saida: RecusasPorCausa = {};
  for (const [chave, quantidade] of Object.entries(valor as Record<string, unknown>)) {
    if (chave in TEXTO_DA_CAUSA && typeof quantidade === "number") {
      saida[chave as CausaDeRecusa] = quantidade;
    }
  }
  return saida;
}
