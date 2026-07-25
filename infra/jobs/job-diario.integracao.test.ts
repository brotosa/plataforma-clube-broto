import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { executarJobDiario } from "./job-diario";

/**
 * Integração do job diário (exige banco com seed): RN03 (expiração) e
 * janela de não-renovação, com auditoria do usuário de sistema.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("job diário — RN03 e janela contratual", () => {
  const prisma = new PrismaClient();
  let empresaId = "";
  let ofertaVencidaId = "";
  let ofertaVigenteId = "";
  let contratoId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-JOB]" } },
      include: { solucoes: true },
    });
    for (const empresa of empresas) {
      const solucaoIds = empresa.solucoes.map((solucao) => solucao.id);
      await prisma.oferta.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
      await prisma.solucao.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.contratoComercial.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.empresa.delete({ where: { id: empresa.id } });
    }
  }

  beforeAll(async () => {
    await limpar();
    const tipo = await prisma.tipoBeneficio.findUniqueOrThrow({ where: { slug: "PCT_DESCONTO" } });
    const mecanica = await prisma.mecanica.findUniqueOrThrow({ where: { slug: "CHECKOUT_CLUBE" } });

    const empresa = await prisma.empresa.create({
      data: { nomeFantasia: "[TESTE-JOB] Empresa", estagio: "ALIADA_ATIVA" },
    });
    empresaId = empresa.id;
    // Aniversário da vigência a ~15 dias de hoje → dentro da janela
    const base = new Date();
    base.setUTCFullYear(base.getUTCFullYear() - 1);
    base.setUTCDate(base.getUTCDate() + 15);
    const contrato = await prisma.contratoComercial.create({
      data: {
        empresaId,
        vigenciaBase: base,
        ambientesPagamento: "AMBOS",
        comissaoPct: 5,
      },
    });
    contratoId = contrato.id;

    const solucao = await prisma.solucao.create({
      data: { empresaId, nome: "[TESTE-JOB] Solução" },
    });
    const ofertaVencida = await prisma.oferta.create({
      data: {
        solucaoId: solucao.id,
        titulo: "[TESTE-JOB] Vencida",
        natureza: "BENEFICIO",
        tipoBeneficioId: tipo.id,
        mecanicaId: mecanica.id,
        vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
        vigenciaFim: new Date("2026-01-31T00:00:00Z"),
        status: "PUBLICADA",
      },
    });
    ofertaVencidaId = ofertaVencida.id;
    const ofertaVigente = await prisma.oferta.create({
      data: {
        solucaoId: solucao.id,
        titulo: "[TESTE-JOB] Vigente",
        natureza: "BENEFICIO",
        tipoBeneficioId: tipo.id,
        mecanicaId: mecanica.id,
        vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
        vigenciaFim: null,
        status: "PUBLICADA",
      },
    });
    ofertaVigenteId = ofertaVigente.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("expira a vencida (RN03), marca despublicação e preserva a vigente", async () => {
    const resultado = await executarJobDiario(new Date());
    expect(resultado.ofertasExpiradas).toBeGreaterThanOrEqual(1);

    const vencida = await prisma.oferta.findUniqueOrThrow({ where: { id: ofertaVencidaId } });
    expect(vencida.status).toBe("EXPIRADA");
    expect(vencida.pendenteRepublicacao).toBe(true);

    const vigente = await prisma.oferta.findUniqueOrThrow({ where: { id: ofertaVigenteId } });
    expect(vigente.status).toBe("PUBLICADA");

    const trilha = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "oferta", entidadeId: ofertaVencidaId, campo: "status" },
      include: { autor: true },
      orderBy: { criadoEm: "desc" },
    });
    expect(trilha?.valorNovo).toBe("EXPIRADA");
    expect(trilha?.autor.email).toBe("rotina@sistema.clubebroto.local");
  });

  it("marca o contrato na janela de não-renovação (≤30 dias do aniversário)", async () => {
    const contrato = await prisma.contratoComercial.findUniqueOrThrow({ where: { id: contratoId } });
    expect(contrato.emJanelaNaoRenovacao).toBe(true);
  });

  it("é idempotente: reexecutar não duplica efeitos", async () => {
    const resultado = await executarJobDiario(new Date());
    expect(resultado.ofertasExpiradas).toBe(0);
    expect(resultado.contratosMarcados).toBe(0);
  });
});
