import { describe, expect, it } from "vitest";
import {
  INDISPONIVEL_AGUARDA_CPF,
  nivelPublicoDisponivel,
  realizadoDaMeta,
  realizadoDasMetas,
  resumoMetas,
  type DadosMedicao,
} from "./atribuicao";

const semTelemetriaPorCpf = (): DadosMedicao => ({
  resgatesNaVigencia: 380,
  aliadosParticipantes: 6,
  ofertasAtivas: 9,
  publicoCongelado: 1240,
  assinantesDoPublicoComResgate: null,
});

const comTelemetriaPorCpf = (): DadosMedicao => ({
  ...semTelemetriaPorCpf(),
  assinantesDoPublicoComResgate: 186,
});

describe("RN43 — nível de atribuição declarado em cada número", () => {
  it("mede resgates pelo nível por oferta", () => {
    const realizado = realizadoDaMeta("RESGATES", 500, semTelemetriaPorCpf());
    expect(realizado.valor).toBe(380);
    expect(realizado.nivel).toBe("POR_OFERTA");
    expect(realizado.disponivel).toBe(true);
  });

  it("mede aliados participantes pelo nível por oferta", () => {
    expect(realizadoDaMeta("ALIADOS_PARTICIPANTES", 5, semTelemetriaPorCpf()).nivel).toBe(
      "POR_OFERTA",
    );
  });

  it("mede ofertas ativas pelo nível por oferta", () => {
    const realizado = realizadoDaMeta("OFERTAS_ATIVAS", 8, semTelemetriaPorCpf());
    expect(realizado.valor).toBe(9);
    expect(realizado.atingida).toBe(true);
  });

  it("marca a meta como não atingida quando o realizado fica abaixo do alvo", () => {
    expect(realizadoDaMeta("RESGATES", 500, semTelemetriaPorCpf()).atingida).toBe(false);
  });

  it("reconhece a chegada da telemetria por CPF", () => {
    expect(nivelPublicoDisponivel(semTelemetriaPorCpf())).toBe(false);
    expect(nivelPublicoDisponivel(comTelemetriaPorCpf())).toBe(true);
  });
});

describe("RN44 — conversão % exige o nível por público", () => {
  it("responde indisponível sem telemetria por CPF, sem número nenhum", () => {
    const realizado = realizadoDaMeta("CONVERSAO_PCT", 12, semTelemetriaPorCpf());
    expect(realizado.disponivel).toBe(false);
    expect(realizado.valor).toBeNull();
    expect(realizado.nivel).toBeNull();
    expect(realizado.nota).toBe(INDISPONIVEL_AGUARDA_CPF);
    expect(realizado.atingida).toBe(false);
  });

  it("não aproxima a conversão pelos resgates por oferta", () => {
    const realizado = realizadoDaMeta("CONVERSAO_PCT", 12, semTelemetriaPorCpf());
    expect(realizado.valor).not.toBe(380 / 1240);
    expect(realizado.valor).toBeNull();
  });

  it("calcula a conversão quando a granularidade existe, no nível público", () => {
    const realizado = realizadoDaMeta("CONVERSAO_PCT", 12, comTelemetriaPorCpf());
    expect(realizado.valor).toBe(15);
    expect(realizado.nivel).toBe("POR_PUBLICO");
    expect(realizado.atingida).toBe(true);
  });

  it("não divide por zero quando o público congelado está vazio", () => {
    const realizado = realizadoDaMeta("CONVERSAO_PCT", 12, {
      ...comTelemetriaPorCpf(),
      publicoCongelado: 0,
      assinantesDoPublicoComResgate: 0,
    });
    expect(realizado.valor).toBe(0);
  });
});

describe("resumo metas × realizado (T22)", () => {
  it("etiqueta os níveis presentes e conta as atingidas", () => {
    const realizados = realizadoDasMetas(
      [
        { tipo: "RESGATES", alvo: 300 },
        { tipo: "OFERTAS_ATIVAS", alvo: 8 },
      ],
      semTelemetriaPorCpf(),
    );
    const resumo = resumoMetas(realizados);
    expect(resumo.texto).toBe("2/2 atingidas");
    expect(resumo.nivel).toBe("por oferta");
  });

  it("aponta as metas indisponíveis em vez de escondê-las", () => {
    const realizados = realizadoDasMetas(
      [
        { tipo: "RESGATES", alvo: 300 },
        { tipo: "CONVERSAO_PCT", alvo: 12 },
      ],
      semTelemetriaPorCpf(),
    );
    expect(resumoMetas(realizados).texto).toContain("1 indisponível(is)");
  });

  it("declara os dois níveis quando ambos aparecem", () => {
    const realizados = realizadoDasMetas(
      [
        { tipo: "RESGATES", alvo: 300 },
        { tipo: "CONVERSAO_PCT", alvo: 12 },
      ],
      comTelemetriaPorCpf(),
    );
    expect(resumoMetas(realizados).nivel).toBe("por oferta e por público");
  });

  it("campanha sem meta mostra traço — metas são opcionais", () => {
    expect(resumoMetas([])).toEqual({ texto: "—", nivel: "sem metas" });
  });
});
