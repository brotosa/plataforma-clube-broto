import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Fluxo principal da F2 pela interface (critério "pronto" da fase):
 * criar empresa → completar M2 → solicitar promoção → aprovar com
 * usuário distinto (RN06) → criar solução (T3) → criar oferta (T5) →
 * publicar → conferir na lista transversal (T4, coluna Natureza).
 * Inclui teclado na T7 e axe-core nas telas novas.
 */

const SENHA = process.env.SENHA_USUARIOS_DEV ?? "clube-broto-dev";
const SUFIXO = `${Date.now()}`.slice(-6);
const NOME_ALIADO = `Aliado E2E ${SUFIXO}`;
const NOME_SOLUCAO = `Solução E2E ${SUFIXO}`;
const TITULO_OFERTA = `15% de desconto E2E ${SUFIXO}`;

/** Gera um CNPJ estruturalmente válido (módulo 11) para o teste. */
function cnpjValido(sufixo: string): string {
  const base = `112223330${sufixo.slice(-3)}`;
  const digito = (corpo: string): number => {
    let soma = 0;
    let peso = 2;
    for (let i = corpo.length - 1; i >= 0; i -= 1) {
      soma += Number(corpo[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(base);
  const d2 = digito(base + String(d1));
  return `${base}${d1}${d2}`;
}

async function entrar(page: Page, email: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/aliados");
}

async function semViolacoesAxe(page: Page) {
  // Aguarda a tela assentar (h1 único por tela) antes de varrer — evita
  // varredura no meio de uma navegação do App Router
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  const resultado = await new AxeBuilder({ page }).analyze();
  expect(resultado.violations).toEqual([]);
}

test.describe.serial("fluxo principal — criar → promover → aprovar → solução → oferta → publicar", () => {
  test("analista cria o aliado com dados M2 completos", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto("/aliados/novo");
    await page.getByLabel("Nome fantasia (nome de exibição)").fill(NOME_ALIADO);
    await page.getByLabel("Razão social").fill(`${NOME_ALIADO} LTDA`);
    await page.getByLabel("CNPJ").fill(cnpjValido(SUFIXO));
    await page.getByLabel("Logo (chave do arquivo)").fill("s3://logos/e2e.svg");
    await page.getByLabel("Descrição institucional").fill("Aliado criado pelo fluxo e2e.");
    await page.getByLabel("Município").fill("Curitiba");
    await page.getByLabel("UF", { exact: true }).selectOption("PR");
    await page.getByRole("checkbox", { name: "Tecnologia e Software" }).check();
    await page.getByRole("button", { name: "Criar aliado" }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: NOME_ALIADO })).toBeVisible();
    await expect(page.getByText("Em negociação")).toBeVisible();
  });

  test("analista registra contato e contrato (bloco comercial)", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(NOME_ALIADO)}`);
    await page.getByRole("link", { name: new RegExp(NOME_ALIADO) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);

    await page.getByRole("link", { name: "Contatos" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Contato Comercial E2E");
    await page.getByLabel("E-mail", { exact: true }).fill(`comercial+${SUFIXO}@e2e.local`);
    await page.getByRole("button", { name: "Adicionar contato" }).click();
    // Sinal durável: o contato aparece na tabela após a revalidação
    await expect(page.getByRole("cell", { name: "Contato Comercial E2E" })).toBeVisible();

    await page.getByRole("link", { name: "Comercial" }).click();
    await page.getByLabel("Data-base da vigência").fill("2026-07-01");
    await page.getByLabel("Comissão (%)").fill("5");
    await page.getByLabel("Ambientes de pagamento habilitados").selectOption("AMBOS");
    await page.getByLabel("Anexo do contrato (chave do arquivo)").fill("s3://contratos/e2e.pdf");
    await page.getByRole("button", { name: "Registrar contrato" }).click();
    // A revalidação troca o formulário pela visão do contrato vigente
    await expect(page.getByRole("heading", { name: "Contrato vigente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Encerrar contrato" })).toBeVisible();
  });

  test("analista solicita a promoção (entra na fila — RN06)", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(NOME_ALIADO)}`);
    await page.getByRole("link", { name: new RegExp(NOME_ALIADO) }).click();
    await page
      .getByRole("button", { name: "Solicitar promoção a Aliada ativa" })
      .click();
    // A revalidação troca o formulário pelo estado "aguardando aprovação"
    await expect(page.getByText("Promoção aguardando aprovação")).toBeVisible();
  });

  test("aprovador (usuário distinto) aprova e o aliado vira Aliada ativa", async ({ page }) => {
    await entrar(page, "aprovador@dev.clubebroto.local");
    await page.goto("/aprovacoes");
    const dossie = page.locator("details", { hasText: NOME_ALIADO });
    await dossie.locator("summary").click();
    await dossie.getByRole("button", { name: "Aprovar", exact: true }).click();
    // A revalidação remove a pendência da fila — sinal de que o efeito foi aplicado
    await expect(dossie).toHaveCount(0);

    await page.goto(`/aliados?busca=${encodeURIComponent(NOME_ALIADO)}`);
    const linha = page.getByRole("row", { name: new RegExp(NOME_ALIADO) });
    await expect(linha.getByText("Aliado ativo")).toBeVisible();
  });

  test("analista cria a solução com card completo (T3, RN01/RN09)", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(NOME_ALIADO)}`);
    await page.getByRole("link", { name: new RegExp(NOME_ALIADO) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await page.getByRole("link", { name: "Soluções", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Soluções do aliado" })).toBeVisible();
    await page.getByRole("link", { name: "+ Nova solução" }).click();
    await page.waitForURL(/\/solucoes\/nova/);
    await page.waitForLoadState("networkidle"); // hidratação completa antes de interagir

    await page.getByLabel("Nome da solução").fill(NOME_SOLUCAO);
    await page.getByLabel("Descrição curta (texto do card)").fill("Solução criada pelo e2e.");
    await page.getByLabel("Categoria").selectOption({ label: "Tecnologia e Software" });
    await page.getByLabel("Imagem do card (chave do arquivo)").fill("s3://cards/e2e.png");
    await page.getByRole("checkbox", { name: "Todas" }).check();
    await page.getByRole("checkbox", { name: "Cobertura nacional" }).check();
    // Régua ao vivo chega a 100% antes de salvar
    await expect(page.getByText("100%")).toBeVisible();
    await page.getByRole("button", { name: "Criar solução" }).click();
    await page.waitForURL(/\/solucoes\/(?!nova$)[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: NOME_SOLUCAO })).toBeVisible();
  });

  test("analista cria a oferta (T5) e publica (RN02/RN09/RN11)", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(NOME_ALIADO)}`);
    await page.getByRole("link", { name: new RegExp(NOME_ALIADO) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await page.getByRole("link", { name: "Soluções", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Soluções do aliado" })).toBeVisible();
    await page.getByRole("link", { name: NOME_SOLUCAO }).click();
    await page.waitForURL(/\/solucoes\/(?!nova$)[a-z0-9]+$/);
    // Navegação direta pelo href (o clique em link com prefetch se mostrou
    // sujeito a corrida no ambiente de teste)
    const hrefNovaOferta = await page
      .getByRole("link", { name: "+ Nova oferta" })
      .getAttribute("href");
    await page.goto(hrefNovaOferta!);
    await page.waitForURL(/\/ofertas\/nova/);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Título comercial").fill(TITULO_OFERTA);
    await page.getByRole("radio", { name: /Benefício/ }).check();
    await page.getByLabel("Tipo de benefício").selectOption({ label: "% desconto" });
    await page.getByLabel("Preço de (R$)").fill("100");
    await page.getByLabel("Preço por (R$)").fill("85");
    await page.getByRole("radio", { name: /Checkout no clube/ }).check();
    await page.getByLabel("Vigência início").fill("2026-07-01");
    await page.getByRole("button", { name: "Criar oferta (rascunho)" }).click();
    await page.waitForURL(/\/ofertas\/(?!nova$)[a-z0-9]+$/);
    await expect(page.getByText("Rascunho")).toBeVisible();

    await page.getByRole("button", { name: "Publicar oferta" }).click();
    // Sinal durável: o pill de status muda para Publicada após a revalidação
    await expect(page.getByText("Publicada", { exact: true })).toBeVisible();
  });

  test("lista transversal (T4) traz a oferta com a coluna Natureza", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ofertas");
    await expect(page.getByRole("columnheader", { name: "Natureza" })).toBeVisible();
    const linha = page.getByRole("row", { name: new RegExp(TITULO_OFERTA) });
    await expect(linha.getByText("Benefício", { exact: true })).toBeVisible();
    await expect(linha.getByText("Publicada")).toBeVisible();
  });

  test("recompensa com preço é bloqueada com explicação (validação de natureza)", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(NOME_ALIADO)}`);
    await page.getByRole("link", { name: new RegExp(NOME_ALIADO) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await page.getByRole("link", { name: "Soluções", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Soluções do aliado" })).toBeVisible();
    await page.getByRole("link", { name: NOME_SOLUCAO }).click();
    await page.waitForURL(/\/solucoes\/(?!nova$)[a-z0-9]+$/);
    const hrefNovaRecompensa = await page
      .getByRole("link", { name: "+ Nova oferta" })
      .getAttribute("href");
    await page.goto(hrefNovaRecompensa!);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Título comercial").fill(`Recompensa E2E ${SUFIXO}`);
    // Nome completo do radio-card de natureza (evita colidir com a mecânica
    // "Recompensa gratuita")
    await page.getByRole("radio", { name: /Recompensa Produto\/serviço gratuito/ }).check();
    // Preços ficam desabilitados — a UI ensina a definição contratual
    await expect(page.getByLabel("Preço por (R$)")).toBeDisabled();
    await expect(page.getByText("Recompensa é gratuidade — preços ficam zerados.")).toBeVisible();
  });
});

test("T7 inteira navegável por teclado: interruptor nativo liga e desliga", async ({ page }) => {
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/aprovacoes/regras");
  await page.waitForLoadState("networkidle"); // hidratação completa antes do teclado

  // Independente do estado inicial: alterna, confere a inversão e restaura
  const interruptor = () =>
    page.getByRole("switch", { name: /exigência de aprovação para Publicação de oferta/i });
  const inicial = (await interruptor().getAttribute("aria-checked")) === "true";

  await interruptor().focus();
  await page.keyboard.press("Enter");
  await expect(interruptor()).toHaveAttribute("aria-checked", String(!inicial));

  // Página limpa antes de restaurar: a segunda alternância imediata pode
  // disparar durante o assentamento do refresh anterior e perder a
  // atualização visual (o banco muda; o DOM não).
  await page.reload();
  await page.waitForLoadState("networkidle");
  await interruptor().focus();
  await page.keyboard.press("Enter");
  await expect(interruptor()).toHaveAttribute("aria-checked", String(inicial));
});

test("axe-core sem violações nas telas da F2", async ({ page }) => {
  await entrar(page, "gestor@dev.clubebroto.local");

  await page.goto("/aliados");
  await semViolacoesAxe(page);

  await page.goto("/aliados/novo");
  await semViolacoesAxe(page);

  // Qualquer ficha de aliado serve para a varredura (independente do sufixo
  // desta execução — o worker pode ter sido reiniciado)
  await page.goto("/aliados");
  await page.locator("table tbody tr").first().getByRole("link").first().click();
  await page.waitForURL(/\/aliados\/[a-z0-9]+/);
  await semViolacoesAxe(page);

  await page.getByRole("link", { name: "Comercial" }).click();
  await semViolacoesAxe(page);

  await page.goto("/ofertas");
  await semViolacoesAxe(page);

  await page.goto("/aprovacoes");
  await semViolacoesAxe(page);

  await page.goto("/aprovacoes/regras");
  await semViolacoesAxe(page);
});
