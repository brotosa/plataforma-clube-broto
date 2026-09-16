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
  /** Validade da senha em dias — **0 desativa** a troca periódica. */
  validadeDias: number;
  /**
   * Validade da **credencial provisória** em horas — **0 desativa**.
   *
   * É outro assunto que a `validadeDias`, e a diferença é quem escolheu a
   * senha. A validade periódica governa a senha que a **pessoa** escolheu e
   * que só ela conhece; esta governa a senha que a **plataforma sorteou** e
   * que alguém teve de transmitir — por mensagem, por telefone, por bilhete.
   * Essa senha existe em trânsito, fora do controle da plataforma, e hoje
   * vale para sempre: uma conta criada e nunca usada fica com credencial
   * válida indefinidamente, e quem tiver a mensagem entra meses depois.
   */
  credencialProvisoriaHoras: number;
}

/** Padrão do domínio — usado quando ainda não há linha de configuração. */
export const POLITICA_SENHA_PADRAO: PoliticaDeSenha = {
  comprimentoMin: 10,
  exigeMaiuscula: false,
  exigeMinuscula: false,
  exigeNumero: false,
  exigeSimbolo: false,
  historicoN: 5,
  // 0 = sem troca periódica. Padrão desligado: ligar é decisão do
  // Administrador, nunca efeito colateral de uma entrega.
  validadeDias: 0,
  // 0 = credencial provisória não expira, que é o comportamento de sempre.
  // Ligar isto pode deixar alguém de fora, então nasce desligado como toda
  // proteção desta tela.
  credencialProvisoriaHoras: 0,
};

// Limites de sanidade dos PRÓPRIOS valores da política (o que o Admin salva).
// Não afrouxam o mínimo abaixo de 8 nem deixam o histórico virar peso inútil.
export const COMPRIMENTO_MIN_MINIMO = 8;
export const COMPRIMENTO_MIN_MAXIMO = 64;
export const HISTORICO_MINIMO = 0;
export const HISTORICO_MAXIMO = 24;
/**
 * Validade da senha, em dias. **0 é o único valor abaixo do mínimo aceito**, e
 * significa desligado — não existe "vencer em 5 dias", que seria hostil sem
 * ser mais seguro.
 */
export const VALIDADE_DIAS_MINIMO = 30;
export const VALIDADE_DIAS_MAXIMO = 730;
/**
 * Validade da credencial provisória, em horas. **0 é desligado.**
 *
 * O mínimo é 1 e não 30 como o da senha escolhida, porque aqui prazo curto é
 * legítimo: o Administrador cria a conta e transmite a senha na mesma
 * conversa, e uma janela de poucas horas é exatamente o que se quer. O teto
 * de 720 h (30 dias) existe para que "expira" continue significando alguma
 * coisa — acima disso a proteção vira decoração.
 */
export const CREDENCIAL_HORAS_MINIMO = 1;
export const CREDENCIAL_HORAS_MAXIMO = 720;

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

  const validade = politica.validadeDias;
  if (!Number.isInteger(validade) || validade < 0) {
    erros.push("A validade da senha não pode ser negativa (use 0 para desligar).");
  } else if (validade !== 0 && (validade < VALIDADE_DIAS_MINIMO || validade > VALIDADE_DIAS_MAXIMO)) {
    erros.push(
      `A validade da senha deve ser 0 (desligada) ou entre ${VALIDADE_DIAS_MINIMO} e ${VALIDADE_DIAS_MAXIMO} dias.`,
    );
  }

  const credencial = politica.credencialProvisoriaHoras;
  if (!Number.isInteger(credencial) || credencial < 0) {
    erros.push("A validade da credencial provisória não pode ser negativa (use 0 para desligar).");
  } else if (
    credencial !== 0 &&
    (credencial < CREDENCIAL_HORAS_MINIMO || credencial > CREDENCIAL_HORAS_MAXIMO)
  ) {
    erros.push(
      `A validade da credencial provisória deve ser 0 (desligada) ou entre ${CREDENCIAL_HORAS_MINIMO} e ${CREDENCIAL_HORAS_MAXIMO} horas.`,
    );
  }

  return erros;
}

/**
 * A senha venceu? Função pura, e o coração da troca periódica.
 *
 * Duas ausências significam **não venceu**, e as duas são deliberadas:
 * validade `0` (desligada) e `alteradaEm` nulo — este último é o estado de
 * quem já existia quando a coluna nasceu, e tratá-lo como vencido mandaria a
 * base inteira para a tela de troca no primeiro deploy.
 */
export function senhaVenceu(
  alteradaEm: Date | null | undefined,
  agora: Date,
  politica: PoliticaDeSenha,
): boolean {
  if (!politica.validadeDias || politica.validadeDias <= 0) return false;
  if (!(alteradaEm instanceof Date) || Number.isNaN(alteradaEm.getTime())) return false;
  const limiteMs = politica.validadeDias * 24 * 60 * 60_000;
  return agora.getTime() - alteradaEm.getTime() > limiteMs;
}

/**
 * Quanto falta para a credencial provisória expirar, em minutos.
 *
 * Devolve `null` quando **não há prazo** — proteção desligada, ou credencial
 * que não foi emitida pela plataforma (`emitidaEm` nulo). Negativo significa
 * expirada, e o quanto já passou; a tela usa o sinal para escolher a palavra.
 *
 * Separada de `credencialProvisoriaVenceu` de propósito: o login precisa de
 * um sim/não e a T27 precisa do número. Derivar um do outro na tela criaria
 * duas opiniões sobre a mesma conta.
 */
export function minutosAteExpirarCredencial(
  emitidaEm: Date | null | undefined,
  agora: Date,
  politica: PoliticaDeSenha,
): number | null {
  if (!politica.credencialProvisoriaHoras || politica.credencialProvisoriaHoras <= 0) return null;
  if (!(emitidaEm instanceof Date) || Number.isNaN(emitidaEm.getTime())) return null;
  const limite = emitidaEm.getTime() + politica.credencialProvisoriaHoras * 60 * 60_000;
  return Math.round((limite - agora.getTime()) / 60_000);
}

/**
 * A credencial provisória expirou? Função pura, e a autoridade do login.
 *
 * Duas ausências significam **não expirou**, e as duas são deliberadas:
 * a proteção desligada (`0`), e `emitidaEm` nulo — que é o estado de toda
 * conta que já existia quando a coluna nasceu, e de toda senha que a **própria
 * pessoa** escolheu. Tratar nulo como expirado trancaria a base inteira no
 * primeiro deploy, exatamente o erro que a coluna `senhaAlteradaEm` já evita
 * do outro lado.
 */
export function credencialProvisoriaExpirou(
  emitidaEm: Date | null | undefined,
  agora: Date,
  politica: PoliticaDeSenha,
): boolean {
  const restam = minutosAteExpirarCredencial(emitidaEm, agora, politica);
  return restam !== null && restam <= 0;
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
