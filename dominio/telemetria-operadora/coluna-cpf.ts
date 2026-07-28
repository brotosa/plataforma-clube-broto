/**
 * A coluna de chave da junção nominal (RN69; prompt §6).
 *
 * **A premissa e o que ela não cobre.** A ficha §1 assume, como premissa
 * de trabalho declarada, que a base da operadora passa a trazer o CPF do
 * titular — requisitado em 27/07. O que **não** foi observado em arquivo
 * real é o nome exato da coluna, se vem com máscara e se cobre todas as
 * linhas (`[A CONFIRMAR — Minutrade]`, ficha §8). Por isso este módulo
 * detecta pelo cabeçalho e tolera as duas formas, em vez de fixar um
 * formato — e por isso a ausência da coluna é um caminho de código de
 * primeira classe, não uma exceção: arquivo histórico não a tem, e a
 * importação dele precisa recusar bem, não quebrar.
 *
 * **Não há junção alternativa.** Nem por e-mail, nem por nome, nem por
 * telefone — RN69 é decisão registrada, não omissão. Este módulo não
 * exporta nada que se pareça com isso de propósito: o lugar onde alguém
 * acrescentaria o fallback é aqui, e não encontrar nenhum gancho é o
 * atrito que a regra quer.
 */

import { normalizarNomeDeColuna } from "./layouts";

/**
 * Grafias aceitas para a coluna, em ordem de preferência.
 *
 * As três primeiras são as que o prompt §6 manda aceitar; as demais são
 * variações prováveis da mesma coisa. A ordem importa: um arquivo com
 * "CPF" e "CPF do Responsável" deve casar com o primeiro.
 */
const GRAFIAS_ACEITAS = [
  "cpf",
  "cpf do cliente",
  "cpf titular",
  "cpf do titular",
  "cpf do assinante",
  "cpf do usuario",
  "num cpf",
  "nr cpf",
  "documento",
] as const;

/**
 * Acha a coluna de CPF no cabeçalho e devolve o **nome original** dela
 * (é por ele que se lê o valor da linha), ou `null` quando não existe.
 *
 * Devolver `null` — em vez de lançar — é o desenho: a ausência da coluna
 * não é erro de programa, é o estado de um arquivo histórico, e quem
 * chama a transforma na causa `SEM_COLUNA_DE_CPF`, contada linha a linha.
 */
export function detectarColunaCpf(colunas: readonly string[]): string | null {
  const porNomeNormalizado = new Map<string, string>();
  for (const coluna of colunas) {
    const normalizado = normalizarNomeDeColuna(coluna);
    if (!porNomeNormalizado.has(normalizado)) {
      porNomeNormalizado.set(normalizado, coluna);
    }
  }
  for (const grafia of GRAFIAS_ACEITAS) {
    const encontrada = porNomeNormalizado.get(grafia);
    if (encontrada) {
      return encontrada;
    }
  }
  return null;
}

/**
 * A leitura de um valor de CPF: com ou sem máscara, sempre normalizado a
 * dígitos.
 *
 * **Só isso.** A validação de dígito verificador e o HMAC ficam com quem
 * chama, e nesta ordem — `validarCpf` de `dominio/assinantes/cpf.ts`,
 * depois `hashCpf` de `infra/assinantes/protecao-cpf.ts`. O CPF nunca é
 * gravado em claro, nunca entra em log e nunca aparece no resultado da
 * importação; este módulo não o registra em lugar nenhum.
 */
export function normalizarValorDeCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}
