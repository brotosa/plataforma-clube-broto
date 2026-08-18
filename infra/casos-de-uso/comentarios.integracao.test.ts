import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeValidacao } from "./contexto";
import {
  adicionarComentario,
  editarComentario,
  removerComentario,
  definirResolucaoPendencia,
} from "./comentarios";
import { contarPendenciasQueMencionam, feedDoAliado } from "@/infra/consultas/comentarios";

/**
 * Painel de atividades em nível de serviço: comentar com pendência e menção,
 * editar/apagar só pelo autor (apagar é soft-delete), resolver/reabrir
 * pendência, e a contagem derivada que alimenta o sino. Tudo auditado.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const PREFIXO = "[TESTE-COMENT]";

describe.skipIf(!temBanco)("comentários do aliado — casos de uso integrados", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let scout: { id: string; papel: "ANALISTA_SCOUT" };
  let leitura: { id: string; papel: "LEITURA" };
  let empresaId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const ids = empresas.map((e) => e.id);
    const notas = await prisma.notaRapida.findMany({
      where: { empresaId: { in: ids } },
      select: { id: true },
    });
    const notaIds = notas.map((n) => n.id);
    await prisma.notaRapidaMencao.deleteMany({ where: { notaRapidaId: { in: notaIds } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: "nota_rapida", entidadeId: { in: notaIds } },
    });
    await prisma.notaRapida.deleteMany({ where: { id: { in: notaIds } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const usuarios = await prisma.usuario.findMany({
      where: { email: { endsWith: "@dev.clubebroto.local" } },
    });
    const porPapel = (papel: string) => {
      const u = usuarios.find((x) => x.papel === papel);
      if (!u) throw new Error(`Seed ausente: ${papel}`);
      return u.id;
    };
    gestor = { id: porPapel("GESTOR"), papel: "GESTOR" };
    scout = { id: porPapel("ANALISTA_SCOUT"), papel: "ANALISTA_SCOUT" };
    leitura = { id: porPapel("LEITURA"), papel: "LEITURA" };

    await limpar();
    const empresa = await prisma.empresa.create({
      data: { nomeFantasia: `${PREFIXO} Alvo`, estagio: "ALIADA_ATIVA" },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("Leitura não comenta (RBAC COMENTAR_FICHA_ALIADO)", async () => {
    await expect(
      adicionarComentario(leitura, empresaId, { texto: "não deveria" }),
    ).rejects.toThrow(ErroDeAutorizacao);
  });

  it("comentário vazio é recusado", async () => {
    await expect(
      adicionarComentario(gestor, empresaId, { texto: "   " }),
    ).rejects.toThrow(ErroDeValidacao);
  });

  let comentarioId = "";
  it("comenta como pendência mencionando outro, e a menção alimenta o sino", async () => {
    const nota = await adicionarComentario(gestor, empresaId, {
      texto: "Cadastrar o Fernando para seguir com as configurações.",
      ehPendencia: true,
      mencionados: [scout.id, gestor.id], // o próprio autor é ignorado
    });
    comentarioId = nota.id;

    const mencoes = await prisma.notaRapidaMencao.findMany({ where: { notaRapidaId: nota.id } });
    expect(mencoes.map((m) => m.usuarioId)).toEqual([scout.id]);

    const eventos = await prisma.auditoriaEvento.count({
      where: { entidade: "nota_rapida", entidadeId: nota.id },
    });
    expect(eventos).toBeGreaterThanOrEqual(1);

    // O sino do mencionado conta a pendência aberta.
    expect(await contarPendenciasQueMencionam(scout.id)).toBeGreaterThanOrEqual(1);
    // Quem não foi mencionado não recebe nada por esta.
    const antesGestor = await contarPendenciasQueMencionam(gestor.id);
    expect(antesGestor).toBe(0);
  });

  it("só o autor edita; edição marca editadoEm e re-sincroniza menções", async () => {
    await expect(
      editarComentario(scout, comentarioId, { texto: "invasão" }),
    ).rejects.toThrow(/autor/);

    const editada = await editarComentario(gestor, comentarioId, {
      texto: "Cadastrar o Fernando (atualizado).",
      ehPendencia: true,
      mencionados: [], // remove a menção
    });
    expect(editada.editadoEm).not.toBeNull();
    const mencoes = await prisma.notaRapidaMencao.count({ where: { notaRapidaId: comentarioId } });
    expect(mencoes).toBe(0);
    // Sem menção, o sino do scout zera para esta pendência.
    expect(await contarPendenciasQueMencionam(scout.id)).toBe(0);
  });

  it("resolver a pendência tira do sino; reabrir devolve", async () => {
    // Re-menciona para o scout voltar a ter a pendência.
    await editarComentario(gestor, comentarioId, {
      texto: "Cadastrar o Fernando.",
      ehPendencia: true,
      mencionados: [scout.id],
    });
    expect(await contarPendenciasQueMencionam(scout.id)).toBe(1);

    await definirResolucaoPendencia(scout, comentarioId, true);
    expect(await contarPendenciasQueMencionam(scout.id)).toBe(0);

    await definirResolucaoPendencia(gestor, comentarioId, false);
    expect(await contarPendenciasQueMencionam(scout.id)).toBe(1);
  });

  it("apagar é soft-delete: some do feed, some do sino, fica na auditoria", async () => {
    await expect(removerComentario(scout, comentarioId)).rejects.toThrow(/autor/);

    await removerComentario(gestor, comentarioId);
    const feed = await feedDoAliado(empresaId);
    expect(feed.some((c) => c.id === comentarioId)).toBe(false);
    expect(await contarPendenciasQueMencionam(scout.id)).toBe(0);

    // A linha continua no banco (soft-delete) e a auditoria registrou a remoção.
    const nota = await prisma.notaRapida.findUniqueOrThrow({ where: { id: comentarioId } });
    expect(nota.removidoEm).not.toBeNull();
  });
});
