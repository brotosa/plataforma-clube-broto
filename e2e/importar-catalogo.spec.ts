import { expect, test } from "@playwright/test";
import { cnpjDeNome, entrar, prisma, runId, semearAliadoAtivoComContrato, semearSolucaoCompleta, semViolacoesAxe } from "./ajudantes";

/**
 * Importação de catálogo por planilha (soluções e ofertas). Valida as telas
 * novas de ponta a ponta — upload real de uma planilha CSV, tela de
 * conferência e acessibilidade AAA (axe) nas duas etapas. Cada teste semeia
 * sua própria precondição (aliado ativo / solução) direto no banco.
 */

const GESTOR = "gestor@dev.clubebroto.local";

test.describe("importar soluções (/aliados/importar-solucoes)", () => {
  test("tela de envio e conferência são acessíveis e criam a solução", async ({ page }) => {
    const nome = `Zimpsol${runId()} Agro`;
    await semearAliadoAtivoComContrato(nome);
    const cnpj = cnpjDeNome(nome);

    await entrar(page, GESTOR);
    await page.goto("/aliados/importar-solucoes");

    // Tela 1 — envio.
    await expect(page.getByRole("heading", { level: 1, name: "Importar soluções" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Baixar modelo/ })).toBeVisible();
    await semViolacoesAxe(page);

    // Sobe uma planilha mínima (só CNPJ + nome; demais campos vazios não bloqueiam).
    const csv =
      "CNPJ do Aliado;Nome da Solução;Descrição Curta;Descrição Completa;Categoria;Link Externo;Culturas Atendidas;Cobertura\n" +
      `${cnpj};${nome} Solução Importada;;;;;;\n`;
    await page.setInputFiles("#arquivo-solucoes", {
      name: "solucoes.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    await page.getByRole("button", { name: "Enviar e conferir" }).click();

    // Tela 2 — conferência.
    await page.waitForURL(/\/aliados\/importar-solucoes\?lote=/);
    await expect(page.getByRole("heading", { level: 1, name: "Conferência da importação" })).toBeVisible();
    await expect(
      page.getByRole("group", { name: /Linhas da importação/ }).getByText("criar", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Efetivar/ })).toBeVisible();
    await semViolacoesAxe(page);
  });
});

test.describe("importar ofertas (/ofertas/importar)", () => {
  test("tela de envio e conferência são acessíveis e a oferta aponta a solução por ID", async ({ page }) => {
    const nome = `Zimpof${runId()} Agro`;
    const empresa = await semearAliadoAtivoComContrato(nome);
    const solucao = await semearSolucaoCompleta(empresa.id, `${nome} Solução`);
    const tipo = await prisma.tipoBeneficio.findFirstOrThrow({ where: { slug: { not: "GRATUIDADE" } } });
    const mecanica = await prisma.mecanica.findFirstOrThrow();

    await entrar(page, GESTOR);
    await page.goto("/ofertas/importar");

    await expect(page.getByRole("heading", { level: 1, name: "Importar ofertas" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Baixar modelo/ })).toBeVisible();
    await semViolacoesAxe(page);

    const csv =
      "ID Oferta;ID Solução;Título;Natureza;Tipo de Benefício;Mecânica de Resgate;Preço De;Preço Por;Código/Regras do Cupom;Modalidade de Pagamento;Instruções Pós-Voucher;Vigência Início;Vigência Fim;Limite de Resgates\n" +
      `;${solucao.id};${nome} Oferta Importada;Benefício;${tipo.nome};${mecanica.nome};11,90;10,11;;Única;;05/08/2026;;9999\n`;
    await page.setInputFiles("#arquivo-ofertas", {
      name: "ofertas.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    await page.getByRole("button", { name: "Enviar e conferir" }).click();

    await page.waitForURL(/\/ofertas\/importar\?lote=/);
    await expect(page.getByRole("heading", { level: 1, name: "Conferência da importação" })).toBeVisible();
    await expect(
      page.getByRole("group", { name: /Linhas da importação/ }).getByText("criar", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Efetivar/ })).toBeVisible();
    await semViolacoesAxe(page);
  });
});
