import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeValidacao } from "./contexto";
import { promoverDentroDaTransacao } from "./empresas";
import {
  adicionarOfertaPretendida,
  registrarIndicadoresDeclarados,
  removerOfertaPretendida,
  salvarIdentificacaoM1,
} from "./ficha-m1";

/**
 * Formulário M1 da Ficha Cadastral do Aliado v1 em nível de serviço
 * (exige banco com seed): seções A/B no cadastro-mestre, D como
 * declaração datada e autodeclarada, F estruturada com a definição
 * contratual validada — e o aproveitamento automático na promoção, que é
 * a promessa central da ficha ("cada linha da F vira um rascunho de
 * Solução + Oferta pendente de curadoria, zero redigitação").
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("Ficha Cadastral M1 — casos de uso integrados (F9)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let leitura: { id: string; papel: "LEITURA" };
  let empresaId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-M1]" } },
    });
    const ids = empresas.map((empresa) => empresa.id);
    const solucoes = await prisma.solucao.findMany({
      where: { empresaId: { in: ids } },
      select: { id: true },
    });
    const solucaoIds = solucoes.map((solucao) => solucao.id);
    const ofertas = await prisma.oferta.findMany({
      where: { solucaoId: { in: solucaoIds } },
      select: { id: true },
    });
    await prisma.ofertaPretendida.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.oferta.deleteMany({ where: { id: { in: ofertas.map((o) => o.id) } } });
    await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.solucao.deleteMany({ where: { id: { in: solucaoIds } } });
    await prisma.indicadorDeclarado.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.contratoComercial.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.contatoEmpresa.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidadeId: { in: [...ids, ...solucaoIds] } },
    });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    gestor = { id: usuarios.find((u) => u.papel === "GESTOR")!.id, papel: "GESTOR" };
    leitura = { id: usuarios.find((u) => u.papel === "LEITURA")!.id, papel: "LEITURA" };
    await limpar();
  });

  beforeEach(async () => {
    await limpar();
    const categoria = await prisma.categoria.findFirstOrThrow();
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-M1] Empresa em negociação",
        estagio: "EM_NEGOCIACAO",
        origem: "INDICACAO",
        categorias: { create: [{ categoriaId: categoria.id }] },
      },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("seções A e B gravam no cadastro-mestre, com auditoria", async () => {
    await salvarIdentificacaoM1(gestor, {
      empresaId,
      razaoSocial: "[TESTE-M1] Empresa LTDA",
      nomeFantasia: "[TESTE-M1] Empresa em negociação",
      site: "https://exemplo.com.br",
      descricaoInstitucional: "Conectividade para o campo.",
      diferenciais: "Cobertura nacional\nInstalação em 48h\n\n",
      modeloNegocio: "Assinatura mensal",
      publicoPorte: ["PEQUENO", "MEDIO"],
      publicoNatureza: "AMBAS",
    });

    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.diferenciais).toEqual(["Cobertura nacional", "Instalação em 48h"]);
    expect(empresa.publicoPorte).toEqual(["PEQUENO", "MEDIO"]);
    expect(empresa.publicoNatureza).toBe("AMBAS");

    const evento = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "empresa", entidadeId: empresaId, campo: "modeloNegocio" },
    });
    expect(evento?.valorNovo).toBe("Assinatura mensal");
  });

  it("papel Leitura não preenche a ficha (RBAC)", async () => {
    await expect(
      salvarIdentificacaoM1(leitura, {
        empresaId,
        razaoSocial: null,
        nomeFantasia: "x",
        site: null,
        descricaoInstitucional: null,
        diferenciais: "",
        modeloNegocio: null,
        publicoPorte: [],
        publicoNatureza: null,
      }),
    ).rejects.toThrow(/não tem permissão/);
  });

  it("seção D grava declaração datada e marcada como autodeclarada", async () => {
    const declaracao = await registrarIndicadoresDeclarados(gestor, {
      empresaId,
      dataDeclaracao: new Date("2026-07-20"),
      ticketMedio: 350.5,
      nps: 62,
      churnMensalPct: 2.4,
      numeroClientes: 1200,
      anoFundacao: 2011,
    });

    expect(Number(declaracao.ticketMedio)).toBe(350.5);
    const evento = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "indicador_declarado", entidadeId: declaracao.id, campo: "autodeclarado" },
    });
    expect(evento?.valorNovo).toBe("true");
  });

  it("seção D mantém histórico: nova declaração não sobrescreve a anterior", async () => {
    await registrarIndicadoresDeclarados(gestor, {
      empresaId,
      dataDeclaracao: new Date("2025-07-20"),
      ticketMedio: 300,
      nps: null,
      churnMensalPct: null,
      numeroClientes: null,
      anoFundacao: null,
    });
    await registrarIndicadoresDeclarados(gestor, {
      empresaId,
      dataDeclaracao: new Date("2026-07-20"),
      ticketMedio: 380,
      nps: null,
      churnMensalPct: null,
      numeroClientes: null,
      anoFundacao: null,
    });

    const declaracoes = await prisma.indicadorDeclarado.findMany({
      where: { empresaId },
      orderBy: { dataDeclaracao: "asc" },
    });
    expect(declaracoes).toHaveLength(2);
    expect(Number(declaracoes[0]!.ticketMedio)).toBe(300);
  });

  it("seção D recusa NPS fora da escala", async () => {
    await expect(
      registrarIndicadoresDeclarados(gestor, {
        empresaId,
        dataDeclaracao: new Date("2026-07-20"),
        ticketMedio: null,
        nps: 130,
        churnMensalPct: null,
        numeroClientes: null,
        anoFundacao: null,
      }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it("seção F recusa Recompensa com preço (definição contratual)", async () => {
    await expect(
      adicionarOfertaPretendida(gestor, {
        empresaId,
        natureza: "RECOMPENSA",
        titulo: "Degustação paga",
        descricao: null,
        tipoBeneficioId: null,
        mecanicaId: null,
        precoDe: 100,
        precoPor: 80,
        instrucoesResgate: "Contato comercial",
        vigenciaInicio: null,
        vigenciaFim: null,
      }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
    expect(await prisma.ofertaPretendida.count({ where: { empresaId } })).toBe(0);
  });

  it("seção F exige instruções de resgate pós-voucher", async () => {
    await expect(
      adicionarOfertaPretendida(gestor, {
        empresaId,
        natureza: "BENEFICIO",
        titulo: "Plano com desconto",
        descricao: null,
        tipoBeneficioId: null,
        mecanicaId: null,
        precoDe: 200,
        precoPor: 160,
        instrucoesResgate: null,
        vigenciaInicio: null,
        vigenciaFim: null,
      }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it("promoção converte cada oferta pretendida em rascunho de Solução + Oferta", async () => {
    const tipoBeneficio = await prisma.tipoBeneficio.findFirstOrThrow();
    const mecanica = await prisma.mecanica.findFirstOrThrow();

    await adicionarOfertaPretendida(gestor, {
      empresaId,
      natureza: "BENEFICIO",
      titulo: "[TESTE-M1] Plano rural com 20% off",
      descricao: "Conectividade via satélite",
      tipoBeneficioId: tipoBeneficio.id,
      mecanicaId: mecanica.id,
      precoDe: 200,
      precoPor: 160,
      instrucoesResgate: "Voucher direciona ao administrador comercial do aliado.",
      vigenciaInicio: new Date("2026-08-01"),
      vigenciaFim: null,
    });

    await prisma.$transaction(async (tx) => {
      await promoverDentroDaTransacao(tx, gestor.id, empresaId);
    });

    const pretendida = await prisma.ofertaPretendida.findFirstOrThrow({ where: { empresaId } });
    expect(pretendida.status).toBe("CONVERTIDA");
    expect(pretendida.solucaoId).not.toBeNull();
    expect(pretendida.ofertaId).not.toBeNull();

    const oferta = await prisma.oferta.findUniqueOrThrow({ where: { id: pretendida.ofertaId! } });
    // Rascunho é a palavra-chave: curadoria antes da vitrine.
    expect(oferta.status).toBe("RASCUNHO");
    expect(oferta.titulo).toBe("[TESTE-M1] Plano rural com 20% off");
    expect(oferta.instrucoesResgate).toContain("administrador comercial");
  });

  it("oferta pretendida sem tipo de benefício e mecânica não é convertida — nada é inventado", async () => {
    await adicionarOfertaPretendida(gestor, {
      empresaId,
      natureza: "RECOMPENSA",
      titulo: "[TESTE-M1] Degustação gratuita",
      descricao: null,
      tipoBeneficioId: null,
      mecanicaId: null,
      precoDe: null,
      precoPor: null,
      instrucoesResgate: "Voucher com link de ativação.",
      vigenciaInicio: null,
      vigenciaFim: null,
    });

    await prisma.$transaction(async (tx) => {
      await promoverDentroDaTransacao(tx, gestor.id, empresaId);
    });

    const pretendida = await prisma.ofertaPretendida.findFirstOrThrow({ where: { empresaId } });
    expect(pretendida.status).toBe("RASCUNHO");
    expect(pretendida.ofertaId).toBeNull();
    expect(await prisma.solucao.count({ where: { empresaId } })).toBe(0);
  });

  it("oferta pretendida já convertida não é removida pela ficha", async () => {
    const tipoBeneficio = await prisma.tipoBeneficio.findFirstOrThrow();
    const mecanica = await prisma.mecanica.findFirstOrThrow();
    const pretendida = await adicionarOfertaPretendida(gestor, {
      empresaId,
      natureza: "BENEFICIO",
      titulo: "[TESTE-M1] Oferta convertida",
      descricao: null,
      tipoBeneficioId: tipoBeneficio.id,
      mecanicaId: mecanica.id,
      precoDe: 100,
      precoPor: 90,
      instrucoesResgate: "Link enviado por e-mail.",
      vigenciaInicio: null,
      vigenciaFim: null,
    });

    await prisma.$transaction(async (tx) => {
      await promoverDentroDaTransacao(tx, gestor.id, empresaId);
    });

    await expect(removerOfertaPretendida(gestor, pretendida.id)).rejects.toBeInstanceOf(
      ErroDeValidacao,
    );
  });
});
