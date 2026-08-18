import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buscaGlobal } from "./busca-global";

/**
 * Busca global (cabeçalho) em nível de consulta: um token distintivo semeado
 * no nome de um aliado, de uma solução e de uma oferta deve aparecer nos três
 * grupos; termo vazio não busca nada; CNPJ é encontrado por dígitos.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const TOKEN = "Xylobuscateste";
const PREFIXO = "[TESTE-BUSCA]";

describe.skipIf(!temBanco)("busca global — consulta integrada", () => {
  const prisma = new PrismaClient();
  let empresaId = "";
  let solucaoId = "";
  let ofertaId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const ids = empresas.map((e) => e.id);
    const solucoes = await prisma.solucao.findMany({
      where: { empresaId: { in: ids } },
      select: { id: true },
    });
    const solIds = solucoes.map((s) => s.id);
    await prisma.oferta.deleteMany({ where: { solucaoId: { in: solIds } } });
    await prisma.solucao.deleteMany({ where: { id: { in: solIds } } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await limpar();
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: `${PREFIXO} ${TOKEN} Agro`,
        cnpj: "99887766000155",
        estagio: "ALIADA_ATIVA",
      },
    });
    empresaId = empresa.id;
    const solucao = await prisma.solucao.create({
      data: { empresaId, nome: `${PREFIXO} Solução ${TOKEN}` },
    });
    solucaoId = solucao.id;

    const tipo = await prisma.tipoBeneficio.findFirst();
    const mecanica = await prisma.mecanica.findFirst();
    if (tipo && mecanica) {
      const oferta = await prisma.oferta.create({
        data: {
          solucaoId,
          titulo: `${PREFIXO} Oferta ${TOKEN}`,
          natureza: "BENEFICIO",
          tipoBeneficioId: tipo.id,
          mecanicaId: mecanica.id,
          vigenciaInicio: new Date(),
        },
      });
      ofertaId = oferta.id;
    }
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("acha o token nos três grupos, cada linha com o vínculo certo", async () => {
    const r = await buscaGlobal(TOKEN);
    expect(r.aliados.some((a) => a.id === empresaId)).toBe(true);
    expect(r.solucoes.some((s) => s.id === solucaoId && s.empresaId === empresaId)).toBe(true);
    if (ofertaId) {
      const oferta = r.ofertas.find((o) => o.id === ofertaId);
      expect(oferta?.empresaId).toBe(empresaId);
      expect(oferta?.solucaoNome).toContain(TOKEN);
    }
  });

  it("termo vazio não busca nada (não varre a base inteira)", async () => {
    const r = await buscaGlobal("   ");
    expect(r.total).toBe(0);
    expect(r.aliados).toEqual([]);
  });

  it("acha o aliado pelo CNPJ (só dígitos, massa mínima)", async () => {
    const r = await buscaGlobal("99887766");
    expect(r.aliados.some((a) => a.id === empresaId)).toBe(true);
  });

  it("token inexistente devolve zero, sem inventar resultado", async () => {
    const r = await buscaGlobal("zzz-nada-Xyloqwerty-nada-zzz");
    expect(r.total).toBe(0);
  });
});
