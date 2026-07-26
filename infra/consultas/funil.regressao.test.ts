import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/infra/prisma/cliente";
import { ESTAGIOS_FUNIL } from "@/dominio/funil/regras";
import { funilDeMercado } from "./funil";

/**
 * **Regressão do funil (T8) — exigida pelo prompt da Onda 7 §2.**
 *
 * A F14 mexeu na T8 em um ponto só: o estado vazio do funil filtrado por
 * categoria passou a oferecer "+ Entrar no radar" com a categoria
 * pré-preenchida. É mudança de apresentação, mas a T8 está em produção e o
 * ajuste depende de um comportamento de consulta — o filtro por categoria
 * devolvendo vazio de verdade — que precisa continuar valendo.
 *
 * O que se prova aqui:
 *   1. a consulta do funil devolve a mesma estrutura de antes (lanes de todos
 *      os estágios, contadores, tabela e régua);
 *   2. o filtro por categoria de fato recorta, e não é ignorado em silêncio;
 *   3. categoria sem ninguém no funil devolve funil vazio — a condição exata
 *      que aciona o estado vazio novo. Se isso deixasse de valer, o atalho
 *      nunca apareceria, e o caminho T29 → T8 → T9 morreria calado.
 */

const SUFIXO = "-regressao-funil-f14";

/**
 * Integração: só executa com banco disponível. O primeiro job do CI
 * (typecheck, lint e unidade) roda SEM PostgreSQL de propósito — é a
 * verificação rápida —, e o segundo é que sobe o serviço. Sem esta guarda o
 * arquivo derruba o job errado, dizendo "DATABASE_URL não encontrada" em vez
 * de reportar regra de negócio. Mesmo padrão das demais suítes de integração
 * do repositório.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

let categoriaComProspectId = "";
let categoriaVaziaId = "";
let empresaId = "";

describe.skipIf(!temBanco)("T8 — regressão do funil (F14)", () => {
  beforeAll(async () => {
    const comProspect = await prisma.categoria.create({
      data: { slug: "regressao-funil-f14-a", nome: `Com prospect${SUFIXO}`, ordem: 950, ativa: true },
    });
    const vazia = await prisma.categoria.create({
      data: { slug: "regressao-funil-f14-b", nome: `Sem ninguém${SUFIXO}`, ordem: 951, ativa: true },
    });
    categoriaComProspectId = comProspect.id;
    categoriaVaziaId = vazia.id;

    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: `Prospect${SUFIXO}`,
        estagio: "MAPEADA",
        categorias: { create: { categoriaId: comProspect.id } },
      },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await prisma.empresaCategoria.deleteMany({ where: { empresaId } });
    await prisma.empresa.deleteMany({ where: { id: empresaId } });
    await prisma.categoria.deleteMany({
      where: { id: { in: [categoriaComProspectId, categoriaVaziaId] } },
    });
  });

  describe("o funil continua o mesmo depois da F14", () => {
    it("a consulta devolve uma lane por estágio do funil, contadores, tabela e régua", async () => {
      const { lanes, contadores, tabela, regua } = await funilDeMercado({});

      expect(lanes.map((lane) => lane.estagio)).toEqual([...ESTAGIOS_FUNIL]);
      expect(typeof contadores.identificadas).toBe("number");
      expect(Array.isArray(tabela)).toBe(true);
      expect(regua.leveDias).toBeGreaterThan(0);
      expect(regua.forteDias).toBeGreaterThan(regua.leveDias);
    });

    it("o filtro por categoria recorta de verdade — não é ignorado", async () => {
      const filtrado = await funilDeMercado({ categoriaId: categoriaComProspectId });
      const cards = filtrado.lanes.flatMap((lane) => lane.cards);

      expect(cards.map((card) => card.id)).toContain(empresaId);
      // Só a empresa do cenário: se o filtro fosse ignorado, viria a base toda.
      expect(cards).toHaveLength(1);
    });

    it("categoria sem ninguém devolve funil vazio — a condição do estado vazio novo", async () => {
      const filtrado = await funilDeMercado({ categoriaId: categoriaVaziaId });

      expect(filtrado.lanes.flatMap((lane) => lane.cards)).toHaveLength(0);
      expect(filtrado.tabela).toHaveLength(0);
      // As lanes continuam existindo mesmo vazias: o kanban não desaparece.
      expect(filtrado.lanes.map((lane) => lane.estagio)).toEqual([...ESTAGIOS_FUNIL]);
    });

    it("o filtro sem recorte não perde a empresa do cenário", async () => {
      const { lanes } = await funilDeMercado({});
      expect(lanes.flatMap((lane) => lane.cards).map((card) => card.id)).toContain(empresaId);
    });
  });
});
