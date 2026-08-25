import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { calcularCompletudeCard } from "@/dominio/ofertas/regras";
import { pendenciasDeHoje } from "./dashboard";

/**
 * A régua da RN09 existe em DOIS lugares, e este teste é a cerca disso.
 *
 * `dominio/ofertas/regras.ts` a implementa como `calcularCompletudeCard` —
 * é ela que a T4 e a T5 exibem e que a RN02 usa para liberar publicação.
 * `infra/consultas/dashboard.ts` a **reimplementa inline**, em
 * `contarCadastrosBloqueandoPublicacao`, para contar rascunhos bloqueados
 * no painel sem instanciar a estrutura da regra por linha.
 *
 * A duplicação é dívida conhecida e está registrada no README. A extração
 * para fonte única **não** foi feita na F17, e por decisão: mexer no
 * cálculo que produz percentual em produção para arrumar arquitetura é
 * trocar um risco pequeno por um grande. O que resolve o risco real —
 * as duas listas divergirem em silêncio — é este teste.
 *
 * Ele monta a tabela-verdade completa: uma solução por item da régua, cada
 * uma faltando exatamente aquele item, mais uma completa. Se as duas
 * implementações discordarem em qualquer linha, a contagem do painel deixa
 * de bater com a contagem derivada do domínio, e aqui fica vermelho.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const SUFIXO = "[TESTE-F17-EQUIV]";

/** PNG mínimo válido — o suficiente para a régua enxergar "tem imagem". */
const PNG_MINIMO = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

/** Os oito itens da régua, e o que significa "faltar" cada um. */
type ItemFaltante =
  | "nomeFantasia"
  | "logo"
  | "nomeSolucao"
  | "descricaoCurta"
  | "categoria"
  | "culturas"
  | "cobertura"
  | "imagem"
  | "nenhum";

const CASOS: ReadonlyArray<ItemFaltante> = [
  "nenhum",
  "nomeFantasia",
  "logo",
  "nomeSolucao",
  "descricaoCurta",
  "categoria",
  "culturas",
  "cobertura",
  "imagem",
];

describe.skipIf(!temBanco)("RN09 — painel e domínio contam a mesma régua", () => {
  const prisma = new PrismaClient();
  const criadas: string[] = [];
  let baseDoPainel = 0;

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      // Pela razão social também: o caso "faltando nomeFantasia" grava
      // nome vazio e não seria encontrado pelo sufixo.
      where: {
        OR: [{ nomeFantasia: { contains: SUFIXO } }, { razaoSocial: { contains: SUFIXO } }],
      },
      select: { id: true },
    });
    const idsEmpresa = empresas.map((e) => e.id);
    const solucoes = await prisma.solucao.findMany({
      where: { OR: [{ empresaId: { in: idsEmpresa } }, { nome: { contains: SUFIXO } }] },
      select: { id: true },
    });
    const idsSolucao = solucoes.map((s) => s.id);
    await prisma.oferta.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.imagemSolucao.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: idsSolucao } } });
    await prisma.solucao.deleteMany({ where: { id: { in: idsSolucao } } });
    await prisma.marcaAliado.deleteMany({ where: { empresaId: { in: idsEmpresa } } });
    await prisma.empresa.deleteMany({ where: { id: { in: idsEmpresa } } });
  }

  /** Cria um rascunho de oferta com exatamente um item da régua faltando. */
  async function semear(falta: ItemFaltante): Promise<string> {
    const autor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    const categoria = await prisma.categoria.findFirstOrThrow();
    const cultura = await prisma.cultura.findFirstOrThrow();
    const mecanica = await prisma.mecanica.findFirstOrThrow();
    const tipoBeneficio = await prisma.tipoBeneficio.findFirstOrThrow();

    const empresa = await prisma.empresa.create({
      data: {
        // A coluna é NOT NULL: "faltar" aqui é string vazia, que é
        // exatamente o que a régua trata como ausente.
        nomeFantasia: falta === "nomeFantasia" ? "" : `${SUFIXO} ${falta}`,
        razaoSocial: `${SUFIXO} ${falta} LTDA`,
        estagio: "ALIADA_ATIVA",
      },
    });
    if (falta !== "logo") {
      await prisma.marcaAliado.create({
        data: {
          empresaId: empresa.id,
          conteudo: PNG_MINIMO,
          tipoMime: "image/png",
          bytes: PNG_MINIMO.length,
          hash: `hash-${empresa.id}`,
          nomeArquivo: "marca.png",
          autorId: autor.id,
        },
      });
    }

    const solucao = await prisma.solucao.create({
      data: {
        empresaId: empresa.id,
        nome: falta === "nomeSolucao" ? "" : `${SUFIXO} solução ${falta}`,
        descricaoCurta: falta === "descricaoCurta" ? null : "Descrição curta do card",
        categoriaId: falta === "categoria" ? null : categoria.id,
        coberturaNacional: falta !== "cobertura",
      },
    });
    if (falta !== "culturas") {
      await prisma.solucaoCultura.create({
        data: { solucaoId: solucao.id, culturaId: cultura.id },
      });
    }
    if (falta !== "imagem") {
      await prisma.imagemSolucao.create({
        data: {
          solucaoId: solucao.id,
          conteudo: PNG_MINIMO,
          tipoMime: "image/png",
          bytes: PNG_MINIMO.length,
          hash: `hash-img-${solucao.id}`,
          nomeArquivo: "card.png",
          autorId: autor.id,
        },
      });
    }

    await prisma.oferta.create({
      data: {
        solucaoId: solucao.id,
        titulo: `${SUFIXO} oferta ${falta}`,
        mecanicaId: mecanica.id,
        tipoBeneficioId: tipoBeneficio.id,
        natureza: "BENEFICIO",
        vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
        status: "RASCUNHO",
      },
    });
    criadas.push(empresa.id);
    return solucao.id;
  }

  /** A régua do DOMÍNIO, aplicada à mesma linha que o painel vê. */
  async function bloqueiaPeloDominio(solucaoId: string): Promise<boolean> {
    const solucao = await prisma.solucao.findUniqueOrThrow({
      where: { id: solucaoId },
      include: {
        culturas: true,
        ufs: true,
        imagemCard: { select: { solucaoId: true } },
        empresa: { include: { marca: { select: { empresaId: true } } } },
      },
    });
    const completude = calcularCompletudeCard({
      aliado: {
        nomeFantasia: solucao.empresa.nomeFantasia,
        temMarca: solucao.empresa.marca !== null,
        logoUrl: solucao.empresa.logoUrl,
      },
      solucao: {
        nome: solucao.nome,
        descricaoCurta: solucao.descricaoCurta,
        temCategoria: Boolean(solucao.categoriaId),
        quantidadeCulturas: solucao.culturas.length,
        coberturaNacional: solucao.coberturaNacional,
        quantidadeUfs: solucao.ufs.length,
        temImagem: solucao.imagemCard !== null,
        imagemCardUrl: solucao.imagemCardUrl,
      },
    });
    return !completude.completa;
  }

  async function contagemDoPainel(): Promise<number> {
    const pendencias = await pendenciasDeHoje();
    // Pela CHAVE, não pelo rótulo: rótulo é texto de produto e muda; a
    // chave é o contrato do catálogo de pendências (Onda 6).
    const incompletos = pendencias.find((p) => p.chave === "CADASTROS_INCOMPLETOS");
    expect(incompletos, "cartão CADASTROS_INCOMPLETOS no painel").toBeDefined();
    expect(incompletos?.indisponivel, "a contagem tem de existir").toBeUndefined();
    return incompletos?.contagem ?? -1;
  }

  beforeAll(async () => {
    await limpar();
    baseDoPainel = await contagemDoPainel();
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it.each(CASOS)("faltando %s: painel e domínio concordam", async (falta) => {
    const antes = await contagemDoPainel();
    const solucaoId = await semear(falta);

    const depois = await contagemDoPainel();
    const painelContou = depois - antes;
    const dominioDiz = (await bloqueiaPeloDominio(solucaoId)) ? 1 : 0;

    expect(painelContou, `item "${falta}"`).toBe(dominioDiz);
    // Não bloqueiam: o caso completo e os dois itens OPCIONAIS — imagem
    // (24/08) e descrição curta (25/08). Qualquer OBRIGATÓRIO ausente bloqueia.
    const opcionalOuCompleto =
      falta === "nenhum" || falta === "imagem" || falta === "descricaoCurta";
    expect(dominioDiz).toBe(opcionalOuCompleto ? 0 : 1);
  });

  it("a base do painel não ficou suja depois da tabela-verdade", async () => {
    await limpar();
    expect(await contagemDoPainel()).toBe(baseDoPainel);
  });

  it("24/08: imagem ausente não conta como bloqueada (item opcional)", async () => {
    // A imagem do card virou item opcional da RN09: uma solução completa em
    // tudo, menos a imagem, não é bloqueada — nem no painel nem no domínio.
    const antes = await contagemDoPainel();
    const solucaoId = await semear("imagem");
    expect(await contagemDoPainel(), "imagem ausente não soma ao painel").toBe(antes);
    expect(await bloqueiaPeloDominio(solucaoId), "imagem ausente não bloqueia o domínio").toBe(
      false,
    );
  });
});
