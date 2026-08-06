import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { type Ator } from "./contexto";
import { atualizarContrato, criarContrato } from "./contatos-contratos";

/**
 * Edição do contrato comercial vigente (Nível 1) — em nível de serviço,
 * com banco. O caminho existia em `atualizarContrato` mas não era exercido
 * por nenhuma tela; agora que a aba Comercial o expõe, o teste prova as
 * duas coisas que importam: quem PODE editar preenche o anexo de um contrato
 * já vigente (sem denunciá-lo), e a auditoria registra a mudança; quem NÃO
 * tem CRIAR_EDITAR é recusado.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("edição do contrato comercial (Nível 1)", () => {
  const prisma = new PrismaClient();
  let gestor: Ator;
  let leitura: Ator;
  let empresaId = "";

  async function atorPorPapel(papel: Ator["papel"], email: string): Promise<Ator> {
    const usuario = await prisma.usuario.upsert({
      where: { email },
      update: { papel },
      create: { email, nome: `Teste ${papel}`, senhaHash: "x", papel },
    });
    return { id: usuario.id, papel };
  }

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: "[TESTE-CONTRATO]" } },
    });
    const ids = empresas.map((e) => e.id);
    await prisma.auditoriaEvento.deleteMany({ where: { entidade: "contrato_comercial" } });
    await prisma.contratoComercial.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    gestor = await atorPorPapel("GESTOR", "gestor.contrato@dev.clubebroto.local");
    leitura = await atorPorPapel("LEITURA", "leitura.contrato@dev.clubebroto.local");
    await limpar();
    const empresa = await prisma.empresa.create({
      data: {
        nomeFantasia: "[TESTE-CONTRATO] Aliado",
        estagio: "EM_NEGOCIACAO",
        estagioDesde: new Date(),
      },
    });
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("preenche o anexo de um contrato vigente sem denunciá-lo, e audita", async () => {
    const contrato = await criarContrato(gestor, empresaId, {
      vigenciaBase: new Date("2026-01-01T00:00:00Z"),
      ambientesPagamento: "FORA_PLATAFORMA",
      comissaoPct: 5,
      anexoS3Key: null,
    });
    expect(contrato.anexoS3Key).toBeNull();

    const atualizado = await atualizarContrato(gestor, contrato.id, {
      vigenciaBase: contrato.vigenciaBase,
      ambientesPagamento: contrato.ambientesPagamento,
      comissaoPct: 5,
      anexoS3Key: "s3://contratos/cyan-analytics.pdf",
    });

    // Continua sendo o mesmo contrato (não trocou), agora com anexo.
    expect(atualizado.id).toBe(contrato.id);
    expect(atualizado.status).toBe("VIGENTE");
    expect(atualizado.anexoS3Key).toBe("s3://contratos/cyan-analytics.pdf");

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "contrato_comercial", entidadeId: contrato.id },
    });
    // Ao menos a criação e a edição foram registradas.
    expect(eventos.length).toBeGreaterThanOrEqual(2);
  });

  it("recusa a edição para papel sem CRIAR_EDITAR (Leitura)", async () => {
    const contrato = await prisma.contratoComercial.findFirstOrThrow({ where: { empresaId } });
    await expect(
      atualizarContrato(leitura, contrato.id, {
        vigenciaBase: contrato.vigenciaBase,
        ambientesPagamento: contrato.ambientesPagamento,
        anexoS3Key: "s3://contratos/invasao.pdf",
      }),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });
});
