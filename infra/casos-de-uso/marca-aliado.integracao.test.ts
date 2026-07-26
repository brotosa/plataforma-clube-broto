import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeMarca } from "@/dominio/marca/marca";
import { ErroDeValidacao } from "./contexto";
import { ENTIDADE_AUDITORIA, enviarMarca, lerMarca, removerMarca } from "./marca-aliado";

/**
 * RN54 — marca do aliado, fim a fim: envio, troca, remoção, auditoria e
 * permissão. O que os testes de `dominio/marca` não alcançam é justamente
 * o que interessa aqui — que o binário gravado é o HIGIENIZADO, que a
 * troca deixa rastro com o hash anterior e o novo, e que a trilha nunca
 * carrega o conteúdo do arquivo.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const PNG_MINIMO = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PNG_OUTRO = new Uint8Array([...PNG_MINIMO, 0x01, 0x02, 0x03]);
const SVG_COM_SCRIPT =
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="4" height="4"/></svg>';

describe.skipIf(!temBanco)("RN54 — marca do aliado (integração)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let leitura: { id: string; papel: "LEITURA" };
  let empresaId = "";

  async function limparDadosDeTeste() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-RN54]" } },
      select: { id: true },
    });
    const ids = empresas.map((empresa) => empresa.id);
    await prisma.marcaAliado.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const usuarioGestor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    gestor = { id: usuarioGestor.id, papel: "GESTOR" };
    const usuarioLeitura = await prisma.usuario.findFirstOrThrow({ where: { papel: "LEITURA" } });
    leitura = { id: usuarioLeitura.id, papel: "LEITURA" };
  });

  beforeEach(async () => {
    await limparDadosDeTeste();
    const empresa = await prisma.empresa.create({
      data: { nomeFantasia: "[TESTE-RN54] Aliado com marca", estagio: "EM_NEGOCIACAO" },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("envia a marca, grava tipo real e hash, e a leitura devolve o conteúdo", async () => {
    const { hash } = await enviarMarca(gestor, empresaId, {
      nome: "marca.png",
      conteudo: PNG_MINIMO,
    });

    const gravada = await prisma.marcaAliado.findUniqueOrThrow({ where: { empresaId } });
    expect(gravada.tipoMime).toBe("image/png");
    expect(gravada.bytes).toBe(PNG_MINIMO.length);
    expect(gravada.hash).toBe(hash);
    expect(gravada.autorId).toBe(gestor.id);

    const lida = await lerMarca(gestor, empresaId);
    expect(lida).not.toBeNull();
    expect(Array.from(lida!.conteudo)).toEqual(Array.from(PNG_MINIMO));
    expect(lida!.hash).toBe(hash);
  });

  it("grava o SVG HIGIENIZADO — o arquivo cru nunca chega ao banco", async () => {
    await enviarMarca(gestor, empresaId, {
      nome: "marca.svg",
      conteudo: new TextEncoder().encode(SVG_COM_SCRIPT),
    });
    const gravada = await prisma.marcaAliado.findUniqueOrThrow({ where: { empresaId } });
    const conteudo = new TextDecoder().decode(new Uint8Array(gravada.conteudo));
    expect(conteudo).not.toContain("script");
    expect(conteudo).not.toContain("alert");
    expect(conteudo).toContain("<rect");
    expect(gravada.bytes).toBe(new TextEncoder().encode(conteudo).length);
  });

  it("a troca substitui o conteúdo e muda o hash — o cache não serve a antiga", async () => {
    const primeira = await enviarMarca(gestor, empresaId, {
      nome: "marca.png",
      conteudo: PNG_MINIMO,
    });
    const segunda = await enviarMarca(gestor, empresaId, {
      nome: "marca-nova.png",
      conteudo: PNG_OUTRO,
    });
    expect(segunda.hash).not.toBe(primeira.hash);

    // 1:1 de verdade: trocar não acumula linha.
    expect(await prisma.marcaAliado.count({ where: { empresaId } })).toBe(1);
    const lida = await lerMarca(gestor, empresaId);
    expect(Array.from(lida!.conteudo)).toEqual(Array.from(PNG_OUTRO));
  });

  it("troca e remoção deixam trilha com autor, valor anterior e novo", async () => {
    await enviarMarca(gestor, empresaId, { nome: "marca.png", conteudo: PNG_MINIMO });
    await enviarMarca(gestor, empresaId, { nome: "marca-nova.png", conteudo: PNG_OUTRO });
    await removerMarca(gestor, empresaId);

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: ENTIDADE_AUDITORIA, entidadeId: empresaId },
      orderBy: { criadoEm: "asc" },
    });
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos.every((evento) => evento.autorId === gestor.id)).toBe(true);

    const porArquivo = eventos.filter((evento) => evento.campo === "arquivo");
    // Envio (null → marca.png), troca (marca.png → marca-nova.png) e
    // remoção (marca-nova.png → null).
    expect(porArquivo.map((evento) => [evento.valorAnterior, evento.valorNovo])).toEqual([
      [null, "marca.png"],
      ["marca.png", "marca-nova.png"],
      ["marca-nova.png", null],
    ]);

    // A trilha registra a mudança, nunca o arquivo: nenhum evento carrega
    // o conteúdo, que é o que a RN49 (auditoria não se poda) exige.
    const conteudoPng = Buffer.from(PNG_MINIMO).toString("base64");
    expect(
      eventos.some(
        (evento) =>
          (evento.valorNovo ?? "").includes(conteudoPng) ||
          (evento.valorAnterior ?? "").includes(conteudoPng),
      ),
    ).toBe(false);
  });

  it("remover devolve o aliado ao estado sem marca", async () => {
    await enviarMarca(gestor, empresaId, { nome: "marca.png", conteudo: PNG_MINIMO });
    await removerMarca(gestor, empresaId);
    expect(await lerMarca(gestor, empresaId)).toBeNull();
  });

  it("remover sem marca recusa com motivo, não em silêncio", async () => {
    await expect(removerMarca(gestor, empresaId)).rejects.toThrow(ErroDeValidacao);
  });

  it("papel sem edição não envia nem remove; papel com leitura lê", async () => {
    await expect(
      enviarMarca(leitura, empresaId, { nome: "marca.png", conteudo: PNG_MINIMO }),
    ).rejects.toThrow(ErroDeAutorizacao);
    await expect(removerMarca(leitura, empresaId)).rejects.toThrow(ErroDeAutorizacao);

    await enviarMarca(gestor, empresaId, { nome: "marca.png", conteudo: PNG_MINIMO });
    expect(await lerMarca(leitura, empresaId)).not.toBeNull();
  });

  it("arquivo recusado não deixa marca nem evento de auditoria", async () => {
    await expect(
      enviarMarca(gestor, empresaId, {
        nome: "marca.png",
        conteudo: new TextEncoder().encode("GIF89a não é imagem aceita"),
      }),
    ).rejects.toThrow(ErroDeMarca);

    expect(await prisma.marcaAliado.count({ where: { empresaId } })).toBe(0);
    expect(
      await prisma.auditoriaEvento.count({
        where: { entidade: ENTIDADE_AUDITORIA, entidadeId: empresaId },
      }),
    ).toBe(0);
  });

  it("aliado inexistente recusa com mensagem, sem estourar erro cru", async () => {
    await expect(
      enviarMarca(gestor, "empresa-que-nao-existe", { nome: "m.png", conteudo: PNG_MINIMO }),
    ).rejects.toThrow(ErroDeValidacao);
  });

  it("apagar o aliado leva a marca junto (cascade) — sem binário órfão", async () => {
    await enviarMarca(gestor, empresaId, { nome: "marca.png", conteudo: PNG_MINIMO });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: empresaId } });
    await prisma.empresa.delete({ where: { id: empresaId } });
    expect(await prisma.marcaAliado.count({ where: { empresaId } })).toBe(0);
  });
});
