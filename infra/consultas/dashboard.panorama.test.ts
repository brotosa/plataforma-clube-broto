import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CATALOGO_ACAO_HOJE,
  CATALOGO_INDICADORES,
  CATALOGO_PANORAMA,
  chaveDePanorama,
  pendenciasAcionaveis,
  totalDePendencias,
} from "@/dominio/dashboard/indicadores";
import { prisma } from "@/infra/prisma/cliente";
import { montarPainel, pendenciasDeHoje } from "./dashboard";
import { kpiVitrineViva } from "./telemetria";

/**
 * **Regressão da HOME (F14).**
 *
 * A reorganização em três camadas — panorama no hero, pendências como
 * cartões próprios, quatro blocos preservados — mexeu na tela que é a porta
 * de entrada do produto em produção. O que este arquivo cobra:
 *
 *   1. **Os quatro blocos não mudaram.** Mesmos indicadores, mesma ordem,
 *      mesmos rótulos do catálogo da F13. O panorama não pode ter vazado
 *      para dentro deles nem deslocado nada.
 *   2. **O panorama lê o mesmo serviço.** Onde uma célula compartilha fonte
 *      com um bloco, os números batem — é o que prova "nenhuma consulta nova
 *      de negócio" (RN50) em vez de apenas afirmá-lo em comentário.
 *   3. **Sino e cartões são o mesmo número.** Se divergirem, os dois perdem
 *      credibilidade (ficha Onda 7 §7).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("T26 · os quatro blocos sobrevivem à reorganização", () => {
  it("os blocos trazem exatamente o catálogo da F13, sem sobra e sem falta", async () => {
    const painel = await montarPainel("90");
    const apurados = painel.blocos.flatMap((bloco) =>
      bloco.indicadores.map((indicador) => indicador.chave),
    );
    expect([...apurados].sort()).toEqual(
      CATALOGO_INDICADORES.map((definicao) => definicao.chave).sort(),
    );
  });

  it("os quatro blocos continuam na ordem da ficha, com os mesmos rótulos", async () => {
    const painel = await montarPainel("90");
    expect(painel.blocos.map((bloco) => bloco.bloco)).toEqual([
      "REDE_E_ALIADOS",
      "MERCADO_E_FUNIL",
      "ASSINANTES_E_USO",
      "CAMPANHAS",
    ]);
    for (const bloco of painel.blocos) {
      for (const indicador of bloco.indicadores) {
        expect(indicador.rotulo.length, indicador.chave).toBeGreaterThan(0);
        expect(indicador.fonte, indicador.chave).toMatch(/ficha-onda[1-5]/);
      }
    }
  });

  it("nenhuma chave de panorama vaza para dentro dos blocos", async () => {
    const painel = await montarPainel("90");
    for (const bloco of painel.blocos) {
      for (const indicador of bloco.indicadores) {
        expect(chaveDePanorama(indicador.chave), indicador.chave).toBe(false);
      }
    }
  });

  it("a meta × realizado do bloco de Mercado continua presente", async () => {
    const painel = await montarPainel("90");
    const mercado = painel.blocos.find((bloco) => bloco.bloco === "MERCADO_E_FUNIL");
    expect(mercado?.indicadores.map((i) => i.chave)).toContain("META_X_REALIZADO");
  });

  it("o destaque do hero segue sendo a vitrine viva", async () => {
    const painel = await montarPainel("90");
    expect(painel.destaque.chave).toBe("VITRINE_VIVA_PCT");
  });
});

describe.skipIf(!temBanco)("T26 · panorama do hero (Onda 7 §6)", () => {
  it("apura as oito células do catálogo, na ordem da ficha", async () => {
    const painel = await montarPainel("90");
    expect(painel.panorama.map((celula) => celula.chave)).toEqual(
      CATALOGO_PANORAMA.map((definicao) => definicao.chave),
    );
  });

  it("toda célula tem rótulo, destino navegável e nota de procedência", async () => {
    const painel = await montarPainel("90");
    for (const celula of painel.panorama) {
      expect(celula.rotulo.length, celula.chave).toBeGreaterThan(0);
      expect(celula.destino.startsWith("/"), celula.chave).toBe(true);
      expect(celula.nota.length, celula.chave).toBeGreaterThan(5);
    }
  });

  it("nenhuma célula fica sem estado — disponível ou indisponível COM motivo", async () => {
    const painel = await montarPainel("90");
    for (const celula of painel.panorama) {
      if (celula.resultado.estado === "INDISPONIVEL") {
        expect(celula.resultado.motivo, celula.chave).toBeTruthy();
      } else {
        expect(Number.isFinite(celula.resultado.valor), celula.chave).toBe(true);
        // Contagem negativa não existe; se aparecer, o cálculo está errado.
        expect(celula.resultado.valor, celula.chave).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("em TODOS, a célula de Aliados é a rede inteira — a MESMA base do bloco de Rede", async () => {
    // A célula passou a obedecer a DATA DE ASSINATURA (28/08); em "Todos"
    // (sem recorte) ela volta a ser a rede inteira, que é o denominador da
    // completude do bloco de Rede. Assim provamos que não há consulta
    // paralela: o total bate com a base do bloco.
    const painel = await montarPainel("TODOS");
    const completude = painel.blocos
      .flatMap((bloco) => bloco.indicadores)
      .find((indicador) => indicador.chave === "ALIADOS_CADASTRO_COMPLETO_PCT");
    const celula = painel.panorama.find((c) => c.chave === "PAN_ALIADOS");

    if (completude?.resultado.estado === "DISPONIVEL" && completude.resultado.base) {
      expect(celula?.resultado.estado).toBe("DISPONIVEL");
      if (celula?.resultado.estado === "DISPONIVEL") {
        expect(celula.resultado.valor).toBe(completude.resultado.base.total);
      }
    } else {
      // Sem base no bloco, a célula também não inventa uma.
      expect(celula?.resultado.estado).toBe("INDISPONIVEL");
    }
  });

  it("a célula de Assinantes usa a MESMA base do bloco de Assinantes", async () => {
    const painel = await montarPainel("90");
    const contato = painel.blocos
      .flatMap((bloco) => bloco.indicadores)
      .find((indicador) => indicador.chave === "BASE_COM_CONTATO_VALIDO_PCT");
    const celula = painel.panorama.find((c) => c.chave === "PAN_ASSINANTES");

    if (contato?.resultado.estado === "DISPONIVEL" && contato.resultado.base) {
      expect(celula?.resultado.estado).toBe("DISPONIVEL");
      if (celula?.resultado.estado === "DISPONIVEL") {
        expect(celula.resultado.valor).toBe(contato.resultado.base.total);
      }
    } else {
      expect(celula?.resultado.estado).toBe("INDISPONIVEL");
    }
  });

  it("a célula de Campanhas concorda com o bloco de Campanhas", async () => {
    const painel = await montarPainel("90");
    const ativas = painel.blocos
      .flatMap((bloco) => bloco.indicadores)
      .find((indicador) => indicador.chave === "CAMPANHAS_ATIVAS");
    const celula = painel.panorama.find((c) => c.chave === "PAN_CAMPANHAS");

    if (ativas?.resultado.estado === "DISPONIVEL" && celula?.resultado.estado === "DISPONIVEL") {
      expect(celula.resultado.valor).toBe(ativas.resultado.valor);
    }
  });

  it("número de campanha no panorama viaja com o nível de atribuição (RN43)", async () => {
    const painel = await montarPainel("90");
    for (const chave of ["PAN_CAMPANHAS", "PAN_RESGATES_BENEFICIOS"] as const) {
      const celula = painel.panorama.find((c) => c.chave === chave);
      if (celula?.resultado.estado === "DISPONIVEL") {
        expect(celula.resultado.nivelAtribuicao, chave).toBeDefined();
      }
    }
  });
});

describe.skipIf(!temBanco)("T26 × sino · o mesmo número nos dois lugares (Onda 7 §7)", () => {
  it("a soma do sino é exatamente a soma dos cartões da camada 2", async () => {
    const painel = await montarPainel("90");
    const doSino = totalDePendencias(await pendenciasDeHoje());
    const dosCartoes = painel.pendencias
      .filter((pendencia) => pendencia.indisponivel === undefined)
      .reduce((total, pendencia) => total + pendencia.contagem, 0);

    expect(doSino).toBe(dosCartoes);
  });

  it("as linhas do sino são exatamente os cartões exibidos na HOME", async () => {
    const pendencias = await pendenciasDeHoje();
    const doSino = pendenciasAcionaveis(pendencias).map((p) => p.chave);
    const painel = await montarPainel("90");
    const dosCartoes = pendenciasAcionaveis(painel.pendencias).map((p) => p.chave);

    expect(doSino).toEqual(dosCartoes);
  });

  it("as seis pendências da ficha continuam apuradas, na ordem", async () => {
    const pendencias = await pendenciasDeHoje();
    expect(pendencias.map((p) => p.chave)).toEqual(CATALOGO_ACAO_HOJE.map((p) => p.chave));
  });

  it("mexer no banco muda o número dos DOIS — não há cache separado", async () => {
    const antes = totalDePendencias(await pendenciasDeHoje());

    const { prisma } = await import("@/infra/prisma/cliente");
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-F14] Reavaliação vencida",
        estagio: "ALIADA_ATIVA",
        reavaliacaoPendente: true,
      },
    });
    try {
      const depois = await pendenciasDeHoje();
      expect(totalDePendencias(depois)).toBe(antes + 1);

      const painel = await montarPainel("90");
      const dosCartoes = painel.pendencias
        .filter((pendencia) => pendencia.indisponivel === undefined)
        .reduce((total, pendencia) => total + pendencia.contagem, 0);
      expect(dosCartoes).toBe(antes + 1);
    } finally {
      await prisma.empresa.delete({ where: { id: empresa.id } });
    }
  });
});

// ---------------------------------------------------------------------
// F15 — a célula Ofertas passa a mostrar o absoluto da vitrine viva
// ---------------------------------------------------------------------

describe.skipIf(!temBanco)("T26 · célula Ofertas — pela DATA DA OFERTA (início da vigência, 28/08)", () => {
  const valorDaCelula = (painel: Awaited<ReturnType<typeof montarPainel>>): number | null => {
    const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
    return celula.resultado.estado === "DISPONIVEL" ? celula.resultado.valor : null;
  };

  it("em TODOS, conta TODAS as publicadas (não só as com resgate)", async () => {
    // A célula deixou de ser o numerador da vitrine viva: agora conta
    // ofertas pela vigência. Em "Todos" isso é o total de publicadas —
    // inclusive as que nunca tiveram resgate.
    const [painel, vitrine] = await Promise.all([montarPainel("TODOS"), kpiVitrineViva()]);
    if (vitrine.totalPublicadas === 0) {
      expect(painel.panorama.find((c) => c.chave === "PAN_OFERTAS")!.resultado.estado).toBe(
        "INDISPONIVEL",
      );
      return;
    }
    expect(valorDaCelula(painel)).toBe(vitrine.totalPublicadas);
  });

  it("a nota fala de vigência no período, não mais de 'com resgate'", async () => {
    const painel = await montarPainel("TODOS");
    const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
    if (celula.resultado.estado !== "DISPONIVEL") return;
    expect(celula.nota).toContain("vigência iniciada no período");
    expect(celula.nota).not.toContain("com resgate em");
  });

  it("as janelas encaixam: 30 ≤ 90 ≤ 12m ≤ TODOS", async () => {
    const [c30, c90, c12m, cTodos] = await Promise.all([
      montarPainel("30").then(valorDaCelula),
      montarPainel("90").then(valorDaCelula),
      montarPainel("12m").then(valorDaCelula),
      montarPainel("TODOS").then(valorDaCelula),
    ]);
    // Célula indisponível (base zero) não entra na comparação.
    if (c30 === null || c90 === null || c12m === null || cTodos === null) return;
    expect(c30).toBeLessThanOrEqual(c90);
    expect(c90).toBeLessThanOrEqual(c12m);
    expect(c12m).toBeLessThanOrEqual(cTodos);
  });

  // Semeia ofertas com vigência ANTIGA (fora de 12 meses) para provar, com
  // número, que a janela recorta pela data da oferta — elas entram em
  // "Todos" e ficam de fora de "12 meses".
  describe("com ofertas de vigência antiga semeadas", () => {
    const SUFIXO = " [TESTE-OFERTAS-VIGENCIA]";
    let empresaId = "";

    beforeAll(async () => {
      const [tipo, mecanica] = await Promise.all([
        prisma.tipoBeneficio.findFirst({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
        prisma.mecanica.findFirst({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
      ]);
      if (!tipo || !mecanica) {
        throw new Error("Seed de taxonomias ausente: rode `pnpm db:seed` antes da suíte.");
      }
      const empresa = await prisma.empresa.create({
        data: {
          nomeFantasia: `Aliado${SUFIXO}`,
          estagio: "ALIADA_ATIVA",
          solucoes: { create: { nome: `Solução${SUFIXO}` } },
        },
        include: { solucoes: true },
      });
      empresaId = empresa.id;
      const solucaoId = empresa.solucoes[0]!.id;
      // Duas publicadas com vigência em 2020 — bem antes de qualquer janela
      // de 12 meses —, e SEM resgate, de propósito.
      for (const indice of [1, 2]) {
        await prisma.oferta.create({
          data: {
            solucaoId,
            titulo: `Oferta antiga ${indice}${SUFIXO}`,
            natureza: "BENEFICIO",
            tipoBeneficioId: tipo.id,
            mecanicaId: mecanica.id,
            vigenciaInicio: new Date("2020-01-01T00:00:00Z"),
            status: "PUBLICADA",
          },
        });
      }
    });

    afterAll(async () => {
      await prisma.oferta.deleteMany({ where: { titulo: { contains: SUFIXO } } });
      await prisma.solucao.deleteMany({ where: { nome: { contains: SUFIXO } } });
      await prisma.empresa.deleteMany({ where: { id: empresaId } });
    });

    it("as 2 ofertas de 2020 entram em TODOS e ficam fora de 12 meses", async () => {
      const [cTodos, c12m] = await Promise.all([
        montarPainel("TODOS").then(valorDaCelula),
        montarPainel("12m").then(valorDaCelula),
      ]);
      expect(cTodos).not.toBeNull();
      expect(c12m).not.toBeNull();
      // Elas estão em TODOS e não em 12m — logo a diferença as inclui.
      expect((cTodos ?? 0) - (c12m ?? 0)).toBeGreaterThanOrEqual(2);
    });
  });
});

describe.skipIf(!temBanco)("T26 · célula Aliados — pela DATA DE ASSINATURA do contrato (28/08)", () => {
  const valorDaCelula = (painel: Awaited<ReturnType<typeof montarPainel>>): number | null => {
    const celula = painel.panorama.find((item) => item.chave === "PAN_ALIADOS")!;
    return celula.resultado.estado === "DISPONIVEL" ? celula.resultado.valor : null;
  };

  // Um aliado com contrato assinado em 2020 (fora de qualquer janela de 12
  // meses): entra em "Todos", fica de fora dos períodos datados.
  const SUFIXO = " [TESTE-ALIADOS-ASSINATURA]";
  let empresaId = "";

  beforeAll(async () => {
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: `Aliado${SUFIXO}`,
        estagio: "ALIADA_ATIVA",
        contratos: {
          create: {
            vigenciaBase: new Date("2020-01-01T00:00:00Z"),
            dataAssinatura: new Date("2020-01-01T00:00:00Z"),
            ambientesPagamento: "FORA_PLATAFORMA",
          },
        },
      },
      select: { id: true },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await prisma.contratoComercial.deleteMany({ where: { empresaId } });
    await prisma.empresa.deleteMany({ where: { id: empresaId } });
  });

  it("o aliado de 2020 entra em TODOS e fica fora de 12 meses", async () => {
    const [cTodos, c12m] = await Promise.all([
      montarPainel("TODOS").then(valorDaCelula),
      montarPainel("12m").then(valorDaCelula),
    ]);
    expect(cTodos).not.toBeNull();
    expect(c12m).not.toBeNull();
    // O aliado assinado em 2020 está em TODOS e não em 12m: a diferença o inclui.
    expect((cTodos ?? 0) - (c12m ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("as janelas encaixam: 30 ≤ 90 ≤ 12m ≤ TODOS", async () => {
    const [c30, c90, c12m, cTodos] = await Promise.all([
      montarPainel("30").then(valorDaCelula),
      montarPainel("90").then(valorDaCelula),
      montarPainel("12m").then(valorDaCelula),
      montarPainel("TODOS").then(valorDaCelula),
    ]);
    if (c30 === null || c90 === null || c12m === null || cTodos === null) return;
    expect(c30).toBeLessThanOrEqual(c90);
    expect(c90).toBeLessThanOrEqual(c12m);
    expect(c12m).toBeLessThanOrEqual(cTodos);
  });
});
