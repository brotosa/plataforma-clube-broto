import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { listarAliados, TAMANHO_BLOCO_ROLAGEM } from "./aliados";

/**
 * RN56 — a T1 lê por rolagem contínua, e o que sustenta isso é a consulta
 * continuar PAGINADA no servidor.
 *
 * O risco que este arquivo guarda não é a tela: é alguém "simplificar" a
 * rolagem trocando os blocos por um `findMany` sem `take`. Com 46 aliados
 * ninguém perceberia; com algumas centenas — o horizonte que a própria
 * ficha declara — a T1 passaria a carregar a rede inteira, com marca,
 * categorias, soluções e ofertas de cada um, a cada visita.
 *
 * Guarda também o outro número que a régua manda preservar: o total é o da
 * CONSULTA, nunca a contagem do que já foi carregado.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("RN56 — rolagem contínua da lista de aliados", () => {
  const prisma = new PrismaClient();
  const PREFIXO = "[TESTE-RN56]";
  const QUANTIDADE = TAMANHO_BLOCO_ROLAGEM + 5;

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const ids = empresas.map((empresa) => empresa.id);
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await limpar();
    // Nomes com índice fixo: a ordenação da consulta é por nome, então os
    // blocos são previsíveis e o teste não depende de sorte.
    await prisma.empresa.createMany({
      data: Array.from({ length: QUANTIDADE }, (_, indice) => ({
        nomeFantasia: `${PREFIXO} Aliado ${String(indice).padStart(3, "0")}`,
        estagio: "ALIADA_ATIVA" as const,
      })),
    });
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  async function blocoDeTeste(pagina: number) {
    const resultado = await listarAliados({
      busca: PREFIXO,
      pagina,
      tamanho: TAMANHO_BLOCO_ROLAGEM,
    });
    return resultado;
  }

  it("o primeiro bloco traz no máximo o tamanho do bloco — nunca a rede inteira", async () => {
    const primeiro = await blocoDeTeste(1);
    expect(primeiro.linhas.length).toBe(TAMANHO_BLOCO_ROLAGEM);
    expect(primeiro.linhas.length).toBeLessThan(QUANTIDADE);
  });

  it("o total é o da consulta, não o do que já foi carregado", async () => {
    const primeiro = await blocoDeTeste(1);
    expect(primeiro.total).toBe(QUANTIDADE);
    expect(primeiro.total).toBeGreaterThan(primeiro.linhas.length);
  });

  it("o segundo bloco continua de onde o primeiro parou, sem repetir nem pular", async () => {
    const primeiro = await blocoDeTeste(1);
    const segundo = await blocoDeTeste(2);

    expect(segundo.linhas.length).toBe(QUANTIDADE - TAMANHO_BLOCO_ROLAGEM);

    const idsPrimeiro = new Set(primeiro.linhas.map((linha) => linha.id));
    const repetidos = segundo.linhas.filter((linha) => idsPrimeiro.has(linha.id));
    expect(repetidos).toEqual([]);

    const todos = [...primeiro.linhas, ...segundo.linhas].map((linha) => linha.nomeFantasia);
    expect(new Set(todos).size).toBe(QUANTIDADE);
  });

  it("os filtros valem em todo bloco — rolar não afrouxa a seleção", async () => {
    const semFiltro = await listarAliados({ pagina: 1, tamanho: TAMANHO_BLOCO_ROLAGEM });
    const comFiltro = await blocoDeTeste(1);
    expect(comFiltro.total).toBeLessThanOrEqual(semFiltro.total);
    expect(comFiltro.linhas.every((linha) => linha.nomeFantasia.startsWith(PREFIXO))).toBe(true);

    const segundoComFiltro = await blocoDeTeste(2);
    expect(segundoComFiltro.linhas.every((linha) => linha.nomeFantasia.startsWith(PREFIXO))).toBe(
      true,
    );
  });

  it("bloco além do fim vem vazio, com o total preservado", async () => {
    const alem = await blocoDeTeste(99);
    expect(alem.linhas).toEqual([]);
    expect(alem.total).toBe(QUANTIDADE);
  });

  it("a marca viaja como hash na linha — o binário não entra na lista (RN54)", async () => {
    const primeiro = await blocoDeTeste(1);
    for (const linha of primeiro.linhas) {
      expect(linha).toHaveProperty("marcaHash");
      expect(linha).not.toHaveProperty("conteudo");
      expect(JSON.stringify(linha).length).toBeLessThan(2000);
    }
  });
});
