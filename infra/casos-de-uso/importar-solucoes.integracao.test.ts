import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { COLUNAS_SOLUCAO } from "@/dominio/importacao-catalogo/solucoes";
import { ErroDeValidacao } from "./contexto";
import { criarSolucao } from "./solucoes";
import {
  conferenciaImportacaoSolucoes,
  efetivarImportacaoSolucoes,
  importarSolucoes,
} from "./importar-solucoes";

/**
 * Importador de soluções em nível de serviço: criar, enriquecer, bloquear
 * por pendência (categoria fora da lista) e recusar aliado não ativo (RN01).
 * Reaproveita criarSolucao/atualizarSolucao, então a auditoria é gravada.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const PREFIXO = "[TESTE-IMPSOL]";
const CNPJ_ATIVO = "11444777000161";
const CNPJ_SUSPENSO = "11222333000181";

function csv(linhas: string[][]): Buffer {
  const cabecalho = [
    COLUNAS_SOLUCAO.cnpj,
    COLUNAS_SOLUCAO.nome,
    COLUNAS_SOLUCAO.descricaoCurta,
    COLUNAS_SOLUCAO.descricaoCompleta,
    COLUNAS_SOLUCAO.categoria,
    COLUNAS_SOLUCAO.linkExterno,
    COLUNAS_SOLUCAO.culturas,
    COLUNAS_SOLUCAO.cobertura,
  ];
  const corpo = [cabecalho, ...linhas].map((l) => l.join(";")).join("\n");
  return Buffer.from(corpo, "utf8");
}

describe.skipIf(!temBanco)("importar soluções — casos de uso integrados", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let empresaAtivaId = "";
  let categoriaNome = "";
  let categoriaId = "";
  let culturaNome = "";

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
    await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: "solucao", entidadeId: { in: solucaoIds } },
    });
    await prisma.solucao.deleteMany({ where: { id: { in: solucaoIds } } });

    const importacoes = await prisma.importacao.findMany({
      where: { tipo: "IMPORTA_SOLUCOES", nomeArquivo: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const impIds = importacoes.map((i) => i.id);
    await prisma.stagingSolucaoImportada.deleteMany({ where: { importacaoId: { in: impIds } } });
    await prisma.importacao.deleteMany({ where: { id: { in: impIds } } });

    await prisma.empresa.deleteMany({ where: { id: { in: empresaIds } } });
  }

  beforeAll(async () => {
    const u = await prisma.usuario.findFirst({ where: { papel: "GESTOR" } });
    if (!u) throw new Error("Seed ausente: GESTOR");
    gestor = { id: u.id, papel: "GESTOR" };

    const categoria = await prisma.categoria.findFirst({ where: { ativa: true } });
    const cultura = await prisma.cultura.findFirst({ where: { ativa: true } });
    if (!categoria || !cultura) throw new Error("Seed ausente: categoria/cultura");
    categoriaNome = categoria.nome;
    categoriaId = categoria.id;
    culturaNome = cultura.nome;

    await limpar();
    const ativa = await prisma.empresa.create({
      data: {
        nomeFantasia: `${PREFIXO} Aliada Ativa`,
        estagio: "ALIADA_ATIVA",
        cnpj: CNPJ_ATIVO,
      },
    });
    empresaAtivaId = ativa.id;
    await prisma.empresa.create({
      data: {
        nomeFantasia: `${PREFIXO} Aliada Suspensa`,
        estagio: "SUSPENSA",
        cnpj: CNPJ_SUSPENSO,
      },
    });
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("cria uma solução nova e grava auditoria", async () => {
    const arquivo = csv([
      [CNPJ_ATIVO, `${PREFIXO} Sol Nova`, "curta", "completa", categoriaNome, "", culturaNome, "Nacional"],
    ]);
    const r = await importarSolucoes(gestor, { nomeArquivo: `${PREFIXO}.csv`, conteudo: arquivo });
    expect(r.prontas).toBe(1);
    expect(r.comPendencia).toBe(0);

    const conf = await conferenciaImportacaoSolucoes(r.importacaoId);
    expect(conf?.linhas[0]?.acao).toBe("CRIAR");

    const efet = await efetivarImportacaoSolucoes(gestor, r.importacaoId);
    expect(efet.criadas).toBe(1);

    const criada = await prisma.solucao.findFirst({
      where: { empresaId: empresaAtivaId, nome: `${PREFIXO} Sol Nova` },
      include: { culturas: true },
    });
    expect(criada?.categoriaId).toBe(categoriaId);
    expect(criada?.coberturaNacional).toBe(true);
    expect(criada?.culturas).toHaveLength(1);

    const auditoria = await prisma.auditoriaEvento.count({
      where: { entidade: "solucao", entidadeId: criada!.id },
    });
    expect(auditoria).toBeGreaterThan(0);
  });

  it("bloqueia efetivar quando há categoria fora da lista", async () => {
    const arquivo = csv([
      [CNPJ_ATIVO, `${PREFIXO} Sol Ruim`, "c", "cc", "Categoria Que Nao Existe", "", culturaNome, "Nacional"],
    ]);
    const r = await importarSolucoes(gestor, { nomeArquivo: `${PREFIXO}.csv`, conteudo: arquivo });
    expect(r.comPendencia).toBe(1);
    await expect(efetivarImportacaoSolucoes(gestor, r.importacaoId)).rejects.toBeInstanceOf(
      ErroDeValidacao,
    );
  });

  it("enriquece uma solução já existente (mesmo CNPJ + nome)", async () => {
    const existente = await criarSolucao(gestor, empresaAtivaId, {
      nome: `${PREFIXO} Sol Existente`,
      descricaoCurta: "antiga",
    });
    const arquivo = csv([
      [CNPJ_ATIVO, `${PREFIXO} Sol Existente`, "nova descrição", "completa", categoriaNome, "", culturaNome, "Nacional"],
    ]);
    const r = await importarSolucoes(gestor, { nomeArquivo: `${PREFIXO}.csv`, conteudo: arquivo });
    const conf = await conferenciaImportacaoSolucoes(r.importacaoId);
    expect(conf?.linhas[0]?.acao).toBe("ENRIQUECER");

    const efet = await efetivarImportacaoSolucoes(gestor, r.importacaoId);
    expect(efet.enriquecidas).toBe(1);

    const atual = await prisma.solucao.findUnique({ where: { id: existente.id } });
    expect(atual?.descricaoCurta).toBe("nova descrição");
    expect(atual?.categoriaId).toBe(categoriaId);
  });

  it("recusa aliado não ativo com a menção à RN01", async () => {
    const arquivo = csv([
      [CNPJ_SUSPENSO, `${PREFIXO} Sol Suspensa`, "c", "cc", categoriaNome, "", culturaNome, "Nacional"],
    ]);
    const r = await importarSolucoes(gestor, { nomeArquivo: `${PREFIXO}.csv`, conteudo: arquivo });
    expect(r.comPendencia).toBe(1);
    const conf = await conferenciaImportacaoSolucoes(r.importacaoId);
    expect(conf?.linhas[0]?.pendencias.some((p) => /RN01/.test(p.motivo))).toBe(true);
  });
});
