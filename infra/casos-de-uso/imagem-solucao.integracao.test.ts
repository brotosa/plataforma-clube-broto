import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeImagem } from "@/dominio/imagens/imagem";
import { TAMANHO_MAXIMO_EM_BYTES } from "@/dominio/solucoes/imagem-card";
import { ErroDeValidacao } from "./contexto";
import {
  ENTIDADE_AUDITORIA,
  enviarImagemDaSolucao,
  lerImagemDaSolucao,
  removerImagemDaSolucao,
} from "./imagem-solucao";

/**
 * RN60 — imagem do card da solução, fim a fim: envio, troca, remoção,
 * auditoria e permissão. O que os testes de `dominio/solucoes` não
 * alcançam é o que interessa aqui — que a troca deixa rastro com o hash
 * anterior e o novo, que a trilha nunca carrega o conteúdo do arquivo, e
 * que a remoção devolve a solução ao estado sem imagem.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const PNG_MINIMO = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PNG_OUTRO = new Uint8Array([...PNG_MINIMO, 0x01, 0x02, 0x03]);
const SVG_VALIDO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';

describe.skipIf(!temBanco)("RN60 — imagem do card da solução (integração)", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let leitura: { id: string; papel: "LEITURA" };
  let solucaoId = "";

  async function limparDadosDeTeste() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-RN60]" } },
      select: { id: true },
    });
    const idsEmpresa = empresas.map((empresa) => empresa.id);
    const solucoes = await prisma.solucao.findMany({
      where: { empresaId: { in: idsEmpresa } },
      select: { id: true },
    });
    const idsSolucao = solucoes.map((solucao) => solucao.id);
    await prisma.imagemSolucao.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidadeId: { in: [...idsSolucao, ...idsEmpresa] } },
    });
    await prisma.solucao.deleteMany({ where: { id: { in: idsSolucao } } });
    await prisma.empresa.deleteMany({ where: { id: { in: idsEmpresa } } });
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
      data: { nomeFantasia: "[TESTE-RN60] Aliado da solução", estagio: "ALIADA_ATIVA" },
    });
    const solucao = await prisma.solucao.create({
      data: { empresaId: empresa.id, nome: "[TESTE-RN60] Solução com imagem" },
    });
    solucaoId = solucao.id;
  });

  afterAll(async () => {
    await limparDadosDeTeste();
    await prisma.$disconnect();
  });

  it("envia a imagem e ela sai pela leitura, com o hash como versão", async () => {
    const { hash } = await enviarImagemDaSolucao(gestor, solucaoId, {
      nome: "card.png",
      conteudo: PNG_MINIMO,
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const lida = await lerImagemDaSolucao(gestor, solucaoId);
    expect(lida?.tipoMime).toBe("image/png");
    expect(lida?.hash).toBe(hash);
    expect(Array.from(lida?.conteudo ?? [])).toEqual(Array.from(PNG_MINIMO));
  });

  it("a troca muda o hash e a auditoria guarda o antes e o depois", async () => {
    const primeira = await enviarImagemDaSolucao(gestor, solucaoId, {
      nome: "card.png",
      conteudo: PNG_MINIMO,
    });
    const segunda = await enviarImagemDaSolucao(gestor, solucaoId, {
      nome: "card-novo.png",
      conteudo: PNG_OUTRO,
    });
    expect(segunda.hash).not.toBe(primeira.hash);

    // A auditoria grava um evento POR CAMPO alterado, então a troca é lida
    // pelo campo, não pelo índice do evento.
    const porHash = await prisma.auditoriaEvento.findMany({
      where: { entidade: ENTIDADE_AUDITORIA, entidadeId: solucaoId, campo: "hash" },
      orderBy: { criadoEm: "asc" },
    });
    expect(porHash.map((evento) => [evento.valorAnterior, evento.valorNovo])).toEqual([
      [null, primeira.hash],
      [primeira.hash, segunda.hash],
    ]);

    const porArquivo = await prisma.auditoriaEvento.findMany({
      where: { entidade: ENTIDADE_AUDITORIA, entidadeId: solucaoId, campo: "arquivo" },
      orderBy: { criadoEm: "asc" },
    });
    expect(porArquivo.map((evento) => [evento.valorAnterior, evento.valorNovo])).toEqual([
      [null, "card.png"],
      ["card.png", "card-novo.png"],
    ]);
  });

  it("a trilha registra o arquivo, nunca o conteúdo", async () => {
    await enviarImagemDaSolucao(gestor, solucaoId, { nome: "card.png", conteudo: PNG_MINIMO });
    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: ENTIDADE_AUDITORIA, entidadeId: solucaoId },
    });

    // Os campos auditados são exatamente estes quatro — nenhum deles é o
    // binário. Auditoria é registro de mudança, não cópia de arquivo: um
    // BYTEA por evento inflaria a tabela que a RN49 proíbe de podar.
    expect([...new Set(eventos.map((evento) => evento.campo))].sort()).toEqual([
      "arquivo",
      "bytes",
      "hash",
      "tipo",
    ]);

    const conteudoEmBase64 = Buffer.from(PNG_MINIMO).toString("base64");
    for (const evento of eventos) {
      const registrado = `${evento.valorAnterior ?? ""}${evento.valorNovo ?? ""}`;
      expect(registrado).not.toContain(conteudoEmBase64);
      expect(registrado.length).toBeLessThan(200);
    }
  });

  it("a remoção devolve a solução ao estado sem imagem, auditada", async () => {
    await enviarImagemDaSolucao(gestor, solucaoId, { nome: "card.png", conteudo: PNG_MINIMO });
    await removerImagemDaSolucao(gestor, solucaoId);

    expect(await lerImagemDaSolucao(gestor, solucaoId)).toBeNull();

    const porHash = await prisma.auditoriaEvento.findMany({
      where: { entidade: ENTIDADE_AUDITORIA, entidadeId: solucaoId, campo: "hash" },
      orderBy: { criadoEm: "asc" },
    });
    // O último evento do campo `hash` é o da remoção: sai um valor, entra
    // nulo. É assim que a trilha distingue remover de nunca ter tido.
    expect(porHash[porHash.length - 1]?.valorNovo).toBeNull();
    expect(porHash[porHash.length - 1]?.valorAnterior).toMatch(/^[0-9a-f]{64}$/);
  });

  it("remover sem imagem recusa nomeando o motivo", async () => {
    await expect(removerImagemDaSolucao(gestor, solucaoId)).rejects.toThrow(ErroDeValidacao);
    await expect(removerImagemDaSolucao(gestor, solucaoId)).rejects.toThrow(
      /não tem imagem para remover/,
    );
  });

  it("solução inexistente recusa antes de validar o arquivo", async () => {
    await expect(
      enviarImagemDaSolucao(gestor, "solucao-que-nao-existe", {
        nome: "card.png",
        conteudo: PNG_MINIMO,
      }),
    ).rejects.toThrow(/Solução não encontrada/);
  });

  it("papel de leitura não envia nem remove, mas lê", async () => {
    await expect(
      enviarImagemDaSolucao(leitura, solucaoId, { nome: "card.png", conteudo: PNG_MINIMO }),
    ).rejects.toThrow(ErroDeAutorizacao);
    await expect(removerImagemDaSolucao(leitura, solucaoId)).rejects.toThrow(ErroDeAutorizacao);

    await enviarImagemDaSolucao(gestor, solucaoId, { nome: "card.png", conteudo: PNG_MINIMO });
    expect(await lerImagemDaSolucao(leitura, solucaoId)).not.toBeNull();
  });

  it("SVG é recusado aqui e nada é gravado", async () => {
    await expect(
      enviarImagemDaSolucao(gestor, solucaoId, {
        nome: "card.svg",
        conteudo: new TextEncoder().encode(SVG_VALIDO),
      }),
    ).rejects.toThrow(ErroDeImagem);

    expect(await lerImagemDaSolucao(gestor, solucaoId)).toBeNull();
    expect(
      await prisma.auditoriaEvento.count({
        where: { entidade: ENTIDADE_AUDITORIA, entidadeId: solucaoId },
      }),
    ).toBe(0);
  });

  it("acima de 400 KB é recusado e nada é gravado", async () => {
    const grande = new Uint8Array(TAMANHO_MAXIMO_EM_BYTES + 16);
    grande.set(PNG_MINIMO.subarray(0, 8));
    await expect(
      enviarImagemDaSolucao(gestor, solucaoId, { nome: "card.png", conteudo: grande }),
    ).rejects.toThrow(/limite é 400 KB/);
    expect(await lerImagemDaSolucao(gestor, solucaoId)).toBeNull();
  });
});
