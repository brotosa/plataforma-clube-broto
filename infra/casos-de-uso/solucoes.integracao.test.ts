import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { atualizarSolucao } from "./solucoes";

/**
 * F17 (RN60) — a coluna obsoleta não pode ser apagada por edição.
 *
 * `solucoes.imagem_card_url` deixou de ser escrita, mas continua sendo a
 * retaguarda de leitura das soluções cadastradas antes desta onda: é ela
 * que sustenta o ponto da régua RN09 que essas soluções já tinham.
 *
 * O risco é concreto e quase passou: o campo saiu do formulário, e o
 * ajudante `texto()` devolve `null` para campo ausente. Se a chave tivesse
 * ficado no objeto que a ação monta, cada edição de nome ou de descrição
 * gravaria `imagemCardUrl: null` e derrubaria o ponto — percentual mudando
 * em produção por causa de uma edição de texto qualquer.
 *
 * Este teste prende a propriedade no nível do caso de uso: atualizar sem
 * mencionar o campo deixa o valor onde está.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const SUFIXO = "[TESTE-F17-COLUNA]";
const LEGADO = "s3://cards/legado-da-producao.png";

describe.skipIf(!temBanco)("RN60 — a retaguarda da coluna obsoleta sobrevive à edição", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };
  let solucaoId = "";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { contains: SUFIXO } },
      select: { id: true },
    });
    const ids = empresas.map((e) => e.id);
    const solucoes = await prisma.solucao.findMany({
      where: { empresaId: { in: ids } },
      select: { id: true },
    });
    const idsSolucao = solucoes.map((s) => s.id);
    await prisma.imagemSolucao.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: [...idsSolucao, ...ids] } } });
    await prisma.solucao.deleteMany({ where: { id: { in: idsSolucao } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  beforeEach(async () => {
    await limpar();
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    gestor = { id: usuario.id, papel: "GESTOR" };
    const empresa = await prisma.empresa.create({
      data: { nomeFantasia: `${SUFIXO} aliado`, estagio: "ALIADA_ATIVA" },
    });
    const solucao = await prisma.solucao.create({
      data: {
        empresaId: empresa.id,
        nome: `${SUFIXO} solução legada`,
        // O estado de uma solução cadastrada antes da F17.
        imagemCardUrl: LEGADO,
      },
    });
    solucaoId = solucao.id;
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("editar outros campos não apaga o endereço legado", async () => {
    await atualizarSolucao(gestor, solucaoId, {
      nome: `${SUFIXO} solução renomeada`,
      descricaoCurta: "Descrição nova",
    });

    const depois = await prisma.solucao.findUniqueOrThrow({ where: { id: solucaoId } });
    expect(depois.nome).toBe(`${SUFIXO} solução renomeada`);
    expect(depois.imagemCardUrl, "o endereço legado tem de continuar lá").toBe(LEGADO);
  });

  it("editar duas vezes seguidas também não apaga", async () => {
    await atualizarSolucao(gestor, solucaoId, { descricaoCurta: "Primeira" });
    await atualizarSolucao(gestor, solucaoId, { descricaoCurta: "Segunda" });
    const depois = await prisma.solucao.findUniqueOrThrow({ where: { id: solucaoId } });
    expect(depois.imagemCardUrl).toBe(LEGADO);
  });

  it("a ação da tela não monta a chave da coluna obsoleta", async () => {
    // Cerca no código, além da cerca no comportamento: se alguém devolver
    // `imagemCardUrl` ao objeto do formulário, os dois testes acima só
    // quebram quando houver banco. Este quebra sempre.
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("app/(plataforma)/aliados/[id]/solucoes/acoes.ts", "utf8");
    const montagem = fonte.slice(
      fonte.indexOf("function dadosSolucaoDoFormulario"),
      fonte.indexOf("export async function acaoCriarSolucao"),
    );
    expect(montagem.length).toBeGreaterThan(100);
    expect(montagem).not.toContain('texto(dados, "imagemCardUrl")');
  });
});
