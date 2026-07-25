import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { executarJobDiario } from "./job-diario";
import { fecharAvaliacao, iniciarAvaliacao, salvarNotas } from "@/infra/casos-de-uso/avaliacoes";

/**
 * Integração do job diário (exige banco com seed): RN03 (expiração),
 * janela de não-renovação e reavaliação anual de aliadas ativas (RN21),
 * com auditoria do usuário de sistema.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("job diário — RN03, janela contratual e RN21", () => {
  const prisma = new PrismaClient();
  let empresaId = "";
  let empresaRecenteId = "";
  let scout: { id: string; papel: "ANALISTA_SCOUT" };
  let ofertaVencidaId = "";
  let ofertaVigenteId = "";
  let contratoId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-JOB]" } },
      include: { solucoes: true },
    });
    const avaliacoes = await prisma.avaliacaoScout.findMany({
      where: { empresaId: { in: empresas.map((empresa) => empresa.id) } },
    });
    await prisma.avaliacaoNota.deleteMany({
      where: { avaliacaoId: { in: avaliacoes.map((avaliacao) => avaliacao.id) } },
    });
    await prisma.avaliacaoScout.deleteMany({
      where: { id: { in: avaliacoes.map((avaliacao) => avaliacao.id) } },
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
    const usuarioScout = await prisma.usuario.findFirstOrThrow({
      where: { papel: "ANALISTA_SCOUT", email: { endsWith: "@dev.clubebroto.local" } },
    });
    scout = { id: usuarioScout.id, papel: "ANALISTA_SCOUT" };
    const indicador = await prisma.indicador.findUniqueOrThrow({
      where: { slug: "PRESENCA_GEOGRAFICA_UFS_ATENDIDAS" },
    });

    const empresa = await prisma.empresa.create({
      data: { nomeFantasia: "[TESTE-JOB] Empresa", estagio: "ALIADA_ATIVA" },
    });
    empresaId = empresa.id;
    // Última avaliação fechada há 13 meses → ciclo anual vencido (RN21)
    const fechadaHa13Meses = new Date();
    fechadaHa13Meses.setUTCMonth(fechadaHa13Meses.getUTCMonth() - 13);
    await prisma.avaliacaoScout.create({
      data: {
        empresaId,
        versao: 1,
        avaliadorId: scout.id,
        status: "FECHADA",
        recomendacao: "AVANCAR",
        total: 60,
        fechadaEm: fechadaHa13Meses,
        notas: { create: [{ indicadorId: indicador.id, nota: 3 }] },
      },
    });

    // Aliada com avaliação fechada há 1 mês → dentro do ciclo (não marca)
    const recente = await prisma.empresa.create({
      data: { nomeFantasia: "[TESTE-JOB] Recente", estagio: "ALIADA_ATIVA" },
    });
    empresaRecenteId = recente.id;
    const fechadaHa1Mes = new Date();
    fechadaHa1Mes.setUTCMonth(fechadaHa1Mes.getUTCMonth() - 1);
    await prisma.avaliacaoScout.create({
      data: {
        empresaId: empresaRecenteId,
        versao: 1,
        avaliadorId: scout.id,
        status: "FECHADA",
        recomendacao: "MONITORAR",
        total: 60,
        fechadaEm: fechadaHa1Mes,
        notas: { create: [{ indicadorId: indicador.id, nota: 3 }] },
      },
    });
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

  it("marca reavaliação da aliada com avaliação fechada há mais de 12 meses (RN21)", async () => {
    const vencida = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(vencida.reavaliacaoPendente).toBe(true);

    const trilha = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "empresa", entidadeId: empresaId, campo: "reavaliacaoPendente" },
      include: { autor: true },
      orderBy: { criadoEm: "desc" },
    });
    expect(trilha?.valorNovo).toBe("true");
    expect(trilha?.autor.email).toBe("rotina@sistema.clubebroto.local");
  });

  it("aliada dentro do ciclo anual não é marcada (RN21)", async () => {
    const recente = await prisma.empresa.findUniqueOrThrow({
      where: { id: empresaRecenteId },
    });
    expect(recente.reavaliacaoPendente).toBe(false);
  });

  it("é idempotente: reexecutar não duplica efeitos", async () => {
    const resultado = await executarJobDiario(new Date());
    expect(resultado.ofertasExpiradas).toBe(0);
    expect(resultado.contratosMarcados).toBe(0);
    expect(resultado.reavaliacoesMarcadas).toBe(0);
    expect(resultado.reavaliacoesDesmarcadas).toBe(0);
  });

  it("fechar nova avaliação zera a marca e reinicia o ciclo (RN21)", async () => {
    const rascunho = await iniciarAvaliacao(scout, empresaId);
    const indicador = await prisma.indicador.findUniqueOrThrow({
      where: { slug: "PRESENCA_GEOGRAFICA_UFS_ATENDIDAS" },
    });
    await salvarNotas(scout, rascunho.id, [{ indicadorId: indicador.id, nota: 4 }]);
    await fecharAvaliacao(scout, rascunho.id, "AVANCAR");

    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.reavaliacaoPendente).toBe(false);
    expect(empresa.scoreScouting).toBe(80);

    const resultado = await executarJobDiario(new Date());
    expect(resultado.reavaliacoesMarcadas).toBe(0); // ciclo reiniciado
  });

  it("empresa que deixa de ser aliada ativa perde a marca órfã (RN21)", async () => {
    await prisma.empresa.update({
      where: { id: empresaRecenteId },
      data: { estagio: "SUSPENSA", reavaliacaoPendente: true },
    });
    const resultado = await executarJobDiario(new Date());
    expect(resultado.reavaliacoesDesmarcadas).toBeGreaterThanOrEqual(1);
    const empresa = await prisma.empresa.findUniqueOrThrow({
      where: { id: empresaRecenteId },
    });
    expect(empresa.reavaliacaoPendente).toBe(false);
  });
});
