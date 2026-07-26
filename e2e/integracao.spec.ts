import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { entrar, resolverDatabaseUrl } from "./ajudantes";

/**
 * Ciclo da F4 pela interface: publicar catálogo → importar telemetria →
 * conferir agregados (RN07) + axe nas telas novas. As linhas de telemetria
 * são SINTÉTICAS (nome do arquivo marcado; CPF fictício que reprova o dígito
 * verificador) e nunca entram na demo/seed — só exercitam o parser.
 *
 * Critério "pronto" da F4: ciclo publicar → telemetria → agregados verde.
 *
 * IDs estáveis: o prefixo de voucher já é fixo (não deriva de Date.now()),
 * então a suíte é idempotente entre execuções. Resolve DATABASE_URL e
 * reaproveita `entrar` do ajudante compartilhado.
 */

resolverDatabaseUrl();

const PREFIXO_VOUCHER = "E2E-F4-";
const ARQUIVO_SINTETICO = "[SINTETICO] telemetria_uso_e2e.csv";
const CPF_SINTETICO = "111.111.111-11"; // reprova o dígito verificador

// PrismaClient próprio: esta suíte o desconecta no afterAll; manter local
// evita fechar o cliente compartilhado dos ajudantes usado por outras specs.
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

async function enviarFixture(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: ARQUIVO_SINTETICO,
    mimeType: "text/csv",
    buffer: Buffer.from(csvSintetico(idExterno), "utf8"),
  });
  // Aguarda a RESPOSTA da server action (POST) e recarrega. A mensagem de
  // sucesso vive em estado efêmero (useActionState) e, no upload de arquivo
  // sob runner lento, ora não repintava, ora era varrida pelo revalidatePath
  // — origem de flakiness. Recarregar assenta o histórico (persistido no
  // banco), que é o sinal DURÁVEL usado nas asserções abaixo.
  await Promise.all([
    page.waitForResponse(
      (resposta) => resposta.request().method() === "POST" && resposta.status() === 200,
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Importar arquivo" }).click(),
  ]);
  await page.reload();
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
    await entrar(page, "gestor@dev.clubebroto.local");
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
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ofertas/telemetria");
    await page.waitForLoadState("networkidle");
    await enviarFixture(page);
    // Sinal DURÁVEL: o histórico (renderizado do banco após o reload) traz o
    // arquivo com as pílulas — 3 importadas e 1 em quarentena. Evita o estado
    // efêmero do useActionState, que era instável no upload sob runner lento.
    const cartaoImportacao = page.locator(".card", { hasText: ARQUIVO_SINTETICO }).first();
    await expect(cartaoImportacao.getByText("3 importadas")).toBeVisible();
    await expect(cartaoImportacao.getByText("1 em quarentena")).toBeVisible();

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
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ofertas/telemetria");
    await page.waitForLoadState("networkidle");
    // Baseline persistido pela importação anterior (fato imutável — RN07).
    const antes = await prisma.telemetriaEvento.count({ where: { ofertaId } });
    expect(antes).toBe(3);
    await enviarFixture(page);
    // Sinal DURÁVEL no histórico: a reimportação registra 0 importadas…
    const cartaoReimportacao = page.locator(".card", { hasText: ARQUIVO_SINTETICO }).first();
    await expect(cartaoReimportacao.getByText("0 importadas")).toBeVisible();
    // …e o invariante RN07: a contagem de eventos NÃO muda (nada duplica).
    await expect
      .poll(() => prisma.telemetriaEvento.count({ where: { ofertaId } }))
      .toBe(antes);
  });

  test("axe-core sem violações nas telas de integração", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    for (const rota of ["/ofertas", "/ofertas/publicacao", "/ofertas/telemetria"]) {
      await page.goto(rota);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      // Espera a UI assentar antes de medir (disciplina da F11): as
      // transições de 160ms do dseed-admin fazem o axe ler cores
      // intermediárias — o botão azul mede 4,3:1 no meio da transição e
      // 4,6:1 assentado, e a varredura acusava contraste falso.
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll("*")).every((elemento) =>
          elemento.getAnimations().every((animacao) => animacao.playState !== "running"),
        ),
      );
      const resultado = await new AxeBuilder({ page }).analyze();
      expect(resultado.violations, `axe em ${rota}`).toEqual([]);
    }
  });
});
