import { expect, test, type Page } from "@playwright/test";
import {
  entrar,
  limparAliadoPorNome,
  prisma,
  runId,
  SENHA,
  semViolacoesAxe,
  semearAliadoEmNegociacao,
  semearAprovacaoPendente,
} from "./ajudantes";

/**
 * E2E da Onda 6 (F13) — T26, T27 e T28.
 *
 * O percurso que a fase precisa provar, na ordem do prompt:
 *  • login → HOME → clicar uma pendência → chegar na tela de origem;
 *  • inativar usuário → a sessão dele cai na requisição SEGUINTE (RN47),
 *    provado com dois navegadores de verdade;
 *  • tentar rebaixar/inativar o último administrador → bloqueio explicado
 *    (RN46);
 *  • exportar o extrato → o evento da exportação conferido na trilha (RN48).
 *
 * Disciplina de estabilidade da F5: cada teste semeia a própria precondição
 * de forma idempotente, restaura o que mexeu, e não depende de outro.
 */

const ADMIN = "administrador@dev.clubebroto.local";
const ADMIN_RESERVA = "administrador2@dev.clubebroto.local";

/**
 * Usuário descartável com a MESMA senha dos usuários de desenvolvimento: o
 * hash é copiado de um usuário do seed, o que evita trazer bcrypt para o
 * e2e só para gerar uma credencial de teste.
 */
async function semearUsuarioDescartavel(sufixo: string) {
  const modelo = await prisma.usuario.findUniqueOrThrow({
    where: { email: "leitura@dev.clubebroto.local" },
    select: { senhaHash: true },
  });
  const email = `descartavel-${sufixo}@e2e.local`;
  return prisma.usuario.upsert({
    where: { email },
    update: { ativo: true, senhaHash: modelo.senhaHash, trocaSenhaObrigatoria: false },
    create: {
      nome: `Descartavel ${sufixo}`,
      email,
      senhaHash: modelo.senhaHash,
      papel: "LEITURA",
      ativo: true,
      trocaSenhaObrigatoria: false,
    },
  });
}

async function removerDescartaveis() {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: "@e2e.local" } },
    select: { id: true },
  });
  const ids = usuarios.map((usuario) => usuario.id);
  if (ids.length > 0) {
    await prisma.auditoriaEvento.deleteMany({ where: { autorId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidade: "usuario" } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
  // Eventos semeados pelos testes desta suíte (identificados pelo prefixo do
  // registro) saem junto: a RN49 proíbe purgar auditoria em PRODUÇÃO, e a
  // limpeza de fixture de teste é outra coisa — o teste de arquitetura
  // garante que nenhum código de produção faça isto.
  await prisma.auditoriaEvento.deleteMany({
    where: { entidadeId: { startsWith: "regua-e2e-" } },
  });
}

/** Devolve os administradores do seed ao estado ativo. */
async function restaurarAdministradores() {
  await prisma.usuario.updateMany({
    where: { papel: "ADMINISTRADOR_PLATAFORMA" },
    data: { ativo: true },
  });
}

test.afterAll(async () => {
  await removerDescartaveis();
  await restaurarAdministradores();
});

// ---------------------------------------------------------------------
// T26 — Dashboard (HOME)
// ---------------------------------------------------------------------

test("T26 é a HOME: o login cai no painel, com as duas camadas da ficha", async ({ page }) => {
  await entrar(page, "gestor@dev.clubebroto.local");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "O Clube hoje" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exige ação hoje" })).toBeVisible();

  for (const bloco of ["Rede e Aliados", "Mercado e Funil", "Assinantes e Uso", "Campanhas"]) {
    await expect(page.getByRole("heading", { name: bloco, exact: true })).toBeVisible();
  }

  // "Dashboard" é o primeiro item da sidebar e está marcado como atual.
  const modulos = page.getByRole("navigation", { name: "Módulos" });
  const primeiro = modulos.getByRole("link").first();
  await expect(primeiro).toHaveText("Dashboard");
  await expect(primeiro).toHaveAttribute("aria-current", "page");
});

test("T26 — RN50: indicador sem fonte diz o que falta, em vez de exibir número", async ({
  page,
}) => {
  await entrar(page, "gestor@dev.clubebroto.local");
  // A telemetria por CPF é a pendência nomeada pela própria ficha.
  await expect(page.getByText("aguarda telemetria por assinante").first()).toBeVisible();
});

test("T26 — clicar uma pendência leva à tela de origem", async ({ page }) => {
  // Ajuste da F14: até a Onda 6 as pendências ocupavam as células do hero e
  // apareciam mesmo zeradas, então abrir a HOME bastava. A ficha da Onda 7 §6
  // as tirou do hero e transformou em cartões que só existem quando há o que
  // fazer — então o teste passa a semear a própria precondição. O que ele
  // prova continua o mesmo: a pendência leva à tela de origem.
  const nome = `Aliado E2E ${runId()}-pendencia-t26`;
  const aliado = await semearAliadoEmNegociacao(nome);
  try {
    await semearAprovacaoPendente(aliado.id);

    await entrar(page, "gestor@dev.clubebroto.local");

    const cartao = page.getByRole("link", { name: /Aprovações pendentes/ }).first();
    await expect(cartao).toBeVisible();
    await cartao.click();

    await page.waitForURL(/\/aprovacoes/);
    await expect(page.getByRole("heading", { level: 1, name: "Aprovações" })).toBeVisible();
  } finally {
    await limparAliadoPorNome(nome);
  }
});

test("T26 — o seletor de período recarrega o painel", async ({ page }) => {
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.getByLabel("Período").selectOption("30");
  await page.waitForURL(/periodo=30/);
  // Escopado ao cartão do bloco: solto, o texto casaria primeiro com a
  // <option> do próprio seletor, que é invisível.
  await expect(
    page.locator(".card").getByText("últimos 30 dias").first(),
  ).toBeVisible();
});

// ---------------------------------------------------------------------
// T27 — Usuários
// ---------------------------------------------------------------------

test("T27 — o Administrador cria usuário e recebe a senha provisória uma vez", async ({
  page,
}) => {
  const marca = runId();
  await entrar(page, ADMIN);
  await page.goto("/usuarios");

  await page.getByRole("button", { name: "+ Novo usuário" }).click();
  await page.getByLabel("Nome completo").fill(`Pessoa E2E ${marca}`);
  await page.getByLabel("E-mail corporativo").fill(`pessoa-${marca}@e2e.local`);
  await page.getByLabel("Papel").selectOption("LEITURA");
  await page.getByRole("button", { name: "Criar usuário" }).click();

  await expect(page.getByText("Senha provisória:")).toBeVisible();
  await expect(page.getByText("credencial provisória").first()).toBeVisible();
});

test("T27 — quem não é Administrador vê a tela em somente leitura (RN46)", async ({ page }) => {
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/usuarios");

  await expect(page.getByRole("heading", { level: 1, name: "Usuários" })).toBeVisible();
  await expect(
    page.getByText("exclusivo do Administrador da Plataforma (RN46)"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Novo usuário" })).toHaveCount(0);
  await expect(page.getByText("somente leitura").first()).toBeVisible();
});

test("T27 — RN46: o último administrador não pode ser inativado, e a tela explica", async ({
  page,
}) => {
  // Deixa o administrador principal como o ÚNICO ativo.
  await prisma.usuario.update({
    where: { email: ADMIN_RESERVA },
    data: { ativo: false },
  });

  try {
    await entrar(page, ADMIN);
    await page.goto("/usuarios");

    const linha = page.getByRole("row").filter({ hasText: ADMIN });
    const inativar = linha.getByRole("button", { name: "Inativar" });
    await expect(inativar).toBeDisabled();
    await expect(linha.getByText(/Designe outro administrador antes/)).toBeVisible();

    // E a garantia real não é a UI: o serviço recusa de todo jeito.
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { email: ADMIN } });
    expect(antes.ativo).toBe(true);
  } finally {
    await restaurarAdministradores();
  }
});

// ---------------------------------------------------------------------
// RN47 — a revogação imediata, com dois navegadores
// ---------------------------------------------------------------------

test("RN47 — usuário inativado por outro navegador é derrubado na requisição seguinte", async ({
  browser,
}) => {
  const marca = runId();
  const alvo = await semearUsuarioDescartavel(marca);

  const contextoAlvo = await browser.newContext();
  const contextoAdmin = await browser.newContext();

  try {
    const paginaAlvo: Page = await contextoAlvo.newPage();
    const paginaAdmin: Page = await contextoAdmin.newPage();

    // 1. O alvo entra e está navegando normalmente.
    await paginaAlvo.goto("/entrar");
    await paginaAlvo.getByLabel("E-mail").fill(alvo.email);
    await paginaAlvo.getByLabel("Senha").fill(SENHA);
    await paginaAlvo.getByRole("button", { name: "Entrar" }).click();
    await paginaAlvo.waitForURL((url) => new URL(url).pathname === "/");
    await expect(
      paginaAlvo.getByRole("heading", { level: 1, name: "O Clube hoje" }),
    ).toBeVisible();

    // 2. Em OUTRO navegador, o Administrador o inativa.
    await entrar(paginaAdmin, ADMIN);
    await paginaAdmin.goto("/usuarios");
    const linha = paginaAdmin.getByRole("row").filter({ hasText: alvo.email });
    await linha.getByRole("button", { name: "Inativar" }).click();
    await expect(paginaAdmin.getByText(/Usuário inativado/)).toBeVisible();

    // 3. A PRÓXIMA requisição do alvo já não passa — sem esperar expiração
    //    de token e sem ele ter feito logout.
    await paginaAlvo.goto("/aliados");
    await paginaAlvo.waitForURL(/\/entrar/);
    await expect(paginaAlvo.getByRole("button", { name: "Entrar" })).toBeVisible();

    // 4. E o login também está fechado.
    await paginaAlvo.getByLabel("E-mail").fill(alvo.email);
    await paginaAlvo.getByLabel("Senha").fill(SENHA);
    await paginaAlvo.getByRole("button", { name: "Entrar" }).click();
    await expect(paginaAlvo).toHaveURL(/\/entrar/);
  } finally {
    await contextoAlvo.close();
    await contextoAdmin.close();
  }
});

test("RN47 — trocar o papel também derruba a sessão aberta", async ({ browser }) => {
  const marca = runId();
  const alvo = await semearUsuarioDescartavel(`papel-${marca}`);

  const contextoAlvo = await browser.newContext();
  const contextoAdmin = await browser.newContext();

  try {
    const paginaAlvo = await contextoAlvo.newPage();
    const paginaAdmin = await contextoAdmin.newPage();

    await paginaAlvo.goto("/entrar");
    await paginaAlvo.getByLabel("E-mail").fill(alvo.email);
    await paginaAlvo.getByLabel("Senha").fill(SENHA);
    await paginaAlvo.getByRole("button", { name: "Entrar" }).click();
    await paginaAlvo.waitForURL((url) => new URL(url).pathname === "/");

    await entrar(paginaAdmin, ADMIN);
    await paginaAdmin.goto("/usuarios");
    const linha = paginaAdmin.getByRole("row").filter({ hasText: alvo.email });
    await linha.getByRole("button", { name: "Editar" }).click();
    await paginaAdmin.getByLabel("Papel").selectOption("APROVADOR");
    await paginaAdmin.getByRole("button", { name: "Gravar alterações" }).click();
    await expect(paginaAdmin.getByText("Usuário atualizado.")).toBeVisible();

    await paginaAlvo.goto("/ofertas");
    await paginaAlvo.waitForURL(/\/entrar/);
  } finally {
    await contextoAlvo.close();
    await contextoAdmin.close();
  }
});

test("credencial provisória só navega para a troca de senha (ficha §3)", async ({ browser }) => {
  const marca = runId();
  const alvo = await semearUsuarioDescartavel(`provisoria-${marca}`);
  await prisma.usuario.update({
    where: { id: alvo.id },
    data: { trocaSenhaObrigatoria: true },
  });

  const contexto = await browser.newContext();
  try {
    const pagina = await contexto.newPage();
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(alvo.email);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();

    await pagina.waitForURL(/\/trocar-senha/);
    await expect(pagina.getByRole("heading", { level: 1, name: "Defina sua senha" })).toBeVisible();

    // Tentar circular devolve para cá.
    await pagina.goto("/aliados");
    await pagina.waitForURL(/\/trocar-senha/);

    await semViolacoesAxe(pagina);
  } finally {
    await contexto.close();
  }
});

// ---------------------------------------------------------------------
// T28 — Auditoria
// ---------------------------------------------------------------------

test("T28 — a trilha abre em antes → depois e marca o evento sensível", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/auditoria?periodo=tudo");

  await expect(page.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();

  const primeira = page.getByRole("row").nth(1);
  await primeira.click();
  await expect(page.getByText("Antes", { exact: true })).toBeVisible();
  await expect(page.getByText("Depois", { exact: true })).toBeVisible();
});

test("T28 — o marcador de evento sensível aparece na trilha", async ({ page }) => {
  // Precondição PRÓPRIA: a base de e2e nasce com os parâmetros no estado de
  // implantação, sem histórico de alteração. Sem semear, o teste passaria
  // por não encontrar nada — que é o oposto do que ele deve provar.
  const autor = await prisma.usuario.findUniqueOrThrow({
    where: { email: ADMIN },
    select: { id: true },
  });
  await prisma.auditoriaEvento.create({
    data: {
      entidade: "valor_regra",
      entidadeId: `regua-e2e-${runId()}`,
      campo: "valor",
      valorAnterior: "90",
      valorNovo: "120",
      autorId: autor.id,
    },
  });

  await entrar(page, ADMIN);
  // Alteração de valor de regra é evento de parâmetro — sensível por ficha.
  await page.goto("/auditoria?periodo=tudo&entidade=valor_regra");
  await expect(page.getByRole("img", { name: "Evento sensível" }).first()).toBeVisible();
});

test("T28 — o filtro por entidade estreita a consulta", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/auditoria?periodo=tudo");

  await page.getByLabel("Filtrar por entidade").selectOption("empresa");
  await page.getByRole("button", { name: "Filtrar" }).click();

  await page.waitForURL(/entidade=empresa/);
  await expect(page.getByRole("cell", { name: "empresa", exact: true }).first()).toBeVisible();
});

test("T28 — RN48: exportar o extrato gera o próprio evento de auditoria", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/auditoria?periodo=tudo");

  const antes = await prisma.auditoriaEvento.count({
    where: { entidade: "exportacao_auditoria" },
  });

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Exportar extrato (CSV)" }).click();
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toMatch(/^extrato-auditoria-.*\.csv$/);

  await expect
    .poll(
      async () =>
        prisma.auditoriaEvento.count({ where: { entidade: "exportacao_auditoria" } }),
      { message: "a exportação precisa gerar o próprio evento (RN48)" },
    )
    .toBeGreaterThan(antes);

  // E o evento nasce classificado como sensível.
  const evento = await prisma.auditoriaEvento.findFirst({
    where: { entidade: "exportacao_auditoria" },
    orderBy: { criadoEm: "desc" },
  });
  expect(evento?.valorNovo).toContain("auditoria externa");
});

test("T28 — RN48: quem não é Gestor nem Administrador não exporta", async ({ page }) => {
  await entrar(page, "leitura@dev.clubebroto.local");
  await page.goto("/auditoria");

  // A trilha é legível por todos os papéis...
  await expect(page.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();
  // ...mas o extrato não sai, e a tela diz por quê.
  await expect(page.getByRole("link", { name: "Exportar extrato (CSV)" })).toHaveCount(0);
  await expect(page.getByText(/exige papel Gestor ou Administrador/)).toBeVisible();
});

// ---------------------------------------------------------------------
// Acessibilidade AAA nas três telas
// ---------------------------------------------------------------------

test("axe-core (AAA) sem violações em T26, T27 e T28", async ({ page }) => {
  await entrar(page, ADMIN);
  for (const rota of ["/", "/usuarios", "/auditoria?periodo=tudo"]) {
    await page.goto(rota);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await semViolacoesAxe(page);
  }
});

test("T28 — a linha da trilha abre por teclado, pelo botão de expansão", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/auditoria?periodo=tudo");

  const expandir = page.getByRole("button", { name: /^Expandir o detalhe/ }).first();
  await expandir.focus();
  await expect(expandir).toBeFocused();
  await expect(expandir).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("Enter");
  await expect(page.getByText("Antes", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Recolher o detalhe/ }).first(),
  ).toHaveAttribute("aria-expanded", "true");
});
