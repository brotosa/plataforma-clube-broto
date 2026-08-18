import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { listarAliados } from "./aliados";

/**
 * Item 4 (Dashboard) — o cartão "Cadastros incompletos" recorta a lista de
 * aliados com `completude=incompletos`. O filtro roda no banco
 * (`filtroCadastroIncompletoPrisma`), enquanto a régua exibida na T1 roda em
 * JS (`calcularCompletudeAliado`). Este arquivo é a cerca contra a
 * DIVERGÊNCIA entre os dois: para cada aliado semeado, estar no recorte de
 * "incompletos" tem de ser exatamente equivalente a ter completude < 100.
 *
 * Se alguém mudar um dos lados (um item novo na régua, um `OR` a mais no
 * predicado) sem mexer no outro, um destes casos passa a discordar e o teste
 * quebra — que é o ponto.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

describe.skipIf(!temBanco)("Item 4 — filtro de cadastro incompleto (banco × régua em JS)", () => {
  const prisma = new PrismaClient();
  const PREFIXO = "[TESTE-COMPLETUDE]";

  async function limpar() {
    const empresas = await prisma.empresa.findMany({
      where: { nomeFantasia: { startsWith: PREFIXO } },
      select: { id: true },
    });
    const ids = empresas.map((empresa) => empresa.id);
    await prisma.contratoComercial.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.contatoEmpresa.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
  }

  async function criar(nome: string, indice: number, faltando: string | null) {
    const categoria = await prisma.categoria.findFirstOrThrow();
    // CNPJ único e sintético (só dígitos): a coluna é @unique; nenhum valor
    // é de empresa real.
    const cnpj = `99${String(indice).padStart(12, "0")}`;
    // Base COMPLETA; cada caso remove exatamente um item da régua.
    return prisma.empresa.create({
      data: {
        nomeFantasia: `${PREFIXO} ${nome}`,
        razaoSocial: faltando === "razaoSocial" ? null : `${nome} LTDA`,
        cnpj: faltando === "cnpj" ? null : cnpj,
        estagio: "ALIADA_ATIVA",
        enderecoMunicipio: faltando === "endereco" ? null : "Curitiba",
        logoUrl: faltando === "marca" ? null : "s3://logos/completude.svg",
        descricaoInstitucional: faltando === "descricao" ? null : "Aliado de teste da completude.",
        categorias: faltando === "categoria" ? undefined : { create: [{ categoriaId: categoria.id }] },
        contatos:
          faltando === "contato"
            ? undefined
            : { create: [{ papel: "COMERCIAL", nome: "Contato", email: "c@teste.local" }] },
        contratos:
          faltando === "contrato"
            ? undefined
            : {
                create: [
                  {
                    status: "VIGENTE",
                    ambientesPagamento: "AMBOS",
                    vigenciaBase: new Date("2026-01-01T00:00:00Z"),
                  },
                ],
              },
      },
    });
  }

  beforeAll(async () => {
    await limpar();
    // Um COMPLETO (100 — o predicado tem de EXCLUIR) e seis incompletos, cada
    // um faltando um item diferente da régua.
    await criar("Completo", 1, null);
    await criar("Sem razao", 2, "razaoSocial");
    await criar("Sem cnpj", 3, "cnpj");
    await criar("Sem endereco", 4, "endereco");
    await criar("Sem marca", 5, "marca");
    await criar("Sem categoria", 6, "categoria");
    await criar("Sem contrato", 7, "contrato");
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("estar no recorte de incompletos equivale a completude < 100, aliado a aliado", async () => {
    const todos = await listarAliados({ tamanho: 500 });
    const incompletos = await listarAliados({ completude: "incompletos", tamanho: 500 });
    const idsIncompletos = new Set(incompletos.linhas.map((linha) => linha.id));

    const semeados = todos.linhas.filter((linha) => linha.nomeFantasia.startsWith(PREFIXO));
    expect(semeados.length).toBe(7);

    for (const linha of semeados) {
      expect(
        idsIncompletos.has(linha.id),
        `${linha.nomeFantasia}: recorte(${idsIncompletos.has(linha.id)}) × completude ${linha.completude}`,
      ).toBe(linha.completude < 100);
    }

    // O predicado discrimina: exclui o completo (100) e inclui os seis demais.
    const completo = semeados.find((l) => l.nomeFantasia.endsWith("Completo"));
    expect(completo?.completude).toBe(100);
    expect(idsIncompletos.has(completo!.id)).toBe(false);
    expect(semeados.filter((l) => idsIncompletos.has(l.id)).length).toBe(6);
  });
});
