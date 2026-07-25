import { describe, expect, it } from "vitest";
import {
  apurarCusto,
  estimarCustoMaximo,
  formatarBrl,
  inicioDoMes,
  inicioDoMesSeguinte,
  verificarTetos,
} from "./custo";

/**
 * Tarifa fictícia dos testes — números redondos escolhidos para a
 * aritmética ficar legível. A tarifa real é [A CONFIRMAR TI] e vive só em
 * variável de ambiente: nenhum valor de produção aparece no código.
 */
const TARIFA = { entradaBrlPorMilhao: 30, saidaBrlPorMilhao: 150 };

describe("apurarCusto", () => {
  it("cobra entrada e saída pela tarifa por milhão de tokens", () => {
    // 100 mil de entrada = 0,1 × 30 = 3,00; 20 mil de saída = 0,02 × 150 = 3,00
    expect(apurarCusto({ tokensEntrada: 100_000, tokensSaida: 20_000 }, TARIFA)).toBe(6);
  });

  it("custo zero quando não houve consumo", () => {
    expect(apurarCusto({ tokensEntrada: 0, tokensSaida: 0 }, TARIFA)).toBe(0);
  });

  it("arredonda para quatro casas (a coluna é DECIMAL(12,4))", () => {
    const custo = apurarCusto({ tokensEntrada: 1, tokensSaida: 1 }, TARIFA);
    expect(custo).toBe(0.0002);
  });
});

describe("estimarCustoMaximo — pior caso, apurado antes de chamar a API", () => {
  it("considera o limite de saída inteiro consumido", () => {
    const estimado = estimarCustoMaximo(
      { tokensEntradaEstimados: 10_000, tokensSaidaMaximos: 32_000 },
      TARIFA,
    );
    // 0,01 × 30 = 0,30 + 0,032 × 150 = 4,80 → 5,10
    expect(estimado).toBe(5.1);
  });

  it("é maior que o custo real quando a resposta usa menos que o limite", () => {
    const estimado = estimarCustoMaximo(
      { tokensEntradaEstimados: 10_000, tokensSaidaMaximos: 32_000 },
      TARIFA,
    );
    const real = apurarCusto({ tokensEntrada: 10_000, tokensSaida: 8_000 }, TARIFA);
    expect(real).toBeLessThan(estimado);
  });
});

describe("verificarTetos", () => {
  const tetos = { mensalBrl: 100, unitarioBrl: 10 };

  it("libera quando cabe nos dois tetos", () => {
    expect(verificarTetos({ custoEstimado: 5, gastoNoMes: 20, tetos })).toEqual({
      liberado: true,
    });
  });

  it("libera no limite exato do teto unitário e do mensal", () => {
    expect(verificarTetos({ custoEstimado: 10, gastoNoMes: 90, tetos }).liberado).toBe(true);
  });

  it("bloqueia acima do teto unitário citando a variável de ambiente", () => {
    const veredicto = verificarTetos({ custoEstimado: 10.5, gastoNoMes: 0, tetos });
    expect(veredicto.liberado).toBe(false);
    if (!veredicto.liberado) {
      expect(veredicto.motivo).toBe("TETO_UNITARIO");
      expect(veredicto.mensagem).toContain("DOSSIE_CUSTO_MAX_UNITARIO_BRL");
      expect(veredicto.mensagem).toContain("inserção manual");
    }
  });

  it("bloqueia quando o mês estourou, dizendo quanto resta", () => {
    const veredicto = verificarTetos({ custoEstimado: 8, gastoNoMes: 95, tetos });
    expect(veredicto.liberado).toBe(false);
    if (!veredicto.liberado) {
      expect(veredicto.motivo).toBe("TETO_MENSAL");
      expect(veredicto.mensagem).toContain("DOSSIE_TETO_MENSAL_BRL");
      expect(veredicto.mensagem).toContain(formatarBrl(5));
    }
  });

  it("o teto unitário é verificado antes do mensal (mensagem mais específica)", () => {
    const veredicto = verificarTetos({ custoEstimado: 200, gastoNoMes: 99, tetos });
    expect(veredicto.liberado).toBe(false);
    if (!veredicto.liberado) {
      expect(veredicto.motivo).toBe("TETO_UNITARIO");
    }
  });

  it("com o mês já estourado, nada mais passa", () => {
    expect(verificarTetos({ custoEstimado: 0.01, gastoNoMes: 100, tetos }).liberado).toBe(
      false,
    );
  });
});

describe("janela do teto mensal", () => {
  it("vai do primeiro instante do mês ao primeiro instante do mês seguinte", () => {
    const referencia = new Date(2026, 6, 25, 18, 30);
    expect(inicioDoMes(referencia)).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
    expect(inicioDoMesSeguinte(referencia)).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
  });

  it("vira o ano em dezembro", () => {
    expect(inicioDoMesSeguinte(new Date(2026, 11, 31, 23, 59))).toEqual(
      new Date(2027, 0, 1, 0, 0, 0, 0),
    );
  });
});
