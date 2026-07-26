import { describe, expect, it } from "vitest";
import {
  CATALOGO_ACAO_HOJE,
  CATALOGO_INDICADORES,
  CATALOGO_PANORAMA,
  chaveDePanorama,
  pendenciasAcionaveis,
  totalDePendencias,
} from "@/dominio/dashboard/indicadores";
import { montarPainel, pendenciasDeHoje } from "./dashboard";

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
