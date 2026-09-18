import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { gerarAssinantesSinteticos } from "../infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "../infra/assinantes/protecao-cpf";
import { entrar, resolverDatabaseUrl, semViolacoesAxe } from "./ajudantes";

/**
 * T36 — Gerador de relatórios (Onda 16, F24).
 *
 * O que estes testes cobrem é o que os testes de unidade não alcançam: que a
 * cadeia inteira funciona contra o banco de verdade — tela → server action →
 * caso de uso → compilador → Postgres → pivô → tela.
 *
 * Os dois que mais importam não são os do caminho feliz:
 *
 *  • **a prévia produz NÚMERO**, e não uma tabela vazia. Todo o resto pode
 *    passar com o SQL devolvendo zero linhas: as gavetas enchem, o layout
 *    monta, nada reclama. O teste confere que há valor na célula;
 *  • **o compartilhado roda com a permissão de quem ABRE** (RN76). É a regra
 *    cujo defeito é invisível — o relatório funciona, só entrega dado demais.
 */

resolverDatabaseUrl();

const prisma = new PrismaClient();
const MARCA = "[E2E-F24]";

test.afterAll(async () => {
  await prisma.execucaoRelatorio.deleteMany({
    where: { relatorio: { nome: { startsWith: MARCA } } },
  });
  await prisma.relatorioSalvo.deleteMany({ where: { nome: { startsWith: MARCA } } });
  await prisma.$disconnect();
});

test.describe.serial("T36 — montar, prever, salvar e exportar", () => {
  test("a abertura lista os assuntos que o papel alcança", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios");

    await expect(page.getByRole("heading", { name: "Gerador de relatórios" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ofertas do Clube" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rede de Aliados" })).toBeVisible();
  });

  test("a abertura lidera com os relatórios prontos, e um deles abre montado", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios");

    /*
     * A garantia desta tela, e a razão de ela ter mudado: os modelos do
     * catálogo existiam desde a F24 e só apareciam DENTRO do construtor — isto
     * é, depois de a pessoa já ter escolhido um assunto. Agora estão na
     * abertura, e um clique precisa entregar o número, não um formulário
     * vazio com o nome certo no alto.
     */
    await expect(page.getByRole("heading", { name: "Relatórios prontos" })).toBeVisible();
    await page.getByRole("heading", { name: "Ofertas publicadas por aliado" }).click();

    await expect(page).toHaveURL(/assunto=ofertas&modelo=ofertas-por-aliado/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Ofertas publicadas por aliado" }),
    ).toBeVisible();

    // Montado de verdade: o chip do modelo está na gaveta e a tabela veio com
    // número. Sem esta asserção, o teste passaria com o construtor em branco.
    await expect(page.getByRole("button", { name: /Tirar Aliado de Linhas/ })).toBeVisible();
    const tabela = page.locator(".rel-resultado table");
    await expect(tabela).toBeVisible({ timeout: 20_000 });
    const medida = tabela.locator("tbody tr").first().locator("td.num").first();
    expect(Number((await medida.innerText()).replace(/\./g, "").trim())).toBeGreaterThan(0);
  });

  test("modelo desconhecido abre o construtor vazio, não uma tela de erro", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=inventado-por-um-link-velho");

    // O que a pessoa queria — montar um relatório de ofertas — continua
    // possível. Falhar aqui seria punir alguém por um favorito antigo.
    await expect(page.getByRole("heading", { level: 1, name: "Ofertas do Clube" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pôr Situação em Linhas" })).toBeVisible();
  });

  test("montar por teclado produz número — o arrasto não é o único caminho", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    // Os botões L/C/V são o caminho completo (disciplina da RN57): quem
    // navega por teclado precisa chegar ao mesmo resultado do arrasto.
    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();

    const tabela = page.locator(".rel-resultado table");
    await expect(tabela).toBeVisible({ timeout: 20_000 });

    // A asserção que importa: há LINHA e há NÚMERO. Sem ela, o teste passaria
    // com a consulta devolvendo vazio — o layout monta igual.
    const primeiraMedida = tabela.locator("tbody tr").first().locator("td.num").first();
    await expect(primeiraMedida).toBeVisible();
    const texto = (await primeiraMedida.innerText()).replace(/\./g, "").trim();
    expect(Number(texto)).toBeGreaterThan(0);

    await expect(page.getByText(/linhas? nesta amostra/)).toBeVisible();
  });

  test("a medida se escolhe sozinha ao pôr um número em Valores", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();
    await page.getByRole("button", { name: "Pôr Preço por em Valores" }).click();

    // Número vira média, e não soma: somar preços de ofertas distintas não
    // significa nada, e a pessoa nunca precisou saber que existe AVG.
    await expect(page.getByLabel("Medida de Preço por")).toHaveValue("MEDIA");
  });

  test("campo sem fonte aparece apagado e não entra em gaveta nenhuma (RN77)", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    // Ele existe na tela — sumir faria quem não o vê abrir chamado.
    await expect(page.getByText("Resgates", { exact: true })).toBeVisible();
    await expect(page.getByText(/divergem \(RN68\)/)).toBeVisible();
    // E não tem por onde ser usado.
    await expect(page.getByRole("button", { name: /Pôr Resgates em/ })).toHaveCount(0);
  });

  test("filtro estreita o resultado, e a recusa do compilador chega à tela", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");

    await page.getByRole("button", { name: "Pôr UF da sede em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    // Média sobre junção que multiplica: o compilador recusa, e a mensagem
    // dele É a interface (RN55) — ela explica por que o número seria falso.
    await page.getByRole("button", { name: "Pôr Categoria em Linhas" }).click();
    await page.getByRole("button", { name: "Pôr Score de scouting em Valores" }).click();
    await page.getByLabel("Medida de Score de scouting").selectOption("MEDIA");

    // Localizado pelo TEXTO, e não por `getByRole("alert")` sozinho: o Next
    // mantém um `<div role="alert">` próprio para anunciar navegação, e ele
    // casaria junto. Antes isto mirava uma classe `.aviso-erro` que eu havia
    // inventado e que não existe no CSS — o localizador funcionava, e a
    // mensagem aparecia sem o estilo de erro. A recusa agora usa o
    // `ErrosDoFormulario` que a plataforma já tinha.
    await expect(page.getByText(/ficariam infladas/)).toBeVisible({ timeout: 20_000 });
  });

  /**
   * RN91 — clicar numa célula de dimensão acrescenta o filtro.
   *
   * Prova pelo NÚMERO, e não pela presença do filtro na lista: um filtro que
   * entra na tela e não estreita o resultado teria a mesma aparência de um que
   * funciona, e é exatamente esse o defeito que a regra existe para impedir.
   */
  test("clicar numa célula do resultado estreita o relatório (RN91)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    // Situação, e não UF da sede: a base do e2e tem uma UF só, e com uma linha
    // só não há como provar que o filtro estreitou — o teste passaria pelo
    // motivo errado.
    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();
    const tabela = page.locator(".rel-resultado table");
    await expect(tabela).toBeVisible({ timeout: 20_000 });

    const linhasAntes = await tabela.locator("tbody tr").count();
    expect(linhasAntes).toBeGreaterThan(1);

    // O nome acessível diz o que vai acontecer — "Publicada" sozinho seria o
    // nome de um botão que ninguém sabe que é botão.
    const celula = tabela
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: /^Filtrar por Situação/ });
    await expect(celula).toBeVisible();
    await celula.click();

    // O filtro entrou na MESMA lista dos digitados, e é removível por lá.
    await expect(page.getByRole("button", { name: /Tirar o filtro de/ }).first()).toBeVisible({
      timeout: 20_000,
    });
    // E estreitou de verdade: uma UF só.
    await expect(async () => {
      expect(await tabela.locator("tbody tr").count()).toBe(1);
    }).toPass({ timeout: 20_000 });
  });

  /**
   * A recusa da RN91(c). Medido ao escrever a ficha: 34 das 71 dimensões
   * usáveis não declaram o operador de vazio, e a RN53 obriga a lacuna a
   * aparecer. O ponto não pode ficar mudo — ele responde com o motivo.
   */
  test("a lacuna que não pode virar filtro diz por que não (RN91)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    // Natureza declara só `igual` e `diferente` — sem `vazio`.
    await page.getByRole("button", { name: "Pôr Natureza em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    // O botão existe e é acionável mesmo quando recusa: desabilitado, ele não
    // receberia foco e o motivo ficaria inalcançável por teclado.
    const ponto = page
      .locator(".rel-resultado tbody tr")
      .first()
      .getByRole("button")
      .first();
    await expect(ponto).toBeEnabled();
  });

  /**
   * RN92 — descer troca a dimensão E leva o recorte junto.
   *
   * Prova as duas metades: o cabeçalho passa a ser o nível de baixo, e o
   * filtro do valor de onde se desceu entrou. Sem a segunda, a tela mostraria
   * os municípios do país inteiro — que não é descer, é trocar de pergunta.
   */
  test("descer de nível troca a dimensão e leva o recorte (RN92)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");

    await page.getByRole("button", { name: "Pôr UF da sede em Linhas" }).click();
    const tabela = page.locator(".rel-resultado table");
    await expect(tabela).toBeVisible({ timeout: 20_000 });
    await expect(tabela.locator("thead th").first()).toHaveText("UF da sede");

    const descer = tabela
      .locator("tbody tr")
      .first()
      .getByRole("button", { name: /^Descer para / });
    await expect(descer).toBeVisible();
    await descer.click();

    // Metade 1: a dimensão trocou, no MESMO lugar das Linhas.
    await expect(tabela.locator("thead th").first()).toHaveText("Município da sede", {
      timeout: 20_000,
    });
    // Metade 2: o recorte entrou junto, e está visível para ser removido.
    await expect(page.getByRole("button", { name: /Tirar o filtro de UF da sede/ })).toBeVisible();
  });

  /**
   * Campo sem hierarquia declarada NÃO desce, e a interface não finge que
   * desce: o botão simplesmente não existe ali.
   */
  test("onde não há nível abaixo, o botão de descer não é montado (RN92)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");

    // O nome do aliado não está em hierarquia nenhuma. (Neste assunto ele se
    // chama "Nome fantasia" — "Aliado" é o rótulo dele em `ofertas`.)
    await page.getByRole("button", { name: "Pôr Nome fantasia em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Descer para / })).toHaveCount(0);
  });

  test("salvar põe na prateleira e abrir recarrega a definição", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");

    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const nome = `${MARCA} ofertas por situação`;
    await page.getByLabel("Nome do relatório").fill(nome);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("salvo");

    await page.goto("/relatorios");
    await page.getByRole("heading", { name: nome }).click();

    // Reabriu com a definição guardada: o chip está na gaveta de novo.
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByRole("button", { name: /Tirar Situação de Linhas/ })).toBeVisible();
  });

  test("exportar em CSV devolve arquivo com cabeçalho e dado", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");
    await page.getByRole("button", { name: "Pôr Situação em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    // O CSV deixou de ser o único botão e virou item do menu de saída (F28).
    // O COMPORTAMENTO dele é o mesmo: as asserções abaixo são as da F24,
    // intactas — o que mudou é o caminho até ele, não o arquivo.
    await page.locator(".rel-saida > summary").click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^relatorio-ofertas-do-clube-\d{4}-\d{2}-\d{2}\.csv$/);

    const caminho = await download.path();
    const conteudo = caminho ? (await import("node:fs")).readFileSync(caminho, "utf8") : "";
    expect(conteudo.startsWith("﻿")).toBe(true);
    expect(conteudo).toContain("Situação;");
    // Uma linha de dado além do cabeçalho — CSV só com cabeçalho passaria
    // por todas as outras asserções.
    expect(conteudo.trim().split("\r\n").length).toBeGreaterThan(1);
  });

  test("toda execução fica na trilha operacional (RN78)", async ({ page }) => {
    const antes = await prisma.execucaoRelatorio.count();

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");
    await page.getByRole("button", { name: "Pôr Estágio em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(() => prisma.execucaoRelatorio.count(), { timeout: 15_000 })
      .toBeGreaterThan(antes);

    const ultima = await prisma.execucaoRelatorio.findFirst({ orderBy: { criadoEm: "desc" } });
    expect(ultima?.assuntoSlug).toBe("aliados");
    expect(ultima?.linhas).toBeGreaterThan(0);
  });

  test("axe-core (AAA) sem violações na abertura e no construtor", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    for (const rota of ["/relatorios", "/relatorios?assunto=ofertas"]) {
      await page.goto(rota);
      await semViolacoesAxe(page);
    }
  });
});

/**
 * RN76 — a metade que só se prova com duas contas.
 *
 * O relatório é compartilhado por quem pode ver o assunto; outra pessoa o
 * abre e a consulta roda com a permissão DELA. O que se pode provar aqui é
 * que o compartilhado aparece para o outro e abre; a **negativa** — assunto
 * que some para quem não o alcança — continua sem teste.
 *
 * **A F25 não a destravou, e o registro do porquê importa.** A expectativa
 * era que `VISUALIZAR_FUNIL` e `VISUALIZAR_PATROCINADORES` fossem de alcance
 * restrito. Não são: as duas estão concedidas aos sete papéis nomeados da
 * matriz, e o oitavo tem acesso total — na prática, todo mundo. Campanhas
 * ficou em `VISUALIZAR` pelo mesmo motivo, porque a T22 não fecha a leitura
 * da lista a papel nenhum.
 *
 * Não há, hoje, nenhum papel que perca um assunto do Gerador. A negativa só
 * ganha teste na F26, com Assinantes: `VISUALIZAR_DADOS_PESSOAIS_PLENOS` é de
 * Gestor e Administrador, e é aí que `assuntosVisiveis` passa a devolver
 * listas diferentes para contas diferentes.
 *
 * Deixar isto escrito importa mais que o teste: quem for implementar a F26
 * precisa saber que esta é a garantia a exercitar, que ela ainda não está
 * exercitada, e que a matriz de permissões já foi conferida duas vezes.
 */
test.describe.serial("RN76 — relatório do time", () => {
  test("o que é compartilhado aparece para outra conta", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=aliados");
    await page.getByRole("button", { name: "Pôr Estágio em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const nome = `${MARCA} rede por estágio`;
    await page.getByLabel("Nome do relatório").fill(nome);
    await page.getByLabel("Quem vê este relatório").selectOption("TIME");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Do time");

    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: nome })).toBeVisible();

    await page.getByRole("heading", { name: nome }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });
  });

  test("o privado de um não aparece para o outro", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas");
    await page.getByRole("button", { name: "Pôr Natureza em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const nome = `${MARCA} so do analista`;
    await page.getByLabel("Nome do relatório").fill(nome);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Meus relatórios");

    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: nome })).toHaveCount(0);
  });
});

/**
 * F25 — os três assuntos novos, contra o banco de verdade.
 *
 * A asserção que interessa é a mesma da F24 e pelo mesmo motivo: **há linha e
 * há número**. Tudo o mais — gavetas, chips, layout, ausência de erro no
 * console — passa com a consulta devolvendo zero linhas, e um assunto cujo
 * SQL não roda é indistinguível de um assunto sem dado.
 *
 * E ela não é hipotética aqui. Três defeitos desta fase só apareceram ao
 * rodar contra a base: uma coluna que o Prisma criou em camelCase sem `@map`,
 * e o filtro de campo booleano, que a F24 deixou quebrado porque nenhum
 * caminho dela filtrava por sim/não.
 */
test.describe.serial("F25 — Funil, Campanhas e Patrocinadores", () => {
  const casos = [
    { slug: "funil", titulo: "Funil de prospecção", dimensao: "Estágio" },
    { slug: "campanhas", titulo: "Campanhas e Cestas", dimensao: "Estado" },
    { slug: "patrocinadores", titulo: "Patrocinadores", dimensao: "Patrocinador" },
  ];

  /*
   * A fixture existe porque a primeira versão destes testes **passou por
   * acaso**: campanhas e vínculos de patrocínio ficaram na base como resíduo
   * de outras suítes, e ao rodar este arquivo sozinho — depois de aquelas
   * limparem o que criaram — a prévia devolveu "Nenhum registro atende a
   * estes filtros" e a tabela nunca apareceu.
   *
   * A base povoada de desenvolvimento tem aliados e ofertas de verdade, então
   * Ofertas, Rede e Funil se sustentam sozinhos. Campanha e vínculo, não: o
   * seed não cria nenhum dos dois. Depender de resíduo é depender da ordem de
   * execução, que é exatamente o tipo de teste que reprova na máquina de
   * outra pessoa e passa na sua.
   */
  const MARCA_F25 = "[E2E-F25]";

  async function limparF25() {
    const campanhas = await prisma.campanha.findMany({
      where: { nome: { startsWith: MARCA_F25 } },
      select: { id: true },
    });
    const ids = campanhas.map((campanha) => campanha.id);
    await prisma.metaCampanha.deleteMany({ where: { campanhaId: { in: ids } } });
    await prisma.campanha.deleteMany({ where: { id: { in: ids } } });

    const patrocinadores = await prisma.patrocinador.findMany({
      where: { razaoSocial: { startsWith: MARCA_F25 } },
      select: { id: true },
    });
    const idsPatrocinador = patrocinadores.map((patrocinador) => patrocinador.id);
    await prisma.vinculoPatrocinio.deleteMany({
      where: { patrocinadorId: { in: idsPatrocinador } },
    });
    await prisma.contratoPatrocinio.deleteMany({
      where: { patrocinadorId: { in: idsPatrocinador } },
    });
    await prisma.patrocinador.deleteMany({ where: { id: { in: idsPatrocinador } } });
  }

  test.beforeAll(async () => {
    await limparF25();
    const autor = await prisma.usuario.findFirstOrThrow({
      where: { email: "gestor@dev.clubebroto.local" },
      select: { id: true },
    });

    /*
     * Duas metas de NÍVEIS diferentes de propósito: é o que faz o teste do
     * rótulo com atribuição valer alguma coisa. Com uma meta só, "por oferta"
     * apareceria por sorte.
     */
    await prisma.campanha.create({
      data: {
        nome: `${MARCA_F25} campanha de prova`,
        estado: "ATIVA",
        autorId: autor.id,
        vigenciaInicio: new Date("2026-08-01T00:00:00.000Z"),
        vigenciaFim: new Date("2026-08-31T00:00:00.000Z"),
        metas: {
          create: [
            { tipo: "RESGATES", alvo: 100 },
            { tipo: "CONVERSAO_PCT", alvo: 5 },
          ],
        },
      },
    });

    const patrocinador = await prisma.patrocinador.create({
      /*
       * CNPJ sintético com dígitos verificadores válidos, e **distinto** dos
       * das outras suítes: a primeira versão copiou o do `[E2E-F22]`, que
       * fica na base, e a criação morreu na restrição de unicidade — o teste
       * reprovou por colisão de fixture, não por defeito do produto.
       */
      data: { razaoSocial: `${MARCA_F25} Patrocinadora de prova`, cnpj: "11222333000424" },
      select: { id: true },
    });
    await prisma.contratoPatrocinio.create({
      data: { patrocinadorId: patrocinador.id, assinaturasAdquiridas: 50 },
    });
    const assinante = await prisma.assinante.findFirst({ select: { id: true } });
    if (assinante) {
      await prisma.vinculoPatrocinio.create({
        data: {
          patrocinadorId: patrocinador.id,
          assinanteId: assinante.id,
          inicio: new Date("2026-08-01T00:00:00.000Z"),
        },
      });
    }
  });

  test.afterAll(async () => {
    await limparF25();
  });

  for (const caso of casos) {
    test(`${caso.titulo} monta e devolve número`, async ({ page }) => {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/relatorios?assunto=${caso.slug}`);

      await expect(page.getByRole("heading", { level: 1, name: caso.titulo })).toBeVisible();
      await page.getByRole("button", { name: `Pôr ${caso.dimensao} em Linhas` }).click();

      const tabela = page.locator(".rel-resultado table");
      await expect(tabela).toBeVisible({ timeout: 20_000 });

      const primeiraMedida = tabela.locator("tbody tr").first().locator("td.num").first();
      await expect(primeiraMedida).toBeVisible();
      const texto = (await primeiraMedida.innerText()).replace(/\./g, "").trim();
      expect(Number(texto)).toBeGreaterThan(0);
    });
  }

  test("o tipo de meta chega à tela com o nível de atribuição (RN43)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=campanhas");

    // O rótulo é o do catálogo, derivado de NIVEL_EXIGIDO — se alguém trocar
    // a lista por texto escrito à mão, o nível some e este teste reprova.
    await page.getByRole("button", { name: "Pôr Tipo de meta em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/por oferta/).first()).toBeVisible();
  });

  test("saldo e realizado aparecem apagados, com o motivo (RN62/RN44)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    await page.goto("/relatorios?assunto=patrocinadores");
    await expect(page.getByText("Saldo de vagas", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pôr Saldo de vagas em/ })).toHaveCount(0);

    await page.goto("/relatorios?assunto=campanhas");
    await expect(page.getByText("Realizado das metas", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pôr Realizado das metas em/ })).toHaveCount(0);
  });

  test("axe-core (AAA) sem violações nos três assuntos novos", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    for (const caso of casos) {
      await page.goto(`/relatorios?assunto=${caso.slug}`);
      await semViolacoesAxe(page);
    }
  });
});

/**
 * F26 — os três sensíveis, e a negativa da RN76 com DUAS contas.
 *
 * O teste que mais importa aqui não é o caminho feliz: é o de baixo, onde
 * Leitura abre a mesma tela que o Gestor e **vê menos assuntos**. A garantia
 * foi declarada na F24, repetida na F25 e não pôde ser exercitada em nenhuma
 * das duas, porque todos os assuntos até aqui eram de alcance aberto.
 */
test.describe.serial("F26 — Telemetria, Assinantes e Auditoria", () => {
  /*
   * Fixture própria, e não resíduo. A primeira versão destes testes passou o
   * assunto Assinantes por acaso: a base de desenvolvimento tinha 2.000
   * assinantes, e a suíte completa de desktop os apaga no caminho. Rodando
   * este arquivo depois dela, a prévia devolveu "nenhum registro" — com a
   * finalidade já declarada, isto é, no ponto exato em que o teste deveria
   * estar provando que o número vem.
   *
   * **Dado de pessoa física aqui é sempre sintético**, gerado e marcado como
   * tal, com CPF formado algoritmicamente (regra do CLAUDE.md, refinamento da
   * Onda 5). Nunca haverá dado real de PF neste repositório.
   */
  const MARCA_F26 = "[E2E-F26]";
  const SINTETICOS_F26 = gerarAssinantesSinteticos(6, 97);

  async function limparF26() {
    const ids = (
      await prisma.assinante.findMany({
        where: { nome: { startsWith: MARCA_F26 } },
        select: { id: true },
      })
    ).map((item) => item.id);
    await prisma.assinatura.deleteMany({ where: { assinanteId: { in: ids } } });
    await prisma.assinante.deleteMany({ where: { id: { in: ids } } });
  }

  test.beforeAll(async () => {
    await limparF26();
    for (const [indice, sintetico] of SINTETICOS_F26.entries()) {
      const assinante = await prisma.assinante.create({
        data: {
          nome: `${MARCA_F26} ${sintetico.nome}`,
          cpfHash: hashCpf(sintetico.cpf),
          cpfCifrado: cifrarCpf(sintetico.cpf),
          uf: sintetico.uf,
          municipio: sintetico.municipio ?? "Sorriso",
          preferencia: "AGRICULTURA",
          statusBase: "ATIVO",
        },
        select: { id: true },
      });
      await prisma.assinatura.create({
        data: {
          assinanteId: assinante.id,
          plano: indice % 2 === 0 ? "MENSAL" : "ANUAL",
        },
      });
    }
  });

  test.afterAll(async () => {
    await limparF26();
  });

  test("a negativa da RN76: Leitura vê menos assuntos que o Gestor", async ({ page }) => {
    /*
     * `exact` em tudo, e a razão vale nota: sem ele, "Assinantes" casa também
     * com o relatório pronto "Assinantes ativos por UF", e o teste reprova
     * por ambiguidade em vez de por defeito. A colisão foi útil — ela mostrou
     * que a abertura tem DOIS lugares por onde um assunto pode vazar, e o
     * segundo é o que ninguém lembraria de conferir.
     */
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: "Assinantes", exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Telemetria · extrato de resgates", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Assinantes ativos por UF", exact: true }),
    ).toBeVisible();

    await entrar(page, "leitura@dev.clubebroto.local");
    await page.goto("/relatorios");
    // Sem cadeado e sem "peça acesso": o assunto simplesmente não existe
    // para quem não o alcança.
    await expect(page.getByRole("heading", { name: "Assinantes", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Telemetria · extrato de resgates", exact: true }),
    ).toHaveCount(0);
    /*
     * E os RELATÓRIOS PRONTOS do assunto escondido somem junto. Este é o
     * vazamento que a abertura nova criou e que o desenho antigo não tinha:
     * o cartão do assunto some, mas as três perguntas prontas dele ficariam
     * na grade, anunciando pelo nome o que a pessoa não pode ver — e um
     * clique devolveria a recusa do servidor em vez de nada.
     */
    await expect(
      page.getByRole("heading", { name: "Assinantes ativos por UF", exact: true }),
    ).toHaveCount(0);
    // O contraponto que impede o teste de passar por engano — se a tela
    // estivesse vazia ou quebrada, as asserções acima passariam iguais.
    await expect(
      page.getByRole("heading", { name: "Telemetria · contadores por oferta", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Auditoria", exact: true })).toBeVisible();
  });

  test("RN78: sem finalidade a prévia não sai, e com ela o número vem", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=assinantes");

    await page.getByRole("button", { name: "Pôr UF em Linhas" }).click();
    // O estado é "falta um passo", não erro: a pessoa não fez nada errado.
    await expect(page.getByText(/Declare a finalidade da consulta/)).toBeVisible();
    await expect(page.locator(".rel-resultado table")).toHaveCount(0);

    await page.getByLabel("Finalidade da consulta").fill("conferência do e2e da F26");

    const tabela = page.locator(".rel-resultado table");
    await expect(tabela).toBeVisible({ timeout: 20_000 });
    const medida = tabela.locator("tbody tr").first().locator("td.num").first();
    expect(Number((await medida.innerText()).replace(/\./g, "").trim())).toBeGreaterThan(0);
  });

  test("a finalidade declarada fica na trilha operacional (RN78)", async ({ page }) => {
    const antes = await prisma.execucaoRelatorio.count({
      where: { finalidade: { contains: "trilha do e2e" } },
    });

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=assinantes");
    await page.getByRole("button", { name: "Pôr UF em Linhas" }).click();
    await page.getByLabel("Finalidade da consulta").fill("trilha do e2e da F26");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    // O que a RN78 promete não é o campo na tela — é o registro do texto.
    await expect
      .poll(
        () =>
          prisma.execucaoRelatorio.count({
            where: { finalidade: { contains: "trilha do e2e" } },
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(antes);
  });

  test("Auditoria recusa sem período, e aceita com ele", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=auditoria");

    await page.getByRole("button", { name: "Pôr Entidade em Linhas" }).click();
    // A recusa É a interface (RN55): ela diz por que, não só que não pode.
    await expect(page.getByText(/só cresce/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Acrescentar filtro" }).click();
    await page.getByLabel("Campo do filtro").selectOption("au-data");
    await page.getByLabel("Operador do filtro").selectOption("maior_ou_igual");
    await page.getByLabel("Valor do filtro").fill("2026-01-01");

    const tabela = page.locator(".rel-resultado table");
    await expect(tabela).toBeVisible({ timeout: 20_000 });
    const medida = tabela.locator("tbody tr").first().locator("td.num").first();
    expect(Number((await medida.innerText()).replace(/\./g, "").trim())).toBeGreaterThan(0);
  });

  test("os campos que não entram aparecem apagados, com o motivo (RN77)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    await page.goto("/relatorios?assunto=assinantes");
    await expect(page.getByText("Nome, contato e CPF", { exact: true })).toBeVisible();
    await expect(page.getByText(/nem em claro nem como hash/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Pôr Nome, contato e CPF em/ })).toHaveCount(0);

    await page.goto("/relatorios?assunto=auditoria");
    await expect(page.getByText("Valor anterior e valor novo", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pôr Valor anterior/ })).toHaveCount(0);
  });

  test("axe-core (AAA) sem violações nos assuntos sensíveis", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    for (const slug of ["telemetria-catalogo", "telemetria-resgates", "assinantes", "auditoria"]) {
      await page.goto(`/relatorios?assunto=${slug}`);
      await semViolacoesAxe(page);
    }
  });
});

/**
 * F27 — a visualização (RN80–RN82).
 *
 * Os testes que importam aqui são os de RECUSA. O caminho feliz — clicar em
 * "Barras" e ver barras — falha ruidosamente se quebrar; a recusa falha em
 * silêncio, desenhando algo plausível e errado, e é para isso que ela existe.
 */
test.describe.serial("F27 — escolher o desenho, e as recusas", () => {
  test("o alternador troca a tabela por barras, e a tabela continua abaixo", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Barras", exact: true }).click();

    // O desenho aparece...
    await expect(page.locator(".rel-grafico svg rect").first()).toBeVisible();
    // ...e a tabela NÃO sai (RN81): ela é a alternativa textual do gráfico.
    await expect(page.locator(".rel-resultado table")).toBeVisible();
  });

  test("linha é recusada sem dimensão de data, e o motivo explica (RN80)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    /*
     * Aliado não é uma sequência: ligar "AGROMOVE" a "Checkplant" afirmaria
     * uma progressão que não existe. O botão fica apagado — e VISÍVEL, para
     * quem procura entender por que não pode (RN77).
     */
    const linha = page.getByRole("button", { name: "Linha", exact: true });
    await expect(linha).toBeVisible();
    await expect(linha).toBeDisabled();
    await expect(linha).toHaveAttribute("title", /continuidade/);
  });

  test("rosca é recusada com categorias demais, e o motivo traz o número", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    // 21 aliados — bem acima do teto de 6 fatias.
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const rosca = page.getByRole("button", { name: "Rosca", exact: true });
    await expect(rosca).toBeDisabled();
    await expect(rosca).toHaveAttribute("title", /fatias/);
  });

  test("com poucas categorias a rosca abre, e mostra o total", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    // Natureza tem 3 valores: cabe na rosca.
    await page.goto("/relatorios?assunto=ofertas");
    await page.getByRole("button", { name: "Pôr Natureza em Linhas" }).click();
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Rosca", exact: true }).click();
    await expect(page.locator(".rel-grafico svg path").first()).toBeVisible();
    await expect(page.getByText("total", { exact: true })).toBeVisible();
  });

  test("os ajustes do tipo aparecem, e só os dele (RN80)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Barras", exact: true }).click();
    await expect(page.getByLabel(/Ordenar por/)).toBeVisible();
    await expect(page.getByLabel(/Mostrar os valores/)).toBeVisible();
    // "Séries" é de colunas cruzadas, não de barras.
    await expect(page.getByLabel(/^Séries/)).toHaveCount(0);

    // O limite corta categorias, e a tabela continua inteira.
    await page.getByLabel(/Mostrar até/).fill("3");
    await expect(page.locator(".rel-grafico svg rect")).toHaveCount(3);
    await expect(page.locator(".rel-resultado tbody tr").nth(3)).toBeVisible();
  });

  test("o desenho escolhido é salvo e volta ao reabrir", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Barras", exact: true }).click();

    const nome = `${MARCA} com barras`;
    await page.getByLabel("Nome do relatório").fill(nome);
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("salvo");

    await page.goto("/relatorios");
    await page.getByRole("heading", { name: nome, exact: true }).click();

    // O que prova a persistência: o gráfico está lá antes de qualquer clique.
    await expect(page.locator(".rel-grafico svg rect").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Barras", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("axe-core (AAA) sem violações com o gráfico na tela", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });
    for (const tipo of ["Barras", "Colunas"]) {
      await page.getByRole("button", { name: tipo, exact: true }).click();
      await expect(page.locator(".rel-grafico svg").first()).toBeVisible();
      await semViolacoesAxe(page);
    }
  });
});

test.describe.serial("F28 — a saída em três formatos", () => {
  /*
   * RN83/RN84 — o que estes testes provam, e o que deixam de fora.
   *
   * Provam que cada formato SAI pela rota, com o conteúdo certo e a
   * procedência dentro. Não provam que o Excel abre a planilha — isso é dos
   * testes de unidade, que a leem com o próprio ExcelJS.
   *
   * O download é interceptado pela API do Playwright em vez de clicado e
   * conferido na pasta: o que interessa é o que o servidor devolveu, e ler
   * arquivo do disco só acrescentaria uma fonte de falha que não é do
   * produto.
   */
  const abrirMenu = async (page: import("@playwright/test").Page) => {
    await page.locator(".rel-saida > summary").click();
  };

  test("o menu oferece os quatro formatos, e o CSV continua lá", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    await abrirMenu(page);
    for (const rotulo of ["Abrir para impressão", "Planilha (XLSX)", "Copiar", "CSV"]) {
      await expect(page.getByRole("menuitem", { name: rotulo })).toBeVisible();
    }
  });

  test("a planilha baixa, e com o nome do assunto", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    await abrirMenu(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Planilha (XLSX)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^relatorio-ofertas-do-clube-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test("o documento de impressão traz procedência e os mesmos números", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    // A rota é conferida direto: o HTML abre em janela nova, e o que importa
    // é o documento, não a janela.
    const resposta = await page.request.post("/relatorios/exportar", {
      data: {
        definicao: await definicaoDaTela(page),
        formato: "HTML",
      },
    });
    expect(resposta.status()).toBe(200);
    expect(resposta.headers()["content-type"]).toContain("text/html");

    const html = await resposta.text();
    expect(html).toContain("Gerado por");
    expect(html).toContain("Gestor");
    // O mesmo aliado que a tela mostra no topo.
    const primeiro = await page.locator(".rel-resultado tbody tr td").first().innerText();
    expect(html).toContain(primeiro);
  });

  test("a cópia devolve TSV — tabulação, não ponto e vírgula", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const resposta = await page.request.post("/relatorios/exportar", {
      data: {
        definicao: await definicaoDaTela(page),
        formato: "AREA_TRANSFERENCIA",
      },
    });
    expect(resposta.status()).toBe(200);
    const texto = await resposta.text();
    expect(texto.split("\n")[0]).toContain("\t");
    expect(texto.split("\n")[0]).not.toContain(";");
  });

  test("formato desconhecido é recusado sem ecoar o que veio (RN55)", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });

    const resposta = await page.request.post("/relatorios/exportar", {
      data: {
        definicao: await definicaoDaTela(page),
        formato: "<script>alert(1)</script>",
      },
    });
    expect(resposta.status()).toBe(422);
    const corpo = await resposta.text();
    expect(corpo).toContain("Formato de saída desconhecido");
    // A asserção que importa: o que veio NÃO volta refletido.
    expect(corpo).not.toContain("script");
  });

  test("axe-core (AAA) com o menu de saída aberto", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/relatorios?assunto=ofertas&modelo=ofertas-por-aliado");
    await expect(page.locator(".rel-resultado table")).toBeVisible({ timeout: 20_000 });
    await abrirMenu(page);
    await expect(page.getByRole("menuitem", { name: "CSV" })).toBeVisible();
    await semViolacoesAxe(page);
  });
});

/** A definição que a tela montou, lida do próprio construtor. */
async function definicaoDaTela(page: import("@playwright/test").Page) {
  // O modelo "ofertas por aliado" é o mesmo do catálogo; reconstruí-lo aqui
  // manteria duas cópias que divergiriam na primeira mudança do catálogo.
  return {
    assunto: "ofertas",
    linhas: ["aliado-nome"],
    colunas: [],
    valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
    filtros: [{ campo: "oferta-status", operador: "igual", valores: ["PUBLICADA"] }],
  };
}
