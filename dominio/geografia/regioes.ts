/**
 * Regiões do Brasil e a que região cada UF pertence.
 *
 * É fato geográfico oficial (divisão regional do IBGE), não parâmetro de
 * negócio: não entra no Parametrizador, não versiona e não tem efeito
 * prospectivo. As UFs em si continuam vindo da tabela `ufs` (lista de
 * domínio da Onda 3) — aqui só mora o agrupamento, que a T29 usa como
 * filtro e a T30 como eixo do ranking.
 *
 * A sigla é a chave porque é o que o cadastro guarda (`empresas.endereco_uf`
 * e `ufs.sigla`).
 */

export const REGIOES = ["NORTE", "NORDESTE", "CENTRO_OESTE", "SUDESTE", "SUL"] as const;

export type Regiao = (typeof REGIOES)[number];

export const ROTULOS_REGIAO: Readonly<Record<Regiao, string>> = {
  NORTE: "Norte",
  NORDESTE: "Nordeste",
  CENTRO_OESTE: "Centro-Oeste",
  SUDESTE: "Sudeste",
  SUL: "Sul",
};

/** As 27 unidades federativas, agrupadas na divisão regional do IBGE. */
export const UFS_POR_REGIAO: Readonly<Record<Regiao, ReadonlyArray<string>>> = {
  NORTE: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"],
  NORDESTE: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
  CENTRO_OESTE: ["DF", "GO", "MS", "MT"],
  SUDESTE: ["ES", "MG", "RJ", "SP"],
  SUL: ["PR", "RS", "SC"],
};

const REGIAO_POR_UF: ReadonlyMap<string, Regiao> = new Map(
  REGIOES.flatMap((regiao) => UFS_POR_REGIAO[regiao].map((sigla) => [sigla, regiao] as const)),
);

/** Todas as siglas conhecidas, em ordem alfabética. */
export const SIGLAS_UF: ReadonlyArray<string> = [...REGIAO_POR_UF.keys()].sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
);

/**
 * Região da UF, ou `null` quando a sigla não é reconhecida.
 *
 * Nulo em vez de um palpite: o cadastro tem endereço livre e uma sigla
 * digitada errada não pode virar volume de uma região que ninguém
 * declarou (RN53).
 */
export function regiaoDaUf(sigla: string | null | undefined): Regiao | null {
  if (!sigla) {
    return null;
  }
  return REGIAO_POR_UF.get(sigla.trim().toUpperCase()) ?? null;
}

export function ehSiglaConhecida(sigla: string | null | undefined): boolean {
  return regiaoDaUf(sigla) !== null;
}
