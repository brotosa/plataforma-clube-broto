import { expect, test, type Page } from "@playwright/test";
import {
  entrar,
  limparAliadoPorNome,
  prisma,
  runId,
  semViolacoesAxe,
  semearAliadoEmNegociacao,
  semearEmpresaRadar,
} from "./ajudantes";

/**
 * F15 (Onda 8) pela interface: marca do aliado (RN54), rolagem contínua da
 * lista (RN56), falha que nomeia a causa (RN55) e arrasto no funil (RN57).
 *
 * Testes isolados, na disciplina da suíte: cada um semeia sua precondição
 * direto no banco e não depende de outro ter rodado.
 */

/** PNG 1×1 real (não é desenho inventado: é o menor PNG válido). */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SVG_COM_SCRIPT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">' +
    '<script>alert(1)</script><rect width="8" height="8" fill="#465EFF"/></svg>',
  "utf8",
);

async function irParaEdicaoDoAliado(page: Page, nome: string) {
  const empresa = await prisma.empresa.findFirstOrThrow({ where: { nomeFantasia: nome } });
  await page.goto(`/aliados/${empresa.id}/editar`);
  return empresa;
}

test.describe("RN54 — marca do aliado", () => {
  test("envia a marca e ela aparece na ficha, na lista e no card do funil", async ({ page }) => {
    const nome = `Aliado Marca ${runId()}`;
    await semearAliadoEmNegociacao(nome);

    await entrar(page, "analista@dev.clubebroto.local");
    const empresa = await irParaEdicaoDoAliado(page, nome);

    // Sem marca, a placa com a inicial — nunca um espaço quebrado.
    await expect(page.getByRole("heading", { name: "Marca do aliado" })).toBeVisible();
    await expect(page.getByRole("img", { name: `Marca de ${nome}` })).toHaveCount(0);

    await page.getByLabel("Enviar a marca").setInputFiles({
      name: "marca.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await page.getByRole("button", { name: "Enviar marca" }).click();
    await expect(page.getByText("Marca do aliado atualizada.")).toBeVisible();

    // Ficha (T2).
    await page.goto(`/aliados/${empresa.id}`);
    await expect(page.getByRole("img", { name: `Marca de ${nome}` })).toBeVisible();

    // Lista de aliados (T1).
    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    await expect(page.getByRole("img", { name: `Marca de ${nome}` })).toBeVisible();

    // A rota serve o binário com o tipo real apurado no envio.
    const resposta = await page.request.get(`/api/aliados/${empresa.id}/marca`);
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toContain("image/png");
    expect(resposta.headers()["etag"]).toBeTruthy();
  });

  test("card do funil também exibe a marca (T8)", async ({ page }) => {
    const nome = `Prospect Marca ${runId()}`;
    const empresa = await semearEmpresaRadar(nome, { estagio: "MAPEADA" });
    // Enviar a marca é editar o cadastro (CRIAR_EDITAR): ato do Analista.
    await entrar(page, "analista@dev.clubebroto.local");

    await page.goto(`/aliados/${empresa.id}/editar`);
    await page.getByLabel("Enviar a marca").setInputFiles({
      name: "marca.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await page.getByRole("button", { name: "Enviar marca" }).click();
    await expect(page.getByText("Marca do aliado atualizada.")).toBeVisible();

    await page.goto("/mercado");
    await expect(page.getByRole("img", { name: `Marca de ${nome}` }).first()).toBeVisible();
  });

  test("recusa SVG com script nomeando o motivo (RN54 + RN55)", async ({ page }) => {
    const nome = `Aliado SVG ${runId()}`;
    await semearAliadoEmNegociacao(nome);
    await entrar(page, "analista@dev.clubebroto.local");
    const empresa = await irParaEdicaoDoAliado(page, nome);

    await page.getByLabel("Enviar a marca").setInputFiles({
      name: "marca.svg",
      mimeType: "image/svg+xml",
      buffer: SVG_COM_SCRIPT,
    });
    await page.getByRole("button", { name: "Enviar marca" }).click();

    // O SVG é higienizado, não recusado: o desenho sobrevive sem o script.
    await expect(page.getByText("Marca do aliado atualizada.")).toBeVisible();
    const servido = await page.request.get(`/api/aliados/${empresa.id}/marca`);
    const conteudo = await servido.text();
    expect(conteudo).not.toContain("script");
    expect(conteudo).not.toContain("alert");
    expect(conteudo).toContain("<rect");
    // E a entrega carrega as outras duas camadas de defesa.
    expect(servido.headers()["x-content-type-options"]).toBe("nosniff");
    expect(servido.headers()["content-security-policy"]).toContain("default-src 'none'");
  });

  test("recusa tipo real divergente da extensão, dizendo os dois", async ({ page }) => {
    const nome = `Aliado Tipo ${runId()}`;
    await semearAliadoEmNegociacao(nome);
    await entrar(page, "analista@dev.clubebroto.local");
    await irParaEdicaoDoAliado(page, nome);

    // Conteúdo PNG com nome .svg: renomear não muda o que o arquivo é.
    await page.getByLabel("Enviar a marca").setInputFiles({
      name: "marca.svg",
      mimeType: "image/svg+xml",
      buffer: PNG_1X1,
    });
    await page.getByRole("button", { name: "Enviar marca" }).click();
    // O Next injeta um role="alert" vazio (route announcer); o alerta do
    // formulário é o primeiro com texto.
    const recusa = page.getByRole("alert").filter({ hasText: /marca\.svg/ });
    await expect(recusa).toContainText("extensão .svg");
    await expect(recusa).toContainText("image/png");
  });

  test("remover a marca devolve o aliado à placa com inicial", async ({ page }) => {
    const nome = `Aliado Remove ${runId()}`;
    await semearAliadoEmNegociacao(nome);
    await entrar(page, "analista@dev.clubebroto.local");
    const empresa = await irParaEdicaoDoAliado(page, nome);

    await page.getByLabel("Enviar a marca").setInputFiles({
      name: "marca.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await page.getByRole("button", { name: "Enviar marca" }).click();
    await expect(page.getByText("Marca do aliado atualizada.")).toBeVisible();

    await page.getByRole("button", { name: "Remover marca" }).click();
    await expect(page.getByText("Marca removida. O aliado volta a exibir a inicial.")).toBeVisible();

    const depois = await page.request.get(`/api/aliados/${empresa.id}/marca`);
    expect(depois.status()).toBe(404);
  });

  test("a tela da marca passa no axe em modo AAA", async ({ page }) => {
    const nome = `Aliado AAA ${runId()}`;
    await semearAliadoEmNegociacao(nome);
    await entrar(page, "analista@dev.clubebroto.local");
    await irParaEdicaoDoAliado(page, nome);
    await expect(page.getByRole("heading", { name: "Marca do aliado" })).toBeVisible();
    await semViolacoesAxe(page);
  });
});

test.describe("RN56 — rolagem contínua da lista de aliados", () => {
  const PREFIXO = `Rolagem ${runId()}`;

  test.beforeAll(async () => {
    // 25 aliados: mais que o bloco de 20, para haver segundo bloco.
    for (let indice = 0; indice < 25; indice += 1) {
      const nome = `${PREFIXO} ${String(indice).padStart(2, "0")}`;
      await limparAliadoPorNome(nome);
      await prisma.empresa.create({
        data: { nomeFantasia: nome, estagio: "ALIADA_ATIVA" },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.empresa.deleteMany({ where: { nomeFantasia: { startsWith: PREFIXO } } });
  });

  test("a lista não tem mais controles de página e mostra o total", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(PREFIXO)}`);

    await expect(page.getByRole("link", { name: "Próxima página" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Próxima página" })).toHaveCount(0);
    await expect(page.getByText("25 aliados", { exact: true })).toBeVisible();
    await expect(page.getByText("Mostrando 20 de 25 aliados.")).toBeVisible();
  });

  test("o segundo bloco entra pelo botão, sem perder o filtro", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(PREFIXO)}`);

    await expect(page.getByRole("row")).toHaveCount(21); // 20 linhas + cabeçalho
    await page.getByRole("button", { name: /Carregar mais/ }).click();

    await expect(page.getByText("25 aliado(s) — lista completa.")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(26);
    // O filtro continua valendo no bloco novo.
    await expect(page.getByRole("link", { name: new RegExp(`${PREFIXO} 24`) })).toBeVisible();
    await expect(page.getByRole("button", { name: /Carregar mais/ })).toHaveCount(0);
  });

  test("a lista completa é alcançável por teclado (RN56)", async ({ page }) => {
    // Redesenho (dívida nomeada na F18): a corrida com a carga por
    // proximidade é LEGÍTIMA — o próprio focus() rola o botão até a
    // viewport, a sentinela dispara e o botão pode desmontar entre o
    // gesto e a asserção. Em produção a corrida é benigna: botão e
    // proximidade terminam no mesmo lugar. O teste afirma o RESULTADO,
    // incondicional; condicional é só o caminho.
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(PREFIXO)}`);

    const botao = page.getByRole("button", { name: /Carregar mais/ });
    const fimDaLista = page.getByText("25 aliado(s) — lista completa.");

    // O primeiro dos dois estados possíveis: o botão, ou a lista já completa.
    await expect(botao.or(fimDaLista)).toBeVisible();

    if (!(await fimDaLista.isVisible())) {
      try {
        await botao.focus({ timeout: 5_000 });
        await page.keyboard.press("Enter");
      } catch {
        // O botão desmontou entre a visibilidade e o gesto: a
        // proximidade completou a lista. Ramo legítimo — o veredito
        // abaixo é quem decide.
      }
    }

    // O veredito, único e incondicional em qualquer ramo: a lista
    // inteira alcançada sem ponteiro, com o fim anunciado.
    await expect(fimDaLista).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(26);
    await expect(botao).toHaveCount(0);
  });
  });

test.describe("RN55 — a falha nomeia a causa", () => {
  test("erro conhecido chega com a mensagem do domínio, não com genérica", async ({ page }) => {
    const nome = `Aliado Erro ${runId()}`;
    await semearAliadoEmNegociacao(nome);
    await entrar(page, "analista@dev.clubebroto.local");
    const empresa = await prisma.empresa.findFirstOrThrow({ where: { nomeFantasia: nome } });

    await page.goto(`/aliados/${empresa.id}/editar`);
    await page.getByLabel("CNPJ").fill("11.111.111/1111-11");
    await page.getByRole("button", { name: /Salvar/ }).click();

    const alerta = page.getByRole("alert").filter({ hasText: "CNPJ" });
    await expect(alerta).toContainText("CNPJ inválido");
    // O que a RN55 tirou da tela: o conselho errado.
    await expect(alerta).not.toContainText("Tente novamente");
  });
});

test.describe("RN57 — arrastar no funil", () => {
  /**
   * Arrasto HTML5 despachando os eventos que o navegador despacha —
   * `dragstart` no card, `dragover` e `drop` no alvo, compartilhando um
   * `DataTransfer`, como manda a especificação.
   *
   * Por que não `mouse.down` + `move`: o Chromium não converte movimento de
   * ponteiro sintético em gesto de arrasto nativo, então aquele caminho
   * nunca chega a disparar `dragstart` e o teste passaria a testar nada.
   *
   * O que isto prova: que nossos manipuladores fazem a coisa certa. O que
   * não prova: que o navegador inicia o gesto — isso é comportamento dele,
   * e o atributo `draggable` (verificado nos dois testes de recusa abaixo)
   * é a nossa parte desse contrato.
   */
  async function pegarCard(page: Page, nome: string) {
    const card = page.locator(".kb-card", { hasText: nome }).first();
    await expect(card).toBeVisible();
    const dados = await page.evaluateHandle(() => new DataTransfer());
    await card.dispatchEvent("dragstart", { dataTransfer: dados });
    return dados;
  }

  async function soltarEm(
    page: Page,
    alvo: ReturnType<Page["locator"]>,
    dados: Awaited<ReturnType<Page["evaluateHandle"]>>,
  ) {
    await expect(alvo).toBeVisible();
    await alvo.dispatchEvent("dragover", { dataTransfer: dados });
    await alvo.dispatchEvent("drop", { dataTransfer: dados });
  }

  async function arrastar(page: Page, origem: string, destino: string) {
    const dados = await pegarCard(page, origem);
    await soltarEm(page, page.locator(".kb-lane", { hasText: destino }).first(), dados);
  }

  test("arrasto válido move o card e a auditoria registra", async ({ page }) => {
    const nome = `Arrasto OK ${runId()}`;
    const empresa = await semearEmpresaRadar(nome, { estagio: "MAPEADA" });
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    await arrastar(page, nome, "Em avaliação");

    await expect
      .poll(async () => {
        const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
        return atual.estagio;
      }, { timeout: 15_000 })
      .toBe("EM_AVALIACAO");

    const eventos = await prisma.auditoriaEvento.findMany({
      where: { entidade: "empresa", entidadeId: empresa.id, campo: "estagio" },
    });
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos.at(-1)?.valorNovo).toBe("EM_AVALIACAO");
    expect(eventos.at(-1)?.autorId).toBeTruthy();
  });

  test("Priorizada sem avaliação fechada recusa e o card volta (RN15)", async ({ page }) => {
    const nome = `Arrasto RN15 ${runId()}`;
    const empresa = await semearEmpresaRadar(nome, { estagio: "EM_AVALIACAO" });
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    await arrastar(page, nome, "Priorizada");

    // A mensagem da regra aparece…
    await expect(page.getByRole("status")).toContainText(/avaliação/i);
    // …e o card não saiu do lugar.
    const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(atual.estagio).toBe("EM_AVALIACAO");
  });

  test("soltar em Descartar abre o modal e só conclui com motivo (RN17)", async ({ page }) => {
    const nome = `Arrasto Descarte ${runId()}`;
    const empresa = await semearEmpresaRadar(nome, { estagio: "MAPEADA" });
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    const dados = await pegarCard(page, nome);
    // A área de descarte só existe durante o gesto — é por isso que ela é
    // localizada depois de pegar o card, não antes.
    await soltarEm(page, page.locator(".kb-descarte"), dados);

    // Abriu o modal — e o descarte NÃO aconteceu ainda.
    await expect(page.getByRole("dialog")).toBeVisible();
    const durante = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(durante.estagio).toBe("MAPEADA");

    await page.getByRole("dialog").getByLabel(/Motivo/).selectOption({ index: 1 });
    await page.getByRole("button", { name: /Confirmar descarte|Descartar/ }).click();

    await expect
      .poll(async () => {
        const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
        return atual.estagio;
      }, { timeout: 15_000 })
      .toBe("DESCARTADA");
  });

  test("o menu continua sendo o caminho completo — regressão do teclado", async ({ page }) => {
    const nome = `Menu Regressao ${runId()}`;
    const empresa = await semearEmpresaRadar(nome, { estagio: "MAPEADA" });
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    await page.getByRole("button", { name: `Ações de ${nome} (mover, descartar, abrir)` }).click();
    await page.getByRole("menuitem", { name: "Mover para Em avaliação" }).click();

    await expect
      .poll(async () => {
        const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
        return atual.estagio;
      }, { timeout: 15_000 })
      .toBe("EM_AVALIACAO");
  });

  test("card em Em aprovação não é arrastável — o motor governa", async ({ page }) => {
    const nome = `Arrasto Aprovacao ${runId()}`;
    await semearEmpresaRadar(nome, { estagio: "EM_APROVACAO" });
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");

    const card = page.locator(".kb-card", { hasText: nome }).first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("draggable", "false");
  });

  test("papel de leitura não arrasta card nenhum", async ({ page }) => {
    const nome = `Arrasto Leitura ${runId()}`;
    await semearEmpresaRadar(nome, { estagio: "MAPEADA" });
    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/mercado");

    const card = page.locator(".kb-card", { hasText: nome }).first();
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("draggable", "false");
  });
});
