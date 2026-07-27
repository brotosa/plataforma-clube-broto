import { expect, test, type Page } from "@playwright/test";
import { entrar, semViolacoesAxe } from "./ajudantes";

/**
 * F16 (Onda 9) pela interface: ajuda contextual (RN58, RN59) e o rótulo
 * institucional (ficha §2).
 *
 * A rota não tem precondição de dados — é conteúdo editorial, e não lê a
 * operação. O que precisa de prova é o percurso: de onde se entra, em que
 * seção se cai, e para onde se volta.
 */

const ROTULO_DA_AJUDA = "Ajuda — abrir o guia da plataforma";

/** Onde o `<main>` está rolado — a âncora pousa nele, não na janela. */
async function rolagemDoMain(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector("main")?.scrollTop ?? -1);
}

/** Distância do topo da seção ao topo do container rolável. */
async function distanciaAoTopo(page: Page, secao: string): Promise<number> {
  return page.evaluate((id) => {
    const alvo = document.getElementById(id);
    const container = document.querySelector("main");
    if (!alvo || !container) return Number.NaN;
    return alvo.getBoundingClientRect().top - container.getBoundingClientRect().top;
  }, secao);
}

test.describe("RN59 — a ajuda abre na seção do módulo de origem", () => {
  /**
   * Três módulos diferentes, três seções diferentes. Se o mapa estivesse
   * espalhado em condicionais, é aqui que a divergência apareceria.
   */
  const percursos = [
    { rota: "/assinantes", modulo: "Assinantes", secao: "j3", titulo: "4.3 Base de assinantes" },
    { rota: "/parametrizador", modulo: "Parametrizador", secao: "j6", titulo: "4.6 Configurar a plataforma" },
    { rota: "/usuarios", modulo: "Usuários", secao: "papeis", titulo: "5 Papéis e permissões" },
  ] as const;

  for (const { rota, modulo, secao, titulo } of percursos) {
    test(`de ${rota} a ajuda abre em #${secao}`, async ({ page }) => {
      await entrar(page, "administrador@dev.clubebroto.local");
      await page.goto(rota);

      await page.getByRole("link", { name: ROTULO_DA_AJUDA }).click();

      await expect(page).toHaveURL(new RegExp(`/ajuda\\?de=.*#${secao}$`));
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();

      // A seção de destino está no topo do container, com folga — e não
      // colada na borda nem fora de vista.
      const distancia = await distanciaAoTopo(page, secao);
      expect(distancia, `folga da seção #${secao}`).toBeGreaterThanOrEqual(0);
      expect(distancia, `folga da seção #${secao}`).toBeLessThan(60);

      await expect(page.getByRole("link", { name: `← Voltar para ${modulo}` })).toBeVisible();
    });
  }

  test("a aba de Mercado muda a seção de destino — mesma rota base", async ({ page }) => {
    await entrar(page, "administrador@dev.clubebroto.local");

    // Funil → 4.1 Trazer um aliado novo
    await page.goto("/mercado");
    await page.getByRole("link", { name: ROTULO_DA_AJUDA }).click();
    await expect(page).toHaveURL(/#j1$/);

    // Metas → 4.5 Acompanhar a rede
    await page.goto("/mercado?aba=metas");
    await page.getByRole("link", { name: ROTULO_DA_AJUDA }).click();
    await expect(page).toHaveURL(/#j5$/);
    // E a volta devolve à aba, não ao funil.
    await expect(page.getByRole("link", { name: "← Voltar para Mercado & Scout" })).toHaveAttribute(
      "href",
      "/mercado?aba=metas",
    );
  });

  test("a volta devolve à tela exata de origem", async ({ page }) => {
    await entrar(page, "administrador@dev.clubebroto.local");
    await page.goto("/assinantes/segmentos");

    await page.getByRole("link", { name: ROTULO_DA_AJUDA }).click();
    await page.getByRole("link", { name: "← Voltar para Assinantes" }).click();

    await expect(page).toHaveURL(/\/assinantes\/segmentos$/);
  });

  test("sem origem conhecida não há barra de volta — nenhum destino inventado", async ({ page }) => {
    await entrar(page, "administrador@dev.clubebroto.local");

    // Acesso direto pela URL: o caso do favorito e do endereço digitado.
    await page.goto("/ajuda");
    await expect(page.getByRole("heading", { name: "1 O que é e o que não é" })).toBeVisible();
    await expect(page.getByRole("link", { name: /← Voltar para/ })).toHaveCount(0);

    // Caminho externo na query: recusado, e a ajuda abre mesmo assim.
    await page.goto("/ajuda?de=%2F%2Fexterno.com");
    await expect(page.getByRole("link", { name: /← Voltar para/ })).toHaveCount(0);
    await expect(page.locator("#oquee")).toBeVisible();

    await page.goto("/ajuda?de=https%3A%2F%2Fexterno.com");
    await expect(page.getByRole("link", { name: /← Voltar para/ })).toHaveCount(0);
    await expect(page.locator("#oquee")).toBeVisible();
  });

  test("/ajuda#j4 direto posiciona na jornada da campanha", async ({ page }) => {
    await entrar(page, "administrador@dev.clubebroto.local");
    await page.goto("/ajuda#j4");

    await expect(page.getByRole("heading", { name: "4.4 Rodar uma campanha" })).toBeVisible();
    const distancia = await distanciaAoTopo(page, "j4");
    expect(distancia).toBeGreaterThanOrEqual(0);
    expect(distancia).toBeLessThan(60);
    // Quem rola é o <main>, não a janela.
    expect(await rolagemDoMain(page)).toBeGreaterThan(0);
  });

  test("o sumário navega entre seções e marca a corrente", async ({ page }) => {
    await entrar(page, "administrador@dev.clubebroto.local");
    await page.goto("/ajuda");

    const sumario = page.getByRole("navigation", { name: "Sumário do guia" });
    await sumario.getByRole("link", { name: "7 · Glossário" }).click();

    await expect(page.getByRole("heading", { name: "7 Glossário" })).toBeVisible();
    // Peso e régua, não só cor: a classe `on` é o gancho do estilo, e o
    // `aria-current` é o que o leitor de tela anuncia.
    await expect(sumario.getByRole("link", { name: "7 · Glossário" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    const peso = await sumario
      .getByRole("link", { name: "7 · Glossário" })
      .evaluate((no) => getComputedStyle(no).fontWeight);
    expect(Number(peso)).toBeGreaterThanOrEqual(700);
  });
});

test.describe("Ficha Onda 10 §2 — o \"?\" fecha o cabeçalho", () => {
  test("a ajuda é o último elemento da barra, depois da identidade e do papel", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    const cabecalho = page.locator("header").first();
    const ajuda = cabecalho.getByRole("link", { name: ROTULO_DA_AJUDA });
    await expect(ajuda).toBeVisible();

    // Posição: a ajuda fica à direita do sino e do bloco de usuário — o
    // inverso da Onda 9, por decisão da Superintendência.
    const caixaDaAjuda = await ajuda.boundingBox();
    const caixaDoSair = await cabecalho.getByRole("button", { name: "Sair" }).boundingBox();
    expect(caixaDaAjuda?.x ?? 0).toBeGreaterThan(caixaDoSair?.x ?? 0);

    // E é o elemento mais à direita do cabeçalho, ponto final.
    const maisADireita = await cabecalho.evaluate((barra) => {
      const focaveis = [...barra.querySelectorAll<HTMLElement>("a[href], button")].filter(
        (no) => no.offsetParent !== null,
      );
      const ordenados = focaveis.sort(
        (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left,
      );
      const ultimo = ordenados[ordenados.length - 1];
      return ultimo?.getAttribute("aria-label") ?? ultimo?.textContent ?? null;
    });
    expect(maisADireita).toBe(ROTULO_DA_AJUDA);
  });

  test("a ajuda é o último item na ordem de tabulação do cabeçalho", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    // Consequência aceita e desejável da mudança: ajuda não é ação
    // urgente, então fechar a tabulação do cabeçalho é o lugar certo.
    const foco = await page.evaluate(() => {
      const cabecalho = document.querySelector("header");
      if (!cabecalho) return null;
      const focaveis = [
        ...cabecalho.querySelectorAll<HTMLElement>("a[href], button, input, [tabindex]:not([tabindex='-1'])"),
      ].filter((no) => no.offsetParent !== null);
      const ultimo = focaveis[focaveis.length - 1];
      return ultimo?.getAttribute("aria-label") ?? ultimo?.textContent ?? null;
    });
    expect(foco).toBe(ROTULO_DA_AJUDA);
  });
});

test.describe("RN58 — a ajuda é leitura, para todos os papéis", () => {
  const papeis = [
    "leitura@dev.clubebroto.local",
    "comercial@dev.clubebroto.local",
    "aprovador@dev.clubebroto.local",
    "scout@dev.clubebroto.local",
  ] as const;

  for (const email of papeis) {
    test(`${email.split("@")[0]} abre o guia`, async ({ page }) => {
      await entrar(page, email);
      await page.goto("/ajuda");

      // Sem redirecionamento, sem tela de recusa: as doze seções inteiras.
      await expect(page).toHaveURL(/\/ajuda$/);
      await expect(page.locator("section.gd-sec")).toHaveCount(12);
      await expect(page.getByRole("link", { name: ROTULO_DA_AJUDA })).toBeVisible();
    });
  }

  test("o guia não exibe dado da operação nem caminho de edição", async ({ page }) => {
    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/ajuda");

    await expect(page.locator("main form")).toHaveCount(0);
    await expect(page.locator("main button")).toHaveCount(0);
  });

  test("axe AAA limpo na rota nova", async ({ page }) => {
    await entrar(page, "administrador@dev.clubebroto.local");
    await page.goto("/ajuda#j2");
    await semViolacoesAxe(page);
  });
});

test.describe("Ficha §2 — rótulo institucional", () => {
  test("a lateral traz o descritivo novo, sem estouro e sem palavra órfã", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    const lateral = page.getByRole("complementary", { name: "Menu lateral" });
    const descritivo = lateral.getByText("Plataforma de gestão do Clube");
    await expect(descritivo).toBeVisible();

    // Sem estouro: o texto cabe na caixa que a lateral dá a ele.
    const estouro = await descritivo.evaluate((no) => no.scrollWidth - no.clientWidth);
    expect(estouro, "estouro do descritivo na lateral").toBeLessThanOrEqual(0);

    // Sem palavra órfã: se quebrar, "do Clube" desce junto — o espaço entre
    // eles é inquebrável, então a última linha nunca é só "Clube".
    const ultimaLinha = await descritivo.evaluate((no) => {
      const alcance = document.createRange();
      alcance.selectNodeContents(no);
      const linhas = [...alcance.getClientRects()];
      const ultima = linhas[linhas.length - 1];
      return { quantidade: linhas.length, largura: ultima ? ultima.width : 0 };
    });
    if (ultimaLinha.quantidade > 1) {
      expect(ultimaLinha.largura, "largura da última linha").toBeGreaterThan(40);
    }
  });

  test("a lateral recolhida não quebra a marca", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    await page.getByRole("button", { name: "Recolher ou expandir menu" }).click();
    const lateral = page.getByRole("complementary", { name: "Menu lateral" });
    await expect(lateral.getByAltText("Broto")).toBeVisible();
    // Recolhida, o descritivo não é exibido — e o "?" continua acessível.
    await expect(lateral.getByText("Plataforma de gestão do Clube")).toHaveCount(0);
    await expect(page.getByRole("link", { name: ROTULO_DA_AJUDA })).toBeVisible();
  });

  test("o login traz a forma com o nome completo", async ({ page }) => {
    await page.goto("/entrar");
    await expect(page.getByText("Plataforma de gestão do Clube Broto")).toBeVisible();
  });

  test("os metadados do documento trazem a forma com o nome completo", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/aliados");

    // A descrição é herdada do layout raiz e vale em toda a plataforma.
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /^Plataforma de gestão do Clube Broto —/,
    );
    // O título só cai no `default` onde a página não declara o seu; o
    // template ("%s · Clube Broto") governa as demais, e /entrar é uma
    // delas — por isso a verificação do default não pode ser feita lá.
    await expect(page).toHaveTitle(/Clube Broto/);
  });
});
