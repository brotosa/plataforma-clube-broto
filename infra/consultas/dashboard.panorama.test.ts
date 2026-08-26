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

  it("a célula de Aliados usa a MESMA base do bloco de Rede — não uma consulta paralela", async () => {
    const painel = await montarPainel("90");
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

describe.skipIf(!temBanco)("T26 · célula Ofertas — mesma base da vitrine viva (F15)", () => {
  it("o destaque é o número de ofertas ativas COM RESGATE, do mesmo serviço", async () => {
    // A concordância que o prompt da Onda 8 exige provar: o número da
    // célula e o numerador da vitrine viva saem da mesma chamada. Se
    // alguém trocar um dos dois por uma contagem própria, isto fica
    // vermelho — que é exatamente a divergência que a RN50 impede.
    const [painel, vitrine] = await Promise.all([montarPainel("90"), kpiVitrineViva()]);
    const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS");
    expect(celula).toBeDefined();

    if (vitrine.totalPublicadas === 0) {
      // Sem oferta publicada não há vitrine a medir: ausência de base,
      // com motivo — nunca um zero que passaria por resultado (RN50).
      expect(celula!.resultado.estado).toBe("INDISPONIVEL");
      expect(celula!.nota).toContain("vitrine viva");
      return;
    }

    expect(celula!.resultado.estado).toBe("DISPONIVEL");
    if (celula!.resultado.estado === "DISPONIVEL") {
      expect(celula!.resultado.valor).toBe(vitrine.publicadasComResgate);
    }
  });

  it('"de N ativas" desceu para a nota — o destaque tem um número só', async () => {
    const [painel, vitrine] = await Promise.all([montarPainel("90"), kpiVitrineViva()]);
    const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
    if (vitrine.totalPublicadas === 0) return;
    expect(celula.nota).toContain(`de ${vitrine.totalPublicadas} ativas`);
    expect(celula.nota).toContain("com resgate em");
  });

  it("o percentual do hero continua sendo o mesmo par de números", async () => {
    // A célula mostra o numerador; o hero, o percentual. Os dois vindos da
    // mesma apuração é o que faz "148" e "77%" contarem a mesma história.
    const [painel, vitrine] = await Promise.all([montarPainel("90"), kpiVitrineViva()]);
    const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
    if (vitrine.totalPublicadas === 0 || celula.resultado.estado !== "DISPONIVEL") return;

    const esperado = Math.round((vitrine.publicadasComResgate / vitrine.totalPublicadas) * 100);
    expect(painel.destaque.resultado.estado).toBe("DISPONIVEL");
    if (painel.destaque.resultado.estado === "DISPONIVEL") {
      expect(painel.destaque.resultado.valor).toBe(esperado);
    }
    // O denominador vive no hero (o percentual) e na nota da célula — o
    // destaque da célula não o carrega mais.
    expect(painel.destaque.resultado.estado === "DISPONIVEL" && painel.destaque.resultado.base).toEqual({
      parte: vitrine.publicadasComResgate,
      total: vitrine.totalPublicadas,
    });
    expect(celula.resultado.estado === "DISPONIVEL" && celula.resultado.base).toBeUndefined();
  });

  it("sem oferta publicada, traço com motivo — jamais zero (RN50)", async () => {
    const painel = await montarPainel("90");
    const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
    if (celula.resultado.estado === "INDISPONIVEL") {
      expect(celula.resultado.motivo).toBeTruthy();
      expect(celula.nota).toBeTruthy();
    }
  });

  // As asserções acima valem sobre a base que existir. Estas semeiam a
  // situação de propósito, para que a concordância seja provada com
  // NÚMERO, e não apenas no ramo de ausência de base.
  describe("com ofertas e resgates semeados", () => {
    const SUFIXO = " [TESTE-F15-OFERTAS]";
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

      // Três publicadas; só duas recebem resgate na janela. A terceira é o
      // que separa "ativas" de "ativas com resgate" — se a célula voltar a
      // mostrar o total de ativas, o teste fica vermelho.
      const ofertas = [];
      for (const indice of [1, 2, 3]) {
        ofertas.push(
          await prisma.oferta.create({
            data: {
              solucaoId,
              titulo: `Oferta ${indice}${SUFIXO}`,
              natureza: "BENEFICIO",
              tipoBeneficioId: tipo.id,
              mecanicaId: mecanica.id,
              vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
              status: "PUBLICADA",
            },
          }),
        );
      }
      // A vitrine viva passou a contar pelo EXTRATO NOMINAL da operadora
      // (RN68/RN50), não mais pelo voucher clássico. Semeamos, então, um
      // evento de resgate nominal ("Recompensa gratuita") para duas das três
      // publicadas — o que faz `publicadasComResgate` valer 2.
      const autor = await prisma.usuario.findFirstOrThrow();
      const assinante = await prisma.assinante.create({
        data: {
          nome: `Assinante${SUFIXO}`,
          cpfHash: `hash-sintetico${SUFIXO}`,
          cpfCifrado: `cif-sintetico${SUFIXO}`,
          marcaSintetico: true,
        },
        select: { id: true },
      });
      const importacao = await prisma.importacaoTelemetria.create({
        data: {
          tipoLayout: "RESGATES",
          nomeArquivo: `arquivo${SUFIXO}`,
          hashConteudo: `hash-conteudo${SUFIXO}`,
          autorId: autor.id,
          lidas: 2,
          aplicadas: 2,
          recusadas: 0,
          recusasPorCausa: {},
        },
        select: { id: true },
      });
      for (const oferta of ofertas.slice(0, 2)) {
        await prisma.eventoDeResgateTelemetria.create({
          data: {
            assinanteId: assinante.id,
            dataEvento: new Date(),
            produto: `Produto${SUFIXO}`,
            tipoOferta: "Recompensa gratuita", // classifica como RESGATE
            ofertaId: oferta.id,
            chaveNatural: `chave-sintetica-${oferta.id}`,
            importacaoId: importacao.id,
          },
        });
      }
    });

    afterAll(async () => {
      const ofertas = await prisma.oferta.findMany({
        where: { titulo: { contains: SUFIXO } },
        select: { id: true },
      });
      const ids = ofertas.map((oferta) => oferta.id);
      await prisma.eventoDeResgateTelemetria.deleteMany({ where: { ofertaId: { in: ids } } });
      await prisma.importacaoTelemetria.deleteMany({
        where: { nomeArquivo: { contains: SUFIXO } },
      });
      await prisma.assinante.deleteMany({ where: { nome: { contains: SUFIXO } } });
      await prisma.oferta.deleteMany({ where: { id: { in: ids } } });
      await prisma.solucao.deleteMany({ where: { nome: { contains: SUFIXO } } });
      await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: empresaId } });
      await prisma.empresa.deleteMany({ where: { id: empresaId } });
    });

    it("o número da célula é exatamente o numerador da vitrine viva", async () => {
      const [painel, vitrine] = await Promise.all([montarPainel("90"), kpiVitrineViva()]);
      const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
      expect(vitrine.publicadasComResgate).toBeGreaterThanOrEqual(2);
      expect(celula.resultado.estado).toBe("DISPONIVEL");
      if (celula.resultado.estado === "DISPONIVEL") {
        expect(celula.resultado.valor).toBe(vitrine.publicadasComResgate);
      }
    });

    it("o destaque NÃO é mais o total de ofertas ativas", async () => {
      const [painel, vitrine] = await Promise.all([montarPainel("90"), kpiVitrineViva()]);
      const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
      // A terceira oferta publicada sem resgate garante a diferença.
      expect(vitrine.totalPublicadas).toBeGreaterThan(vitrine.publicadasComResgate);
      if (celula.resultado.estado === "DISPONIVEL") {
        expect(celula.resultado.valor).not.toBe(vitrine.totalPublicadas);
      }
    });

    it("a nota carrega a procedência: janela, ativas e total", async () => {
      const [painel, vitrine] = await Promise.all([montarPainel("90"), kpiVitrineViva()]);
      const celula = painel.panorama.find((item) => item.chave === "PAN_OFERTAS")!;
      expect(celula.nota).toContain("com resgate em");
      expect(celula.nota).toContain(`de ${vitrine.totalPublicadas} ativas`);
    });
  });
});
