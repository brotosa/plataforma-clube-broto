import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  aprovarTudo,
  conferenciaAtual,
  decidirAgrupamentos,
  decidirSellers,
  efetivarCarga,
  iniciarCarga,
  moverOferta,
  renomearAgrupamento,
} from "./carga-inicial";

/**
 * Pipeline completo da carga inicial com as PLANILHAS REAIS (exige banco
 * com seed): staging → conferência (ajustes) → efetivação transacional.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("carga inicial — staging, conferência e efetivação", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let leitura: { id: string; papel: "LEITURA" };

  async function limparBaseDeNegocio() {
    await prisma.telemetriaAcumuladoInicial.deleteMany();
    await prisma.telemetriaEvento.deleteMany();
    await prisma.aprovacaoSolicitacao.deleteMany();
    await prisma.stagingOferta.deleteMany();
    await prisma.stagingAgrupamento.deleteMany();
    await prisma.stagingSeller.deleteMany();
    // Filhas de importacoes/empresas criadas pela F6 (funil) e pela F7
    // (avaliações de scout): sem elas o deleteMany das mães viola as FKs
    // quando sobra resíduo de outra suíte.
    await prisma.stagingEmpresa.deleteMany();
    await prisma.notaRapida.deleteMany();
    await prisma.registroNegociacao.deleteMany();
    await prisma.avaliacaoNota.deleteMany();
    await prisma.avaliacaoScout.deleteMany();
    await prisma.importacao.deleteMany();
    await prisma.oferta.deleteMany();
    await prisma.solucaoCultura.deleteMany();
    await prisma.solucaoUf.deleteMany();
    await prisma.solucao.deleteMany();
    await prisma.contratoComercial.deleteMany();
    await prisma.contatoEmpresa.deleteMany();
    await prisma.empresaCategoria.deleteMany();
    await prisma.auditoriaEvento.deleteMany();
    await prisma.empresa.deleteMany();
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    gestor = { id: usuarios.find((u) => u.papel === "GESTOR")!.id, papel: "GESTOR" };
    leitura = { id: usuarios.find((u) => u.papel === "LEITURA")!.id, papel: "LEITURA" };
    await limparBaseDeNegocio();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("papel Leitura não inicia a carga (RBAC ficha §2)", async () => {
    await expect(iniciarCarga(leitura)).rejects.toThrow(/não tem permissão/);
  });

  it("iniciar a carga povoa o staging com as planilhas reais, sem quarentena", async () => {
    const resultado = await iniciarCarga(gestor);
    expect(resultado.sellers).toBe(46);
    expect(resultado.ofertas).toBe(192);
    expect(resultado.quarentena).toBe(0);

    const conferencia = await conferenciaAtual();
    expect(conferencia.sellers).toHaveLength(46);
    expect(conferencia.agrupamentos).toHaveLength(147);
    expect(conferencia.ofertasSemAgrupamento).toHaveLength(0);
  });

  it("conferência permite renomear agrupamento e mover oferta entre agrupamentos do mesmo seller", async () => {
    const { agrupamentos } = await conferenciaAtual();
    const comDuas = agrupamentos.find((agrupamento) => agrupamento.ofertas.length >= 2)!;
    expect(comDuas).toBeDefined();

    await renomearAgrupamento(gestor, comDuas.id, `${comDuas.nomeSolucaoProposto} (ajustado)`);
    const renomeado = await prisma.stagingAgrupamento.findUniqueOrThrow({
      where: { id: comDuas.id },
    });
    expect(renomeado.nomeSolucaoProposto.endsWith("(ajustado)")).toBe(true);

    // Mover para agrupamento de OUTRO seller é recusado
    const idSeller = comDuas.chaveHeuristica.split("::")[0]!;
    const deOutroSeller = agrupamentos.find(
      (agrupamento) => !agrupamento.chaveHeuristica.startsWith(`${idSeller}::`),
    )!;
    await expect(
      moverOferta(gestor, comDuas.ofertas[0]!.id, deOutroSeller.id),
    ).rejects.toThrow(/mesmo seller/);

    // Mover para outro agrupamento do MESMO seller funciona
    const doMesmoSeller = agrupamentos.find(
      (agrupamento) =>
        agrupamento.id !== comDuas.id &&
        agrupamento.chaveHeuristica.startsWith(`${idSeller}::`),
    );
    if (doMesmoSeller) {
      await moverOferta(gestor, comDuas.ofertas[0]!.id, doMesmoSeller.id);
      const movida = await prisma.stagingOferta.findUniqueOrThrow({
        where: { id: comDuas.ofertas[0]!.id },
      });
      expect(movida.agrupamentoId).toBe(doMesmoSeller.id);
      // Devolve para manter os números redondos do restante do teste
      await moverOferta(gestor, comDuas.ofertas[0]!.id, comDuas.id);
    }
  });

  it("efetivar sem aprovação é recusado; rejeitados ficam de fora", async () => {
    await expect(efetivarCarga(gestor)).rejects.toThrow(/aprove/i);
  });

  it("aprovar tudo e efetivar cria a base real com telemetria acumulada", async () => {
    await aprovarTudo(gestor);

    // Rejeita um seller de propósito para comprovar o item a item
    const umSeller = await prisma.stagingSeller.findFirstOrThrow({
      where: { estado: "APROVADA" },
      orderBy: { linhaOrigem: "desc" },
    });
    await decidirSellers(gestor, [umSeller.id], "REJEITADA");
    const agrupamentosDoRejeitado = await prisma.stagingAgrupamento.findMany({
      where: { chaveHeuristica: { startsWith: `${umSeller.idSellerExterno}::` } },
    });
    await decidirAgrupamentos(
      gestor,
      agrupamentosDoRejeitado.map((agrupamento) => agrupamento.id),
      "REJEITADA",
    );

    const resultado = await efetivarCarga(gestor);
    expect(resultado.empresasCriadas).toBe(45); // 46 − 1 rejeitado
    expect(resultado.solucoesCriadas).toBeGreaterThan(0);
    expect(resultado.ofertasCriadas).toBeGreaterThan(0);
    expect(resultado.acumuladosGravados).toBeGreaterThan(0);

    const [empresas, publicadas, encerradas, acumulados] = await Promise.all([
      prisma.empresa.count({ where: { estagio: "ALIADA_ATIVA" } }),
      prisma.oferta.count({ where: { status: "PUBLICADA" } }),
      prisma.oferta.count({ where: { status: "ENCERRADA" } }),
      prisma.telemetriaAcumuladoInicial.count(),
    ]);
    expect(empresas).toBe(45);
    expect(publicadas + encerradas).toBe(resultado.ofertasCriadas);
    expect(acumulados).toBe(resultado.acumuladosGravados);

    // Dados reais de ponta a ponta: o seller com nome normalizado existe
    const cyan = await prisma.empresa.findFirst({
      where: { nomeFantasia: "Cyan Analytics" },
    });
    expect(cyan).not.toBeNull();
    expect(cyan?.dataEntrada).not.toBeNull();

    // Auditoria da criação registra a origem
    const trilha = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "empresa", entidadeId: cyan!.id, campo: "origem" },
    });
    expect(trilha?.valorNovo).toBe("carga_inicial");
  });

  it("reexecutar a carga e efetivar de novo não duplica (idempotência por id externo)", async () => {
    await iniciarCarga(gestor);
    await aprovarTudo(gestor);
    const resultado = await efetivarCarga(gestor);
    // Tudo já existia (exceto o seller rejeitado na rodada anterior)
    expect(resultado.empresasCriadas).toBe(1);
    const empresas = await prisma.empresa.count();
    expect(empresas).toBe(46);
    const ofertas = await prisma.oferta.count();
    expect(ofertas).toBe(192);
  });
});
