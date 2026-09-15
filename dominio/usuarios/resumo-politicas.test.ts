import { describe, expect, it } from "vitest";
import { POLITICA_SENHA_PADRAO } from "./politica-senha";
import { POLITICA_SESSAO_PADRAO } from "./politica-sessao";
import { POLITICA_LOGIN_PADRAO } from "./politica-login";
import { POLITICA_ORIGEM_PADRAO } from "./politica-origem";
import {
  formatarMinutos,
  resumirPoliticaDeLogin,
  resumirPoliticaDeOrigem,
  resumirCredencialProvisoria,
  resumirPoliticaDeSenha,
  resumirPoliticaDeSessao,
} from "./resumo-politicas";

/**
 * Faixa de panorama da T35 — o que a célula diz de cada proteção.
 *
 * O caso que estes testes existem para prender é o de **desligado**: a faixa
 * nasceu porque as abas escondem, e uma célula que mostre "0" sem dizer
 * "desligado" reintroduz a ambiguidade que a tela evita nos cartões — zero
 * tanto pode ser "proteção desligada" quanto "nenhuma tentativa permitida",
 * que são opostos.
 */

describe("formatarMinutos", () => {
  it("mantém minutos abaixo de uma hora", () => {
    expect(formatarMinutos(30)).toBe("30 min");
    expect(formatarMinutos(59)).toBe("59 min");
  });

  it("sobe para horas quando a conversão é exata", () => {
    expect(formatarMinutos(60)).toBe("1 h");
    expect(formatarMinutos(480)).toBe("8 h");
  });

  it("sobe para dias quando a conversão é exata", () => {
    expect(formatarMinutos(1440)).toBe("1 dia");
    expect(formatarMinutos(10_080)).toBe("7 dias");
  });

  it("não arredonda: hora quebrada sai com os dois termos", () => {
    expect(formatarMinutos(90)).toBe("1 h 30 min");
    expect(formatarMinutos(125)).toBe("2 h 5 min");
  });

  it("trata zero e valores inválidos sem quebrar", () => {
    expect(formatarMinutos(0)).toBe("0 min");
    expect(formatarMinutos(-5)).toBe("0 min");
    expect(formatarMinutos(Number.NaN)).toBe("0 min");
  });
});

describe("resumirPoliticaDeSenha", () => {
  it("no padrão: comprimento sem classes, histórico ligado, sem vencimento", () => {
    const resumo = resumirPoliticaDeSenha(POLITICA_SENHA_PADRAO);
    expect(resumo.principal).toBe("10 caracteres");
    expect(resumo.detalhe).toBe("sem vencimento · não repete as últimas 5");
  });

  it("nunca se marca desligada — o comprimento mínimo vale sempre", () => {
    expect(resumirPoliticaDeSenha(POLITICA_SENHA_PADRAO).desligada).toBe(false);
    expect(
      resumirPoliticaDeSenha({
        ...POLITICA_SENHA_PADRAO,
        historicoN: 0,
        validadeDias: 0,
      }).desligada,
    ).toBe(false);
  });

  it("conta as classes exigidas e concorda o plural", () => {
    expect(
      resumirPoliticaDeSenha({ ...POLITICA_SENHA_PADRAO, exigeMaiuscula: true }).principal,
    ).toBe("10 caracteres · 1 classe");
    expect(
      resumirPoliticaDeSenha({
        ...POLITICA_SENHA_PADRAO,
        exigeMaiuscula: true,
        exigeNumero: true,
      }).principal,
    ).toBe("10 caracteres · 2 classes");
  });

  it("declara o vencimento quando ligado", () => {
    expect(
      resumirPoliticaDeSenha({ ...POLITICA_SENHA_PADRAO, validadeDias: 90 }).detalhe,
    ).toBe("vence a cada 90 dias · não repete as últimas 5");
  });

  it("diz 'sem histórico' em vez de exibir zero", () => {
    expect(resumirPoliticaDeSenha({ ...POLITICA_SENHA_PADRAO, historicoN: 0 }).detalhe).toBe(
      "sem vencimento · sem histórico",
    );
  });
});

describe("resumirPoliticaDeSessao", () => {
  it("no padrão: inatividade ligada, teto desligado", () => {
    const resumo = resumirPoliticaDeSessao(POLITICA_SESSAO_PADRAO);
    expect(resumo.principal).toBe("30 min sem atividade");
    expect(resumo.detalhe).toBe("sem teto absoluto");
    expect(resumo.desligada).toBe(false);
  });

  it("converte o teto para horas", () => {
    expect(
      resumirPoliticaDeSessao({ tempoSessaoMin: 30, tetoMin: 480 }).detalhe,
    ).toBe("teto de 8 h após o login");
  });

  it("só é desligada quando OS DOIS eixos estão em zero", () => {
    expect(resumirPoliticaDeSessao({ tempoSessaoMin: 0, tetoMin: 480 }).desligada).toBe(false);
    expect(resumirPoliticaDeSessao({ tempoSessaoMin: 30, tetoMin: 0 }).desligada).toBe(false);
    expect(resumirPoliticaDeSessao({ tempoSessaoMin: 0, tetoMin: 0 }).desligada).toBe(true);
  });

  it("com inatividade desligada, o destaque diz isso em palavras", () => {
    expect(resumirPoliticaDeSessao({ tempoSessaoMin: 0, tetoMin: 480 }).principal).toBe(
      "Sem expiração por inatividade",
    );
  });
});

describe("resumirPoliticaDeLogin", () => {
  it("no padrão: cinco tentativas, quinze minutos", () => {
    const resumo = resumirPoliticaDeLogin(POLITICA_LOGIN_PADRAO);
    expect(resumo.principal).toBe("5 tentativas");
    expect(resumo.detalhe).toBe("bloqueia por 15 min");
    expect(resumo.desligada).toBe(false);
  });

  it("desligado aparece como palavra, nunca como zero", () => {
    const resumo = resumirPoliticaDeLogin({ maxTentativas: 0, bloqueioMin: 15 });
    expect(resumo.principal).toBe("Desligado");
    expect(resumo.desligada).toBe(true);
    expect(resumo.principal).not.toContain("0");
  });
});

describe("resumirPoliticaDeOrigem", () => {
  it("nasce desligada — é o padrão do domínio", () => {
    const resumo = resumirPoliticaDeOrigem(POLITICA_ORIGEM_PADRAO);
    expect(resumo.principal).toBe("Desligado");
    expect(resumo.desligada).toBe(true);
  });

  it("ligada, declara as falhas e o tempo", () => {
    const resumo = resumirPoliticaDeOrigem({ maxTentativas: 20, bloqueioMin: 15 });
    expect(resumo.principal).toBe("20 falhas");
    expect(resumo.detalhe).toBe("bloqueia por 15 min");
    expect(resumo.desligada).toBe(false);
  });
});

/**
 * A célula da credencial provisória.
 *
 * Ela ganhou lugar próprio na faixa, e não uma terceira parte do detalhe da
 * Senha, porque é a única proteção da aba capaz de deixar alguém **de fora**.
 * O que este bloco prende é a disciplina da faixa: desligado aparece como a
 * **palavra** "Desligado", nunca como `0` — `0 h` se leria como "expira
 * imediatamente", que é o oposto do que significa.
 */
describe("resumirCredencialProvisoria", () => {
  it("no padrão está desligada, e diz isso em palavra", () => {
    const resumo = resumirCredencialProvisoria(POLITICA_SENHA_PADRAO);
    expect(resumo.rotulo).toBe("Credencial provisória");
    expect(resumo.principal).toBe("Desligado");
    expect(resumo.principal).not.toContain("0");
    expect(resumo.desligada).toBe(true);
  });

  it("ligada, mostra o prazo em unidade legível e não se marca como desligada", () => {
    const resumo = resumirCredencialProvisoria({
      ...POLITICA_SENHA_PADRAO,
      credencialProvisoriaHoras: 48,
    });
    expect(resumo.principal).toBe("2 dias");
    expect(resumo.desligada).toBe(false);
  });

  it("prazo de horas não vira dia por arredondamento", () => {
    const resumo = resumirCredencialProvisoria({
      ...POLITICA_SENHA_PADRAO,
      credencialProvisoriaHoras: 8,
    });
    expect(resumo.principal).toBe("8 h");
  });
});
