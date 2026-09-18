import { describe, expect, it } from "vitest";
import {
  BLOQUEIO_MIN_MAXIMO,
  BLOQUEIO_MIN_MINIMO,
  MAX_TENTATIVAS_MAXIMO,
  MAX_TENTATIVAS_MINIMO,
  POLITICA_LOGIN_PADRAO,
  descreverPolitica,
  estaBloqueado,
  estadoLimpo,
  minutosRestantesDeBloqueio,
  bloqueouAgora,
  cruzouLimiteDeAlerta,
  registrarFalha,
  registrarFalhaSemBloquear,
  validarPoliticaDeLogin,
} from "./politica-login";

const AGORA = new Date("2026-09-11T20:00:00Z");
const POL = { maxTentativas: 5, bloqueioMin: 15 };

describe("política de bloqueio por login (Configurações)", () => {
  it("o padrão é 5 tentativas / 15 minutos", () => {
    expect(POLITICA_LOGIN_PADRAO).toEqual({ maxTentativas: 5, bloqueioMin: 15 });
    expect(validarPoliticaDeLogin(POLITICA_LOGIN_PADRAO)).toEqual([]);
  });

  it("valida as faixas de tentativas e de tempo", () => {
    expect(
      validarPoliticaDeLogin({ maxTentativas: MAX_TENTATIVAS_MINIMO, bloqueioMin: BLOQUEIO_MIN_MINIMO }),
    ).toEqual([]);
    expect(
      validarPoliticaDeLogin({ maxTentativas: MAX_TENTATIVAS_MAXIMO, bloqueioMin: BLOQUEIO_MIN_MAXIMO }),
    ).toEqual([]);
    expect(validarPoliticaDeLogin({ maxTentativas: 2, bloqueioMin: 15 })).toHaveLength(1);
    expect(validarPoliticaDeLogin({ maxTentativas: 5, bloqueioMin: 0 })).toHaveLength(1);
    expect(validarPoliticaDeLogin({ maxTentativas: 5, bloqueioMin: 99999 })).toHaveLength(1);
  });

  it("conta falhas e bloqueia ao alcançar o limite", () => {
    let estado = estadoLimpo();
    for (let i = 1; i <= 4; i += 1) {
      estado = registrarFalha(estado, POL, AGORA);
      expect(estado.tentativas).toBe(i);
      expect(estado.bloqueadoAte).toBeNull();
    }
    // 5ª falha: bloqueia por 15 min e zera o contador.
    estado = registrarFalha(estado, POL, AGORA);
    expect(estado.tentativas).toBe(0);
    expect(estado.bloqueadoAte).toEqual(new Date(AGORA.getTime() + 15 * 60_000));
    expect(estaBloqueado(estado.bloqueadoAte, AGORA)).toBe(true);
  });

  it("uma falha durante o bloqueio não muda nada", () => {
    const bloqueado = { tentativas: 0, bloqueadoAte: new Date(AGORA.getTime() + 60_000) };
    expect(registrarFalha(bloqueado, POL, AGORA)).toEqual(bloqueado);
  });

  it("bloqueio expirado reinicia a janela de contagem", () => {
    const expirado = { tentativas: 0, bloqueadoAte: new Date(AGORA.getTime() - 60_000) };
    expect(estaBloqueado(expirado.bloqueadoAte, AGORA)).toBe(false);
    const depois = registrarFalha(expirado, POL, AGORA);
    // Começa do 1, não continua de onde o bloqueio anterior parou.
    expect(depois.tentativas).toBe(1);
    expect(depois.bloqueadoAte).toBeNull();
  });

  it("minutos restantes arredondam para cima e são 0 quando livre", () => {
    expect(minutosRestantesDeBloqueio(new Date(AGORA.getTime() + 61_000), AGORA)).toBe(2);
    expect(minutosRestantesDeBloqueio(null, AGORA)).toBe(0);
    expect(minutosRestantesDeBloqueio(new Date(AGORA.getTime() - 1000), AGORA)).toBe(0);
  });

  it("descreve a política citando a isenção do Administrador", () => {
    const texto = descreverPolitica({ maxTentativas: 3, bloqueioMin: 10 });
    expect(texto).toContain("3");
    expect(texto).toContain("10");
    expect(texto).toMatch(/Administrador/);
  });
});

describe("bloqueio desligável (tudo configurável)", () => {
  const DESLIGADO = { maxTentativas: 0, bloqueioMin: 15 };

  it("0 é válido e significa desligado", () => {
    expect(validarPoliticaDeLogin(DESLIGADO)).toEqual([]);
    expect(descreverPolitica(DESLIGADO)).toMatch(/desligad/i);
  });

  it("desligado não conta nem bloqueia, por mais que se erre", () => {
    let estado = estadoLimpo();
    for (let i = 0; i < 50; i += 1) estado = registrarFalha(estado, DESLIGADO, AGORA);
    expect(estado).toEqual({ tentativas: 0, bloqueadoAte: null });
  });

  it("religar não pune falhas antigas — o contador ficou em zero", () => {
    let estado = estadoLimpo();
    estado = registrarFalha(estado, DESLIGADO, AGORA);
    // Religado com limite 3: a primeira falha depois disso é a primeira mesmo.
    estado = registrarFalha(estado, { maxTentativas: 3, bloqueioMin: 15 }, AGORA);
    expect(estado.tentativas).toBe(1);
    expect(estado.bloqueadoAte).toBeNull();
  });

  it("recusa valor negativo", () => {
    expect(validarPoliticaDeLogin({ maxTentativas: -1, bloqueioMin: 15 })).toHaveLength(1);
  });
});

/**
 * A conta isenta de bloqueio (RN74) — contar sem trancar.
 *
 * Estes testes existem porque a isenção era **invisível**: o ramo de isenção
 * devolvia a recusa sem tocar contador nenhum, e tentar senhas contra uma conta
 * de Administrador não deixava rastro em lugar algum.
 */
describe("conta isenta de bloqueio — conta sem trancar", () => {
  it("acumula e NUNCA escreve bloqueadoAte", () => {
    let estado = estadoLimpo();
    for (let i = 0; i < 40; i += 1) estado = registrarFalhaSemBloquear(estado);
    expect(estado.tentativas).toBe(40);
    // A garantia estrutural: nula, a conta isenta fica fora de todo caminho de
    // bloqueio por construção — inclusive da lista de contas a desbloquear,
    // que não filtra por isenção.
    expect(estado.bloqueadoAte).toBeNull();
  });

  it("o contador NÃO cicla ao passar do limite, ao contrário do da conta comum", () => {
    // `registrarFalha` zera ao atingir o limite (o bloqueio é o próprio
    // estado). Se a conta isenta reusasse aquela função, o número na tela
    // ficaria eternamente entre 0 e 4 e nunca mostraria acumulação.
    let comum = estadoLimpo();
    for (let i = 0; i < 5; i += 1) comum = registrarFalha(comum, POL, AGORA);
    expect(comum.tentativas).toBe(0);

    let isenta = estadoLimpo();
    for (let i = 0; i < 5; i += 1) isenta = registrarFalhaSemBloquear(isenta);
    expect(isenta.tentativas).toBe(5);
  });

  it("conta mesmo com a política desligada — é o único sinal que existe", () => {
    const estado = registrarFalhaSemBloquear(estadoLimpo());
    expect(estado.tentativas).toBe(1);
  });
});

describe("cruzouLimiteDeAlerta — uma vez por rajada, não uma por tentativa", () => {
  it("dispara exatamente na travessia do limite", () => {
    const antes = { tentativas: 4, bloqueadoAte: null };
    const depois = registrarFalhaSemBloquear(antes);
    expect(cruzouLimiteDeAlerta(antes, depois, POL)).toBe(true);
  });

  it("não dispara antes do limite", () => {
    const antes = { tentativas: 2, bloqueadoAte: null };
    expect(cruzouLimiteDeAlerta(antes, registrarFalhaSemBloquear(antes), POL)).toBe(false);
  });

  /**
   * O ponto inteiro da função. Quem ataca não escolhe o volume da trilha —
   * a RN49 diz que auditoria não se apaga, e a retenção ainda é `[A CONFIRMAR]`.
   */
  it("NÃO dispara de novo depois da travessia, por mais que se insista", () => {
    let estado = estadoLimpo();
    let disparos = 0;
    for (let i = 0; i < 500; i += 1) {
      const novo = registrarFalhaSemBloquear(estado);
      if (cruzouLimiteDeAlerta(estado, novo, POL)) disparos += 1;
      estado = novo;
    }
    expect(disparos).toBe(1);
    expect(estado.tentativas).toBe(500);
  });

  it("volta a poder disparar depois de um acesso bem-sucedido", () => {
    let estado = estadoLimpo();
    let disparos = 0;
    for (let rajada = 0; rajada < 3; rajada += 1) {
      for (let i = 0; i < 10; i += 1) {
        const novo = registrarFalhaSemBloquear(estado);
        if (cruzouLimiteDeAlerta(estado, novo, POL)) disparos += 1;
        estado = novo;
      }
      estado = estadoLimpo(); // entrou com a senha certa
    }
    expect(disparos).toBe(3);
  });

  it("com a política desligada não há limite a cruzar, e nada dispara", () => {
    const antes = { tentativas: 99, bloqueadoAte: null };
    const depois = registrarFalhaSemBloquear(antes);
    expect(cruzouLimiteDeAlerta(antes, depois, { maxTentativas: 0, bloqueioMin: 15 })).toBe(false);
  });
});

describe("bloqueouAgora — a transição da conta comum", () => {
  it("é verdadeira na falha que tranca", () => {
    let estado = estadoLimpo();
    for (let i = 0; i < 4; i += 1) estado = registrarFalha(estado, POL, AGORA);
    const novo = registrarFalha(estado, POL, AGORA);
    expect(bloqueouAgora(estado, novo)).toBe(true);
  });

  it("é falsa nas falhas anteriores", () => {
    const estado = estadoLimpo();
    expect(bloqueouAgora(estado, registrarFalha(estado, POL, AGORA))).toBe(false);
  });

  it("uma janela inteira de insistência produz UMA transição", () => {
    let estado = estadoLimpo();
    let transicoes = 0;
    for (let i = 0; i < 50; i += 1) {
      const novo = registrarFalha(estado, POL, AGORA);
      if (bloqueouAgora(estado, novo)) transicoes += 1;
      estado = novo;
    }
    expect(transicoes).toBe(1);
  });
});
