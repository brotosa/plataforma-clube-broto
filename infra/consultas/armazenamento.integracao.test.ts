import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { LIMITE_MAIOR_KIT } from "@/dominio/arquivos/artefato-derivado";
import { medirArmazenamento } from "./armazenamento";

/**
 * A medida do armazenamento (RN71) agrega por prefixo de chave e avalia a
 * condição objetiva. O teste mede sobre a base real, insere artefatos
 * marcados e afere o DELTA — assim independe do que já está guardado.
 *
 * O tamanho vai na coluna `bytes` (é o que a RN71 mede), então um "kit de
 * 51 MB" se testa sem gravar 51 MB de conteúdo: a coluna de tamanho e o
 * binário são colunas distintas, e a medida lê a de tamanho.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const MARCA = "medida-rn71-teste";

describe.skipIf(!temBanco)("RN71 — medida do armazenamento e condição de saída", () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.arquivoArmazenado.deleteMany({ where: { chave: { contains: MARCA } } });
    await prisma.$disconnect();
  });

  it("classifica por prefixo, soma o total e um kit acima de 50 MB satisfaz a condição", async () => {
    const antes = await medirArmazenamento();

    const kitGrande = LIMITE_MAIOR_KIT + 1; // 50 MB + 1 byte
    await prisma.arquivoArmazenado.createMany({
      data: [
        {
          chave: `kits/${MARCA}/v1-grande.zip`,
          conteudo: Buffer.from("zip-sintetico"),
          tipoMime: "application/zip",
          bytes: kitGrande,
          hash: `${MARCA}-kit`,
        },
        {
          chave: `pecas/${MARCA}/arte.png`,
          conteudo: Buffer.from("png-sintetico"),
          tipoMime: "image/png",
          bytes: 3,
          hash: `${MARCA}-peca`,
        },
      ],
    });

    const depois = await medirArmazenamento();

    // Cada linha caiu no artefato do seu prefixo.
    expect(depois.porArtefato.KIT_DE_EXECUCAO.quantidade).toBe(
      antes.porArtefato.KIT_DE_EXECUCAO.quantidade + 1,
    );
    expect(depois.porArtefato.IMAGEM_DE_PECA.quantidade).toBe(
      antes.porArtefato.IMAGEM_DE_PECA.quantidade + 1,
    );
    // O total cresceu exatamente pela soma dos dois.
    expect(depois.totalBytes).toBe(antes.totalBytes + kitGrande + 3);
    // O maior kit é o que acabou de entrar, e ele satisfaz a condição por kit.
    expect(depois.maiorKitBytes).toBeGreaterThanOrEqual(kitGrande);
    expect(depois.condicao.porKit).toBe(true);
    expect(depois.condicao.satisfeita).toBe(true);
  });
});
