import { describe, expect, it } from "vitest";
import {
  REGIOES,
  ROTULOS_REGIAO,
  SIGLAS_UF,
  UFS_POR_REGIAO,
  ehSiglaConhecida,
  regiaoDaUf,
} from "./regioes";
import {
  DESCRICOES_MODO,
  type DistribuicaoGeografica,
  FONTES_MODO,
  MODOS_GEOGRAFICOS,
  ROTULOS_MODO,
  lerOMapa,
  modoValido,
  participacao,
  rankingPorRegiao,
  somaExcedeBase,
} from "./distribuicao";

describe("divisão regional — fato geográfico, não parâmetro de negócio", () => {
  it("cobre as 27 unidades federativas, sem repetir nenhuma", () => {
    expect(SIGLAS_UF).toHaveLength(27);
    expect(new Set(SIGLAS_UF).size).toBe(27);
  });

  it("cada UF pertence a exatamente uma região", () => {
    const vistas = new Set<string>();
    for (const regiao of REGIOES) {
      for (const sigla of UFS_POR_REGIAO[regiao]) {
        expect(vistas.has(sigla), `${sigla} repetida`).toBe(false);
        vistas.add(sigla);
      }
    }
    expect(vistas.size).toBe(27);
  });

  it("resolve a região de siglas conhecidas, tolerando caixa e espaço", () => {
    expect(regiaoDaUf("PR")).toBe("SUL");
    expect(regiaoDaUf(" sp ")).toBe("SUDESTE");
    expect(regiaoDaUf("df")).toBe("CENTRO_OESTE");
    expect(regiaoDaUf("AM")).toBe("NORTE");
    expect(regiaoDaUf("BA")).toBe("NORDESTE");
  });

  it("sigla desconhecida, vazia ou nula devolve null — nunca um palpite (RN53)", () => {
    expect(regiaoDaUf("XX")).toBeNull();
    expect(regiaoDaUf("")).toBeNull();
    expect(regiaoDaUf(null)).toBeNull();
    expect(regiaoDaUf(undefined)).toBeNull();
    expect(ehSiglaConhecida("ZZ")).toBe(false);
  });
});

// ---------------------------------------------------------------------

function distribuicaoDeTeste(
  parcial: Partial<DistribuicaoGeografica> = {},
): DistribuicaoGeografica {
  return {
    modo: "SEDE",
    linhas: [
      { sigla: "SP", nome: "São Paulo", regiao: "SUDESTE", aliados: 10, solucoes: 20 },
      { sigla: "PR", nome: "Paraná", regiao: "SUL", aliados: 6, solucoes: 8 },
      { sigla: "BA", nome: "Bahia", regiao: "NORDESTE", aliados: 4, solucoes: 3 },
      { sigla: "AM", nome: "Amazonas", regiao: "NORTE", aliados: 0, solucoes: 0 },
      { sigla: "GO", nome: "Goiás", regiao: "CENTRO_OESTE", aliados: 0, solucoes: 0 },
    ],
    baseDeAliados: 20,
    baseDeSolucoes: 31,
    naoDeclarado: null,
    ...parcial,
  };
}

describe("RN52 · o modo geográfico é sempre declarado", () => {
  it("os dois modos têm rótulo, descrição e fonte no cadastro", () => {
    for (const modo of MODOS_GEOGRAFICOS) {
      expect(ROTULOS_MODO[modo]).toBeTruthy();
      expect(DESCRICOES_MODO[modo].length).toBeGreaterThan(20);
      expect(FONTES_MODO[modo].length).toBeGreaterThan(20);
    }
  });

  it("as descrições distinguem presença de alcance — é a confusão que a regra evita", () => {
    expect(DESCRICOES_MODO.SEDE).toMatch(/não alcance de atendimento/i);
    expect(DESCRICOES_MODO.ABRANGENCIA).toMatch(/não presença física/i);
  });

  it("modo inválido não vira modo — cai para null e a página decide o padrão", () => {
    expect(modoValido("SEDE")).toBe("SEDE");
    expect(modoValido("ABRANGENCIA")).toBe("ABRANGENCIA");
    expect(modoValido("sede")).toBeNull();
    expect(modoValido("QUALQUER")).toBeNull();
    expect(modoValido(undefined)).toBeNull();
  });

  it("volume não declarado viaja com motivo — não é omitido nem deduzido", () => {
    const distribuicao = distribuicaoDeTeste({
      modo: "ABRANGENCIA",
      naoDeclarado: { aliados: 7, motivo: "sem cobertura declarada nas soluções publicadas" },
    });
    const leituras = lerOMapa(distribuicao);
    const sobreNaoDeclarado = leituras.find((l) => l.texto.includes("fora do mapa"));
    expect(sobreNaoDeclarado).toBeDefined();
    expect(sobreNaoDeclarado!.texto).toContain("7");
    expect(sobreNaoDeclarado!.alerta).toBe(true);
  });
});

describe("ranking por região", () => {
  it("ordena por volume e mantém as cinco regiões, inclusive as vazias (RN53)", () => {
    const ranking = rankingPorRegiao(distribuicaoDeTeste());
    expect(ranking).toHaveLength(5);
    expect(ranking.map((linha) => linha.regiao).slice(0, 3)).toEqual([
      "SUDESTE",
      "SUL",
      "NORDESTE",
    ]);
    const vazias = ranking.filter((linha) => linha.vazia).map((linha) => linha.regiao);
    expect(vazias.sort()).toEqual(["CENTRO_OESTE", "NORTE"]);
  });

  it("participação usa a base de aliados, não a soma da coluna", () => {
    const ranking = rankingPorRegiao(distribuicaoDeTeste());
    expect(ranking.find((l) => l.regiao === "SUDESTE")!.participacao).toBe(50);
    expect(ranking.find((l) => l.regiao === "NORTE")!.participacao).toBe(0);
  });

  it("base zero devolve participação indisponível, não 0% (RN53)", () => {
    const ranking = rankingPorRegiao(
      distribuicaoDeTeste({
        linhas: [{ sigla: "SP", nome: "São Paulo", regiao: "SUDESTE", aliados: 0, solucoes: 0 }],
        baseDeAliados: 0,
      }),
    );
    expect(ranking.every((linha) => linha.participacao === null)).toBe(true);
    expect(participacao(3, 0)).toBeNull();
  });

  it("detecta quando a coluna soma mais que a base — o caso da abrangência", () => {
    // Um aliado que atende as três UFs conta em cada uma: soma 3, base 1.
    const sobreposta = distribuicaoDeTeste({
      modo: "ABRANGENCIA",
      linhas: [
        { sigla: "SP", nome: "São Paulo", regiao: "SUDESTE", aliados: 1, solucoes: 1 },
        { sigla: "PR", nome: "Paraná", regiao: "SUL", aliados: 1, solucoes: 1 },
        { sigla: "BA", nome: "Bahia", regiao: "NORDESTE", aliados: 1, solucoes: 1 },
      ],
      baseDeAliados: 1,
    });
    expect(somaExcedeBase(sobreposta)).toBe(true);
    expect(somaExcedeBase(distribuicaoDeTeste())).toBe(false);
  });
});

describe("leitura do mapa — derivada do recorte, nunca texto fixo (ficha §3)", () => {
  it("nomeia a região líder e a UF líder com os números do recorte", () => {
    const leituras = lerOMapa(distribuicaoDeTeste());
    const texto = leituras.map((l) => l.texto).join(" | ");
    expect(texto).toContain(ROTULOS_REGIAO.SUDESTE);
    expect(texto).toContain("50%");
    expect(texto).toContain("São Paulo");
  });

  it("muda quando o recorte muda — é a prova de que não é texto fixo", () => {
    const sudeste = lerOMapa(distribuicaoDeTeste()).map((l) => l.texto).join(" ");
    const outroRecorte = lerOMapa(
      distribuicaoDeTeste({
        linhas: [
          { sigla: "SP", nome: "São Paulo", regiao: "SUDESTE", aliados: 1, solucoes: 1 },
          { sigla: "BA", nome: "Bahia", regiao: "NORDESTE", aliados: 9, solucoes: 9 },
        ],
        baseDeAliados: 10,
      }),
    )
      .map((l) => l.texto)
      .join(" ");
    expect(outroRecorte).not.toBe(sudeste);
    expect(outroRecorte).toContain("Bahia");
  });

  it("aponta as regiões sem ninguém como alerta", () => {
    const leituras = lerOMapa(distribuicaoDeTeste());
    const vazio = leituras.find((l) => l.texto.includes("Sem nenhum aliado"));
    expect(vazio?.alerta).toBe(true);
    expect(vazio?.texto).toContain("Norte");
    expect(vazio?.texto).toContain("Centro-Oeste");
  });

  it("afirma o estado positivo quando as cinco regiões têm aliado", () => {
    const completa = distribuicaoDeTeste({
      linhas: [
        { sigla: "SP", nome: "São Paulo", regiao: "SUDESTE", aliados: 4, solucoes: 4 },
        { sigla: "PR", nome: "Paraná", regiao: "SUL", aliados: 4, solucoes: 4 },
        { sigla: "BA", nome: "Bahia", regiao: "NORDESTE", aliados: 4, solucoes: 4 },
        { sigla: "AM", nome: "Amazonas", regiao: "NORTE", aliados: 4, solucoes: 4 },
        { sigla: "GO", nome: "Goiás", regiao: "CENTRO_OESTE", aliados: 4, solucoes: 4 },
      ],
      baseDeAliados: 20,
    });
    const leituras = lerOMapa(completa);
    expect(leituras.some((l) => l.texto.includes("As cinco regiões"))).toBe(true);
  });

  it("sem base declara a ausência em vez de inventar uma leitura (RN53)", () => {
    const leituras = lerOMapa(
      distribuicaoDeTeste({
        linhas: [{ sigla: "SP", nome: "São Paulo", regiao: "SUDESTE", aliados: 0, solucoes: 0 }],
        baseDeAliados: 0,
      }),
    );
    expect(leituras).toHaveLength(1);
    expect(leituras[0]!.texto).toContain("não há distribuição a ler");
    expect(leituras[0]!.alerta).toBe(true);
  });

  it("entrega de três a quatro observações, como a ficha pede", () => {
    expect(lerOMapa(distribuicaoDeTeste()).length).toBeGreaterThanOrEqual(3);
    expect(
      lerOMapa(
        distribuicaoDeTeste({
          naoDeclarado: { aliados: 2, motivo: "sem UF de sede válida" },
        }),
      ).length,
    ).toBeLessThanOrEqual(4);
  });
});
