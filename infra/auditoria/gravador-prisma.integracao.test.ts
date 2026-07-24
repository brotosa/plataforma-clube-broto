import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { criarGravadorPrisma } from "./gravador-prisma";

/**
 * Teste de integração do critério "pronto" da F1: evento de auditoria
 * gravando de fato no banco, com valor anterior/novo/autor consultáveis.
 * Executa apenas quando há banco disponível (local ou job de CI com
 * PostgreSQL de serviço).
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("gravador de auditoria (Prisma + PostgreSQL)", () => {
  const prisma = new PrismaClient();
  let autorId = "";

  beforeAll(async () => {
    const autor = await prisma.usuario.upsert({
      where: { email: "auditoria.integracao@dev.clubebroto.local" },
      update: {},
      create: {
        nome: "Autor do teste de integração",
        email: "auditoria.integracao@dev.clubebroto.local",
        senhaHash: "sem-login",
        papel: "GESTOR",
      },
    });
    autorId = autor.id;
    await prisma.auditoriaEvento.deleteMany({ where: { autorId } });
  });

  afterAll(async () => {
    await prisma.auditoriaEvento.deleteMany({ where: { autorId } });
    await prisma.usuario.delete({ where: { id: autorId } });
    await prisma.$disconnect();
  });

  it("grava e consulta o evento com valor anterior/novo/autor na transação da mutação", async () => {
    await prisma.$transaction(async (tx) => {
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "empresa",
        entidadeId: "empresa-teste-integracao",
        autorId,
        anterior: { estagio: "EM_NEGOCIACAO" },
        novo: { estagio: "ALIADA_ATIVA" },
      });
    });

    const gravado = await prisma.auditoriaEvento.findFirst({
      where: { entidade: "empresa", entidadeId: "empresa-teste-integracao" },
    });
    expect(gravado).not.toBeNull();
    expect(gravado?.campo).toBe("estagio");
    expect(gravado?.valorAnterior).toBe("EM_NEGOCIACAO");
    expect(gravado?.valorNovo).toBe("ALIADA_ATIVA");
    expect(gravado?.autorId).toBe(autorId);
    expect(gravado?.criadoEm).toBeInstanceOf(Date);
  });

  it("mantém atomicidade: rollback da transação descarta o evento", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await registrarMutacao(criarGravadorPrisma(tx), {
          entidade: "empresa",
          entidadeId: "empresa-teste-rollback",
          autorId,
          anterior: null,
          novo: { nomeFantasia: "descartada" },
        });
        throw new Error("forçar rollback");
      }),
    ).rejects.toThrow("forçar rollback");

    const gravado = await prisma.auditoriaEvento.findFirst({
      where: { entidadeId: "empresa-teste-rollback" },
    });
    expect(gravado).toBeNull();
  });
});
