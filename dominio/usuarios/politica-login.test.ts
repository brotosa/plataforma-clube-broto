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
  registrarFalha,
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
