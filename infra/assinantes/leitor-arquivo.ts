/**
 * Leitor dos arquivos de assinantes da T20 — "CSV ou XLSX" (protótipo
 * v6.1). O dicionário real do arquivo do comprador é [A CONFIRMAR]
 * (ficha §10): o leitor entrega colunas e linhas CRUAS, chaveadas pelo
 * cabeçalho original; quem dá significado é o mapeador de colunas.
 *
 * **F20 — a mecânica saiu daqui para `infra/planilhas/leitor-tabular.ts`**
 * e este módulo passou a ser o nome que a T20 usa para ela. Nada mudou de
 * comportamento: as tolerâncias documentadas (BOM, delimitador detectado,
 * aspas RFC 4180, primeira aba do XLSX, datas em ISO, coluna sem nome
 * descartada) são as mesmas linhas de código, e os testes deste arquivo
 * seguem sem uma alteração — é o que prova a extração.
 *
 * A razão de extrair, e não copiar: a telemetria da operadora (RN67)
 * precisa do mesmo leitor, e um segundo caminho paralelo para a mesma
 * coisa é o defeito que a disciplina da RN60 existe para impedir.
 */

import {
  type ArquivoTabularLido,
  lerArquivoTabular,
  lerCsvTabular,
  lerXlsxTabular,
} from "@/infra/planilhas/leitor-tabular";

export type ArquivoAssinantesLido = ArquivoTabularLido;

export const lerCsvAssinantes = lerCsvTabular;
export const lerXlsxAssinantes = lerXlsxTabular;
export const lerArquivoAssinantes = lerArquivoTabular;
