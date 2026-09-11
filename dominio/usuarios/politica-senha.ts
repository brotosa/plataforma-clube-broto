/**
 * Política de senha — regras puras da tela de Configurações.
 *
 * Domínio: nada aqui sabe de banco, bcrypt ou sessão. O caso de uso carrega a
 * política do banco, valida a senha contra ela por estas funções, confere o
 * histórico (que precisa do banco) e grava. A tela usa `descreverPolitica`
 * para dizer os requisitos antes de a pessoa digitar.
 *
 * **Os padrões preservam o comportamento anterior**: até esta fase a única
 * regra era o mínimo de 10 caracteres, sem exigência de classe. Por isso o
 * padrão é 10 e nenhuma classe exigida — o Administrador aperta a partir daí.
 */

export interface PoliticaDeSenha {
  /** Comprimento mínimo, em caracteres. */
  comprimentoMin: number;
  exigeMaiuscula: boolean;
  exigeMinuscula: boolean;
  exigeNumero: boolean;
  exigeSimbolo: boolean;
  /** Quantas senhas anteriores não podem repetir (0 = sem histórico). */
  historicoN: number;
}

/** Padrão do domínio — usado quando ainda não há linha de configuração. */
export const POLITICA_SENHA_PADRAO: PoliticaDeSenha = {
  comprimentoMin: 10,
  exigeMaiuscula: false,
  exigeMinuscula: false,
  exigeNumero: false,
  exigeSimbolo: false,
  historicoN: 5,
};

// Limites de sanidade dos PRÓPRIOS valores da política (o que o Admin salva).
// Não afrouxam o mínimo abaixo de 8 nem deixam o histórico virar peso inútil.
export const COMPRIMENTO_MIN_MINIMO = 8;
export const COMPRIMENTO_MIN_MAXIMO = 64;
export const HISTORICO_MINIMO = 0;
export const HISTORICO_MAXIMO = 24;

/**
 * Valida os VALORES que o Administrador tenta salvar (não uma senha). Recusa
 * fora dos limites de sanidade, nomeando a causa (RN55).
 */
export function validarPoliticaDeSenha(politica: PoliticaDeSenha): string[] {
  const erros: string[] = [];
  const { comprimentoMin, historicoN } = politica;

  if (!Number.isInteger(comprimentoMin) || comprimentoMin < COMPRIMENTO_MIN_MINIMO) {
    erros.push(`O comprimento mínimo não pode ser menor que ${COMPRIMENTO_MIN_MINIMO} caracteres.`);
  } else if (comprimentoMin > COMPRIMENTO_MIN_MAXIMO) {
    erros.push(`O comprimento mínimo não pode passar de ${COMPRIMENTO_MIN_MAXIMO} caracteres.`);
  }

  if (!Number.isInteger(historicoN) || historicoN < HISTORICO_MINIMO) {
    erros.push("O histórico de senhas não pode ser negativo (use 0 para desligar).");
  } else if (historicoN > HISTORICO_MAXIMO) {
    erros.push(`O histórico de senhas não pode passar de ${HISTORICO_MAXIMO}.`);
  }

  return erros;
}

// Reconhecedores por classe. Unicode-aware: letra maiúscula/minúscula acentuada
// conta; "símbolo" é o que não é letra, número nem espaço.
const TEM_MAIUSCULA = /\p{Lu}/u;
const TEM_MINUSCULA = /\p{Ll}/u;
const TEM_NUMERO = /\p{Nd}/u;
const TEM_SIMBOLO = /[^\p{L}\p{N}\s]/u;

/**
 * Valida uma SENHA contra a política — comprimento e classes exigidas. **Não**
 * confere o histórico: isso exige o banco e vive no caso de uso. Cada recusa
 * nomeia o requisito que faltou (RN55).
 */
export function validarSenhaContraPolitica(senha: string, politica: PoliticaDeSenha): string[] {
  const erros: string[] = [];

  if (senha.length < politica.comprimentoMin) {
    erros.push(`A senha precisa de ao menos ${politica.comprimentoMin} caracteres.`);
  }
  if (politica.exigeMaiuscula && !TEM_MAIUSCULA.test(senha)) {
    erros.push("A senha precisa de ao menos uma letra maiúscula.");
  }
  if (politica.exigeMinuscula && !TEM_MINUSCULA.test(senha)) {
    erros.push("A senha precisa de ao menos uma letra minúscula.");
  }
  if (politica.exigeNumero && !TEM_NUMERO.test(senha)) {
    erros.push("A senha precisa de ao menos um número.");
  }
  if (politica.exigeSimbolo && !TEM_SIMBOLO.test(senha)) {
    erros.push("A senha precisa de ao menos um símbolo (ex.: ! @ # $ %).");
  }

  return erros;
}

/** Frase única com os requisitos, para o campo de ajuda da tela de troca. */
export function descreverPolitica(politica: PoliticaDeSenha): string {
  const exigencias: string[] = [];
  if (politica.exigeMaiuscula) exigencias.push("uma maiúscula");
  if (politica.exigeMinuscula) exigencias.push("uma minúscula");
  if (politica.exigeNumero) exigencias.push("um número");
  if (politica.exigeSimbolo) exigencias.push("um símbolo");

  const base = `Ao menos ${politica.comprimentoMin} caracteres`;
  const classes =
    exigencias.length > 0
      ? `, incluindo ${exigencias.slice(0, -1).join(", ")}${
          exigencias.length > 1 ? " e " : ""
        }${exigencias[exigencias.length - 1]}`
      : "";
  const historico =
    politica.historicoN > 0
      ? `. Não pode repetir as últimas ${politica.historicoN} senhas`
      : "";
  return `${base}${classes}${historico}.`;
}
