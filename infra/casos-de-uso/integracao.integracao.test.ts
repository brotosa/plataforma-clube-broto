import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { criarSolucao } from "./solucoes";
import { criarOferta, publicarOferta } from "./ofertas";
import {
  arquivosDaPublicacao,
  historicoPublicacoes,
  publicarCatalogo,
} from "./publicacao";
import { importarTelemetria } from "./telemetria";
import { agregadoDaOferta, resumoTelemetriaPorOferta } from "@/infra/consultas/telemetria";
import type { PacoteExport } from "@/dominio/integracao/export";

/**
 * Ciclo da F4 em nível de serviço (exige banco com seed): publicar catálogo
 * (Publicacao + diff RN10 + despublicação RN04) → importar telemetria
 * (quarentena + idempotência + hash de CPF) → conferir agregados (RN07).
 *
 * As linhas de telemetria abaixo são SINTÉTICAS (test-only): CPF fictício que
 * reprova o dígito verificador, nunca de pessoa real.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const ID_EXTERNO_OFERTA = "TESTE-F4-OF-1";
const ARQUIVO_TELEMETRIA = "[TESTE-F4] telemetria_uso_20260720.csv";
const CPF_SINTETICO = "111.111.111-11";

describe.skipIf(!temBanco)("integração F4 — publicação e telemetria", () => {
  const prisma = new PrismaClient();
  let analista: { id: string; papel: "ANALISTA" };
  let gestor: { id: string; papel: "GESTOR" };
  let leitura: { id: string; papel: "LEITURA" };
  let empresaId = "";
  let solucaoId = "";
  let ofertaId = "";
  const publicacaoIds: string[] = [];

  function csvTelemetria(): string {
    return [
      "data_hora_evento;cpf_assinante;id_seller;id_oferta;id_voucher;tipo_evento;valor_transacao;canal",
      `2026-07-20T10:00:00;${CPF_SINTETICO};S;${ID_EXTERNO_OFERTA};V-1;emissao_voucher;;app`,
      `2026-07-20T11:00:00;${CPF_SINTETICO};S;${ID_EXTERNO_OFERTA};V-1;resgate_voucher;;app`,
      `2026-07-20T12:00:00;${CPF_SINTETICO};S;${ID_EXTERNO_OFERTA};V-1;compra_confirmada;100.00;web`,
      `2026-07-20T13:00:00;${CPF_SINTETICO};S;${ID_EXTERNO_OFERTA};V-2;reembolso;;web`,
      `2026-07-20T14:00:00;${CPF_SINTETICO};S;${ID_EXTERNO_OFERTA};;emissao_voucher;;web`,
    ].join("\n");
  }

  async function limpar() {
    await prisma.telemetriaEvento.deleteMany({
      where: { arquivoOrigem: { startsWith: "[TESTE-F4]" } },
    });
    await prisma.importacao.deleteMany({ where: { nomeArquivo: { startsWith: "[TESTE-F4]" } } });
    if (publicacaoIds.length) {
      await prisma.publicacao.deleteMany({ where: { id: { in: publicacaoIds } } });
    }
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-F4]" } },
      include: { solucoes: true },
    });
    for (const empresa of empresas) {
      const ids = empresa.solucoes.map((s) => s.id);
      await prisma.telemetriaEvento.deleteMany({ where: { oferta: { solucaoId: { in: ids } } } });
      await prisma.oferta.deleteMany({ where: { solucaoId: { in: ids } } });
      await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: ids } } });
      await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: ids } } });
      await prisma.solucao.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.contratoComercial.deleteMany({ where: { empresaId: empresa.id } });
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
      return usuario.id;
    };
    analista = { id: porPapel("ANALISTA"), papel: "ANALISTA" };
    gestor = { id: porPapel("GESTOR"), papel: "GESTOR" };
    leitura = { id: porPapel("LEITURA"), papel: "LEITURA" };
    await limpar();

    // Aliado ativo com contrato vigente (ambientes AMBOS), solução completa e
    // oferta Benefício publicável — criada direto no estágio final.
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-F4] Aliado Integração",
        estagio: "ALIADA_ATIVA",
        dataEntrada: new Date("2026-01-01T00:00:00Z"),
        logoUrl: "s3://logos/teste-f4.svg",
      },
    });
    empresaId = empresa.id;
    await prisma.contratoComercial.create({
      data: {
        empresaId,
        status: "VIGENTE",
        ambientesPagamento: "AMBOS",
        comissaoPct: 10,
        vigenciaBase: new Date("2026-01-01T00:00:00Z"),
        anexoS3Key: "s3://contratos/teste-f4.pdf",
      },
    });
    const categoria = await prisma.categoria.findFirstOrThrow();
    const cultura = await prisma.cultura.findFirstOrThrow({ where: { slug: "TODAS" } });
    const solucao = await criarSolucao(analista, empresaId, {
      nome: "[TESTE-F4] Solução Integração",
      descricaoCurta: "Descrição do card de teste F4",
      categoriaId: categoria.id,
      coberturaNacional: true,
      culturaIds: [cultura.id],
      imagemCardUrl: "s3://cards/teste-f4.png",
    });
    solucaoId = solucao.id;
    const pct = await prisma.tipoBeneficio.findUniqueOrThrow({ where: { slug: "PCT_DESCONTO" } });
    const checkoutClube = await prisma.mecanica.findUniqueOrThrow({
      where: { slug: "CHECKOUT_CLUBE" },
    });
    const oferta = await criarOferta(analista, solucaoId, {
      titulo: "[TESTE-F4] 15% de desconto",
      natureza: "BENEFICIO",
      tipoBeneficioId: pct.id,
      mecanicaId: checkoutClube.id,
      precoDe: 100,
      precoPor: 85,
      vigenciaInicio: new Date("2026-07-01T00:00:00Z"),
    });
    ofertaId = oferta.id;
    await prisma.oferta.update({
      where: { id: ofertaId },
      data: { idExternoMinutrade: ID_EXTERNO_OFERTA },
    });
    await publicarOferta(analista, ofertaId);
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("leitura não publica nem importa (RBAC)", async () => {
    await expect(publicarCatalogo(leitura)).rejects.toThrow(/não tem permissão/);
    await expect(
      importarTelemetria(leitura, { nomeArquivo: ARQUIVO_TELEMETRIA, conteudo: csvTelemetria() }),
    ).rejects.toThrow(/não tem permissão/);
  });

  it("publicar catálogo inclui a oferta e gera JSON+CSV", async () => {
    const resultado = await publicarCatalogo(gestor);
    publicacaoIds.push(resultado.publicacaoId);
    expect(resultado.diff.adicionadas).toContain(ofertaId);
    expect(resultado.arquivos.map((a) => a.tipoConteudo)).toEqual([
      "application/json",
      "text/csv",
    ]);
    const pacote = JSON.parse(resultado.arquivos[0]?.conteudo ?? "{}") as PacoteExport;
    expect(pacote.itens.some((i) => i.idOferta === ofertaId && i.acao === "PUBLICAR")).toBe(true);

    const oferta = await prisma.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
    expect(oferta.pendenteRepublicacao).toBe(false);
  });

  it("editar campo publicável liga RN10; o próximo export marca 'alterada' e limpa a flag", async () => {
    await prisma.oferta.update({
      where: { id: ofertaId },
      data: { precoPor: 70, pendenteRepublicacao: true },
    });
    const resultado = await publicarCatalogo(gestor);
    publicacaoIds.push(resultado.publicacaoId);
    expect(resultado.diff.alteradas).toContain(ofertaId);
    const oferta = await prisma.oferta.findUniqueOrThrow({ where: { id: ofertaId } });
    expect(oferta.pendenteRepublicacao).toBe(false);
  });

  it("pausar a oferta gera despublicação em cascata no próximo pacote (RN04)", async () => {
    await prisma.oferta.update({ where: { id: ofertaId }, data: { status: "PAUSADA" } });
    const resultado = await publicarCatalogo(gestor);
    publicacaoIds.push(resultado.publicacaoId);
    expect(resultado.diff.removidas).toContain(ofertaId);
    const pacote = JSON.parse(resultado.arquivos[0]?.conteudo ?? "{}") as PacoteExport;
    expect(pacote.itens.some((i) => i.idOferta === ofertaId && i.acao === "DESPUBLICAR")).toBe(true);
    // devolve a oferta ao ar para os testes de telemetria/agregado
    await prisma.oferta.update({ where: { id: ofertaId }, data: { status: "PUBLICADA" } });
  });

  it("histórico de publicações lista os pacotes gerados", async () => {
    const historico = await historicoPublicacoes(50);
    expect(historico.some((p) => publicacaoIds.includes(p.id))).toBe(true);
  });

  it("regenera os arquivos de uma publicação a partir do pacote guardado", async () => {
    const id = publicacaoIds[0] ?? "";
    const arquivos = await arquivosDaPublicacao(id);
    expect(arquivos).toHaveLength(2);
    expect(arquivos[1]?.conteudo.startsWith("acao;id_oferta;")).toBe(true);
  });

  it("importa telemetria: 3 válidas, 2 em quarentena; CPF só como hash (RN07/LGPD)", async () => {
    const relatorio = await importarTelemetria(gestor, {
      nomeArquivo: ARQUIVO_TELEMETRIA,
      conteudo: csvTelemetria(),
    });
    expect(relatorio.importados).toBe(3);
    expect(relatorio.emQuarentena).toBe(2);
    expect(relatorio.semVinculoOferta).toBe(0);

    const eventos = await prisma.telemetriaEvento.findMany({
      where: { arquivoOrigem: ARQUIVO_TELEMETRIA },
    });
    expect(eventos).toHaveLength(3);
    for (const evento of eventos) {
      expect(evento.cpfHash).toMatch(/^[a-f0-9]{64}$/);
      expect(evento.cpfHash).not.toContain("111");
    }
  });

  // A RN07 não é só "não editável": a ficha exige "origem, data e arquivo de
  // importação RASTREÁVEIS". A imutabilidade já tinha teste de arquitetura;
  // a rastreabilidade do fato gravado, não — sem ela um número na tela não
  // teria como ser reconciliado com a linha do arquivo que o gerou.
  it("todo evento gravado é rastreável até o arquivo e a importação (RN07)", async () => {
    const importacao = await prisma.importacao.findFirstOrThrow({
      where: { nomeArquivo: ARQUIVO_TELEMETRIA },
      orderBy: { criadoEm: "desc" },
    });
    const eventos = await prisma.telemetriaEvento.findMany({
      where: { arquivoOrigem: ARQUIVO_TELEMETRIA },
    });
    expect(eventos.length).toBeGreaterThan(0);
    for (const evento of eventos) {
      expect(evento.arquivoOrigem).toBe(ARQUIVO_TELEMETRIA);
      expect(evento.importacaoId).toBe(importacao.id);
      expect(evento.dataEvento).toBeInstanceOf(Date);
      expect(Number.isNaN(evento.dataEvento.getTime())).toBe(false);
      // O identificador externo cru é preservado mesmo com a oferta resolvida
      // — é ele que permite reconciliar com a origem.
      expect(evento.idVoucher).not.toBe("");
    }
  });

  it("agregados por oferta derivam só dos eventos importados (RN07)", async () => {
    const agregado = await agregadoDaOferta(ofertaId);
    expect(agregado).toMatchObject({
      emitidos: 1,
      resgatados: 1,
      comprasConfirmadas: 1,
      receitaConfirmada: 100,
      foraDaPlataforma: false,
    });
    const resumo = await resumoTelemetriaPorOferta([ofertaId]);
    expect(resumo.get(ofertaId)?.resgateRecente).toBe(true);
  });

  it("reimportar o mesmo arquivo é idempotente (nada duplica — RN07)", async () => {
    const relatorio = await importarTelemetria(gestor, {
      nomeArquivo: ARQUIVO_TELEMETRIA,
      conteudo: csvTelemetria(),
    });
    expect(relatorio.importados).toBe(0);
    expect(relatorio.duplicados).toBe(3);
    const total = await prisma.telemetriaEvento.count({
      where: { arquivoOrigem: ARQUIVO_TELEMETRIA },
    });
    expect(total).toBe(3);
  });
});
