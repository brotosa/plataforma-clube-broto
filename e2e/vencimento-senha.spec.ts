import { expect, test } from "@playwright/test";
import { entrar, prisma, runId, SENHA, semViolacoesAxe } from "./ajudantes";

/**
 * E2E da validade periódica da senha (RN72) — a prova que faltava.
 *
 * O domínio já testa `senhaVenceu` isoladamente, e `revisao-de-sessao.test.ts`
 * testa a decisão do callback. O que **nada** provava é a ligação: que o
 * servidor de verdade, com a política ligada em Configurações, conduz a
 * pessoa à troca — e, mais importante, que ele conduz **só** quem deve.
 *
 * A promessa da RN72 tem duas metades, e a segunda é a que se quebra em
 * silêncio:
 *
 *  • senha vencida acende a troca obrigatória e leva à tela;
 *  • senha vencida **não derruba a sessão**, e `senhaAlteradaEm` nulo
 *    **nunca vence**.
 *
 * Um defeito na primeira metade aparece no primeiro uso. Um defeito na
 * segunda manda a base inteira para a tela de troca no dia em que alguém
 * ligar a política — e ninguém descobre antes, porque a política nasce
 * desligada e o caminho nunca roda.
 *
 * O relógio não se espera: 30 dias não cabem numa suíte. O que se faz é
 * envelhecer `senhaAlteradaEm` no banco, que é o dado que a regra lê.
 */

const SUFIXO = "@venc-e2e.local";
const VALIDADE_DIAS = 30;
const SENHA_NOVA = "senha-trocada-2026";

/** Coloca a validade periódica em `dias` — 0 desliga. */
async function politicaDeValidade(dias: number) {
  await prisma.configuracaoPortal.upsert({
    where: { id: "portal" },
    update: { senhaValidadeDias: dias },
    create: { id: "portal", senhaValidadeDias: dias },
  });
}

/**
 * Usuário descartável com a senha de desenvolvimento (hash copiado do seed) e
 * SEM credencial provisória: a marca gravada teria de estar apagada para que
 * a única coisa capaz de levar à troca seja o vencimento. Com ela acesa, o
 * teste passaria mesmo se o vencimento não funcionasse — que é a forma mais
 * fácil de escrever um teste que não prova nada.
 */
async function semearUsuario(sufixo: string, senhaAlteradaEm: Date | null) {
  const modelo = await prisma.usuario.findUniqueOrThrow({
    where: { email: "leitura@dev.clubebroto.local" },
    select: { senhaHash: true },
  });
  return prisma.usuario.create({
    data: {
      nome: `Vencimento ${sufixo}`,
      email: `vencimento-${sufixo}${SUFIXO}`,
      senhaHash: modelo.senhaHash,
      papel: "LEITURA",
      ativo: true,
      trocaSenhaObrigatoria: false,
      senhaAlteradaEm,
    },
  });
}

function diasAtras(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60_000);
}

async function limpar() {
  await prisma.auditoriaEvento.deleteMany({ where: { entidade: "configuracao_portal" } });
  await prisma.configuracaoPortal.deleteMany({ where: { id: "portal" } });
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: SUFIXO } },
    select: { id: true },
  });
  const ids = usuarios.map((usuario) => usuario.id);
  if (ids.length > 0) {
    await prisma.senhaHistorico.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { autorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  }
}

test.beforeEach(limpar);
test.afterAll(limpar);

/**
 * O caminho feliz inteiro, e a metade sutil no meio dele.
 *
 * A pessoa entra com a senha válida e navega. A política vence enquanto ela
 * trabalha — no teste, envelhecendo a data; na vida, passando o prazo. A
 * requisição seguinte a leva à troca **sem derrubá-la**, e é isso que a
 * ausência de `/entrar` na URL prova. Depois de trocar, ela volta a navegar.
 */
test("senha vencida conduz à troca sem derrubar a sessão, e trocar destrava", async ({ page }) => {
  const alvo = await semearUsuario(`fluxo-${runId()}`, diasAtras(2));
  await politicaDeValidade(VALIDADE_DIAS);

  // 1. Entra normalmente: a senha ainda está dentro do prazo.
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(alvo.email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/");

  // 2. O prazo passa com a sessão aberta.
  await prisma.usuario.update({
    where: { id: alvo.id },
    data: { senhaAlteradaEm: diasAtras(VALIDADE_DIAS + 1) },
  });

  // 3. A requisição seguinte conduz à troca — e NÃO ao login. A distinção é a
  //    promessa da RN72: "senha vencida não derruba a sessão".
  await page.goto("/aliados");
  await page.waitForURL(/\/trocar-senha/);
  expect(new URL(page.url()).pathname).toBe("/trocar-senha");

  // 4. E a tela diz o motivo CERTO. Antes desta rodada ela dizia a todo mundo
  //    que "sua credencial foi emitida pelo Administrador da Plataforma" —
  //    falso para quem escolheu a própria senha e só viu o prazo passar.
  await expect(page.getByRole("heading", { level: 1, name: "Sua senha venceu" })).toBeVisible();
  await expect(page.getByText(/exige troca a cada 30 dias/)).toBeVisible();
  await expect(page.getByText(/emitida pelo Administrador/)).toHaveCount(0);
  await semViolacoesAxe(page);

  // 5. Troca e volta a navegar.
  await page.getByLabel("Nova senha", { exact: true }).fill(SENHA_NOVA);
  await page.getByLabel("Confirme a nova senha").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Definir minha senha" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/");

  await page.goto("/aliados");
  await expect(page.getByRole("heading", { level: 1, name: /Aliados/ })).toBeVisible();

  // O relógio foi reacertado — sem isso, a senha nova nasceria vencida e a
  // pessoa entraria num laço de troca.
  const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
  expect(depois.trocaSenhaObrigatoria).toBe(false);
  expect(depois.senhaAlteradaEm!.getTime()).toBeGreaterThan(diasAtras(1).getTime());
});

/**
 * O falso positivo que a regra existe para impedir, e o mais caro de todos.
 *
 * `senhaAlteradaEm` nasce NULA para quem já estava na base quando a coluna
 * foi criada — a maioria das contas reais. Se nulo contasse como vencido,
 * ligar a política mandaria a plataforma inteira à tela de troca no primeiro
 * acesso de cada um, de uma vez.
 *
 * O teste força o pior caso possível: validade ligada, conta antiga, data
 * nula. E exige que ela entre e navegue sem ver a tela de troca.
 */
test("senha sem data de troca NUNCA vence — a base antiga não é arrastada", async ({ page }) => {
  const alvo = await semearUsuario(`nula-${runId()}`, null);
  await politicaDeValidade(VALIDADE_DIAS);

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(alvo.email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/");

  await page.goto("/aliados");
  await expect(page.getByRole("heading", { level: 1, name: /Aliados/ })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/aliados");
});

/**
 * O outro desligamento explícito: validade em `0`.
 *
 * Com a proteção desligada, **nem a senha mais antiga vence**. Este é o
 * estado de produção hoje, então um defeito aqui não seria hipotético — seria
 * a plataforma inteira barrada por uma regra que ninguém ligou.
 */
test("com a validade desligada, nem senha de um ano vence", async ({ page }) => {
  const alvo = await semearUsuario(`desligada-${runId()}`, diasAtras(365));
  await politicaDeValidade(0);

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(alvo.email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/");
  expect(new URL(page.url()).pathname).toBe("/");
});

/**
 * "Exigir nova senha" é o remédio para a lacuna da validade, e este teste
 * prova que ele **acende a troca sem trocar a senha**: a pessoa entra com a
 * senha de sempre e é conduzida à tela. Sem isso a política ficaria acesa e
 * sem morder para toda conta de data nula — que é a maioria.
 *
 * Aqui a tela diz a frase da credencial, e está certa: quem acendeu a marca
 * foi o Administrador, não o relógio.
 */
test("exigir nova senha faz a política morder em quem tem data nula", async ({ page }) => {
  const alvo = await semearUsuario(`empurrao-${runId()}`, null);
  await politicaDeValidade(VALIDADE_DIAS);
  // A ação da T27/T35 acende a marca sem tocar a senha nem a sessão.
  await prisma.usuario.update({
    where: { id: alvo.id },
    data: { trocaSenhaObrigatoria: true },
  });

  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(alvo.email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/trocar-senha/);

  // O motivo é outro, e a tela distingue.
  await expect(page.getByRole("heading", { level: 1, name: "Defina sua senha" })).toBeVisible();
  await expect(page.getByText(/emitida pelo Administrador/)).toBeVisible();

  // A senha continuava sendo a de sempre — é o que separa esta ação de
  // "redefinir credencial", e o que faz o prazo começar a contar sem que
  // nada precise ser transmitido a ninguém.
  await page.getByLabel("Nova senha", { exact: true }).fill(SENHA_NOVA);
  await page.getByLabel("Confirme a nova senha").fill(SENHA_NOVA);
  await page.getByRole("button", { name: "Definir minha senha" }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/");

  const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } });
  expect(depois.senhaAlteradaEm).toBeInstanceOf(Date);
});

/**
 * A política vale na sessão ABERTA, e não só no próximo login.
 *
 * É a razão de a validade ser lida a cada requisição em vez de gravada no
 * token (ver o callback `jwt`). Aqui o Administrador liga a política com a
 * vítima já dentro, e ela é conduzida à troca sem ter feito nada — sem
 * relogar, sem esperar o token expirar.
 */
test("ligar a validade alcança quem já está dentro, na requisição seguinte", async ({
  browser,
}) => {
  const alvo = await semearUsuario(`aberta-${runId()}`, diasAtras(90));
  await politicaDeValidade(0); // desligada: a conta antiga entra normalmente

  const contexto = await browser.newContext();
  try {
    const pagina = await contexto.newPage();
    await pagina.goto("/entrar");
    await pagina.getByLabel("E-mail").fill(alvo.email);
    await pagina.getByLabel("Senha").fill(SENHA);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    await pagina.waitForURL((url) => new URL(url).pathname === "/");

    // O Administrador liga a validade pela tela, com a outra sessão aberta.
    const contextoAdmin = await browser.newContext();
    try {
      const paginaAdmin = await contextoAdmin.newPage();
      await entrar(paginaAdmin, "administrador@dev.clubebroto.local");
      await paginaAdmin.goto("/configuracoes?aba=senha");
      await paginaAdmin.getByLabel("Validade da senha (dias)").fill(String(VALIDADE_DIAS));
      await paginaAdmin.getByRole("button", { name: "Salvar política" }).click();
      await expect(paginaAdmin.getByText("Política de senha salva")).toBeVisible();
    } finally {
      await contextoAdmin.close();
    }

    // Requisição seguinte da vítima: já é conduzida à troca.
    await pagina.goto("/aliados");
    await pagina.waitForURL(/\/trocar-senha/);
  } finally {
    await contexto.close();
  }
});
