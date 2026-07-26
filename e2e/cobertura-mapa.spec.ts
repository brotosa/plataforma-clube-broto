import { expect, test } from "@playwright/test";
import {
  entrar,
  limparAliadoPorNome,
  prisma,
  runId,
  semViolacoesAxe,
  semearAliadoAtivoComContrato,
  semearEmpresaRadar,
  semearOfertaPublicada,
  semearSolucaoCompleta,
} from "./ajudantes";

/**
 * F14 pela interface — T29 (cobertura do portfólio), T30 (mapa da rede) e as
 * quatro correções transversais da Onda 7.
 *
 * O percurso que mais importa aqui é o da RN51: a T29 mostra um vazio, o
 * "Buscar no radar" leva à T8 filtrada por aquela categoria, e — se o funil
 * estiver vazio — a T8 oferece a entrada no radar com a categoria já
 * preenchida. Verificar antes de prospectar só é regra se o caminho inteiro
 * existir; testar as telas isoladamente não provaria isso.
 */

const GESTOR = "gestor@dev.clubebroto.local";

/** Categoria criada pelo teste, para o vazio ser determinístico. */
async function categoriaVazia(sufixo: string) {
  const nome = `Categoria vazia ${sufixo}`;
  await prisma.categoria.deleteMany({ where: { nome } });
  return prisma.categoria.create({
    data: { slug: `e2e-vazia-${sufixo}`.toLowerCase(), nome, ordem: 990, ativa: true },
  });
}

test.describe("T29 — Cobertura do portfólio", () => {
  test("faixa, distribuição e a categoria sem cobertura que NÃO some da lista", async ({
    page,
  }) => {
    const sufixo = `${runId()}-t29`;
    const categoria = await categoriaVazia(sufixo);
    try {
      await entrar(page, GESTOR);
      await page.goto("/aliados/cobertura");

      await expect(page.getByRole("heading", { name: "Cobertura do portfólio" })).toBeVisible();
      await expect(page.getByText("Onde a rede está completa")).toBeVisible();

      // A faixa de quatro indicadores da ficha §2.
      for (const rotulo of [
        "Categorias cobertas",
        "Aliados ativos",
        "Soluções publicadas",
        "Categorias sem cobertura",
      ]) {
        await expect(page.getByText(rotulo, { exact: true })).toBeVisible();
      }

      // RN53: a categoria vazia aparece na distribuição, com marcação própria.
      const linha = page.locator(".cov-lin", { hasText: categoria.nome });
      await expect(linha).toHaveCount(1);
      await expect(linha).toHaveClass(/zero/);

      // O critério de ordenação é declarado em texto, não implícito.
      await expect(page.getByText(/ordenado por aliados ativos/i)).toBeVisible();
    } finally {
      await prisma.categoria.deleteMany({ where: { id: categoria.id } });
    }
  });

  test("alternar a leitura entre Aliados e Soluções muda o critério declarado", async ({
    page,
  }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/cobertura");

    await expect(page.getByText(/ordenado por aliados ativos/i)).toBeVisible();
    await page.getByRole("link", { name: "Soluções", exact: true }).click();
    await expect(page.getByText(/ordenado por soluções publicadas/i)).toBeVisible();
  });

  test("filtro de região recorta e o resumo do recorte acompanha", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/cobertura");

    await expect(page.getByText(/^Rede inteira —/)).toBeVisible();
    await page.getByLabel("Filtrar por região").selectOption("SUL");
    await page.getByRole("button", { name: "Aplicar" }).click();

    await expect(page.getByText(/Recorte: região Sul/)).toBeVisible();
    await page.getByRole("link", { name: "Limpar filtros" }).click();
    await expect(page.getByText(/^Rede inteira —/)).toBeVisible();
  });

  test("a matriz Categoria × cultura traz as DUAS notas obrigatórias da ficha", async ({
    page,
  }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/cobertura");

    await expect(page.getByRole("heading", { name: "Categoria × cultura" })).toBeVisible();

    // As duas notas estão no corpo da tela, não em rodapé. Escopo no parágrafo
    // visível: o mesmo texto também vive na <caption> da tabela, para quem
    // navega por leitor de tela — duplicação deliberada, não ambiguidade.
    const nota = page.locator("p.cap", { hasText: "Uma solução pode servir mais de uma cultura" });
    await expect(nota).toBeVisible();
    // (a) a linha soma mais que o total da categoria
    await expect(nota).toContainText("a linha soma mais que o total da categoria");
    // (b) a matriz independe do filtro de região
    await expect(nota).toContainText("independe do filtro de região");
    await expect(page.getByRole("link", { name: /Parametrizador › Culturas/ })).toBeVisible();
  });

  test("axe-core AAA sem violações na T29", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/cobertura");
    await semViolacoesAxe(page);
  });
});

test.describe("RN51 — o caminho T29 → T8 → T9 fecha", () => {
  test("'Buscar no radar' abre a T8 filtrada, e o vazio dela leva à T9 com a categoria", async ({
    page,
  }) => {
    const sufixo = `${runId()}-rn51`;
    const categoria = await categoriaVazia(sufixo);
    try {
      await entrar(page, GESTOR);
      await page.goto("/aliados/cobertura");

      // A categoria vazia está em "Onde faltam", com o botão do scout.
      const item = page.locator(".cont-it", { hasText: categoria.nome });
      await expect(item).toHaveCount(1);
      await item.getByRole("link", { name: /Buscar no radar/ }).click();

      // Chegou à T8 filtrada por ESTA categoria — a mesma rota da célula da T13.
      await expect(page).toHaveURL(new RegExp(`/mercado\\?categoria=${categoria.id}`));

      // Funil vazio para a categoria: o estado vazio oferece a entrada no radar.
      await expect(page.getByRole("heading", { name: "Nenhuma empresa neste filtro" })).toBeVisible();
      await expect(page.getByText(new RegExp(`Nenhuma empresa em prospecção para ${categoria.nome}`))).toBeVisible();
      await page.getByRole("link", { name: "+ Entrar no radar" }).click();

      // A T9 abre com a categoria JÁ marcada — sem redigitar o que se acabou de dizer.
      await expect(page).toHaveURL(new RegExp(`/mercado/radar\\?categoria=${categoria.id}`));
      await expect(page.getByRole("checkbox", { name: categoria.nome })).toBeChecked();
    } finally {
      await prisma.empresaCategoria.deleteMany({ where: { categoriaId: categoria.id } });
      await prisma.categoria.deleteMany({ where: { id: categoria.id } });
    }
  });

  test("com empresa no funil, a T8 filtrada mostra o kanban e NÃO o atalho", async ({ page }) => {
    const sufixo = `${runId()}-rn51-cheio`;
    const categoria = await categoriaVazia(sufixo);
    const nome = `Prospect E2E ${sufixo}`;
    try {
      const empresa = await semearEmpresaRadar(nome);
      await prisma.empresaCategoria.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.empresaCategoria.create({
        data: { empresaId: empresa.id, categoriaId: categoria.id },
      });

      await entrar(page, GESTOR);
      await page.goto(`/mercado?categoria=${categoria.id}`);

      await expect(page.getByText(nome)).toBeVisible();
      await expect(page.getByRole("link", { name: "+ Entrar no radar" })).toHaveCount(0);
    } finally {
      await limparAliadoPorNome(nome);
      await prisma.categoria.deleteMany({ where: { id: categoria.id } });
    }
  });
});

test.describe("T30 — Mapa da rede", () => {
  test("RN52: o modo ativo é sempre declarado e o alternador troca a leitura", async ({
    page,
  }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/mapa");

    await expect(page.getByRole("heading", { name: "Distribuição geográfica" })).toBeVisible();

    // Modo padrão: sede, com a etiqueta visível e a advertência da RN52.
    const etiqueta = page.locator(".pill-info", { hasText: "Sede do aliado" });
    await expect(etiqueta).toBeVisible();
    await expect(page.getByText(/Plotar sede não é plotar cobertura de atendimento/)).toBeVisible();

    await page.getByRole("link", { name: "Abrangência declarada" }).click();
    await expect(page.locator(".pill-info", { hasText: "Abrangência declarada" })).toBeVisible();
    await expect(page.getByText(/Alcance declarado não é presença física/)).toBeVisible();
  });

  test("o mapa é geometria real projetada, com proveniência declarada", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/mapa");

    const svg = page.locator("svg.mapa-svg");
    await expect(svg).toBeVisible();
    // 27 contornos de UF: se alguém trocar por um desenho à mão, cai aqui.
    await expect(svg.locator("path")).toHaveCount(27);
    await expect(page.getByText(/Natural Earth/)).toBeVisible();
    await expect(page.getByText(/projeção Mercator/)).toBeVisible();
  });

  test("a tabela por UF traz as 27 unidades, inclusive as zeradas (RN53)", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/mapa");

    const linhas = page.locator("table.tbl-resp tbody tr");
    await expect(linhas).toHaveCount(27);
    await expect(page.getByRole("columnheader", { name: "Participação na rede" })).toBeVisible();
  });

  test("a leitura do mapa é derivada — muda com o modo", async ({ page }) => {
    // A prova exige uma base onde os dois modos DIVIRJAM: um aliado sediado
    // no Paraná cuja solução declara cobertura nacional aparece em PR no modo
    // Sede e nas 27 UFs no modo Abrangência. Sem semear, a base vazia dá o
    // mesmo texto nos dois e o teste passaria sem provar nada.
    const sufixo = `${runId()}-leitura`;
    const nome = `Aliado E2E ${sufixo}`;
    try {
      const aliado = await semearAliadoAtivoComContrato(nome);
      await prisma.empresa.update({ where: { id: aliado.id }, data: { enderecoUf: "PR" } });
      const solucao = await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);
      await prisma.solucao.update({
        where: { id: solucao.id },
        data: { coberturaNacional: true },
      });
      await semearOfertaPublicada(solucao.id, `Oferta ${nome}`);

      await entrar(page, GESTOR);
      await page.goto("/aliados/mapa");

      const leitura = page.locator(".card", { hasText: "Leitura do mapa" });
      await expect(leitura).toBeVisible();
      const porSede = await leitura.innerText();
      expect(porSede).toContain("Paraná");

      await page.getByRole("link", { name: "Abrangência declarada" }).click();
      await expect(page).toHaveURL(/modo=ABRANGENCIA/);
      const porAbrangencia = await page
        .locator(".card", { hasText: "Leitura do mapa" })
        .innerText();

      expect(porAbrangencia).not.toBe(porSede);
      // Cobertura nacional alcança as cinco regiões; a sede alcança uma.
      expect(porAbrangencia).toContain("As cinco regiões");
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("axe-core AAA sem violações na T30", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados/mapa");
    await semViolacoesAxe(page);
  });
});

test.describe("Segmentado da seção — as três leituras são o mesmo módulo", () => {
  test("Lista · Cobertura · Mapa navegam e marcam a página corrente", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/aliados");

    const navegacao = page.getByRole("navigation", { name: /Visões de Aliados/ });
    await expect(navegacao.getByRole("link", { name: "Lista" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await navegacao.getByRole("link", { name: "Cobertura" }).click();
    await expect(page).toHaveURL(/\/aliados\/cobertura$/);
    await expect(
      page.getByRole("navigation", { name: /Visões de Aliados/ }).getByRole("link", { name: "Cobertura" }),
    ).toHaveAttribute("aria-current", "page");

    await page
      .getByRole("navigation", { name: /Visões de Aliados/ })
      .getByRole("link", { name: "Mapa da rede" })
      .click();
    await expect(page).toHaveURL(/\/aliados\/mapa$/);
  });
});

test.describe("Correções transversais da Onda 7", () => {
  test("cabeçalho: marca no azul institucional, com o logo amarelo/verde", async ({ page }) => {
    await entrar(page, GESTOR);

    const lateral = page.getByRole("complementary", { name: "Menu lateral" });
    const logo = lateral.getByAltText("Broto");
    await expect(logo).toHaveAttribute("src", /logo-broto-amarelo-verde/);
    await expect(lateral.getByText("Plataforma de administração")).toBeVisible();

    // A área da marca não tem mais fundo branco: o azul da lateral sobe ao topo.
    const fundoDaMarca = await logo.evaluate((elemento) => {
      let no: Element | null = elemento.parentElement;
      while (no) {
        const cor = getComputedStyle(no).backgroundColor;
        if (cor && cor !== "rgba(0, 0, 0, 0)") return cor;
        no = no.parentElement;
      }
      return "";
    });
    // #465EFF — o azul institucional da barra lateral.
    expect(fundoDaMarca).toBe("rgb(70, 94, 255)");
  });

  test("rodapé institucional traz a versão do build, não um rótulo de desenvolvimento", async ({
    page,
  }) => {
    await entrar(page, GESTOR);

    const lateral = page.getByRole("complementary", { name: "Menu lateral" });
    await expect(lateral.getByText(/Elaborado por Broto S\.A\. · v\d+\.\d+\.\d+/)).toBeVisible();
    // O rótulo antigo era falso desde a Onda 3.
    await expect(page.getByText("Ondas 1–2")).toHaveCount(0);
  });

  test("shell preserva o recolher da lateral e a navegação entre módulos", async ({ page }) => {
    await entrar(page, GESTOR);

    const recolher = page.getByRole("button", { name: "Recolher ou expandir menu" });
    await expect(recolher).toHaveAttribute("aria-expanded", "true");
    await recolher.press("Enter");
    await expect(recolher).toHaveAttribute("aria-expanded", "false");
    // Recolhida, a marca vira o símbolo amarelo.
    await expect(
      page.getByRole("complementary", { name: "Menu lateral" }).getByAltText("Broto"),
    ).toHaveAttribute("src", /logo-broto-simbolo-amarelo/);
    await recolher.press("Enter");
    await expect(recolher).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("link", { name: "Aliados & Soluções" }).click();
    await expect(page).toHaveURL(/\/aliados$/);
  });

  test("HOME: panorama de oito células no hero e pendências como cartões próprios", async ({
    page,
  }) => {
    await entrar(page, GESTOR);
    await page.goto("/");

    // Camada 1 — o panorama.
    const celulas = page.locator(".dash-stats .dash-stat");
    await expect(celulas).toHaveCount(8);
    for (const rotulo of [
      "Aliados",
      "Soluções",
      "Ofertas",
      "Campanhas",
      "Cestas",
      "Assinantes",
      "Resgates de benefícios",
      "Resgates de cupons",
    ]) {
      await expect(celulas.getByText(rotulo, { exact: true })).toHaveCount(1);
    }

    // Camada 2 — pendências FORA do hero.
    await expect(page.getByRole("heading", { name: /Pendências/ })).toBeVisible();

    // Camada 3 — os quatro blocos, intactos.
    for (const bloco of ["Rede e Aliados", "Mercado e Funil", "Assinantes e Uso", "Campanhas"]) {
      await expect(page.getByRole("heading", { name: bloco, exact: true })).toBeVisible();
    }
  });

  test("sino: marcador, painel e o mesmo número dos cartões da HOME", async ({ page }) => {
    const sufixo = `${runId()}-sino`;
    const nome = `Aliado E2E ${sufixo}`;
    try {
      // Uma reavaliação vencida garante ao menos uma pendência.
      const aliado = await semearAliadoAtivoComContrato(nome);
      await prisma.empresa.update({
        where: { id: aliado.id },
        data: { reavaliacaoPendente: true },
      });

      await entrar(page, GESTOR);
      await page.goto("/");

      const marcador = page.locator(".badge-not");
      await expect(marcador).toBeVisible();
      const doSino = Number((await marcador.innerText()).replace(/\D/g, ""));

      const dosCartoes = await page
        .locator(".acao-grid .acao-card .acao-n")
        .evaluateAll((nos) =>
          nos.reduce((total, no) => total + Number((no.textContent ?? "").replace(/\D/g, "") || 0), 0),
        );
      expect(doSino).toBe(dosCartoes);
    } finally {
      await limparAliadoPorNome(nome);
    }
  });

  test("sino: Esc fecha e devolve o foco ao botão; clique fora fecha", async ({ page }) => {
    await entrar(page, GESTOR);

    const botao = page.getByRole("button", { name: /abrir o painel/i });
    await expect(botao).toHaveAttribute("aria-expanded", "false");

    await botao.click();
    await expect(botao).toHaveAttribute("aria-expanded", "true");
    const painel = page.getByRole("dialog", { name: "Ações pendentes" });
    await expect(painel).toBeVisible();
    // O foco entra no painel ao abrir.
    await expect(painel.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(painel).toBeHidden();
    await expect(botao).toBeFocused();

    // Clique fora fecha sem devolver foco à força.
    await botao.click();
    await expect(page.getByRole("dialog", { name: "Ações pendentes" })).toBeVisible();
    await page.getByRole("button", { name: "Fechar o painel de pendências" }).click();
    await expect(page.getByRole("dialog", { name: "Ações pendentes" })).toBeHidden();
  });

  test("sino: o foco fica contido no painel enquanto ele está aberto", async ({ page }) => {
    await entrar(page, GESTOR);

    await page.getByRole("button", { name: /abrir o painel/i }).click();
    const painel = page.getByRole("dialog", { name: "Ações pendentes" });
    await expect(painel).toBeVisible();

    const focaveis = await painel.locator("a[href], button:not([disabled])").count();
    // Uma volta completa + 1: o foco tem de continuar dentro do painel.
    for (let passo = 0; passo <= focaveis; passo += 1) {
      await page.keyboard.press("Tab");
    }
    await expect(painel.locator(":focus")).toHaveCount(1);
  });

  test("axe-core AAA sem violações com o painel do sino aberto", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.getByRole("button", { name: /abrir o painel/i }).click();
    await expect(page.getByRole("dialog", { name: "Ações pendentes" })).toBeVisible();
    await semViolacoesAxe(page);
  });
});

test.describe("Regressão da T13 pela interface", () => {
  test("o mapa de cobertura da T13 segue igual depois da extração do serviço", async ({
    page,
  }) => {
    const sufixo = `${runId()}-t13`;
    const nome = `Aliado E2E ${sufixo}`;
    try {
      const aliado = await semearAliadoAtivoComContrato(nome);
      await semearSolucaoCompleta(aliado.id, `Solução ${nome}`);

      await entrar(page, GESTOR);
      await page.goto("/mercado?aba=cobertura");

      // As quatro contagens do topo e a matriz continuam onde estavam.
      for (const rotulo of [
        "Categorias cobertas",
        "Gaps de portfólio",
        "Gaps descobertos",
        "No funil",
      ]) {
        await expect(page.getByText(rotulo, { exact: true })).toBeVisible();
      }
      await expect(page.getByRole("columnheader", { name: "Aliadas ativas" })).toBeVisible();
      await expect(page.getByText(/Gap de portfólio = categoria sem nenhuma aliada ativa/)).toBeVisible();
    } finally {
      await limparAliadoPorNome(nome);
    }
  });
});

/**
 * Acabamento visual pós-Onda 7 — três divergências de fidelidade contra o
 * protótipo v9.1, encontradas na demonstração.
 *
 * Nenhuma delas muda comportamento, e é justamente por isso que precisam de
 * teste: defeito puramente visual não quebra nada, não aparece em log e
 * sobrevive a revisão de código. O que os testes abaixo prendem é a
 * GEOMETRIA e a ordem de pintura, medidas no navegador — não a existência
 * de uma regra de CSS, que pode estar lá e ser sobrescrita.
 */
test.describe("Acabamento visual — fidelidade ao v9.1", () => {
  test("marca da lateral alinhada à esquerda, no mesmo recuo dos itens do menu", async ({
    page,
  }) => {
    await entrar(page, GESTOR);

    const medidas = await page.evaluate(() => {
      const lateral = document.querySelector("aside")!;
      const logo = lateral.querySelector("img")!;
      const descritivo = lateral.querySelector(".cap")!;
      const faixa = document.createRange();
      faixa.selectNodeContents(descritivo);
      const icone = lateral.querySelector(".sidebar-it svg")!;
      const esquerda = (caixa: DOMRect) => Math.round(caixa.left);
      return {
        logo: esquerda(logo.getBoundingClientRect()),
        larguraDoLogo: Math.round(logo.getBoundingClientRect().width),
        descritivo: esquerda(faixa.getBoundingClientRect()),
        icone: esquerda(icone.getBoundingClientRect()),
      };
    });

    // Os três começam na mesma coluna de leitura.
    expect(medidas.logo).toBe(medidas.icone);
    expect(medidas.descritivo).toBe(medidas.icone);

    // E o logo tem a largura da SUA proporção (295×56 a 19px de altura ≈ 100),
    // não a da lateral inteira — que é como ele acabava centralizado dentro
    // da própria caixa, por conta do preserveAspectRatio padrão do SVG.
    expect(medidas.larguraDoLogo).toBeLessThan(140);
  });

  test("marca da lateral recolhida permanece centrada, como no protótipo", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.getByRole("button", { name: "Recolher ou expandir menu" }).click();
    await expect(page.getByRole("button", { name: "Recolher ou expandir menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    const folgas = await page.evaluate(() => {
      const lateral = document.querySelector("aside")!.getBoundingClientRect();
      const logo = document.querySelector("aside img")!.getBoundingClientRect();
      return {
        esquerda: Math.round(logo.left - lateral.left),
        direita: Math.round(lateral.right - logo.right),
      };
    });
    // Recolhida o protótipo centra: as folgas se equivalem (1px de tolerância
    // para arredondamento de subpixel).
    expect(Math.abs(folgas.esquerda - folgas.direita)).toBeLessThanOrEqual(1);
  });

  test("marca d'água do hero: presente, decorativa e SOB o conteúdo", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/");

    const agua = page.locator(".dash-hero .dash-marca");
    await expect(agua).toHaveCount(1);
    await expect(agua).toHaveAttribute("aria-hidden", "true");
    await expect(agua).toHaveAttribute("alt", "");

    const veredito = await page.evaluate(() => {
      const marca = document.querySelector(".dash-marca") as HTMLElement;
      const celulas = [...document.querySelectorAll(".dash-stat")];
      // Prova de ordem de pintura: no centro de cada célula do panorama,
      // quem está no topo é a célula — nunca a marca d'água. Se ela subisse,
      // passaria a compor com o texto e o contraste medido cairia.
      const porCima = celulas.map((celula) => {
        const caixa = celula.getBoundingClientRect();
        const alvo = document.elementFromPoint(
          caixa.left + caixa.width / 2,
          caixa.top + caixa.height / 2,
        );
        return alvo === marca;
      });
      return {
        algumaCelulaCobertaPelaMarca: porCima.some(Boolean),
        focavel: marca.tabIndex >= 0,
        opacidade: getComputedStyle(marca).opacity,
        // O fundo da célula é opaco: nada atravessa por transparência.
        fundoDaCelula: getComputedStyle(celulas[0]!).backgroundColor,
      };
    });

    expect(veredito.algumaCelulaCobertaPelaMarca).toBe(false);
    expect(veredito.focavel).toBe(false);
    expect(Number(veredito.opacidade)).toBeLessThan(0.2);
    expect(veredito.fundoDaCelula).not.toContain("rgba");
  });

  test("panorama do hero em 4 colunas × 2 linhas, sem célula fantasma", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/");

    const grade = await page.evaluate(() => {
      const stats = document.querySelector(".dash-stats")!;
      const celulas = [...stats.querySelectorAll(".dash-stat")];
      const topos = celulas.map((celula) => Math.round(celula.getBoundingClientRect().top));
      return {
        colunas: getComputedStyle(stats).gridTemplateColumns.split(" ").length,
        celulas: celulas.length,
        linhas: new Set(topos).size,
      };
    });

    expect(grade.celulas).toBe(8);
    expect(grade.colunas).toBe(4);
    expect(grade.linhas).toBe(2);
    // 8 em 4 colunas fecha exatamente duas linhas — nenhuma sobra.
    expect(grade.celulas % grade.colunas).toBe(0);
  });

  test("axe AAA segue limpo no hero com a marca d'água", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/");
    await semViolacoesAxe(page);
  });
});

/**
 * Segmentado de seção — um componente, duas seções.
 *
 * O padrão nasceu em Aliados & Soluções (F14) e Mercado & Scout tinha o
 * mesmo alternador escrito à mão, numa linha própria abaixo do cabeçalho.
 * Enquanto o padrão viveu duplicado, ele divergiu — e é essa divergência
 * que estes testes prendem, dos dois lados.
 *
 * O cabeçalho de Mercado é compartilhado por T8, T13 e T14: mexer nele é
 * mexer nas três, e por isso a navegação entre as abas é verificada
 * inteira, com o conteúdo de cada uma.
 */
test.describe("Segmentado de seção compartilhado", () => {
  test("em Mercado, o segmentado está na LINHA DO CABEÇALHO, junto dos botões", async ({
    page,
  }) => {
    await entrar(page, GESTOR);
    await page.goto("/mercado");

    const geometria = await page.evaluate(() => {
      const seg = document.querySelector('nav[aria-label^="Visões do Mercado"]')!;
      const botao = [...document.querySelectorAll("a.btn")].find((a) =>
        (a.textContent ?? "").includes("Incluir empresa"),
      )!;
      const titulo = document.querySelector("h1")!;
      const centro = (e: Element) => {
        const b = e.getBoundingClientRect();
        return Math.round(b.top + b.height / 2);
      };
      return {
        centroDoSegmentado: centro(seg),
        centroDoBotao: centro(botao),
        topoDoTitulo: Math.round(titulo.getBoundingClientRect().top),
        segAbaixoDoBotao: seg.getBoundingClientRect().top > botao.getBoundingClientRect().bottom,
      };
    });

    // Mesma faixa vertical do botão de ação (tolerância de meia altura de
    // controle), e não numa linha abaixo dele.
    expect(Math.abs(geometria.centroDoSegmentado - geometria.centroDoBotao)).toBeLessThanOrEqual(20);
    expect(geometria.segAbaixoDoBotao).toBe(false);
  });

  test("navegação entre as três abas de Mercado — T8, T13 e T14", async ({ page }) => {
    await entrar(page, GESTOR);
    await page.goto("/mercado");

    const segmentado = page.getByRole("navigation", { name: /Visões do Mercado/ });

    // T8 — funil, a aba de entrada.
    await expect(segmentado.getByRole("link", { name: "Funil" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("heading", { level: 1, name: "Funil de mercado" })).toBeVisible();

    // T13 — cobertura.
    await segmentado.getByRole("link", { name: "Cobertura" }).click();
    await expect(page).toHaveURL(/aba=cobertura/);
    await expect(page.getByRole("heading", { level: 1, name: "Mapa de cobertura" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: /Visões do Mercado/ }).getByRole("link", { name: "Cobertura" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("columnheader", { name: "Aliadas ativas" })).toBeVisible();

    // T14 — metas.
    await page
      .getByRole("navigation", { name: /Visões do Mercado/ })
      .getByRole("link", { name: "Metas" })
      .click();
    await expect(page).toHaveURL(/aba=metas/);
    await expect(page.getByRole("heading", { level: 1, name: "Metas" })).toBeVisible();

    // E de volta ao funil, fechando o ciclo.
    await page
      .getByRole("navigation", { name: /Visões do Mercado/ })
      .getByRole("link", { name: "Funil" })
      .click();
    await expect(page).toHaveURL(/\/mercado$/);
    await expect(page.getByRole("heading", { level: 1, name: "Funil de mercado" })).toBeVisible();
  });

  test("as duas seções rendem a MESMA estrutura — é o mesmo componente", async ({ page }) => {
    await entrar(page, GESTOR);

    const estrutura = async (rota: string, rotulo: RegExp) => {
      await page.goto(rota);
      return page.evaluate((padrao: string) => {
        const seg = [...document.querySelectorAll("nav.seg")].find((n) =>
          new RegExp(padrao).test(n.getAttribute("aria-label") ?? ""),
        )!;
        return {
          classe: seg.className,
          filhos: [...seg.children].map((f) => f.tagName),
          temAriaCurrent: [...seg.children].filter((f) => f.hasAttribute("aria-current")).length,
        };
      }, rotulo.source);
    };

    const aliados = await estrutura("/aliados", /Visões de Aliados/);
    const mercado = await estrutura("/mercado", /Visões do Mercado/);

    expect(mercado.classe).toBe(aliados.classe);
    expect(mercado.filhos).toEqual(aliados.filhos);
    // Exatamente uma visão marcada como corrente, dos dois lados.
    expect(aliados.temAriaCurrent).toBe(1);
    expect(mercado.temAriaCurrent).toBe(1);
  });

  test("axe AAA limpo nas três abas de Mercado com o cabeçalho novo", async ({ page }) => {
    await entrar(page, GESTOR);
    for (const rota of ["/mercado", "/mercado?aba=cobertura", "/mercado?aba=metas"]) {
      await page.goto(rota);
      await semViolacoesAxe(page);
    }
  });
});

/**
 * Navegação que muda APENAS a querystring.
 *
 * Defeito encontrado no acabamento e **anterior a ele**: o `<Link>` do App
 * Router não confirma uma transição que só altera a query. Ele intercepta o
 * clique, busca o payload RSC (200, `text/x-component`) e o descarta — a URL
 * não muda e a tela não repinta. Medido no `main` já mergeado: **12 de 12
 * falhas** no alternador de modo da T30, que é o coração da RN52. Com
 * âncora de documento: 0 de 12.
 *
 * Estes testes cobrem os controles em que isso acontece. Eles clicam
 * IMEDIATAMENTE depois de a tela montar — sem espera de cortesia —, porque
 * era justamente a espera das asserções anteriores que mascarava o defeito
 * na suíte original.
 */
test.describe("Navegação por querystring — o clique tem de confirmar", () => {
  for (const caso of [
    {
      nome: "T30 · alternador de modo (RN52)",
      rota: "/aliados/mapa",
      link: "Abrangência declarada",
      esperado: /modo=ABRANGENCIA/,
    },
    {
      nome: "T29 · leitura Aliados ⇄ Soluções",
      rota: "/aliados/cobertura",
      link: "Soluções",
      esperado: /visao=solucoes/,
    },
    {
      nome: "T8 · alternador Kanban ⇄ Tabela",
      rota: "/mercado",
      link: "Tabela",
      esperado: /visao=tabela/,
    },
    {
      nome: "Mercado · aba Cobertura (T13)",
      rota: "/mercado",
      link: "Cobertura",
      esperado: /aba=cobertura/,
    },
  ]) {
    test(`${caso.nome} confirma a navegação`, async ({ page }) => {
      await entrar(page, GESTOR);
      await page.goto(caso.rota);
      await page.getByRole("heading", { level: 1 }).first().waitFor();

      // Sem espera extra: o defeito só aparecia no clique imediato.
      await page.getByRole("link", { name: caso.link, exact: true }).first().click();
      await expect(page).toHaveURL(caso.esperado);
    });
  }

  test("a célula da T13 abre o funil filtrado — mesma navegação do 'Buscar no radar'", async ({
    page,
  }) => {
    const sufixo = `${runId()}-t13-celula`;
    const nome = `Prospect E2E ${sufixo}`;
    const categoria = await categoriaVazia(sufixo);
    try {
      const empresa = await semearEmpresaRadar(nome);
      await prisma.empresaCategoria.deleteMany({ where: { empresaId: empresa.id } });
      await prisma.empresaCategoria.create({
        data: { empresaId: empresa.id, categoriaId: categoria.id },
      });

      await entrar(page, GESTOR);
      await page.goto("/mercado?aba=cobertura");
      await page.getByRole("heading", { level: 1 }).first().waitFor();

      await page
        .getByRole("link", { name: new RegExp(`Abrir funil filtrado em ${categoria.nome}`) })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`categoria=${categoria.id}`));
      await expect(page.getByText(nome)).toBeVisible();
    } finally {
      await limparAliadoPorNome(nome);
      await prisma.categoria.deleteMany({ where: { id: categoria.id } });
    }
  });
});
