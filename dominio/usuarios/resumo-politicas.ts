import type { PoliticaDeSenha } from "./politica-senha";
import type { PoliticaDeSessao } from "./politica-sessao";
import type { PoliticaDeLogin } from "./politica-login";
import type { PoliticaDeOrigem } from "./politica-origem";

/**
 * Resumos curtos das quatro políticas do portal — o conteúdo da faixa de
 * panorama da T35.
 *
 * **Por que existe, e por que não é enfeite.** A tela de Configurações passou
 * a ter abas, e aba esconde: quem administra o portal pode nunca abrir a
 * terceira e nunca descobrir que o bloqueio por origem existe — desligado.
 * Numa tela de segurança isso tem custo real, e a rolagem longa que as abas
 * substituem tinha a virtude de mostrar tudo que há. A faixa devolve essa
 * virtude: fica **acima** das abas, sempre visível, e diz em uma linha o que
 * cada proteção está valendo agora.
 *
 * Vive no domínio, e não na tela, pelo mesmo motivo que `descreverPolitica`
 * vive: é regra de leitura da política, testável sem navegador, e a tela não
 * pode ter uma segunda opinião sobre o que "desligado" significa.
 *
 * A diferença entre os dois: `descreverPolitica` escreve a frase completa que
 * vai dentro do cartão, com as consequências; estes escrevem o rótulo curto de
 * uma célula. Não se substituem — a célula não cabe a frase, e o cartão não se
 * contenta com o rótulo.
 */

/** Uma célula da faixa de panorama. */
export interface ResumoDePolitica {
  /** Rótulo da célula — o nome da proteção. */
  readonly rotulo: string;
  /** Linha de destaque: o número que importa. */
  readonly principal: string;
  /** Linha de apoio: o complemento que qualifica o destaque. */
  readonly detalhe: string;
  /**
   * Verdadeiro quando a proteção está **desligada**. A faixa marca a célula
   * visualmente — número sozinho não distingue "desligado" de "nenhuma
   * tentativa permitida", que são opostos, e a tela já tem o hábito de dizer
   * isso em palavras nos cartões.
   */
  readonly desligada: boolean;
}

/**
 * Minutos em unidade legível.
 *
 * A faixa é estreita e 10080 não se lê como uma semana. Sobe de unidade só
 * quando a conversão é exata em dias ou horas; fora disso mantém "1 h 30 min",
 * que continua curto e não mente por arredondamento.
 */
export function formatarMinutos(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) {
    return "0 min";
  }
  if (minutos % 1440 === 0) {
    const dias = minutos / 1440;
    return dias === 1 ? "1 dia" : `${dias} dias`;
  }
  if (minutos % 60 === 0) {
    const horas = minutos / 60;
    return horas === 1 ? "1 h" : `${horas} h`;
  }
  if (minutos > 60) {
    return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  }
  return `${minutos} min`;
}

/**
 * Senha. **Nunca é "desligada"**: o comprimento mínimo vale sempre, mesmo no
 * padrão — o que pode estar desligado são o vencimento e o histórico, e isso o
 * detalhe diz.
 */
export function resumirPoliticaDeSenha(politica: PoliticaDeSenha): ResumoDePolitica {
  const classes = [
    politica.exigeMaiuscula,
    politica.exigeMinuscula,
    politica.exigeNumero,
    politica.exigeSimbolo,
  ].filter(Boolean).length;

  const principal =
    classes === 0
      ? `${politica.comprimentoMin} caracteres`
      : `${politica.comprimentoMin} caracteres · ${classes} classe${classes > 1 ? "s" : ""}`;

  const vencimento =
    politica.validadeDias > 0 ? `vence a cada ${politica.validadeDias} dias` : "sem vencimento";
  const historico =
    politica.historicoN > 0 ? `não repete as últimas ${politica.historicoN}` : "sem histórico";

  return {
    rotulo: "Senha",
    principal,
    detalhe: `${vencimento} · ${historico}`,
    desligada: false,
  };
}

/**
 * Sessão. Só se considera desligada quando **os dois** eixos estão em zero —
 * com um deles ligado a sessão ainda tem prazo, e marcar a célula como
 * desligada seria falso.
 */
export function resumirPoliticaDeSessao(politica: PoliticaDeSessao): ResumoDePolitica {
  const principal =
    politica.tempoSessaoMin > 0
      ? `${formatarMinutos(politica.tempoSessaoMin)} sem atividade`
      : "Sem expiração por inatividade";

  const detalhe =
    politica.tetoMin > 0
      ? `teto de ${formatarMinutos(politica.tetoMin)} após o login`
      : "sem teto absoluto";

  return {
    rotulo: "Sessão",
    principal,
    detalhe,
    desligada: politica.tempoSessaoMin <= 0 && politica.tetoMin <= 0,
  };
}

/** Bloqueio por tentativas de login (por conta). */
export function resumirPoliticaDeLogin(politica: PoliticaDeLogin): ResumoDePolitica {
  if (politica.maxTentativas <= 0) {
    return {
      rotulo: "Bloqueio por login",
      principal: "Desligado",
      detalhe: "errar a senha não tranca a conta",
      desligada: true,
    };
  }
  return {
    rotulo: "Bloqueio por login",
    principal: `${politica.maxTentativas} tentativas`,
    detalhe: `bloqueia por ${formatarMinutos(politica.bloqueioMin)}`,
    desligada: false,
  };
}

/** Bloqueio por origem de rede (por endereço, atinge todas as contas). */
export function resumirPoliticaDeOrigem(politica: PoliticaDeOrigem): ResumoDePolitica {
  if (politica.maxTentativas <= 0) {
    return {
      rotulo: "Bloqueio por origem",
      principal: "Desligado",
      detalhe: "nenhum endereço é trancado",
      desligada: true,
    };
  }
  return {
    rotulo: "Bloqueio por origem",
    principal: `${politica.maxTentativas} falhas`,
    detalhe: `bloqueia por ${formatarMinutos(politica.bloqueioMin)}`,
    desligada: false,
  };
}
