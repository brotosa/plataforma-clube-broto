/**
 * O histórico das Configurações do portal — a leitura da trilha que a T35
 * ainda não fazia.
 *
 * ## Por que a tela precisava disto
 *
 * A T35 mostra o **estado vigente** de cada proteção e mais nada. Quem abre
 * vê que a sessão cai em 30 minutos, e não vê se isso é o padrão desde a
 * implantação ou algo que alguém apertou ontem à tarde. Numa tela de
 * segurança essa é a pergunta que mais se faz depois de um incidente — "isto
 * mudou?" — e a única resposta era abrir a Auditoria, filtrar por
 * `configuracao_portal` e ler evento a evento.
 *
 * O dado já existia: a trilha grava desde a F23, com autor, campo, valor
 * anterior e novo. Faltava a leitura, e é só isso o que este módulo faz.
 *
 * ## O desenho é o do Parametrizador, de propósito
 *
 * A T17 já resolve exatamente este problema — "alterado por Fulano em
 * 12/09/2026, de 10 para 12", numa legenda sob o campo. Repetir a solução
 * conhecida vale mais que inventar uma: quem administra as duas telas lê a
 * mesma frase nos dois lugares.
 *
 * ## O vocabulário tem de ser o mesmo da faixa
 *
 * A T35 escreve **"Desligado"** onde o valor é zero, porque `0` não distingue
 * "proteção desligada" de "nenhuma tentativa permitida" — que são opostos. O
 * histórico obedece à mesma regra: seria absurdo a faixa dizer "Desligado" no
 * alto da tela e a legenda dizer "0" três centímetros abaixo, falando do
 * mesmo número.
 */

/** Os quatro grupos da T35 — um por formulário, um por aba (a aba Bloqueios tem dois). */
export type GrupoDeConfiguracao = "SENHA" | "SESSAO" | "LOGIN" | "ORIGEM";

interface CampoDeConfiguracao {
  grupo: GrupoDeConfiguracao;
  rotulo: string;
  /** Como o valor se lê: número puro, minutos, horas, dias ou sim/não. */
  formato: "NUMERO" | "MINUTOS" | "HORAS" | "DIAS" | "BOOLEANO";
  /**
   * `0` neste campo significa **desligado**, e não "zero de alguma coisa".
   *
   * Marcado campo a campo porque não é universal: em `senhaComprimentoMin`
   * zero seria um comprimento mínimo de zero — que a validação nem aceita —,
   * e escrever "Desligado" ali seria inventar um estado que não existe.
   */
  zeroDesliga?: boolean;
}

/**
 * Os campos auditados, tal como `paraAuditavel*` os grava em
 * `infra/casos-de-uso/configuracoes.ts`.
 *
 * As chaves precisam bater com as de lá **exatamente**: um campo renomeado no
 * caso de uso e esquecido aqui não quebra nada — ele simplesmente some do
 * histórico, em silêncio, e a tela passa a dizer "sem alteração" sobre uma
 * alteração que houve. É o tipo de defeito que só aparece quando alguém
 * precisa da informação, isto é, tarde. Há um teste que confronta as duas
 * listas.
 */
export const CAMPOS_DE_CONFIGURACAO: Readonly<Record<string, CampoDeConfiguracao>> = {
  senhaComprimentoMin: { grupo: "SENHA", rotulo: "Comprimento mínimo", formato: "NUMERO" },
  senhaExigeMaiuscula: { grupo: "SENHA", rotulo: "Exige maiúscula", formato: "BOOLEANO" },
  senhaExigeMinuscula: { grupo: "SENHA", rotulo: "Exige minúscula", formato: "BOOLEANO" },
  senhaExigeNumero: { grupo: "SENHA", rotulo: "Exige número", formato: "BOOLEANO" },
  senhaExigeSimbolo: { grupo: "SENHA", rotulo: "Exige símbolo", formato: "BOOLEANO" },
  senhaHistoricoN: {
    grupo: "SENHA",
    rotulo: "Não repetir as últimas",
    formato: "NUMERO",
    zeroDesliga: true,
  },
  senhaValidadeDias: {
    grupo: "SENHA",
    rotulo: "Validade da senha",
    formato: "DIAS",
    zeroDesliga: true,
  },
  credencialProvisoriaHoras: {
    grupo: "SENHA",
    rotulo: "Validade da credencial provisória",
    formato: "HORAS",
    zeroDesliga: true,
  },
  tempoSessaoMin: {
    grupo: "SESSAO",
    rotulo: "Inatividade",
    formato: "MINUTOS",
    zeroDesliga: true,
  },
  sessaoTetoMin: {
    grupo: "SESSAO",
    rotulo: "Teto absoluto",
    formato: "MINUTOS",
    zeroDesliga: true,
  },
  loginMaxTentativas: {
    grupo: "LOGIN",
    rotulo: "Tentativas até bloquear a conta",
    formato: "NUMERO",
    zeroDesliga: true,
  },
  loginBloqueioMin: {
    grupo: "LOGIN",
    rotulo: "Tempo de bloqueio da conta",
    formato: "MINUTOS",
    zeroDesliga: true,
  },
  origemMaxTentativas: {
    grupo: "ORIGEM",
    rotulo: "Tentativas até bloquear a origem",
    formato: "NUMERO",
    zeroDesliga: true,
  },
  origemBloqueioMin: {
    grupo: "ORIGEM",
    rotulo: "Tempo de bloqueio da origem",
    formato: "MINUTOS",
    zeroDesliga: true,
  },
};

/** Um evento da trilha, no mínimo de que esta leitura precisa. */
export interface EventoDeConfiguracao {
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  autorNome: string;
  criadoEm: Date;
}

function formatarMinutosCurto(minutos: number): string {
  if (minutos % 1440 === 0) {
    const dias = minutos / 1440;
    return dias === 1 ? "1 dia" : `${dias} dias`;
  }
  if (minutos % 60 === 0) {
    const horas = minutos / 60;
    return horas === 1 ? "1 h" : `${horas} h`;
  }
  return `${minutos} min`;
}

/**
 * O valor como a tela o escreve.
 *
 * O `null` sai como "—" e não como "0": a trilha grava `null` quando o campo
 * não existia no retrato anterior — o que acontece na primeira gravação de
 * cada política —, e isso não é a mesma coisa que o valor ter sido zero.
 */
export function formatarValorDeConfiguracao(campo: string, valor: string | null): string {
  const definicao = CAMPOS_DE_CONFIGURACAO[campo];
  if (valor === null || valor === "") return "—";
  if (!definicao) return valor;

  if (definicao.formato === "BOOLEANO") {
    return valor === "true" ? "sim" : "não";
  }

  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;

  if (definicao.zeroDesliga && numero === 0) {
    // A palavra, nunca o número — mesma regra da faixa de panorama.
    return "Desligado";
  }

  switch (definicao.formato) {
    case "MINUTOS":
      return formatarMinutosCurto(numero);
    case "HORAS":
      return formatarMinutosCurto(numero * 60);
    case "DIAS":
      return numero === 1 ? "1 dia" : `${numero} dias`;
    default:
      return String(numero);
  }
}

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * A legenda de um grupo, a partir dos eventos dele.
 *
 * Recebe os eventos **já filtrados e ordenados do mais recente para o mais
 * antigo**, e descreve o mais recente. Descrever só o último é escolha, não
 * limitação: a legenda fica sob o formulário e responde "isto mudou?" — o
 * histórico completo é da Auditoria, que tem filtro, paginação e exportação.
 * Empilhar dez linhas aqui competiria com ela e perderia.
 *
 * Sem evento nenhum, a frase é a do Parametrizador: a configuração está como
 * nasceu. **Não é "sem histórico"** — a ausência de alteração é uma
 * informação, e uma boa.
 */
export function descreverUltimaAlteracao(
  eventos: ReadonlyArray<EventoDeConfiguracao>,
): string {
  const ultimo = eventos[0];
  if (!ultimo) {
    return "sem alteração desde a implantação";
  }

  const definicao = CAMPOS_DE_CONFIGURACAO[ultimo.campo];
  const rotulo = definicao?.rotulo ?? ultimo.campo;
  const de = formatarValorDeConfiguracao(ultimo.campo, ultimo.valorAnterior);
  const para = formatarValorDeConfiguracao(ultimo.campo, ultimo.valorNovo);

  const outros = eventos.filter(
    (evento) => evento.criadoEm.getTime() === ultimo.criadoEm.getTime(),
  ).length;
  /*
   * Uma gravação do formulário mexe em vários campos e gera um evento por
   * campo alterado, todos no mesmo instante. Anunciar só um deles daria a
   * entender que foi a única mudança; "e mais N" diz a verdade sem transformar
   * a legenda em lista.
   */
  const complemento = outros > 1 ? ` e mais ${outros - 1} campo${outros > 2 ? "s" : ""}` : "";

  return `${rotulo}: ${de} → ${para}${complemento} · por ${ultimo.autorNome} em ${formatarData(ultimo.criadoEm)}`;
}
