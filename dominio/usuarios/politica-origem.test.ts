import { describe, expect, it } from "vitest";
import { registrarFalha, estadoLimpo } from "./politica-login";
import {
  ORIGEM_MAX_TENTATIVAS_MAXIMO,
  ORIGEM_MAX_TENTATIVAS_MINIMO,
  POLITICA_ORIGEM_PADRAO,
  descreverPolitica,
  validarPoliticaDeOrigem,
} from "./politica-origem";

const AGORA = new Date("2026-09-14T18:00:00Z");

describe("política de bloqueio por origem", () => {
  it("nasce DESLIGADA — atinge todo mundo atrás do mesmo endereço", () => {
    expect(POLITICA_ORIGEM_PADRAO.maxTentativas).toBe(0);
    expect(validarPoliticaDeOrigem(POLITICA_ORIGEM_PADRAO)).toEqual([]);
    expect(descreverPolitica(POLITICA_ORIGEM_PADRAO)).toMatch(/desligad/i);
  });

  it("valida a faixa, aceitando só 0 abaixo do mínimo", () => {
    const ok = { maxTentativas: ORIGEM_MAX_TENTATIVAS_MINIMO, bloqueioMin: 15 };
    expect(validarPoliticaDeOrigem(ok)).toEqual([]);
    expect(
      validarPoliticaDeOrigem({ maxTentativas: ORIGEM_MAX_TENTATIVAS_MAXIMO, bloqueioMin: 15 }),
    ).toEqual([]);
    expect(
      validarPoliticaDeOrigem({ maxTentativas: ORIGEM_MAX_TENTATIVAS_MINIMO - 1, bloqueioMin: 15 }),
    ).toHaveLength(1);
    expect(validarPoliticaDeOrigem({ maxTentativas: -1, bloqueioMin: 15 })).toHaveLength(1);
    expect(validarPoliticaDeOrigem({ maxTentativas: 10, bloqueioMin: 0 })).toHaveLength(1);
  });

  it("a contagem é a MESMA da política por conta — reusada, não reescrita", () => {
    const politica = { maxTentativas: 5, bloqueioMin: 15 };
    let estado = estadoLimpo();
    for (let i = 1; i <= 4; i += 1) {
      estado = registrarFalha(estado, politica, AGORA);
      expect(estado.bloqueadoAte).toBeNull();
    }
    estado = registrarFalha(estado, politica, AGORA);
    expect(estado.bloqueadoAte).toEqual(new Date(AGORA.getTime() + 15 * 60_000));
  });

  it("a descrição avisa que o Administrador entra, mas as falhas contam", () => {
    const texto = descreverPolitica({ maxTentativas: 10, bloqueioMin: 20 });
    expect(texto).toContain("10");
    expect(texto).toMatch(/Administrador/);
    expect(texto).toMatch(/contam/i);
  });
});
