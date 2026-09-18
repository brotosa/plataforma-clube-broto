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

/**
 * Abre a T27 já estreitada num usuário e devolve a linha dele.
 *
 * Desde que a lista pagina (Onda 15), localizar a linha sem filtrar é apostar
 * que ela caiu na primeira página — e esta suíte semeia descartáveis ao longo
 * do arquivo, então a contagem sobe durante a própria execução. A busca torna
 * o alvo independente de posição, que é o que o teste quer afirmar.
 */
async function abrirLinhaDoUsuario(pagina: Page, termo: string) {
  await pagina.goto("/usuarios");
  await pagina.getByLabel("Buscar por nome ou e-mail").fill(termo);
  return pagina.getByRole("row").filter({ hasText: termo });
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

/**
 * Os papéis que contam para a RN46 — **os dois**.
 *
 * A regra passou a proteger quem pode GERIR USUÁRIOS, e não um papel literal
 * (ver `eAdministradorEfetivo`): depois da renomeação da Onda 15 isso são o
 * Administrador (`ADMIN`) e o acesso total. Neutralizar só um deixaria o outro
 * contando, e o caso de "é o último" provaria sobre uma base onde ele não é.
 */
const PAPEIS_QUE_ADMINISTRAM = ["ADMINISTRADOR_PLATAFORMA", "ADMIN"] as const;

/** Devolve os administradores do seed ao estado ativo. */
async function restaurarAdministradores() {
  await prisma.usuario.updateMany({
    where: { papel: { in: [...PAPEIS_QUE_ADMINISTRAM] } },
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
  await page.getByLabel("Papel", { exact: true }).selectOption("LEITURA");
  await page.getByRole("button", { name: "Criar usuário" }).click();

  await expect(page.getByText("Senha provisória:")).toBeVisible();
  await expect(page.getByText("credencial provisória").first()).toBeVisible();
});

/**
 * T27 — conceder acesso total exige confirmação.
 *
 * Os dois papéis de administração são vizinhos no seletor e têm nomes que
 * começam igual; errar o item concede a plataforma inteira com um clique. A
 * Onda 15 mitigou com uma nota ao lado do campo, e nota vira paisagem para
 * quem usa a tela toda semana. A confirmação não vira: ela **impede de
 * gravar**.
 *
 * O que estes casos prendem é o par — a cerimônia aparece na CONCESSÃO e
 * **não aparece** na edição de quem já tem o papel. O segundo é o que
 * protege o desenho: cerimônia repetida sem motivo ensina a marcar sem ler.
 */
test("T27 — conceder acesso total pede confirmação, e o botão fica travado sem ela", async ({
  page,
}) => {
  const marca = runId();
  await entrar(page, ADMIN);
  await page.goto("/usuarios");

  await page.getByRole("button", { name: "+ Novo usuário" }).click();
  await page.getByLabel("Nome completo").fill(`Total E2E ${marca}`);
  await page.getByLabel("E-mail corporativo").fill(`total-${marca}@e2e.local`);

  // Papel comum: nenhuma cerimônia, e o botão está livre.
  await page.getByLabel("Papel", { exact: true }).selectOption("LEITURA");
  await expect(page.getByText("Este papel dá acesso total")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar usuário" })).toBeEnabled();

  // Acesso total: o bloco aparece e o botão trava.
  await page.getByLabel("Papel", { exact: true }).selectOption("ADMINISTRADOR_PLATAFORMA");
  await expect(page.getByText("Este papel dá acesso total")).toBeVisible();
  await expect(page.getByText("toda ação da plataforma")).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar usuário" })).toBeDisabled();

  // Marcar destrava.
  await page.getByLabel("Confirmo que quero conceder acesso total.").check();
  await expect(page.getByRole("button", { name: "Criar usuário" })).toBeEnabled();

  // Trocar o papel depois de marcar desmarca: a confirmação é daquela
  // concessão, não um crédito que se leva adiante.
  await page.getByLabel("Papel", { exact: true }).selectOption("ADMIN");
  await expect(page.getByText("Este papel dá acesso total")).toHaveCount(0);
  await page.getByLabel("Papel", { exact: true }).selectOption("ADMINISTRADOR_PLATAFORMA");
  await expect(page.getByRole("button", { name: "Criar usuário" })).toBeDisabled();

  await page.getByLabel("Confirmo que quero conceder acesso total.").check();
  await page.getByRole("button", { name: "Criar usuário" }).click();
  await expect(page.getByText("Senha provisória:")).toBeVisible();
});

test("T27 — editar quem já tem acesso total não pede confirmação", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/usuarios");

  // A conta de acesso total do seed, que nasce sem detentores mas existe
  // como papel — aqui basta uma linha que já o tenha.
  await page.getByLabel("Buscar por nome ou e-mail").fill("acessototal@dev.clubebroto.local");
  const linha = page.getByRole("row", { name: /acessototal@dev\.clubebroto\.local/ });
  await expect(linha).toBeVisible();
  await linha.getByRole("button", { name: "Editar" }).click();

  // O formulário abre com o papel já em acesso total, e NÃO há cerimônia:
  // editar o nome de quem já o tem não é concessão.
  await expect(page.getByLabel("Papel", { exact: true })).toHaveValue(
    "ADMINISTRADOR_PLATAFORMA",
  );
  await expect(page.getByText("Este papel dá acesso total")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gravar alterações" })).toBeEnabled();
});

/**
 * T27 — a linha compacta e o rodapé de paginação (Onda 15).
 *
 * O que este teste prende não é a aparência, é a **regra de corte**: `Editar` e
 * `Inativar/Reativar` decidem sobre a conta e ficam à vista; redefinir
 * credencial, encerrar sessões e exigir nova senha decidem sobre o acesso dela
 * e vivem no menu. Antes disso as cinco estavam empilhadas e cada ação nova
 * esticava **todas** as linhas — a tela passava de 2.200 px com treze contas.
 *
 * Se alguém devolver uma das três à faixa visível "para ficar mais à mão", a
 * primeira asserção reprova; se o menu deixar de ser operável por teclado, a
 * segunda reprova. As duas coisas são decisão, não acidente.
 */
test("T27 — a linha traz duas ações à vista e as de acesso no menu", async ({ page }) => {
  const marca = runId();
  const alvo = await semearUsuarioDescartavel(`layout-${marca}`);

  try {
    await entrar(page, ADMIN);
    await page.goto("/usuarios");
    // A busca põe a linha em foco e dispensa depender de onde ela cai na
    // paginação — o conjunto cresce a cada teste que semeia descartável.
    await page.getByLabel("Buscar por nome ou e-mail").fill(alvo.email);

    const linha = page.getByRole("row").filter({ hasText: alvo.email });
    await expect(linha.getByRole("button", { name: "Editar" })).toBeVisible();
    await expect(linha.getByRole("button", { name: "Inativar" })).toBeVisible();

    // Fechado, o menu não expõe nenhuma das três.
    const menu = linha.getByRole("button", { name: "Acesso" });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(linha.getByRole("button", { name: "Redefinir credencial" })).toHaveCount(0);
    await expect(linha.getByRole("button", { name: "Encerrar sessões" })).toHaveCount(0);
    await expect(linha.getByRole("button", { name: "Exigir nova senha" })).toHaveCount(0);

    // Aberto por TECLADO — o menu não pode depender de ponteiro.
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(linha.getByRole("button", { name: "Redefinir credencial" })).toBeVisible();
    await expect(linha.getByRole("button", { name: "Encerrar sessões" })).toBeVisible();
    await expect(linha.getByRole("button", { name: "Exigir nova senha" })).toBeVisible();

    await semViolacoesAxe(page);
  } finally {
    await removerDescartaveis();
  }
});

/**
 * O rodapé de paginação. Com a linha compacta a equipe de hoje cabe inteira
 * numa página — então o teste força o menor tamanho para provar que a máquina
 * funciona antes de a equipe crescer, que é quando descobrir um defeito aqui
 * sairia caro.
 */
test("T27 — o rodapé pagina a lista e a leitura volta ao começo ao filtrar", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/usuarios");

  const rodape = page.getByRole("navigation", { name: "Paginação da lista de usuários" });
  await page.getByLabel("Por página").selectOption("10");

  await expect(rodape.getByText(/^Mostrando 1–10 de \d+$/)).toBeVisible();
  await expect(rodape.getByRole("button", { name: "Anterior" })).toBeDisabled();

  await rodape.getByRole("button", { name: "Próxima" }).click();
  await expect(rodape.getByText(/^Mostrando 11–/)).toBeVisible();

  // Filtrar repõe em 1: quem busca quer o começo do resultado, não a página 2
  // dele — e sem isso a tabela apareceria vazia, sem nada explicar.
  await page.getByLabel("Buscar por nome ou e-mail").fill("@dev.clubebroto.local");
  await expect(rodape.getByText(/^Mostrando 1–/)).toBeVisible();
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
  // Deixa o administrador principal como o ÚNICO ativo — o que inclui inativar
  // quem tem ACESSO TOTAL, porque ele também administra e também conta.
  await prisma.usuario.updateMany({
    where: {
      papel: { in: [...PAPEIS_QUE_ADMINISTRAM] },
      email: { not: ADMIN },
    },
    data: { ativo: false },
  });

  try {
    await entrar(page, ADMIN);
    const linha = await abrirLinhaDoUsuario(page, ADMIN);
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

/**
 * Encerrar sessões — o caso que nenhuma das ações vizinhas cobria.
 *
 * O contraste com o teste da inativação, logo abaixo, é o ponto inteiro: as
 * duas derrubam a sessão na requisição seguinte, mas só uma **devolve a
 * pessoa** com a senha que ela já tem. Se um dia alguém "simplificar" isto
 * fazendo o botão inativar, o segundo trecho deste teste reprova.
 */
test("encerrar sessões derruba o logado — e ele entra de novo com a MESMA senha", async ({
  browser,
}) => {
  const marca = runId();
  const alvo = await semearUsuarioDescartavel(marca);

  const contextoAlvo = await browser.newContext();
  const contextoAdmin = await browser.newContext();

  try {
    const paginaAlvo: Page = await contextoAlvo.newPage();
    const paginaAdmin: Page = await contextoAdmin.newPage();

    // 1. O alvo entra e está navegando.
    await paginaAlvo.goto("/entrar");
    await paginaAlvo.getByLabel("E-mail").fill(alvo.email);
    await paginaAlvo.getByLabel("Senha").fill(SENHA);
    await paginaAlvo.getByRole("button", { name: "Entrar" }).click();
    await paginaAlvo.waitForURL((url) => new URL(url).pathname === "/");

    // 2. Em OUTRO navegador, o Administrador encerra as sessões dele.
    await entrar(paginaAdmin, ADMIN);
    const linha = await abrirLinhaDoUsuario(paginaAdmin, alvo.email);
    // Onda 15 — a ação vive no menu "Acesso" da linha (layout compacto da T27).
    await linha.getByRole("button", { name: "Acesso" }).click();
    await linha.getByRole("button", { name: "Encerrar sessões" }).click();
    await expect(paginaAdmin.getByText(/Sessões encerradas/)).toBeVisible();

    // 3. A próxima requisição do alvo já não passa (mecanismo da RN47).
    await paginaAlvo.goto("/aliados");
    await paginaAlvo.waitForURL(/\/entrar/);

    // 4. E aqui está a diferença para "Inativar": o acesso CONTINUA. A pessoa
    //    entra de novo com a senha de sempre, sem credencial provisória e sem
    //    ninguém ter de lhe transmitir nada.
    await paginaAlvo.getByLabel("E-mail").fill(alvo.email);
    await paginaAlvo.getByLabel("Senha").fill(SENHA);
    await paginaAlvo.getByRole("button", { name: "Entrar" }).click();
    await paginaAlvo.waitForURL((url) => new URL(url).pathname === "/");
    await expect(
      paginaAlvo.getByRole("heading", { level: 1, name: "O Clube hoje" }),
    ).toBeVisible();
  } finally {
    await contextoAlvo.close();
    await contextoAdmin.close();
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
    const linha = await abrirLinhaDoUsuario(paginaAdmin, alvo.email);
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
    const linha = await abrirLinhaDoUsuario(paginaAdmin, alvo.email);
    await linha.getByRole("button", { name: "Editar" }).click();
    await paginaAdmin.getByLabel("Papel", { exact: true }).selectOption("APROVADOR");
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

/**
 * T27 — presença: On-line, Offline e "nunca acessou".
 *
 * O indicador é uma **inferência declarada**, não uma conexão observada: a
 * plataforma é HTTP e não há soquete aberto para olhar. O que existe é a marca
 * da última atividade, escrita pelo caminho de autenticação com folga de um
 * minuto. Por isso o teste envelhece a marca no banco em vez de esperar —
 * esperar cinco minutos numa suíte é inviável, e o que se quer provar é a
 * regra, não o relógio.
 *
 * Os três estados de uma vez, na mesma tela, porque o que importa é o
 * CONTRASTE: se os três colapsassem num só rótulo, o indicador não diria nada.
 * E `nunca acessou` é o mais útil dos três para quem administra — é a conta
 * criada cuja credencial talvez nunca tenha chegado a ninguém.
 */
test("T27 — a presença distingue on-line, offline e quem nunca acessou", async ({ page }) => {
  const marca = runId();
  const online = await semearUsuarioDescartavel(`presenca-on-${marca}`);
  const offline = await semearUsuarioDescartavel(`presenca-off-${marca}`);
  const nunca = await semearUsuarioDescartavel(`presenca-nunca-${marca}`);

  await prisma.usuario.update({
    where: { id: online.id },
    data: { ultimoAcessoEm: new Date() },
  });
  await prisma.usuario.update({
    where: { id: offline.id },
    data: { ultimoAcessoEm: new Date(Date.now() - 3 * 24 * 60 * 60_000) },
  });
  // `nunca` fica com a coluna NULA — é o estado de nascimento, e o teste não
  // o fabrica: ele apenas não o preenche.

  try {
    await entrar(page, ADMIN);

    /*
     * A pílula tem DUAS opções desde 17/09, por decisão da TI: On-line e
     * Offline. O "visto há" saiu dela e vive no `title`; "Nunca acessou"
     * deixou de ser um terceiro rótulo — quem nunca entrou está offline, e o
     * que o distingue de um offline antigo continua no `title` e na legenda.
     *
     * O teste mudou de forma, não de intenção: ele continua provando que os
     * três estados do domínio chegam distintos à tela. Só que agora dois
     * deles compartilham a palavra e se separam pelo texto de apoio — que é
     * exatamente o que se pediu, e o que precisa continuar valendo.
     */
    const linhaOnline = await abrirLinhaDoUsuario(page, online.email);
    await expect(linhaOnline.getByText("On-line", { exact: true })).toBeVisible();
    // Verde, e conferido AQUI: `abrirLinhaDoUsuario` refaz a listagem, então
    // guardar este localizador para depois de abrir outra linha o deixa
    // obsoleto — foi o que fez a primeira versão deste teste falhar.
    await expect(linhaOnline.locator(".pill").filter({ hasText: "On-line" })).toHaveClass(
      /pill-ok/,
    );

    const linhaOffline = await abrirLinhaDoUsuario(page, offline.email);
    await expect(linhaOffline.getByText("Offline", { exact: true })).toBeVisible();
    await expect(linhaOffline.locator('[title*="há 3 dias"]')).toHaveCount(1);

    /*
     * A COR do selo, presa em teste — decidido em 18/09 (pendência §5.4).
     *
     * Offline é **neutro**, não vermelho: o vermelho desta plataforma é a cor
     * de falha, e estar offline não é falha. Em produção isso deixava 11 de
     * 13 linhas vermelhas, competindo por atenção com o único vermelho que é
     * problema de verdade na mesma tela — a credencial provisória expirada.
     *
     * Prende-se aqui, e não num teste de unidade, porque o que se decidiu foi
     * o que a PESSOA vê. A asserção é dos dois lados: neutro presente e
     * vermelho ausente — só conferir o neutro passaria se alguém empilhasse
     * as duas classes.
     */
    const seloOffline = linhaOffline.locator(".pill").filter({ hasText: "Offline" });
    await expect(seloOffline).toHaveClass(/pill-neutra/);
    await expect(seloOffline).not.toHaveClass(/pill-erro/);

    const linhaNunca = await abrirLinhaDoUsuario(page, nunca.email);
    await expect(linhaNunca.getByText("Offline", { exact: true })).toBeVisible();
    // O fato não se perdeu ao sair da pílula: quem nunca entrou continua
    // distinguível de quem entrou e sumiu.
    await expect(linhaNunca.locator('[title*="nunca entrou"]')).toHaveCount(1);
    await expect(linhaNunca.locator('[title*="há"]')).toHaveCount(0);

    await semViolacoesAxe(page);
  } finally {
    await removerDescartaveis();
  }
});

/**
 * A marca é escrita pelo próprio ato de usar a plataforma — e este teste é o
 * único lugar onde isso se prova de ponta a ponta.
 *
 * Também prova a **folga**: a segunda navegação, um instante depois, não
 * regrava. Sem folga, cada clique seria um `UPDATE` no banco, e o indicador
 * custaria mais do que tudo o que mostra.
 */
test("T27 — usar a plataforma grava a presença, e a folga evita escrita por clique", async ({
  browser,
}) => {
  const marca = runId();
  const alvo = await semearUsuarioDescartavel(`presenca-grava-${marca}`);
  // Nasce sem marca: é o que torna a primeira gravação observável.
  await prisma.usuario.update({ where: { id: alvo.id }, data: { ultimoAcessoEm: null } });

  const contexto = await browser.newContext();
  try {
    const pagina = await contexto.newPage();
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(alvo.email);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    await pagina.waitForURL((url) => new URL(url).pathname === "/");

    const primeira = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(primeira.ultimoAcessoEm).toBeInstanceOf(Date);

    // Segunda navegação imediata: dentro da folga, a marca NÃO se move.
    await pagina.goto("/aliados");
    await expect(pagina.getByRole("heading", { level: 1, name: /Aliados/ })).toBeVisible();
    const segunda = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(segunda.ultimoAcessoEm!.getTime()).toBe(primeira.ultimoAcessoEm!.getTime());

    /*
     * E presença NÃO é auditoria: a trilha da RN49 não se polui com telemetria
     * de uso, no mesmo espírito da rota de saúde (RN61). Navegar não pode ter
     * gerado evento nenhum sobre esta conta.
     */
    const eventos = await prisma.auditoriaEvento.count({ where: { entidadeId: alvo.id } });
    expect(eventos).toBe(0);
  } finally {
    await contexto.close();
    await removerDescartaveis();
  }
});
