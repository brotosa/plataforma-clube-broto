import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { FAMILIAS_DE_LISTA, familiaDe } from "@/dominio/parametrizador/listas";
import { atualizarItem, contarUsos, criarItem, listarItens } from "./familias";

/**
 * Convergência da Onda 4 com o Parametrizador (Onda 3): "Formatos de peça"
 * é a lista de domínio nova da ficha da Onda 4 §6, e a T16 a edita como
 * qualquer outra taxonomia — sem migração e sem código de tela novo.
 *
 * O que este teste protege: a família está registrada, o editor enxerga o
 * seed, criar item funciona e a contagem de uso da RN24 responde pelas
 * PEÇAS que usam o formato (a frase que a T16 mostra antes de inativar).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("Parametrizador — família Formatos de peça (Onda 4 §6)", () => {
  const prisma = new PrismaClient();
  const NOME_NOVO = "[TESTE-F12] SMS";
  const NOME_EM_USO = "[TESTE-F12] Formato em uso";
  let campanhaId = "";
  let formatoEmUsoId = "";

  beforeAll(async () => {
    const autor = await prisma.usuario.findFirstOrThrow({
      where: { email: "gestor@dev.clubebroto.local" },
    });
    const campanha = await prisma.campanha.create({
      data: { nome: "[TESTE-F12] Campanha da família", autorId: autor.id },
    });
    campanhaId = campanha.id;
    // Formato próprio do teste: a contagem fica isolada do que outras
    // suítes deixam na base (o e2e da F12 também cria peças de e-mail).
    const emUso = await prisma.formatoPeca.create({
      data: { slug: "TESTE_F12_EM_USO", nome: NOME_EM_USO, ordem: 90 },
    });
    formatoEmUsoId = emUso.id;
    await prisma.pecaCampanha.create({
      data: {
        campanhaId,
        formatoId: formatoEmUsoId,
        titulo: "[TESTE-F12] Peça que usa o formato",
      },
    });
  });

  afterAll(async () => {
    await prisma.pecaCampanha.deleteMany({ where: { campanhaId } });
    await prisma.campanha.deleteMany({ where: { id: campanhaId } });
    await prisma.formatoPeca.deleteMany({ where: { nome: { in: [NOME_NOVO, NOME_EM_USO] } } });
    await prisma.$disconnect();
  });

  it("a família está no hub do Parametrizador, na seção da Onda 4", () => {
    const familia = familiaDe("formatos-peca");
    expect(familia).not.toBeNull();
    expect(familia?.secao).toBe("Campanhas & Cestas");
    expect(familia?.permiteCriar).toBe(true);
    expect(FAMILIAS_DE_LISTA.map((f) => f.id)).toContain("formatos-peca");
  });

  it("o editor lista o seed da ficha §6", async () => {
    const itens = await listarItens(prisma, "formatos-peca");
    // O seed da ficha §6 vem primeiro, na ordem declarada; o que outras
    // suítes criarem entra depois e não desmente a asserção.
    expect(itens.slice(0, 4).map((item) => item.nome)).toEqual([
      "E-mail",
      "Banner",
      "Push",
      "WhatsApp",
    ]);
  });

  it("RN24 — a contagem de uso responde pelas peças que usam o formato", async () => {
    const usos = await contarUsos(prisma, "formatos-peca", formatoEmUsoId);
    expect(usos).toEqual([
      { singular: "peça de campanha", plural: "peças de campanha", quantidade: 1 },
    ]);

    const criadoAgora = await criarItem(prisma, "formatos-peca", { nome: NOME_NOVO });
    const semUso = await contarUsos(prisma, "formatos-peca", criadoAgora.id);
    expect(semUso[0]?.quantidade).toBe(0);
  });

  it("criar e inativar item passam pelo caminho genérico do editor (RN24)", async () => {
    const criado =
      (await listarItens(prisma, "formatos-peca")).find((item) => item.nome === NOME_NOVO) ??
      (await criarItem(prisma, "formatos-peca", { nome: NOME_NOVO }));
    expect(criado.ativo).toBe(true);

    await atualizarItem(prisma, "formatos-peca", criado.id, { ativo: false });
    const inativado = (await listarItens(prisma, "formatos-peca")).find(
      (item) => item.id === criado.id,
    );
    // Inativar não exclui: o item continua na lista, com etiqueta.
    expect(inativado?.ativo).toBe(false);
  });
});
