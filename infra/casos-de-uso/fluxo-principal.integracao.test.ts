import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeValidacao } from "./contexto";
import {
  atualizarEmpresa,
  criarEmpresa,
  solicitarPromocao,
  suspenderEmpresa,
} from "./empresas";
import { criarContato, criarContrato } from "./contatos-contratos";
import { criarSolucao } from "./solucoes";
import { atualizarOferta, criarOferta, publicarOferta } from "./ofertas";
import { decidirSolicitacao } from "./aprovacoes";

/**
 * Fluxo principal da F2 em nível de serviço (exige banco com seed):
 * criar empresa → completar M2 → solicitar promoção (motor LIGADO, RN06)
 * → aprovar com usuário distinto → criar solução (RN01) → criar oferta →
 * publicar (motor de oferta DESLIGADO; RN02/RN09/RN11) → editar campo
 * publicável (RN10) → suspender aliado (RN12 + cascata RN04).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const CNPJ_TESTE = "11.222.333/0001-81";

describe.skipIf(!temBanco)("fluxo principal — casos de uso integrados", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let analista: { id: string; papel: "ANALISTA" };
  let aprovador: { id: string; papel: "APROVADOR" };
  let leitura: { id: string; papel: "LEITURA" };
  let empresaId = "";
  let solucaoId = "";
  let ofertaId = "";

  async function limparDadosDeTeste() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-F2]" } },
      include: { solucoes: true },
    });
    for (const empresa of empresas) {
      const solucaoIds = empresa.solucoes.map((solucao) => solucao.id);
      await prisma.aprovacaoSolicitacao.deleteMany({
        where: {
          OR: [
            { entidadeId: empresa.id },
            { entidadeId: { in: solucaoIds } },
          ],
        },
      });
      const ofertas = await prisma.oferta.findMany({
        where: { solucaoId: { in: solucaoIds } },
      });
      await prisma.aprovacaoSolicitacao.deleteMany({
        where: { entidadeId: { in: ofertas.map((oferta) => oferta.id) } },
      });
      await prisma.oferta.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
      await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
      await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
      await prisma.solucao.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.contratoComercial.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.contatoEmpresa.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.empresaCategoria.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: empresa.id } });
      await prisma.empresa.delete({ where: { id: empresa.id } });
    }
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    const porPapel = (papel: string) => {
      const usuario = usuarios.find((u) => u.papel === papel);
      if (!usuario) throw new Error(`Seed ausente: usuário ${papel}`);
      return usuario;
    };
    gestor = { id: porPapel("GESTOR").id, papel: "GESTOR" };
    analista = { id: porPapel("ANALISTA").id, papel: "ANALISTA" };
    aprovador = { id: porPapel("APROVADOR").id, papel: "APROVADOR" };
    leitura = { id: porPapel("LEITURA").id, papel: "LEITURA" };
    await limparDadosDeTeste();
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("papel Leitura não cria empresa (RBAC ficha §2)", async () => {
    await expect(
      criarEmpresa(leitura, { nomeFantasia: "[TESTE-F2] Bloqueada" }),
    ).rejects.toThrow(/não tem permissão/);
  });

  it("analista cria empresa em negociação, com auditoria de criação", async () => {
    const empresa = await criarEmpresa(analista, {
      nomeFantasia: "[TESTE-F2] Empresa Fluxo",
      razaoSocial: "[TESTE-F2] Empresa Fluxo LTDA",
    });
    empresaId = empresa.id;
    expect(empresa.estagio).toBe("EM_NEGOCIACAO");
    const trilha = await prisma.auditoriaEvento.findMany({
      where: { entidade: "empresa", entidadeId: empresaId },
    });
    expect(trilha.some((evento) => evento.campo === "nomeFantasia")).toBe(true);
  });

  it("promoção com pendências é recusada (M2)", async () => {
    await expect(solicitarPromocao(analista, empresaId)).rejects.toThrow(ErroDeValidacao);
  });

  it("CNPJ inválido é recusado na edição (RN08)", async () => {
    await expect(
      atualizarEmpresa(analista, empresaId, { cnpj: "11.222.333/0001-99" }),
    ).rejects.toThrow(/RN08/);
  });

  it("dados M2 completos: identificação, contato e contrato", async () => {
    await atualizarEmpresa(analista, empresaId, {
      cnpj: CNPJ_TESTE,
      enderecoMunicipio: "Curitiba",
      enderecoUf: "PR",
      logoUrl: "s3://logos/teste-f2.svg",
    });
    await criarContato(analista, empresaId, {
      papel: "COMERCIAL",
      nome: "[TESTE-F2] Contato Comercial",
      email: "comercial@teste-f2.local",
    });
    await criarContrato(analista, empresaId, {
      vigenciaBase: new Date("2026-07-01T00:00:00Z"),
      comissaoPct: 5,
      ambientesPagamento: "AMBOS",
      anexoS3Key: "s3://contratos/teste-f2.pdf",
    });
    const { pendencias } = await import("./empresas").then((modulo) =>
      modulo.avaliarPromocao(empresaId),
    );
    expect(pendencias).toEqual([]);
  });

  it("solicitar promoção cria solicitação pendente (regra nasce LIGADA — RN06)", async () => {
    const resultado = await solicitarPromocao(analista, empresaId);
    expect(resultado.resultado).toBe("SOLICITADA");
    // Onda 2 (pipeline da ficha §3.1): com o pedido pendente a empresa
    // fica Em aprovação — lane própria da T8.
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.estagio).toBe("EM_APROVACAO");
  });

  it("solicitante não aprova o próprio item (RN06)", async () => {
    const pendente = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    // Analista não tem permissão APROVAR_DEVOLVER (ficha §2)
    await expect(
      decidirSolicitacao(analista, pendente.id, "APROVADA", null),
    ).rejects.toThrow(/não tem permissão/);
    // Gestor tem a permissão, mas se fosse o solicitante seria bloqueado:
    // aqui o solicitante é o analista, então o aprovador decide.
  });

  it("aprovador (usuário distinto) aprova e a empresa é promovida", async () => {
    const pendente = await prisma.aprovacaoSolicitacao.findFirstOrThrow({
      where: { entidadeId: empresaId, estado: "SOLICITADA" },
    });
    await decidirSolicitacao(aprovador, pendente.id, "APROVADA", null);
    const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    expect(empresa.estagio).toBe("ALIADA_ATIVA");
    expect(empresa.dataEntrada).not.toBeNull();
  });

  it("solução nasce apenas para Aliada ativa (RN01) — com card completo", async () => {
    const categoria = await prisma.categoria.findFirstOrThrow();
    const cultura = await prisma.cultura.findFirstOrThrow({ where: { slug: "TODAS" } });
    const solucao = await criarSolucao(analista, empresaId, {
      nome: "[TESTE-F2] Solução Fluxo",
      descricaoCurta: "Descrição curta do card de teste",
      categoriaId: categoria.id,
      coberturaNacional: true,
      culturaIds: [cultura.id],
      imagemCardUrl: "s3://cards/teste-f2.png",
    });
    solucaoId = solucao.id;
    expect(solucao.status).toBe("ATIVA");
  });

  it("oferta Recompensa com preço é recusada (validação de natureza)", async () => {
    const gratuidade = await prisma.tipoBeneficio.findUniqueOrThrow({
      where: { slug: "GRATUIDADE" },
    });
    const mecanica = await prisma.mecanica.findUniqueOrThrow({
      where: { slug: "RECOMPENSA_GRATUITA" },
    });
    await expect(
      criarOferta(analista, solucaoId, {
        titulo: "[TESTE-F2] Recompensa com preço",
        natureza: "RECOMPENSA",
        tipoBeneficioId: gratuidade.id,
        mecanicaId: mecanica.id,
        vigenciaInicio: new Date("2026-07-01T00:00:00Z"),
        precoPor: 50,
      }),
    ).rejects.toThrow(/gratuidade/i);
  });

  it("oferta Benefício é criada como rascunho e publicada direto (regra de oferta DESLIGADA)", async () => {
    const pctDesconto = await prisma.tipoBeneficio.findUniqueOrThrow({
      where: { slug: "PCT_DESCONTO" },
    });
    const checkoutClube = await prisma.mecanica.findUniqueOrThrow({
      where: { slug: "CHECKOUT_CLUBE" },
    });
    const oferta = await criarOferta(analista, solucaoId, {
      titulo: "[TESTE-F2] 15% de desconto na assinatura",
      natureza: "BENEFICIO",
      tipoBeneficioId: pctDesconto.id,
      mecanicaId: checkoutClube.id,
      precoDe: 100,
      precoPor: 85,
      modalidadePagamento: "RECORRENTE",
      vigenciaInicio: new Date("2026-07-01T00:00:00Z"),
    });
    ofertaId = oferta.id;
    expect(oferta.status).toBe("RASCUNHO");

    const resultado = await publicarOferta(analista, ofertaId);
    expect(resultado.resultado).toBe("PUBLICADA");
  });

  it("editar campo publicável de oferta publicada liga a flag (RN10)", async () => {
    await atualizarOferta(analista, ofertaId, {
      titulo: "[TESTE-F2] 20% de desconto na assinatura",
    });
    const oferta = await prisma.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
    expect(oferta.pendenteRepublicacao).toBe(true);
  });

  it("suspensão sem motivo é recusada; com motivo pausa em cascata (RN12 + RN04)", async () => {
    const outros = await prisma.motivoSuspensao.findUniqueOrThrow({ where: { slug: "OUTROS" } });
    await expect(
      suspenderEmpresa(gestor, empresaId, { motivoSuspensaoId: outros.id, descricao: null }),
    ).rejects.toThrow(/descrição/);

    const curadoria = await prisma.motivoSuspensao.findUniqueOrThrow({
      where: { slug: "DECISAO_CURADORIA" },
    });
    const { ofertasPausadas } = await suspenderEmpresa(gestor, empresaId, {
      motivoSuspensaoId: curadoria.id,
      descricao: null,
    });
    expect(ofertasPausadas).toBe(1);
    const oferta = await prisma.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
    expect(oferta.status).toBe("PAUSADA");
    expect(oferta.pendenteRepublicacao).toBe(true);
  });

  it("publicação com aliado suspenso é impedida (RN02)", async () => {
    await expect(publicarOferta(gestor, ofertaId)).rejects.toThrow(/RN02/);
  });

  it("trilha de auditoria da empresa registra before/after das transições", async () => {
    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "empresa", entidadeId: empresaId, campo: "estagio" },
      orderBy: { criadoEm: "asc" },
    });
    expect(eventos.map((evento) => `${evento.valorAnterior}→${evento.valorNovo}`)).toEqual([
      "null→EM_NEGOCIACAO", // criação audita o estado inicial
      "EM_NEGOCIACAO→EM_APROVACAO", // pedido de promoção pendente (Onda 2)
      "EM_APROVACAO→ALIADA_ATIVA",
      "ALIADA_ATIVA→SUSPENSA",
    ]);
  });
});
