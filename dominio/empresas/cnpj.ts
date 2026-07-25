/**
 * RN08 — CNPJ único e validado.
 * Validação de dígito verificador conforme o algoritmo oficial (módulo 11).
 * A unicidade é garantida pela constraint UNIQUE do banco; aqui vive a
 * validação estrutural, usada nos formulários e nos serviços de escrita.
 */

/** Remove máscara, mantendo apenas dígitos. */
export function normalizarCnpj(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

/** Formata 14 dígitos como 00.000.000/0000-00 (exibição). */
export function formatarCnpj(cnpj: string): string {
  const digitos = normalizarCnpj(cnpj);
  if (digitos.length !== 14) {
    return cnpj;
  }
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

function calcularDigito(base: string): number {
  // Pesos do módulo 11: 2..9 repetidos da direita para a esquerda.
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Valida os dígitos verificadores do CNPJ (aceita com ou sem máscara). */
export function validarCnpj(entrada: string): boolean {
  const cnpj = normalizarCnpj(entrada);
  if (cnpj.length !== 14) {
    return false;
  }
  // Sequências de um único dígito repetido têm verificadores "válidos",
  // mas não são CNPJs reais.
  if (/^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }
  const digito1 = calcularDigito(cnpj.slice(0, 12));
  const digito2 = calcularDigito(cnpj.slice(0, 12) + String(digito1));
  return cnpj[12] === String(digito1) && cnpj[13] === String(digito2);
}
