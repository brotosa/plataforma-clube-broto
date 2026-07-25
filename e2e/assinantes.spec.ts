import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { entrar, runId, semViolacoesAxe } from "./ajudantes";
import { gerarAssinantesSinteticos } from "../infra/assinantes/fixtures-sinteticas";

/**
 * E2e da F11 (critérios do prompt da Onda 5):
 *
 * 1. Fluxo incremental completo: importar arquivo sintético → mapear →
 *    política incremental → carteira → montar filtro → contagem →
 *    salvar segmento → exportar com finalidade → evento de auditoria
 *    conferido.
 * 2. Foto completa: arquivo parcial exige a confirmação em duas etapas
 *    mostrando quantos sairiam (cenário do desastre, RN29).
 *
 * As contagens esperadas vêm do MESMO gerador determinístico (semente
 * 21) usado pelo setup global — nenhum número inventado. Ajudantes
 * compartilhados da estabilização (entrar/axe/runId); axe-core roda nas
 * quatro telas novas e a T18 é verificada a 380px.
 */

const SINTETICOS = gerarAssinantesSinteticos(12, 21);
const ESPERADO_MT = SINTETICOS.filter((s) => s.uf === "MT").length;
// runId estável do globalSetup (padrão da estabilização): o sufixo não
// muda se um worker reiniciar no meio da cadeia serial.
const NOME_SEGMENTO = `Segmento E2E ${runId()}`;

/**
 * Varredura axe com a UI ASSENTADA: as transições do dseed-admin (160ms
 * em background/color) fazem o axe medir cores intermediárias e acusar
 * contraste falso — o chip do passo ativo da T20, por exemplo, mede
 * 3,14:1 no meio da transição e 4,88:1 assentado. `getAnimations()`
 * inclui transições CSS, então esperar nenhuma em execução é preciso
 * (sem sleep fixo). Mesma disciplina de "esperar o repintar" da
 * estabilização, aplicada ao que muda por transição.
 */
async function axeComUiAssentada(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      // O <title> do App Router é aplicado depois do commit da navegação;
      // varrer antes disso acusa "document-title" vazio (visto no CI lento).
      document.title.trim().length > 0 &&
      Array.from(document.querySelectorAll("*")).every((elemento) =>
        elemento
          .getAnimations()
          .every((animacao) => animacao.playState !== "running"),
      ),
  );
  await semViolacoesAxe(page);
}

/**
 * Semeadura idempotente do módulo (padrão dos ajudantes da estabilização):
 * o teste de importação zera a base antes de importar, para que o retry
 * encontre o mesmo estado inicial da primeira tentativa — sem isso, a
 * segunda tentativa veria "atualizados" onde a asserção espera "novos".
 */
async function zerarModuloAssinantes(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.atributoEnriquecimento.deleteMany({});
    await prisma.assinatura.deleteMany({});
    await prisma.exportacaoLista.deleteMany({});
    await prisma.segmento.deleteMany({});
    await prisma.stagingAssinante.deleteMany({});
    await prisma.assinante.deleteMany({});
    await prisma.importacao.deleteMany({
      where: { tipo: { in: ["ASSINANTES_NUCLEO", "ASSINANTES_ENRIQUECIMENTO"] } },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("F11 — fluxo incremental completo (T20 → T18 → T21 → exportação)", () => {
  test("gestor importa a base sintética pela T20 (família → arquivo → mapeamento → política → resumo)", async ({
    page,
  }) => {
    await zerarModuloAssinantes(); // idempotência do retry
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/assinantes/importacoes");
    await axeComUiAssentada(page);

    // Passo 1 — família (Base de assinantes já selecionada)
    await page.getByRole("button", { name: "Continuar" }).click();

    // Passo 2 — arquivo sintético gerado no setup global
    await page
      .locator("#arquivo-carga")
      .setInputFiles(path.join(process.cwd(), "e2e", ".tmp", "assinantes-nucleo.csv"));
    await page.getByRole("button", { name: "Mapear colunas" }).click();

    // Passo 3 — sugestão automática cobre o dicionário de exemplo
    await expect(page.getByText("Pré-visualização — 5 primeiras linhas")).toBeVisible();
    await expect(page.getByText("12 linhas · 7 colunas reconhecidas")).toBeVisible();
    await axeComUiAssentada(page);
    await page.getByRole("button", { name: "Escolher política" }).click();

    // Passo 4 — política incremental (padrão da RN29)
    await expect(
      page.getByText("A ausência de um CPF no arquivo não inativa ninguém por padrão"),
    ).toBeVisible();
    await expect(page.getByText("12 novos · 0 atualizados · 0 em quarentena")).toBeVisible();
    await axeComUiAssentada(page);
    await page.getByRole("button", { name: "Processar carga" }).click();

    // Passo 5 — resumo real da efetivação
    await expect(page.getByText("assinantes criados")).toBeVisible();
    await expect(page.getByText("Nenhuma linha em quarentena nesta carga.")).toBeVisible();
    await axeComUiAssentada(page);
  });

  test("carteira nasce mascarada, contagem viva reage ao filtro e RN36 nunca estima", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/assinantes");

    // Base completa na contagem viva e CPFs mascarados na tabela.
    await expect(page.locator(".viva-n")).toHaveText("12");
    await expect(
      page.getByText("assinantes na base — nenhum filtro aplicado"),
    ).toBeVisible();
    await expect(page.getByText(/CPF \*\*\*\.___\.\*\*\*-\d{2}/).first()).toBeVisible();
    await axeComUiAssentada(page);

    // Regra UF é MT → contagem esperada do gerador determinístico.
    await page.getByRole("button", { name: "+ Adicionar regra" }).click();
    await page.getByLabel("Campo da regra 1").selectOption("uf");
    await page.getByLabel("Valor da regra 1").selectOption("MT");
    await expect(page.locator(".viva-n")).toHaveText(String(ESPERADO_MT));
    await expect(page.getByText("assinantes correspondem aos filtros")).toBeVisible();

    // Regra de uso em 90 dias: contagem INDISPONÍVEL, nunca estimada.
    await page.getByRole("button", { name: "+ Adicionar regra" }).click();
    await page.getByLabel("Campo da regra 2").selectOption("uso-90-dias");
    await expect(page.getByText(/contagem indisponível/)).toBeVisible();
    await expect(page.locator(".viva").getByText("aguardando telemetria por assinante")).toBeVisible();
    await page.getByRole("button", { name: "Remover regra 2" }).click();
    await expect(page.locator(".viva-n")).toHaveText(String(ESPERADO_MT));
  });

  test("filtro vira segmento salvo e a T21 recalcula a contagem", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/assinantes");
    await page.getByRole("button", { name: "+ Adicionar regra" }).click();
    await page.getByLabel("Campo da regra 1").selectOption("uf");
    await page.getByLabel("Valor da regra 1").selectOption("MT");
    await expect(page.locator(".viva-n")).toHaveText(String(ESPERADO_MT));

    await page.getByRole("button", { name: "Salvar como segmento" }).click();
    await page.getByLabel("Nome do segmento").fill(NOME_SEGMENTO);
    await page.getByRole("button", { name: "Salvar segmento" }).last().click();
    await expect(page.getByText("Segmento salvo — disponível em Segmentos salvos")).toBeVisible();

    await page.goto("/assinantes/segmentos");
    await expect(page.getByRole("heading", { name: NOME_SEGMENTO })).toBeVisible();
    const cartao = page.locator(".pm-card", { hasText: NOME_SEGMENTO });
    await expect(cartao.getByText("UF é MT")).toBeVisible();
    await expect(cartao.locator(".kpi-n")).toHaveText(String(ESPERADO_MT));
    await expect(cartao.getByText("assinantes hoje")).toBeVisible();
    await axeComUiAssentada(page);
  });

  test("exportação exige finalidade, baixa o snapshot e o evento de auditoria fica conferível", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(
      `/assinantes?regras=${encodeURIComponent(JSON.stringify([{ campo: "uf", operador: "e", valor: "MT" }]))}`,
    );
    await expect(page.locator(".viva-n")).toHaveText(String(ESPERADO_MT));

    await page.getByRole("button", { name: "Exportar lista" }).first().click();
    const confirmar = page.getByRole("dialog").getByRole("button", { name: "Exportar lista" });
    // Sem finalidade, o botão fica bloqueado (RN34).
    await expect(confirmar).toBeDisabled();
    await page
      .getByLabel(/Finalidade da exportação/)
      .fill("Convite sintético do e2e — lista para o time de relacionamento");
    const aguardaDownload = page.waitForEvent("download");
    await confirmar.click();
    const download = await aguardaDownload;
    expect(download.suggestedFilename()).toMatch(/^lista-contato-.+\.csv$/);

    // Evento de auditoria conferido (RN34): finalidade + contagem gravadas.
    const prisma = new PrismaClient();
    try {
      const exportacao = await prisma.exportacaoLista.findFirstOrThrow({
        orderBy: { criadoEm: "desc" },
      });
      expect(exportacao.finalidade).toContain("Convite sintético do e2e");
      expect(exportacao.contagem).toBe(ESPERADO_MT);
      const evento = await prisma.auditoriaEvento.findFirst({
        where: { entidade: "exportacao_lista", entidadeId: exportacao.id },
      });
      expect(evento).not.toBeNull();
      expect(evento?.valorNovo).toContain("Convite sintético do e2e");
    } finally {
      await prisma.$disconnect();
    }
  });

  test("perfil mascarado por padrão; exibição plena com aviso de auditoria (T19)", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/assinantes");
    await page.getByRole("row").nth(1).click();
    await page.waitForURL(/\/assinantes\/[a-z0-9]+$/);

    await expect(page.getByText(/\*\*\*\.___\.\*\*\*-\d{2}/)).toBeVisible();
    await expect(page.getByText("CPF e contato mascarados.")).toBeVisible();
    await expect(page.getByText("aguardando telemetria por assinante")).toBeVisible();
    await expect(page.getByText("origem do dado em definição")).toBeVisible();
    await axeComUiAssentada(page);

    // A exibição plena é uma NAVEGAÇÃO (o servidor decide a máscara e audita
    // o acesso, RN30): esperar a URL com ?plenos=1 antes de asserir — sem
    // isso, no runner lento a asserção corre contra o DOM mascarado anterior.
    await page.getByRole("link", { name: "Exibir dados plenos" }).click();
    // toHaveURL (e não waitForURL): a navegação do App Router é soft — não
    // dispara "load", então esperar por lifecycle estoura o timeout. Aqui
    // basta observar a URL assentar antes de asserir o conteúdo.
    await expect(page).toHaveURL(/\?plenos=1$/);
    await expect(
      page.getByText("Exibição plena de dados pessoais — este acesso gerou evento de auditoria"),
    ).toBeVisible();
    await expect(page.getByText(/\d{3}\.\d{3}\.\d{3}-\d{2}/).first()).toBeVisible();
    await axeComUiAssentada(page);
  });

  test("papel Leitura consulta contagens mas não vê alternância de dados plenos", async ({
    page,
  }) => {
    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/assinantes");
    await expect(page.locator(".viva-n")).toHaveText("12");
    await expect(
      page.getByText(
        "Exibição plena de CPF e contato depende da permissão “visualizar dados pessoais plenos”.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Exibir dados plenos" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Exportar lista" })).toHaveCount(0);
  });

  test("T18 consultável a 380px: contagem viva e construtor operáveis", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/assinantes");
    await expect(page.locator(".viva-n")).toHaveText("12");
    await page.getByRole("button", { name: "+ Adicionar regra" }).click();
    await page.getByLabel("Campo da regra 1").selectOption("uf");
    await page.getByLabel("Valor da regra 1").selectOption("MT");
    await expect(page.locator(".viva-n")).toHaveText(String(ESPERADO_MT));
    await axeComUiAssentada(page);
  });
});

test.describe.serial("F11 — foto completa em duas etapas (cenário do desastre, RN29)", () => {
  test("arquivo parcial como foto completa exige o texto digitado mostrando quantos sairiam", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/assinantes/importacoes");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page
      .locator("#arquivo-carga")
      .setInputFiles(path.join(process.cwd(), "e2e", ".tmp", "assinantes-parcial.csv"));
    await page.getByRole("button", { name: "Mapear colunas" }).click();
    await page.getByRole("button", { name: "Escolher política" }).click();

    // Troca para foto completa: o dry-run mostra QUANTOS sairiam.
    await page.getByRole("radio", { name: /Foto completa/ }).check();
    await expect(page.getByText(`${12 - 2} assinante(s)`)).toBeVisible();
    await expect(page.getByText(/seriam marcados como “fora da base”/)).toBeVisible();

    // Sem o texto exato, o processamento fica bloqueado.
    const processar = page.getByRole("button", { name: "Processar carga" });
    await expect(processar).toBeDisabled();
    await page.getByRole("textbox", { name: "Confirmação" }).fill("CONFIRMO");
    await expect(processar).toBeDisabled();

    // Com o texto exato, processa e reporta os que saíram.
    await page.getByRole("textbox", { name: "Confirmação" }).fill("foto completa");
    await expect(processar).toBeEnabled();
    await processar.click();
    await expect(
      page.getByText(/Foto completa confirmada: 10 assinante\(s\) marcados como “fora da base”/),
    ).toBeVisible();

    // A carteira passa a contar somente os 2 do arquivo.
    await page.goto("/assinantes");
    await expect(page.locator(".viva-n")).toHaveText("2");
  });
});
