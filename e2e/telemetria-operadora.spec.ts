import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { entrar, prisma, runId, semViolacoesAxe } from "./ajudantes";

/**
 * Onda 12 (F20) — T34 fim a fim.
 *
 * O que estes testes cobrem e os de integração não: que a esteira chega à
 * TELA. Envio de arquivo real de catálogo com o layout reconhecido pelo
 * cabeçalho, o aviso de reimportação (que é fato a informar, não silêncio),
 * as divergências exibidas como relato, e a leitura sem permissão de envio
 * não vendo o campo de arquivo.
 *
 * **Só arquivos de catálogo aqui.** Os nominais não existem no
 * repositório e nunca existirão (ficha §7) — o caminho nominal é
 * exercitado por fixture sintética nos testes de integração.
 */

const MARCA = "[E2E-F20]";
// `process.cwd()` e não `import.meta`: o runner do Playwright carrega os
// specs como CommonJS (ver `e2e/assinantes.spec.ts`, mesmo padrão).
const RAIZ = process.cwd();

async function limpar() {
  const importacoes = await prisma.importacaoTelemetria.findMany({
    where: { nomeArquivo: { contains: "E2E-F20" } },
    select: { id: true },
  });
  const ids = importacoes.map((i) => i.id);
  await prisma.eventoDeResgateTelemetria.deleteMany({ where: { importacaoId: { in: ids } } });
  await prisma.contadorDeOfertaTelemetria.deleteMany({ where: { importacaoId: { in: ids } } });
  await prisma.divergenciaDeCatalogo.deleteMany({ where: { importacaoId: { in: ids } } });
  await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
  await prisma.importacaoTelemetria.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Um CSV de catálogo de ofertas, com id irreconhecível de propósito: a
 * oferta não existe no cadastro, então a importação relata divergência —
 * que é o que a RN70 contrata — sem tocar em nada.
 */
function csvDeOfertas(sufixo: string): Buffer {
  const cabecalho =
    ",Id do Seller,Seller,Id da Oferta,Status da Oferta,Produto,CheckOut," +
    "Preço do Produto,Desconto,Preço Final do Produto,Data da Oferta,Resgates,Compras";
  const linha = [
    "1",
    `seller-${sufixo}`,
    "Seller do e2e",
    `oferta-${sufixo}`,
    "Oferta Ativa",
    "Produto do e2e",
    "Recompensa gratuita",
    "0",
    "0",
    "0",
    "2026-07-20",
    "12",
    "3",
  ].join(",");
  return Buffer.from(`${cabecalho}\n${linha}\n`, "utf8");
}

test.afterAll(async () => {
  await limpar();
});

test("T34 — envia o catálogo real, detecta o layout pelo cabeçalho e mostra o resultado", async ({
  page,
}) => {
  await limpar();
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/ofertas/telemetria-operadora");

  await expect(
    page.getByRole("heading", { name: "Telemetria da operadora", level: 1 }),
  ).toBeVisible();

  // A amostra REAL de `dados/` — 46 sellers, com emoji no status.
  await page.setInputFiles("#arquivo-telemetria-operadora", {
    name: `${MARCA} Lista_de_Sellers_1.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: readFileSync(join(RAIZ, "dados", "Lista_de_Sellers_1.xlsx")),
  });
  await page.getByRole("button", { name: "Enviar relatório" }).click();

  // O nome do arquivo diz "Sellers", mas quem decidiu foi o cabeçalho.
  await expect(page.getByRole("status")).toContainText("catálogo de sellers");
  await expect(page.getByRole("status")).toContainText("linha(s) lida(s)");

  // E o histórico passa a listar a importação, com autor e retrato —
  // **depois de uma recarga**, deliberadamente.
  //
  // A confirmação acima é estado do próprio componente e chega sempre. Já
  // a tabela é renderizada no servidor e depende da re-renderização
  // pousar, que é justamente o payload que a F17 mediu sendo descartado
  // (~5 em 30, README: "O payload da ação que às vezes é descartado").
  // Sem a recarga este teste ficaria intermitente — e o defeito que ele
  // acusaria não seria da F20. Segue afirmando O QUÊ; deixa de afirmar o
  // QUANDO, e o porquê está escrito aqui.
  await page.reload();
  const linha = page.getByRole("row").filter({ hasText: "Lista_de_Sellers_1.xlsx" });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("Catálogo de sellers");

  await semViolacoesAxe(page);
});

test("T34 — reenviar o mesmo arquivo avisa que já havia entrado, sem duplicar", async ({
  page,
}) => {
  await limpar();
  const sufixo = runId();
  const arquivo = {
    name: `${MARCA} Lista_de_Ofertas_7.csv`,
    mimeType: "text/csv",
    buffer: csvDeOfertas(sufixo),
  };

  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/ofertas/telemetria-operadora");

  await page.setInputFiles("#arquivo-telemetria-operadora", arquivo);
  await page.getByRole("button", { name: "Enviar relatório" }).click();
  await expect(page.getByRole("status")).toContainText("catálogo de ofertas");

  // O MESMO conteúdo, com outro nome — o sufixo da operadora muda a cada
  // geração, e é por isso que a identidade é o conteúdo, não o nome.
  await page.setInputFiles("#arquivo-telemetria-operadora", {
    ...arquivo,
    name: `${MARCA} Lista_de_Ofertas_99.csv`,
  });
  await page.getByRole("button", { name: "Enviar relatório" }).click();
  await expect(page.getByRole("status")).toContainText("já havia sido importado");
  await expect(page.getByRole("status")).toContainText("Nada foi duplicado");

  const importacoes = await prisma.importacaoTelemetria.count({
    where: { nomeArquivo: { contains: "E2E-F20" } },
  });
  expect(importacoes).toBe(1);
});

test("T34 — a divergência aparece como relato, e a tela diz que não corrige", async ({
  page,
}) => {
  await limpar();
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/ofertas/telemetria-operadora");

  const sufixo = runId();
  await page.setInputFiles("#arquivo-telemetria-operadora", {
    name: `${MARCA} Lista_de_Ofertas_8.csv`,
    mimeType: "text/csv",
    buffer: csvDeOfertas(sufixo),
  });
  await page.getByRole("button", { name: "Enviar relatório" }).click();
  await expect(page.getByRole("status")).toContainText("divergência(s)");

  // Mesma razão da recarga do teste anterior: a lista vem do servidor.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Divergências de catálogo", level: 2 }),
  ).toBeVisible();
  await expect(page.getByText("relatado aqui e nunca corrigido")).toBeVisible();

  // A divergência ACIONÁVEL — item que a operadora tem e a plataforma não
  // conhece — precisa estar visível mesmo quando as centenas de "ausente
  // na operadora" a acompanham. É a prioridade explícita da tela.
  const linha = page.getByRole("row").filter({ hasText: `oferta-${sufixo}` });
  await expect(linha).toBeVisible();
  await expect(linha).toContainText("existe lá, desconhecida aqui");
});

test("T34 — arquivo com cabeçalho estranho é recusado nomeando a causa, sem mandar repetir", async ({
  page,
}) => {
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/ofertas/telemetria-operadora");

  await page.setInputFiles("#arquivo-telemetria-operadora", {
    name: `${MARCA} qualquer.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from("coluna a,coluna b\n1,2\n", "utf8"),
  });
  await page.getByRole("button", { name: "Enviar relatório" }).click();

  // Escopado ao formulário: o anunciador de rota do Next também tem
  // role="alert" e o seletor global bate em dois elementos.
  const alerta = page.locator("form").getByRole("alert");
  await expect(alerta).toContainText("não corresponde a nenhum dos quatro relatórios");
  // RN55 — reenviar o mesmo arquivo daria o mesmo resultado.
  await expect(alerta).not.toContainText("Tente novamente");
});

test("T34 — quem só lê não vê campo de envio, mas vê histórico e divergências", async ({
  page,
}) => {
  await entrar(page, "leitura@dev.clubebroto.local");
  await page.goto("/ofertas/telemetria-operadora");

  await expect(
    page.getByRole("heading", { name: "Telemetria da operadora", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#arquivo-telemetria-operadora")).toHaveCount(0);
  await expect(page.getByText("Envio restrito a Gestor e Analista")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Divergências de catálogo", level: 2 }),
  ).toBeVisible();

  await semViolacoesAxe(page);
});

test("Ofertas — as duas contagens aparecem com a origem escrita, nunca somadas", async ({
  page,
}) => {
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/ofertas");

  const cabecalho = page.getByRole("row").first();
  await expect(cabecalho).toContainText("Resgatados (extrato)");
  await expect(cabecalho).toContainText("Resgates (catálogo)");
  await expect(cabecalho).toContainText("Compras (catálogo)");
});
