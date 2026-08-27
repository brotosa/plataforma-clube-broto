/**
 * Modelo de REFERÊNCIA do relatório de "Resgate e Compras das Ofertas" da
 * operadora — domínio puro.
 *
 * Diferente do modelo do importador de soluções ou da telemetria de voucher:
 * os quatro relatórios da operadora são **gerados pela Minutrade**, não
 * preenchidos aqui. Este arquivo não é um formulário a preencher — é uma
 * referência para conferir se o arquivo recebido tem as colunas esperadas,
 * com o nome real de cada uma e uma linha de exemplo por modalidade de
 * resgate (gratuito e checkout — desde 28/08, checkout é modalidade de
 * resgate, não uma categoria de "compra" à parte).
 *
 * O cabeçalho é a transcrição do arquivo real observado na primeira
 * importação (ago/2026). O CPF de exemplo é **SINTÉTICO** (dígitos
 * repetidos) — jamais de pessoa real (LGPD).
 */

/** Cabeçalho real do relatório de resgates/compras (ordem observada). */
export const CABECALHO_MODELO_RESGATES = [
  "Data da compra ou resgate",
  "cpf",
  "Id_Seller",
  "Id_oferta",
  "id_voucher",
  "Tipo de Oferta",
  "Valor",
  "Canal",
] as const;

/**
 * CSV de referência. `Id_oferta` é o **id da oferta na nossa plataforma** (o
 * que o importador usa para casar o evento à oferta); no arquivo real ele
 * vem preenchido pela operadora. `Tipo de Oferta` distingue as modalidades
 * de resgate — "Recompensa gratuita" (gratuito) e "Checkout no clube"/
 * "Checkout externo" (checkout) —, todas contadas como resgate.
 */
export function gerarModeloResgatesCsv(): string {
  const cpf = "111.111.111-11"; // SINTÉTICO — dígitos repetidos, nunca real
  const linhas = [
    CABECALHO_MODELO_RESGATES.join(";"),
    `2026-08-21 12:21:27;${cpf};48596479000105;<id_da_oferta_na_plataforma>;CB0001;Recompensa gratuita;0;app`,
    `2026-08-21 12:15:28;${cpf};48596479000105;<id_da_oferta_na_plataforma>;CB0002;Checkout no clube;149,90;web`,
  ];
  return linhas.join("\r\n") + "\r\n";
}
