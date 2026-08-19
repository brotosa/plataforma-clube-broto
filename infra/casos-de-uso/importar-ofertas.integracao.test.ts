import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { COLUNAS_OFERTA } from "@/dominio/importacao-catalogo/ofertas";
import { ErroDeValidacao } from "./contexto";
import { criarSolucao } from "./solucoes";
import { criarOferta } from "./ofertas";
import {
  conferenciaImportacaoOfertas,
  efetivarImportacaoOfertas,
  importarOfertas,
} from "./importar-ofertas";

/**
 * Importador de ofertas em nível de serviço: cria (rascunho) + audita,
 * bloqueia quando a solução não existe, e enriquece uma oferta existente
 * (via ID Oferta). Reaproveita criarOferta/atualizarOferta.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const PREFIXO = "[TESTE-IMPOF]";
const CNPJ_ATIVO = "11444777000161";

function csv(linhas: string[][]): Buffer {
  const cabecalho = [
    COLUNAS_OFERTA.idOferta,
    COLUNAS_OFERTA.idSolucao,
    COLUNAS_OFERTA.titulo,
    COLUNAS_OFERTA.natureza,
    COLUNAS_OFERTA.tipoBeneficio,
    COLUNAS_OFERTA.mecanica,
    COLUNAS_OFERTA.precoDe,
    COLUNAS_OFERTA.precoPor,
    COLUNAS_OFERTA.cupomCodigoRegras,
    COLUNAS_OFERTA.modalidade,
    COLUNAS_OFERTA.instrucoes,
    COLUNAS_OFERTA.vigenciaInicio,
    COLUNAS_OFERTA.vigenciaFim,
    COLUNAS_OFERTA.limiteResgates,
  ];
  return Buffer.from([cabecalho, ...linhas].map((l) => l.join(";")).join("\n"), "utf8");
}

describe.skipIf(!temBanco)("importar ofertas — casos de uso integrados", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let solucaoId = "";
  let tipoNome = "";
  let tipoId = "";
  let mecanicaNome = "";
  let mecanicaId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const empresaIds = empresas.map((e) => e.id);
    const solucoes = await prisma.solucao.findMany({
      where: { empresaId: { in: empresaIds } },
      select: { id: true },
    });
    const solucaoIds = solucoes.map((s) => s.id);
    const ofertas = await prisma.oferta.findMany({
      where: { solucaoId: { in: solucaoIds } },
      select: { id: true },
    });
    const ofertaIds = ofertas.map((o) => o.id);
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: "oferta", entidadeId: { in: ofertaIds } },
    });
    await prisma.oferta.deleteMany({ where: { id: { in: ofertaIds } } });
    await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: "solucao", entidadeId: { in: solucaoIds } },
    });
    await prisma.solucao.deleteMany({ where: { id: { in: solucaoIds } } });

    const imps = await prisma.importacao.findMany({
      where: { tipo: "IMPORTA_OFERTAS", nomeArquivo: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const impIds = imps.map((i) => i.id);
    await prisma.stagingOfertaImportada.deleteMany({ where: { importacaoId: { in: impIds } } });
    await prisma.importacao.deleteMany({ where: { id: { in: impIds } } });

    await prisma.empresa.deleteMany({ where: { id: { in: empresaIds } } });
  }

  beforeAll(async () => {
    const u = await prisma.usuario.findFirst({ where: { papel: "GESTOR" } });
    if (!u) throw new Error("Seed ausente: GESTOR");
    gestor = { id: u.id, papel: "GESTOR" };

    const tipo = await prisma.tipoBeneficio.findFirst({ where: { slug: { not: "GRATUIDADE" } } });
    const mecanica = await prisma.mecanica.findFirst();
    if (!tipo || !mecanica) throw new Error("Seed ausente: tipoBeneficio/mecanica");
    tipoNome = tipo.nome;
    tipoId = tipo.id;
    mecanicaNome = mecanica.nome;
    mecanicaId = mecanica.id;

    await limpar();
    const empresa = await prisma.empresa.create({
      data: { nomeFantasia: `${PREFIXO} Aliada`, estagio: "ALIADA_ATIVA", cnpj: CNPJ_ATIVO },
    });
    const solucao = await criarSolucao(gestor, empresa.id, { nome: `${PREFIXO} Solução` });
    solucaoId = solucao.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  function linhaValida(idOferta: string, titulo: string): string[] {
    return [
      idOferta,
      solucaoId,
      titulo,
      "Benefício",
      tipoNome,
      mecanicaNome,
      "11,90",
      "10,11",
      "",
      "Única",
      "",
      "05/08/2026",
      "",
      "9999",
    ];
  }

  it("cria uma oferta como rascunho e grava auditoria", async () => {
    const r = await importarOfertas(gestor, {
      nomeArquivo: `${PREFIXO}.csv`,
      conteudo: csv([linhaValida("", `${PREFIXO} Oferta Nova`)]),
    });
    expect(r.prontas).toBe(1);
    const conf = await conferenciaImportacaoOfertas(r.importacaoId);
    expect(conf?.linhas[0]?.acao).toBe("CRIAR");

    const efet = await efetivarImportacaoOfertas(gestor, r.importacaoId);
    expect(efet.criadas).toBe(1);

    const criada = await prisma.oferta.findFirst({
      where: { solucaoId, titulo: `${PREFIXO} Oferta Nova` },
    });
    expect(criada?.status).toBe("RASCUNHO");
    expect(criada?.tipoBeneficioId).toBe(tipoId);
    expect(criada?.mecanicaId).toBe(mecanicaId);
    const auditoria = await prisma.auditoriaEvento.count({
      where: { entidade: "oferta", entidadeId: criada!.id },
    });
    expect(auditoria).toBeGreaterThan(0);
  });

  it("bloqueia quando a solução não existe", async () => {
    const linha = linhaValida("", `${PREFIXO} Oferta Órfã`);
    linha[1] = "sol-inexistente";
    const r = await importarOfertas(gestor, { nomeArquivo: `${PREFIXO}.csv`, conteudo: csv([linha]) });
    expect(r.comPendencia).toBe(1);
    await expect(efetivarImportacaoOfertas(gestor, r.importacaoId)).rejects.toBeInstanceOf(
      ErroDeValidacao,
    );
  });

  it("enriquece uma oferta existente pelo ID Oferta", async () => {
    const existente = await criarOferta(gestor, solucaoId, {
      titulo: `${PREFIXO} Oferta Existente`,
      natureza: "BENEFICIO",
      tipoBeneficioId: tipoId,
      mecanicaId,
      vigenciaInicio: new Date(Date.UTC(2026, 7, 5)),
    });
    const r = await importarOfertas(gestor, {
      nomeArquivo: `${PREFIXO}.csv`,
      conteudo: csv([linhaValida(existente.id, `${PREFIXO} Oferta Renomeada`)]),
    });
    const conf = await conferenciaImportacaoOfertas(r.importacaoId);
    expect(conf?.linhas[0]?.acao).toBe("ENRIQUECER");

    const efet = await efetivarImportacaoOfertas(gestor, r.importacaoId);
    expect(efet.enriquecidas).toBe(1);
    const atual = await prisma.oferta.findUnique({ where: { id: existente.id } });
    expect(atual?.titulo).toBe(`${PREFIXO} Oferta Renomeada`);
  });
});
