import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { gerarAssinantesSinteticos } from "@/infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "@/infra/assinantes/protecao-cpf";
import { criarArmazenadorPrisma } from "@/infra/exportacoes/armazenador";
import { painelDaCampanha } from "@/infra/consultas/campanhas";
import { ErroDeValidacao, type Ator } from "./contexto";
import {
  alternarCestaDaCampanha,
  ativarCampanha,
  atualizarCampanha,
  criarCampanha,
  definirMeta,
  encerrarCampanha,
  gerarNovaVersaoDoKit,
  previaDoEncerramento,
  salvarPeca,
} from "./campanhas";
import { alternarOfertaDaCesta, criarCesta } from "./cestas";
import { criarOferta } from "./ofertas";

/**
 * Integração da F12 (executa apenas com banco disponível): modelar →
 * simular público → conteúdo → peças → metas → ativar (RN38, kit v1) →
 * medir nos dois níveis (RN43/RN44) → nova versão do kit (RN45) →
 * encerrar com a RN40. Inclui a REGRESSÃO da T5: a criação de oferta
 * sem destinação continua idêntica à da Onda 1.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

process.env.CPF_HASH_KEY ??= "chave-de-teste-integracao-hmac";
process.env.APP_ENCRYPTION_KEY ??= "chave-de-teste-integracao-cifra";

const prisma = new PrismaClient();
const SINTETICOS = gerarAssinantesSinteticos(4, 12);

let gestor: Ator;
let leitura: Ator;
let solucaoId = "";
let ofertaPublicadaId = "";
let ofertaExclusivaId = "";
let campanhaId = "";
let cestaId = "";

async function upsertUsuario(email: string, papel: "GESTOR" | "LEITURA") {
  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: { nome: `Perfil ${papel} (teste F12)`, email, senhaHash: "sem-login", papel },
  });
  return { id: usuario.id, papel: usuario.papel };
}

async function limparModuloCampanhas() {
  await prisma.kitCampanha.deleteMany({});
  await prisma.metaCampanha.deleteMany({});
  await prisma.pecaCampanha.deleteMany({});
  await prisma.campanhaOferta.deleteMany({});
  await prisma.campanhaCesta.deleteMany({});
  await prisma.cestaOferta.deleteMany({});
  await prisma.oferta.updateMany({
    data: { destinacao: "VITRINE", destinacaoCampanhaId: null, destinacaoCestaId: null },
  });
  await prisma.campanha.deleteMany({});
  await prisma.cesta.deleteMany({});
  await prisma.telemetriaEvento.deleteMany({ where: { arquivoOrigem: "teste-f12" } });
  await prisma.oferta.deleteMany({ where: { titulo: { startsWith: "[TESTE-F12]" } } });
  const solucoesDoTeste = await prisma.solucao.findMany({
    where: { nome: { startsWith: "[TESTE-F12]" } },
    select: { id: true },
  });
  const idsSolucoes = solucoesDoTeste.map(({ id }) => id);
  await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: idsSolucoes } } });
  await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: idsSolucoes } } });
  await prisma.solucao.deleteMany({ where: { id: { in: idsSolucoes } } });
  await prisma.empresa.deleteMany({ where: { nomeFantasia: { startsWith: "[TESTE-F12]" } } });
  await prisma.assinante.deleteMany({ where: { nome: { startsWith: "[TESTE-F12]" } } });
  await prisma.exportacaoLista.deleteMany({ where: { finalidade: { contains: "[TESTE-F12]" } } });
  await prisma.segmento.deleteMany({ where: { nome: { startsWith: "[TESTE-F12]" } } });
  await prisma.auditoriaEvento.deleteMany({
    where: { entidade: { in: ["campanha", "cesta", "kit_campanha", "peca_campanha", "meta_campanha"] } },
  });
}

describe.skipIf(!temBanco)("F12 — campanhas e cestas (integração)", () => {
  beforeAll(async () => {
    gestor = await upsertUsuario("gestor.campanhas@dev.clubebroto.local", "GESTOR");
    leitura = await upsertUsuario("leitura.campanhas@dev.clubebroto.local", "LEITURA");
    await limparModuloCampanhas();

    // Base mínima: aliada ativa com solução e duas ofertas publicadas.
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-F12] Aliada da campanha",
        estagio: "ALIADA_ATIVA",
        dataEntrada: new Date("2026-01-10T00:00:00Z"),
      },
    });
    const cultura = await prisma.cultura.findFirstOrThrow({ where: { nome: "Café" } });
    const uf = await prisma.uf.findFirstOrThrow({ where: { sigla: "MG" } });
    const solucao = await prisma.solucao.create({
      data: {
        empresaId: empresa.id,
        nome: "[TESTE-F12] Consultoria agronômica",
        descricaoCurta: "Acompanhamento técnico da lavoura, com relatório mensal.",
        coberturaNacional: false,
        culturas: { create: [{ culturaId: cultura.id }] },
        ufs: { create: [{ ufId: uf.id }] },
      },
    });
    solucaoId = solucao.id;

    const pctDesconto = await prisma.tipoBeneficio.findUniqueOrThrow({
      where: { slug: "PCT_DESCONTO" },
    });
    const checkoutClube = await prisma.mecanica.findUniqueOrThrow({
      where: { slug: "CHECKOUT_CLUBE" },
    });
    const publicada = await prisma.oferta.create({
      data: {
        solucaoId,
        titulo: "[TESTE-F12] 20% na consultoria",
        natureza: "BENEFICIO",
        tipoBeneficioId: pctDesconto.id,
        mecanicaId: checkoutClube.id,
        precoDe: 100,
        precoPor: 80,
        vigenciaInicio: new Date("2026-08-01T00:00:00Z"),
        status: "PUBLICADA",
      },
    });
    ofertaPublicadaId = publicada.id;

    // Assinantes sintéticos para o público da campanha.
    for (const [indice, sintetico] of SINTETICOS.entries()) {
      await prisma.assinante.create({
        data: {
          nome: `[TESTE-F12] ${sintetico.nome}`,
          cpfHash: hashCpf(sintetico.cpf),
          cpfCifrado: cifrarCpf(sintetico.cpf),
          uf: "MG",
          municipio: "Uberaba",
          preferencia: indice % 2 === 0 ? "AGRICULTURA" : "PECUARIA",
          statusBase: "ATIVO",
        },
      });
    }
  });

  afterAll(async () => {
    await limparModuloCampanhas();
    await prisma.$disconnect();
  });

  it("papel Leitura não modela campanha (RBAC ficha §2)", async () => {
    await expect(criarCampanha(leitura, { nome: "Proibida" })).rejects.toBeInstanceOf(
      ErroDeAutorizacao,
    );
  });

  it("campanha nasce em rascunho, com auditoria de criação", async () => {
    const campanha = await criarCampanha(gestor, {
      nome: "[TESTE-F12] Safra Centro-Oeste",
      objetivo: "Ativar assinantes de café",
    });
    campanhaId = campanha.id;
    expect(campanha.estado).toBe("RASCUNHO");

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "campanha", entidadeId: campanhaId },
    });
    expect(eventos.length).toBeGreaterThan(0);
  });

  it("ativar sem público, conteúdo e vigência é recusado com as três portas (RN38)", async () => {
    await expect(ativarCampanha(gestor, campanhaId)).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it("público por regras próprias conta os assinantes sintéticos (simulador de alcance)", async () => {
    await atualizarCampanha(gestor, campanhaId, {
      origemPublico: "REGRAS_PROPRIAS",
      regrasPublico: [{ campo: "uf", operador: "e", valor: "MG" }],
      vigenciaInicio: "2026-08-01",
      vigenciaFim: "2026-08-31",
      instrucoes: "Disparar na primeira semana.",
    });
    const campanha = await prisma.campanha.findUniqueOrThrow({ where: { id: campanhaId } });
    expect(campanha.vigenciaInicio).not.toBeNull();
  });

  it("cesta com oferta não publicada não entra em campanha (RN41)", async () => {
    const cesta = await criarCesta(gestor, { nome: "[TESTE-F12] Cesta Café" });
    cestaId = cesta.id;
    const rascunho = await prisma.oferta.create({
      data: {
        solucaoId,
        titulo: "[TESTE-F12] Oferta ainda em rascunho",
        natureza: "RECOMPENSA",
        tipoBeneficioId: (
          await prisma.tipoBeneficio.findUniqueOrThrow({ where: { slug: "GRATUIDADE" } })
        ).id,
        mecanicaId: (
          await prisma.mecanica.findUniqueOrThrow({ where: { slug: "RECOMPENSA_GRATUITA" } })
        ).id,
        vigenciaInicio: new Date("2026-08-01T00:00:00Z"),
        status: "RASCUNHO",
      },
    });
    await alternarOfertaDaCesta(gestor, cestaId, rascunho.id, true);

    await expect(alternarCestaDaCampanha(gestor, campanhaId, cestaId, true)).rejects.toBeInstanceOf(
      ErroDeValidacao,
    );

    // Retirando a pendência, a cesta entra.
    await alternarOfertaDaCesta(gestor, cestaId, rascunho.id, false);
    await alternarOfertaDaCesta(gestor, cestaId, ofertaPublicadaId, true);
    await alternarCestaDaCampanha(gestor, campanhaId, cestaId, true);
    const vinculo = await prisma.campanhaCesta.findFirst({ where: { campanhaId, cestaId } });
    expect(vinculo).not.toBeNull();
  });

  it("peças e metas entram na modelagem", async () => {
    const formato = await prisma.formatoPeca.findUniqueOrThrow({ where: { slug: "EMAIL" } });
    await salvarPeca(gestor, campanhaId, {
      formatoSlug: formato.slug,
      titulo: "Sua safra merece o Clube Broto",
      texto: "Ofertas selecionadas para quem planta e cria.",
    });
    await definirMeta(gestor, campanhaId, { tipo: "RESGATES", alvo: 2 });
    await definirMeta(gestor, campanhaId, { tipo: "CONVERSAO_PCT", alvo: 10 });

    const campanha = await prisma.campanha.findUniqueOrThrow({
      where: { id: campanhaId },
      include: { pecas: true, metas: true },
    });
    expect(campanha.pecas).toHaveLength(1);
    expect(campanha.metas).toHaveLength(2);
  });

  it("ativar congela o público, herda a auditoria da RN34 e gera o kit v1 (RN38)", async () => {
    const resultado = await ativarCampanha(gestor, campanhaId);
    expect(resultado.resultado).toBe("ATIVA");

    const campanha = await prisma.campanha.findUniqueOrThrow({
      where: { id: campanhaId },
      include: { publicoSnapshot: true, kits: true },
    });
    expect(campanha.estado).toBe("ATIVA");
    expect(campanha.publicoSnapshot?.contagem).toBe(SINTETICOS.length);
    expect(campanha.publicoSnapshot?.finalidade).toContain("[TESTE-F12] Safra Centro-Oeste");
    expect(campanha.kits).toHaveLength(1);
    expect(campanha.kits[0]!.versao).toBe(1);
    expect(campanha.kits[0]!.diffTexto).toBeNull();

    // O pacote existe no armazenamento e é um zip legível.
    const pacote = await criarArmazenadorPrisma().ler(campanha.kits[0]!.arquivoChave);
    expect(pacote.subarray(0, 2).toString("latin1")).toBe("PK");

    const auditoriaExportacao = await prisma.auditoriaEvento.findMany({
      where: { entidade: "exportacao_lista" },
    });
    expect(auditoriaExportacao.length).toBeGreaterThan(0);
  });

  it("campanha ativa não volta à modelagem — ajuste gera nova versão (RN45)", async () => {
    await expect(
      atualizarCampanha(gestor, campanhaId, { nome: "Nome novo" }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);

    await gerarNovaVersaoDoKit(gestor, campanhaId);
    const kits = await prisma.kitCampanha.findMany({
      where: { campanhaId },
      orderBy: { versao: "asc" },
    });
    expect(kits).toHaveLength(2);
    expect(kits[1]!.versao).toBe(2);
    expect(kits[1]!.diffTexto).not.toBeNull();
    // O kit v1 permanece intacto: mesmo hash e mesmo arquivo.
    expect(kits[0]!.hashArquivo).not.toBe("");
  });

  it("painel mede por oferta e responde indisponível na conversão (RN43/RN44)", async () => {
    await prisma.telemetriaEvento.createMany({
      data: [
        {
          idVoucher: "TESTE-F12-1",
          tipo: "RESGATE_VOUCHER",
          ofertaId: ofertaPublicadaId,
          dataEvento: new Date("2026-08-10T12:00:00Z"),
          arquivoOrigem: "teste-f12",
        },
        {
          idVoucher: "TESTE-F12-2",
          tipo: "RESGATE_VOUCHER",
          ofertaId: ofertaPublicadaId,
          dataEvento: new Date("2026-08-12T12:00:00Z"),
          arquivoOrigem: "teste-f12",
        },
      ],
    });

    const painel = await painelDaCampanha(campanhaId);
    const resgates = painel.realizados.find((meta) => meta.tipo === "RESGATES")!;
    expect(resgates.valor).toBe(2);
    expect(resgates.nivel).toBe("POR_OFERTA");
    expect(resgates.atingida).toBe(true);

    const conversao = painel.realizados.find((meta) => meta.tipo === "CONVERSAO_PCT")!;
    expect(conversao.disponivel).toBe(false);
    expect(conversao.valor).toBeNull();
    expect(conversao.nota).toContain("aguarda telemetria por CPF");
  });

  it("com telemetria por CPF, a conversão passa a existir no nível público (RN43b)", async () => {
    await prisma.telemetriaEvento.create({
      data: {
        idVoucher: "TESTE-F12-3",
        tipo: "RESGATE_VOUCHER",
        ofertaId: ofertaPublicadaId,
        cpfHash: hashCpf(SINTETICOS[0]!.cpf),
        dataEvento: new Date("2026-08-14T12:00:00Z"),
        arquivoOrigem: "teste-f12",
      },
    });
    const painel = await painelDaCampanha(campanhaId);
    const conversao = painel.realizados.find((meta) => meta.tipo === "CONVERSAO_PCT")!;
    expect(conversao.disponivel).toBe(true);
    expect(conversao.nivel).toBe("POR_PUBLICO");
    expect(conversao.valor).toBe(25);
  });

  it("encerrar avisa e pausa a oferta exclusiva; a de vitrine só se desvincula (RN40)", async () => {
    const exclusiva = await prisma.oferta.create({
      data: {
        solucaoId,
        titulo: "[TESTE-F12] Exclusiva da campanha",
        natureza: "BENEFICIO",
        tipoBeneficioId: (
          await prisma.tipoBeneficio.findUniqueOrThrow({ where: { slug: "PCT_DESCONTO" } })
        ).id,
        mecanicaId: (
          await prisma.mecanica.findUniqueOrThrow({ where: { slug: "CHECKOUT_CLUBE" } })
        ).id,
        precoDe: 200,
        precoPor: 150,
        vigenciaInicio: new Date("2026-08-01T00:00:00Z"),
        status: "PUBLICADA",
        destinacao: "CAMPANHA",
        destinacaoCampanhaId: campanhaId,
      },
    });
    ofertaExclusivaId = exclusiva.id;

    const previa = await previaDoEncerramento(campanhaId);
    expect(previa.aviso).toContain("[TESTE-F12] Exclusiva da campanha");
    expect(previa.efeito.pausar.map((oferta) => oferta.id)).toContain(ofertaExclusivaId);
    expect(previa.efeito.desvincular.map((oferta) => oferta.id)).toContain(ofertaPublicadaId);

    const resultado = await encerrarCampanha(gestor, campanhaId);
    expect(resultado.pausadas).toContain("[TESTE-F12] Exclusiva da campanha");

    const exclusivaDepois = await prisma.oferta.findUniqueOrThrow({
      where: { id: ofertaExclusivaId },
    });
    expect(exclusivaDepois.status).toBe("PAUSADA");
    const daVitrine = await prisma.oferta.findUniqueOrThrow({ where: { id: ofertaPublicadaId } });
    expect(daVitrine.status).toBe("PUBLICADA");
  });

  it("REGRESSÃO T5 — oferta sem destinação continua nascendo de vitrine, como na Onda 1", async () => {
    const oferta = await criarOferta(gestor, solucaoId, {
      titulo: "[TESTE-F12] Oferta do formulário antigo",
      natureza: "BENEFICIO",
      tipoBeneficioId: (
        await prisma.tipoBeneficio.findUniqueOrThrow({ where: { slug: "PCT_DESCONTO" } })
      ).id,
      mecanicaId: (
        await prisma.mecanica.findUniqueOrThrow({ where: { slug: "CHECKOUT_CLUBE" } })
      ).id,
      precoDe: 100,
      precoPor: 90,
      modalidadePagamento: "RECORRENTE",
      vigenciaInicio: new Date("2026-09-01T00:00:00Z"),
    });
    expect(oferta.status).toBe("RASCUNHO");
    expect(oferta.destinacao).toBe("VITRINE");
    expect(oferta.destinacaoCampanhaId).toBeNull();
    expect(oferta.destinacaoCestaId).toBeNull();
  });

  it("REGRESSÃO T5 — oferta criada para uma cesta grava o vínculo sem mexer na publicação", async () => {
    const oferta = await criarOferta(gestor, solucaoId, {
      titulo: "[TESTE-F12] Oferta destinada à cesta",
      natureza: "BENEFICIO",
      tipoBeneficioId: (
        await prisma.tipoBeneficio.findUniqueOrThrow({ where: { slug: "PCT_DESCONTO" } })
      ).id,
      mecanicaId: (
        await prisma.mecanica.findUniqueOrThrow({ where: { slug: "CHECKOUT_CLUBE" } })
      ).id,
      precoDe: 100,
      precoPor: 70,
      vigenciaInicio: new Date("2026-09-01T00:00:00Z"),
      destinacao: "CESTA",
      destinacaoCestaId: cestaId,
    });
    expect(oferta.destinacao).toBe("CESTA");
    expect(oferta.destinacaoCestaId).toBe(cestaId);
    // Publicação inalterada: nasce rascunho e não fica pendente de republicação.
    expect(oferta.status).toBe("RASCUNHO");
    expect(oferta.pendenteRepublicacao).toBe(false);
  });
});
