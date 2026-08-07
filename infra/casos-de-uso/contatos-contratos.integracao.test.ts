import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { type Ator } from "./contexto";
import {
  atualizarContato,
  atualizarContrato,
  criarContato,
  criarContrato,
  enviarAnexoContrato,
  lerAnexoDoContratoVigente,
  removerAnexoContrato,
} from "./contatos-contratos";
import { avaliarPromocao } from "./empresas";

/** PDF mínimo válido pelo conteúdo (assinatura %PDF) — o bastante para a régua. */
const PDF_MINIMO = new Uint8Array(
  Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1"),
);
const SEM_ANEXO = "Contrato sem anexo (PDF)";

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
    const contratos = await prisma.contratoComercial.findMany({
      where: { empresaId: { in: ids } },
      select: { id: true },
    });
    const contratoIds = contratos.map((c) => c.id);
    // Ordem segura de FK: anexo → auditoria → contatos → contratos → empresa.
    await prisma.anexoContrato.deleteMany({ where: { contratoId: { in: contratoIds } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidade: { in: ["contrato_comercial", "contato_empresa", "AnexoContrato"] } },
    });
    await prisma.contatoEmpresa.deleteMany({ where: { empresaId: { in: ids } } });
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

  // ---- Nível 2: upload real do PDF do anexo ----

  it("upload de PDF conta como anexo na régua de promoção, e some ao remover", async () => {
    const contrato = await prisma.contratoComercial.findFirstOrThrow({ where: { empresaId } });
    // Isola o efeito do PDF: zera a chave S3 legada que o teste anterior gravou.
    await atualizarContrato(gestor, contrato.id, {
      vigenciaBase: contrato.vigenciaBase,
      ambientesPagamento: contrato.ambientesPagamento,
      anexoS3Key: null,
    });
    expect((await avaliarPromocao(empresaId)).pendencias).toContain(SEM_ANEXO);

    const { hash } = await enviarAnexoContrato(gestor, contrato.id, {
      nome: "contrato-cyan.pdf",
      conteudo: PDF_MINIMO,
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // O binário sai só pela leitura dedicada, com o tipo real apurado.
    const anexo = await lerAnexoDoContratoVigente(gestor, empresaId);
    expect(anexo?.tipoMime).toBe("application/pdf");
    expect(anexo?.nomeArquivo).toBe("contrato-cyan.pdf");

    // A régua de promoção agora enxerga o anexo — sem a chave S3.
    expect((await avaliarPromocao(empresaId)).pendencias).not.toContain(SEM_ANEXO);

    // Remover devolve a pendência.
    await removerAnexoContrato(gestor, contrato.id);
    expect(await lerAnexoDoContratoVigente(gestor, empresaId)).toBeNull();
    expect((await avaliarPromocao(empresaId)).pendencias).toContain(SEM_ANEXO);
  });

  it("recusa o upload do anexo para papel sem CRIAR_EDITAR (Leitura)", async () => {
    const contrato = await prisma.contratoComercial.findFirstOrThrow({ where: { empresaId } });
    await expect(
      enviarAnexoContrato(leitura, contrato.id, { nome: "x.pdf", conteudo: PDF_MINIMO }),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });

  // ---- Editar contato ----

  it("edita um contato existente (Gestor), e recusa a Leitura", async () => {
    const contato = await criarContato(gestor, empresaId, {
      papel: "COMERCIAL",
      nome: "Contato Original",
      email: "original@exemplo.local",
    });
    const atualizado = await atualizarContato(gestor, contato.id, {
      nome: "Contato Editado",
      cargo: "Diretor",
    });
    expect(atualizado.nome).toBe("Contato Editado");
    expect(atualizado.cargo).toBe("Diretor");

    await expect(
      atualizarContato(leitura, contato.id, { nome: "Invasor" }),
    ).rejects.toBeInstanceOf(ErroDeAutorizacao);
  });
});
