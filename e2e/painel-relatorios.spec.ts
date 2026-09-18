import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { gerarAssinantesSinteticos } from "../infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "../infra/assinantes/protecao-cpf";
import { entrar, resolverDatabaseUrl, semViolacoesAxe } from "./ajudantes";

/**
 * T37 — Painel de relatórios (Onda 18, F30).
 *
 * Os dois testes que importam aqui são os de **recusa**, e nenhum deles tem
 * equivalente em teste de unidade — os dois dependem de duas contas
 * diferentes, de uma sessão de verdade e do banco povoado:
 *
 *  • **RN87** — um painel do time com bloco que quem abre não alcança: o
 *    bloco recusa **sozinho** e os demais carregam. O defeito que o teste
 *    impede é o painel cair inteiro, que tiraria de quem abre justamente os
 *    blocos que ele pode ver.
 *  • **RN88** — bloco de dado pessoal **não carrega ao abrir**. É o ponto
 *    onde o painel destruiria a RN78 sem que ninguém percebesse: a
 *    finalidade viraria consequência de ter aberto uma página.
 */

resolverDatabaseUrl();

const prisma = new PrismaClient();
const MARCA = "[E2E-F30]";

/*
 * Blocos montados à mão, e não pela interface: a F30 só cria painel de UM
 * bloco ("Pôr no painel"), e o que se quer provar exige um painel misto —
 * um bloco que quem abre alcança ao lado de um que não.
 */
const BLOCO_OFERTAS = {
  titulo: `${MARCA} Ofertas por aliado`,
  definicao: {
    assunto: "ofertas",
    linhas: ["aliado-nome"],
    colunas: [],
    valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
    filtros: [],
  },
  visualizacao: { tipo: "TABELA", ajustes: {} },
  largura: "METADE",
};

/** Assinantes alcança GESTOR e ADMIN — e mais ninguém. É o que torna a RN87 testável. */
const BLOCO_ASSINANTES = {
  titulo: `${MARCA} Assinantes por UF`,
  definicao: {
    assunto: "assinantes",
    linhas: ["as-uf"],
    colunas: [],
    valores: [{ campo: "as-uf", agregacao: "QUANTOS" }],
    filtros: [],
  },
  visualizacao: { tipo: "TABELA", ajustes: {} },
  largura: "METADE",
};

let painelId = "";

/**
 * Assinantes sintéticos, gerados para este teste.
 *
 * A suíte de e2e ZERA o módulo de assinantes na preparação, então o bloco de
 * dado pessoal carregaria uma tabela vazia — e o teste passaria sem provar
 * nada, porque "sem linha" é indistinguível de "não carregou". Descobri isso
 * rodando: os dois testes de recusa passaram e o de carregamento falhou.
 *
 * São SINTÉTICOS e marcados como tal, com CPF formado algoritmicamente
 * (regra do CLAUDE.md). Nunca haverá dado real de PF neste repositório.
 */
const SINTETICOS = gerarAssinantesSinteticos(4, 131);

test.beforeAll(async () => {
  await limpar();
  for (const sintetico of SINTETICOS) {
    await prisma.assinante.create({
      data: {
        nome: `${MARCA} ${sintetico.nome}`,
        cpfHash: hashCpf(sintetico.cpf),
        cpfCifrado: cifrarCpf(sintetico.cpf),
        uf: sintetico.uf,
        municipio: sintetico.municipio ?? "Sorriso",
        preferencia: "AGRICULTURA",
        statusBase: "ATIVO",
      },
    });
  }
  const gestor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
  const painel = await prisma.painel.create({
    data: {
      nome: `${MARCA} Segunda-feira`,
      // Do time, de propósito: é a visibilidade em que a RN87 tem efeito.
      visibilidade: "TIME",
      autorId: gestor.id,
      blocos: [BLOCO_OFERTAS, BLOCO_ASSINANTES],
    },
    select: { id: true },
  });
  painelId = painel.id;
});

test.afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function limpar() {
  await prisma.assinante.deleteMany({ where: { nome: { startsWith: MARCA } } });

  const paineis = await prisma.painel.findMany({
    where: { nome: { startsWith: MARCA } },
    select: { id: true },
  });
  const ids = paineis.map((p) => p.id);
  if (ids.length === 0) return;
  await prisma.execucaoRelatorio.updateMany({
    where: { painelId: { in: ids } },
    data: { painelId: null },
  });
  await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
  await prisma.painel.deleteMany({ where: { id: { in: ids } } });
}

test.describe.serial("T37 — o painel, e as duas recusas que importam", () => {
  test("RN87: o bloco fora do alcance recusa SOZINHO, e o outro carrega", async ({ page }) => {
    // Analista não alcança Assinantes; alcança Ofertas.
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${painelId}`);

    const semAlcance = page.getByRole("region", { name: `${MARCA} Assinantes por UF` });
    await expect(semAlcance).toBeVisible();
    await expect(semAlcance).toContainText(/não alcança/i);

    /*
     * A asserção que dá sentido à anterior: o OUTRO bloco carregou, com dado.
     * Sem ela, o teste passaria num painel que falhou inteiro — que é
     * exatamente o defeito que a RN87 existe para impedir.
     */
    const comAlcance = page.getByRole("region", { name: `${MARCA} Ofertas por aliado` });
    await expect(comAlcance.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });

    // E o painel em si não foi escondido nem derrubado.
    await expect(page.getByRole("heading", { name: `${MARCA} Segunda-feira` })).toBeVisible();
  });

  test("RN88: o bloco de dado pessoal NÃO carrega ao abrir", async ({ page }) => {
    // Gestor ALCANÇA Assinantes — então o que segura o bloco aqui não é
    // permissão, é a finalidade. É a distinção que o teste precisa isolar.
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${painelId}`);

    const bloco = page.getByRole("region", { name: `${MARCA} Assinantes por UF` });
    await expect(bloco).toContainText(/finalidade/i);

    // O bloco vizinho carrega, o que prova que a página não está travada.
    const ofertas = page.getByRole("region", { name: `${MARCA} Ofertas por aliado` });
    await expect(ofertas.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });

    /*
     * A asserção central: passado o tempo em que o bloco vizinho já carregou,
     * o de dado pessoal continua SEM tabela. Se ele disparasse ao montar, ela
     * já estaria aqui.
     */
    await expect(bloco.locator("table")).toHaveCount(0);
  });

  test("RN88: declarada a finalidade, o bloco carrega", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${painelId}`);

    const bloco = page.getByRole("region", { name: `${MARCA} Assinantes por UF` });
    await bloco.getByLabel("Finalidade do acesso").fill("Conferência da carteira — teste");
    await bloco.getByRole("button", { name: "Carregar" }).click();

    await expect(bloco.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
  });

  test("a execução do bloco fica na trilha, AMARRADA ao painel (RN86)", async ({ page }) => {
    /*
     * Sem `painelId`, abrir um painel de oito blocos apareceria na trilha
     * como oito consultas soltas no mesmo segundo — indistinguível de
     * alguém varrendo a plataforma à mão.
     */
    const antes = await prisma.execucaoRelatorio.count({ where: { painelId } });

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${painelId}`);
    await expect(
      page.getByRole("region", { name: `${MARCA} Ofertas por aliado` }).locator("table tbody tr").first(),
    ).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(() => prisma.execucaoRelatorio.count({ where: { painelId } }), { timeout: 15_000 })
      .toBeGreaterThan(antes);
  });

  test("a galeria lista o painel do time para quem não é o autor", async ({ page }) => {
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto("/paineis");
    await expect(page.getByRole("link", { name: new RegExp(MARCA) })).toBeVisible();
  });

  test("axe-core (AAA) sem violações no painel aberto", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${painelId}`);
    await expect(
      page.getByRole("region", { name: `${MARCA} Ofertas por aliado` }).locator("table"),
    ).toBeVisible({ timeout: 20_000 });
    await semViolacoesAxe(page);
  });
});

test.describe.serial("T37 — RN89: o filtro por eixo, e o que ele NÃO alcança", () => {
  let comFiltroId = "";

  test.beforeAll(async () => {
    await prisma.painel.deleteMany({ where: { nome: { startsWith: `${MARCA} filtrado` } } });
    const gestor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    const painel = await prisma.painel.create({
      data: {
        nome: `${MARCA} filtrado`,
        visibilidade: "PRIVADO",
        autorId: gestor.id,
        /*
         * O par que prova a regra: Auditoria DECLARA o eixo Período
         * (`au-data`), e Assinantes NÃO declara — a única data dela é o
         * vencimento, que é futuro. Lado a lado, um bloco é filtrado e o
         * outro não, que é exatamente a situação que a RN89 existe para
         * tornar visível.
         */
        blocos: [
          {
            titulo: `${MARCA} Auditoria por entidade`,
            definicao: {
              assunto: "auditoria",
              linhas: ["au-entidade"],
              colunas: [],
              valores: [{ campo: "au-entidade", agregacao: "QUANTOS" }],
              filtros: [
                { campo: "au-data", operador: "maior_ou_igual", valores: ["2000-01-01"] },
              ],
            },
            visualizacao: { tipo: "TABELA", ajustes: {} },
            largura: "METADE",
          },
          BLOCO_ASSINANTES,
        ],
        filtro: { periodo: { de: "2020-01-01", ate: "2030-12-31" } },
      },
      select: { id: true },
    });
    comFiltroId = painel.id;
  });

  test.afterAll(async () => {
    await prisma.execucaoRelatorio.updateMany({
      where: { painelId: comFiltroId },
      data: { painelId: null },
    });
    await prisma.painel.deleteMany({ where: { id: comFiltroId } });
  });

  test("o bloco que NÃO comporta o eixo avisa, e diz qual", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${comFiltroId}`);

    const semEixo = page.getByRole("region", { name: `${MARCA} Assinantes por UF` });
    await expect(semEixo.getByRole("note")).toContainText("Período");
    // E diz o que a pessoa está vendo, não só que o filtro falhou.
    await expect(semEixo.getByRole("note")).toContainText("conjunto inteiro");
  });

  test("o bloco que comporta o eixo NÃO avisa — o aviso não é decorativo", async ({ page }) => {
    /*
     * A asserção que dá sentido à anterior. Um aviso que aparecesse em todo
     * bloco não informaria nada: a pessoa aprenderia a ignorá-lo, e no dia
     * em que ele importasse ela não o leria.
     */
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${comFiltroId}`);

    const comEixo = page.getByRole("region", { name: `${MARCA} Auditoria por entidade` });
    await expect(comEixo.locator("table")).toBeVisible({ timeout: 20_000 });
    await expect(comEixo.getByRole("note")).toHaveCount(0);
  });

  test("o filtro vigente aparece no alto do painel", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${comFiltroId}`);
    await expect(page.locator(".pn-filtro")).toContainText("Período");
  });

  test("axe-core (AAA) com o filtro e o aviso na tela", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/paineis?painel=${comFiltroId}`);
    await expect(
      page.getByRole("region", { name: `${MARCA} Auditoria por entidade` }).locator("table"),
    ).toBeVisible({ timeout: 20_000 });
    await semViolacoesAxe(page);
  });
});
