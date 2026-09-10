import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeEnvioDeArquivo } from "@/dominio/arquivos/arquivo-enviado";
import { ErroDeValidacao } from "./contexto";
import {
  adicionarComentario,
  editarComentario,
  removerComentario,
  definirResolucaoPendencia,
  lerAnexoDoComentario,
} from "./comentarios";
import {
  contarPendenciasQueMencionam,
  feedDoAliado,
  feedDoPatrocinador,
} from "@/infra/consultas/comentarios";

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
      adicionarComentario(leitura, { tipo: "aliado", id: empresaId }, { texto: "não deveria" }),
    ).rejects.toThrow(ErroDeAutorizacao);
  });

  it("comentário vazio é recusado", async () => {
    await expect(
      adicionarComentario(gestor, { tipo: "aliado", id: empresaId }, { texto: "   " }),
    ).rejects.toThrow(ErroDeValidacao);
  });

  let comentarioId = "";
  it("comenta como pendência mencionando outro, e a menção alimenta o sino", async () => {
    const nota = await adicionarComentario(gestor, { tipo: "aliado", id: empresaId }, {
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

  it("anexa um PDF ao comentário: grava 1:1, some por rota e recusa SVG", async () => {
    // Fixture sintética — bytes de um PDF mínimo, nunca arquivo real.
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, ...new Array(64).fill(0x20)]);
    const nota = await adicionarComentario(gestor, { tipo: "aliado", id: empresaId }, {
      texto: "Segue o contrato assinado em anexo.",
      anexo: { nome: "contrato.pdf", conteudo: pdf },
    });

    // A linha 1:1 nasceu com o tipo REAL e o tamanho do que foi gravado.
    const anexo = await prisma.notaRapidaAnexo.findUniqueOrThrow({
      where: { notaRapidaId: nota.id },
    });
    expect(anexo.tipoMime).toBe("application/pdf");
    expect(anexo.nomeArquivo).toBe("contrato.pdf");
    expect(anexo.bytes).toBe(pdf.length);
    expect(anexo.autorId).toBe(gestor.id);

    // O feed traz os METADADOS (nunca o binário).
    const feed = await feedDoAliado(empresaId);
    const linha = feed.find((c) => c.id === nota.id);
    expect(linha?.anexo).toEqual({
      nomeArquivo: "contrato.pdf",
      tipoMime: "application/pdf",
      bytes: pdf.length,
    });

    // A leitura de serviço (a rota) devolve o conteúdo íntegro.
    const servido = await lerAnexoDoComentario(scout, nota.id);
    expect(servido?.tipoMime).toBe("application/pdf");
    expect(Array.from(servido?.conteudo ?? [])).toEqual(Array.from(pdf));

    // SVG é recusado nomeando o formato (RN60): nada foi gravado.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await expect(
      adicionarComentario(gestor, { tipo: "aliado", id: empresaId }, {
        texto: "tentativa com vetor",
        anexo: { nome: "x.svg", conteudo: svg },
      }),
    ).rejects.toThrow(ErroDeEnvioDeArquivo);

    // Soft-delete da nota tira o anexo do serviço; a linha cai por cascade.
    await removerComentario(gestor, nota.id);
    expect(await lerAnexoDoComentario(scout, nota.id)).toBeNull();
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

describe.skipIf(!temBanco)("comentários do patrocinador — mesmo painel, permissão própria", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let scout: { id: string; papel: "ANALISTA_SCOUT" };
  let leitura: { id: string; papel: "LEITURA" };
  let patrocinadorId = "";
  // CNPJ alfanumérico válido (exemplo oficial) — único, e o prefixo na razão
  // social permite a limpeza.
  const CNPJ = "12ABC34501DE35";

  async function limpar() {
    const patrocinadores = await prisma.patrocinador.findMany({
      where: { razaoSocial: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const ids = patrocinadores.map((p) => p.id);
    const notas = await prisma.notaRapida.findMany({
      where: { patrocinadorId: { in: ids } },
      select: { id: true },
    });
    const notaIds = notas.map((n) => n.id);
    await prisma.notaRapidaMencao.deleteMany({ where: { notaRapidaId: { in: notaIds } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: "nota_rapida", entidadeId: { in: notaIds } },
    });
    await prisma.notaRapida.deleteMany({ where: { id: { in: notaIds } } });
    await prisma.patrocinador.deleteMany({ where: { id: { in: ids } } });
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
    const patrocinador = await prisma.patrocinador.create({
      data: { razaoSocial: `${PREFIXO} Patrocinador`, cnpj: CNPJ },
    });
    patrocinadorId = patrocinador.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("Leitura não comenta no patrocinador (RBAC COMENTAR_FICHA_PATROCINADOR)", async () => {
    await expect(
      adicionarComentario(leitura, { tipo: "patrocinador", id: patrocinadorId }, {
        texto: "não deveria",
      }),
    ).rejects.toThrow(ErroDeAutorizacao);
  });

  it("Gestor comenta: a nota pousa em patrocinador_id (XOR), entra no feed e no sino", async () => {
    const nota = await adicionarComentario(
      gestor,
      { tipo: "patrocinador", id: patrocinadorId },
      { texto: "Confirmar a minuta com o jurídico.", ehPendencia: true, mencionados: [scout.id] },
    );
    // XOR: dono é o patrocinador; a coluna do aliado fica nula.
    expect(nota.patrocinadorId).toBe(patrocinadorId);
    expect(nota.empresaId).toBeNull();

    const feed = await feedDoPatrocinador(patrocinadorId);
    expect(feed.some((c) => c.id === nota.id)).toBe(true);

    // O mesmo sino conta a menção do patrocinador (contagem cross-ficha).
    expect(await contarPendenciasQueMencionam(scout.id)).toBeGreaterThanOrEqual(1);

    // Editar/resolver funcionam pela permissão da própria ficha.
    await definirResolucaoPendencia(scout, nota.id, true);
    const feedResolvido = await feedDoPatrocinador(patrocinadorId);
    expect(feedResolvido.find((c) => c.id === nota.id)?.pendenciaResolvidaEm).not.toBeNull();
  });
});
