import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

/**
 * Ciclo da F4 pela interface: publicar catálogo → importar telemetria →
 * conferir agregados (RN07) + axe nas telas novas. As linhas de telemetria
 * são SINTÉTICAS (nome do arquivo marcado; CPF fictício que reprova o dígito
 * verificador) e nunca entram na demo/seed — só exercitam o parser.
 *
 * Critério "pronto" da F4: ciclo publicar → telemetria → agregados verde.
 */

function resolverDatabaseUrl() {
  if (process.env.DATABASE_URL) return;
  try {
    const env = readFileSync(".env", "utf8");
    const linha = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (linha) {
      process.env.DATABASE_URL = linha.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
    }
  } catch {
    /* sem banco: os testes serão pulados */
  }
}

resolverDatabaseUrl();

const SENHA = process.env.SENHA_USUARIOS_DEV ?? "clube-broto-dev";
const PREFIXO_VOUCHER = "E2E-F4-";
const ARQUIVO_SINTETICO = "[SINTETICO] telemetria_uso_e2e.csv";
const CPF_SINTETICO = "111.111.111-11"; // reprova o dígito verificador

const prisma = new PrismaClient();
let ofertaId = "";
let idExterno = "";
let semDados = false;

function csvSintetico(id: string): string {
  return [
    "data_hora_evento;cpf_assinante;id_seller;id_oferta;id_voucher;tipo_evento;valor_transacao;canal",
    `2026-07-20T10:00:00;${CPF_SINTETICO};S;${id};${PREFIXO_VOUCHER}1;emissao_voucher;;app`,
    `2026-07-20T11:00:00;${CPF_SINTETICO};S;${id};${PREFIXO_VOUCHER}1;resgate_voucher;;app`,
    `2026-07-20T12:00:00;${CPF_SINTETICO};S;${id};${PREFIXO_VOUCHER}1;compra_confirmada;99.90;web`,
    `2026-07-20T13:00:00;${CPF_SINTETICO};S;${id};${PREFIXO_VOUCHER}9;reembolso;;web`,
  ].join("\n");
}

async function entrarComoGestor(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill("gestor@dev.clubebroto.local");
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/aliados");
}

async function enviarFixture(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: ARQUIVO_SINTETICO,
    mimeType: "text/csv",
    buffer: Buffer.from(csvSintetico(idExterno), "utf8"),
  });
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  // Aguarda a server action + revalidação concluírem antes de ler o status.
  await page.waitForLoadState("networkidle");
}

test.describe.serial("F4 — publicar → telemetria → agregados", () => {
  test.beforeAll(async () => {
    await prisma.telemetriaEvento.deleteMany({
      where: { idVoucher: { startsWith: PREFIXO_VOUCHER } },
    });
    const oferta = await prisma.oferta.findFirst({
      where: { status: "PUBLICADA", idExternoMinutrade: { not: null } },
      select: { id: true, idExternoMinutrade: true },
    });
    if (!oferta?.idExternoMinutrade) {
      semDados = true;
      return;
    }
    ofertaId = oferta.id;
    idExterno = oferta.idExternoMinutrade;
  });

  test.afterAll(async () => {
    await prisma.telemetriaEvento.deleteMany({
      where: { idVoucher: { startsWith: PREFIXO_VOUCHER } },
    });
    await prisma.$disconnect();
  });

  test("publicar catálogo gera o pacote e registra no histórico", async ({ page }) => {
    test.skip(semDados, "carga inicial não efetivada: sem oferta publicada com id externo");
    await entrarComoGestor(page);
    page.on("dialog", (dialogo) => dialogo.accept());
    await page.goto("/ofertas/publicacao");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Gerar pacote de publicação" }).click();
    await expect(page.getByText(/Pacote gerado/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("GenericJsonCsvAdapter").first()).toBeVisible();
  });

  test("importar telemetria reporta importados e quarentena; agregado aparece na oferta", async ({
    page,
  }) => {
    test.skip(semDados, "sem base real");
    await entrarComoGestor(page);
    await page.goto("/ofertas/telemetria");
    await page.waitForLoadState("networkidle");
    await enviarFixture(page);
    // A mensagem de resultado é o <p role="status"> (o histórico também traz
    // "em quarentena" em pílulas — por isso escopamos ao status).
    const status = page.locator('p[role="status"]');
    await expect(status).toContainText("3 eventos importados", { timeout: 30_000 });
    await expect(status).toContainText("1 em quarentena");

    // Conferir agregados na oferta (derivam só dos eventos importados — RN07)
    await page.goto(`/ofertas/${ofertaId}`);
    await expect(
      page.getByText("Telemetria por oferta (somente leitura — RN07)"),
    ).toBeVisible();
    await expect(page.getByText(/Receita confirmada/)).toBeVisible();
    await expect(page.getByText(/99,90/)).toBeVisible();
  });

  test("reimportar o mesmo arquivo é idempotente (nada duplica — RN07)", async ({ page }) => {
    test.skip(semDados, "sem base real");
    await entrarComoGestor(page);
    await page.goto("/ofertas/telemetria");
    await page.waitForLoadState("networkidle");
    await enviarFixture(page);
    const status = page.locator('p[role="status"]');
    await expect(status).toContainText("0 eventos importados", { timeout: 30_000 });
    await expect(status).toContainText("3 duplicados");
  });

  test("axe-core sem violações nas telas de integração", async ({ page }) => {
    await entrarComoGestor(page);
    for (const rota of ["/ofertas", "/ofertas/publicacao", "/ofertas/telemetria"]) {
      await page.goto(rota);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      const resultado = await new AxeBuilder({ page }).analyze();
      expect(resultado.violations, `axe em ${rota}`).toEqual([]);
    }
  });
});
