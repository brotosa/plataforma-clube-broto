/**
 * RN08 — CNPJ único e validado.
 *
 * **CNPJ alfanumérico (lei vigente).** A Receita Federal tornou o CNPJ
 * alfanumérico (IN RFB nº 2.229/2024): as **12 primeiras** posições (raiz de
 * 8 + ordem de 4) passam a aceitar letras `A–Z` e dígitos `0–9`; os **2
 * dígitos verificadores continuam numéricos**. O cálculo do DV segue o
 * módulo 11 de sempre, mas o valor de cada caractere é o seu **código ASCII
 * menos 48** (`'0'..'9'` → 0..9; `'A'..'Z'` → 17..42). Assim o CNPJ numérico
 * antigo é um caso particular do alfanumérico e continua válido — nenhum
 * cadastro existente deixa de valer.
 *
 * A unicidade é garantida pela constraint UNIQUE do banco; aqui vive a
 * validação estrutural, usada nos formulários e nos serviços de escrita.
 * Como é fonte única, corrigir aqui adequa aliados, patrocinadores, prospects
 * e as importações de uma vez.
 */

/**
 * Remove a máscara (pontos, barra, hífen, espaços) e normaliza para
 * maiúsculas — as letras do CNPJ alfanumérico são sempre maiúsculas. Não
 * remove mais as letras: `\D` descartava o miolo alfanumérico.
 */
export function normalizarCnpj(entrada: string): string {
  return entrada.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** Formata 14 caracteres como 00.000.000/0000-00 (exibição). */
export function formatarCnpj(cnpj: string): string {
  const caracteres = normalizarCnpj(cnpj);
  if (caracteres.length !== 14) {
    return cnpj;
  }
  return `${caracteres.slice(0, 2)}.${caracteres.slice(2, 5)}.${caracteres.slice(5, 8)}/${caracteres.slice(8, 12)}-${caracteres.slice(12)}`;
}

/**
 * Valor do caractere no cálculo do DV: código ASCII − 48 (regra oficial do
 * CNPJ alfanumérico). Para dígitos coincide com o próprio número.
 */
function valorDoCaractere(caractere: string): number {
  return caractere.charCodeAt(0) - 48;
}

function calcularDigito(base: string): number {
  // Pesos do módulo 11: 2..9 repetidos da direita para a esquerda.
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += valorDoCaractere(base[i]!) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida um CNPJ (aceita com ou sem máscara). Estrutura oficial: 12 posições
 * alfanuméricas (`0-9`, `A-Z`) seguidas de 2 dígitos verificadores numéricos.
 * O CNPJ numérico antigo passa por esta mesma regra.
 */
export function validarCnpj(entrada: string): boolean {
  const cnpj = normalizarCnpj(entrada);
  if (cnpj.length !== 14) {
    return false;
  }
  // 12 primeiras alfanuméricas; as duas últimas (DV) são sempre numéricas.
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) {
    return false;
  }
  // Um único caractere repetido 14 vezes fecha os verificadores pela conta,
  // mas não é CNPJ real (ex.: 00000000000000).
  if (/^(.)\1{13}$/.test(cnpj)) {
    return false;
  }
  const digito1 = calcularDigito(cnpj.slice(0, 12));
  const digito2 = calcularDigito(cnpj.slice(0, 12) + String(digito1));
  return cnpj[12] === String(digito1) && cnpj[13] === String(digito2);
}
