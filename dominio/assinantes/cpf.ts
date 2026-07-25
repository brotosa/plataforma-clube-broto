/**
 * RN30 — CPF do assinante: validado na entrada, cifrado em repouso,
 * mascarado por padrão. Aqui vive a validação estrutural (dígitos
 * verificadores, módulo 11) e a normalização usadas pela importação;
 * cifragem e hash ficam em infra/assinantes/protecao-cpf.ts.
 */

/** Remove máscara, mantendo apenas dígitos. */
export function normalizarCpf(entrada: string): string {
  return entrada.replace(/\D/g, "");
}

/** Formata 11 dígitos como 000.000.000-00 (exibição plena, com permissão). */
export function formatarCpf(cpf: string): string {
  const digitos = normalizarCpf(cpf);
  if (digitos.length !== 11) {
    return cpf;
  }
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

function calcularDigito(base: string): number {
  // Pesos do módulo 11: (tamanho+1)..2 da esquerda para a direita.
  let soma = 0;
  let peso = base.length + 1;
  for (let i = 0; i < base.length; i += 1) {
    soma += Number(base[i]) * peso;
    peso -= 1;
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** Valida os dígitos verificadores do CPF (aceita com ou sem máscara). */
export function validarCpf(entrada: string): boolean {
  const cpf = normalizarCpf(entrada);
  if (cpf.length !== 11) {
    return false;
  }
  // Sequências de um único dígito repetido têm verificadores "válidos",
  // mas não são CPFs reais.
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  const digito1 = calcularDigito(cpf.slice(0, 9));
  const digito2 = calcularDigito(cpf.slice(0, 10));
  return cpf[9] === String(digito1) && cpf[10] === String(digito2);
}

/**
 * Completa os dois dígitos verificadores de uma base de 9 dígitos.
 * Uso exclusivo do gerador de fixtures sintéticas (CPFs algoritmicamente
 * formados, regra de PF do CLAUDE.md) — nunca de cadastro de produção.
 */
export function completarDigitosCpf(base9: string): string {
  if (!/^\d{9}$/.test(base9)) {
    throw new Error("A base do CPF sintético deve ter exatamente 9 dígitos.");
  }
  const digito1 = calcularDigito(base9);
  const digito2 = calcularDigito(base9 + String(digito1));
  return `${base9}${digito1}${digito2}`;
}
