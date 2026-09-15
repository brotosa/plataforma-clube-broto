import { expect, test } from "@playwright/test";
import { entrar, semViolacoesAxe } from "./ajudantes";

/**
 * O desdobramento do papel de administração (Onda 15, ficha §5.1).
 *
 * A matriz já é cobrada célula a célula em `permissoes.test.ts`. O que estes
 * testes provam é outra coisa, e é o que nenhum teste de unidade alcança: que
 * o desdobramento **chega à tela** — que o Administrador encontra o que administra e
 * não encontra o que não opera, e que o acesso total encontra tudo.
 *
 * A distinção mais fácil de quebrar sem ninguém notar é a do Patrocinadores:
 * os dois papéis **veem** a ficha inteira, e só um dos dois vê os botões de
 * escrita. Um `podeExecutar` trocado ali não derruba nenhuma página — só faz
 * um botão aparecer para quem não devia.
 */

const ADMINISTRADOR = "administrador@dev.clubebroto.local";
const ACESSO_TOTAL = "acessototal@dev.clubebroto.local";

test("o Administrador administra a plataforma — e não opera o negócio", async ({ page }) => {
  await entrar(page, ADMINISTRADOR);
  const nav = page.getByRole("navigation", { name: "Módulos" });

  // O que ele administra.
  await expect(nav.getByRole("link", { name: "Configurações" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Parametrizador" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Usuários" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Auditoria" })).toBeVisible();

  await page.goto("/configuracoes");
  await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
  await semViolacoesAxe(page);

  // O que ele NÃO opera: vê a lista de patrocinadores, não cria nem edita.
  await page.goto("/patrocinadores");
  await expect(page.getByRole("heading", { level: 1, name: /Patrocinadores/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo patrocinador" })).toHaveCount(0);
});

test("o acesso total encontra também o que o Administrador não opera", async ({ page }) => {
  await entrar(page, ACESSO_TOTAL);
  const nav = page.getByRole("navigation", { name: "Módulos" });

  await expect(nav.getByRole("link", { name: "Configurações" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Parametrizador" })).toBeVisible();

  /*
   * A prova do desdobramento, e a única afirmação destes dois testes que era
   * FALSA antes dele: até a Onda 15 este botão não existia para este papel —
   * `GERIR_PATROCINADORES` era do Gestor e de mais ninguém.
   */
  await page.goto("/patrocinadores");
  await expect(page.getByRole("button", { name: "Novo patrocinador" })).toBeVisible();
  await semViolacoesAxe(page);
});

/**
 * A isenção de bloqueio da RN74 acompanhou a renomeação, como tinha de
 * acontecer: ela é de **quem configura o portal**, e continua valendo para as
 * mesmas contas de antes — que só trocaram de nome. Se estivesse presa ao
 * literal `ADMINISTRADOR_PLATAFORMA`, passaria a valer para um papel que
 * ninguém detém, e as contas reais perderiam a isenção sem que nada no pedido
 * mandasse tirá-la.
 *
 * Aqui se verifica o lado visível: o Administrador tem a tela do bloqueio, e a
 * tela declara a isenção.
 */
test("o Administrador configura o bloqueio e continua isento da RN74", async ({ page }) => {
  await entrar(page, ADMINISTRADOR);
  await page.goto("/configuracoes?aba=bloqueios");
  await expect(page.getByRole("heading", { name: "Bloqueio por tentativas de login" })).toBeVisible();
  // A frase aparece DUAS vezes na aba — na descrição da seção e na prévia da
  // política —, então o localizador precisa do trecho que só existe na
  // primeira; sem ele o teste falha por ambiguidade, não por ausência.
  await expect(
    page.getByText(/nunca é bloqueado — a conta que faz o desbloqueio não pode se trancar/),
  ).toBeVisible();
});

/**
 * A hierarquia visual da coluna Papel na T27 — três degraus.
 *
 * Nasceu de um defeito de leitura: a regra antiga era `papel ===
 * "ADMINISTRADOR_PLATAFORMA" ? azul : cinza`, escrita quando esse nome
 * designava o administrador comum. Depois da renomeação ela ficou **certa por
 * coincidência** — o azul passou a marcar o acesso total, que é mesmo o que
 * merece destaque — e deixou o Administrador com a mesma pílula cinza de
 * Leitura e Comercial, indistinguível de quem não administra.
 *
 * Este teste existe para que a hierarquia seja decisão, e não acidente: se
 * alguém "consertar" a regra achando que é resíduo, ele reprova.
 */
test("a coluna Papel distingue os três níveis de poder", async ({ page }) => {
  await entrar(page, ACESSO_TOTAL);
  await page.goto("/usuarios");

  const pilula = (rotulo: string) =>
    page.locator(".tbl td .pill").filter({ hasText: new RegExp(`^${rotulo}$`) }).first();

  // Acesso total: degrau mais forte — azul com borda firme e ponto.
  const total = pilula("Administrador da Plataforma");
  await expect(total).toBeVisible();
  await expect(total).toHaveClass(/pill-info/);
  await expect(total).toHaveClass(/pill-total/);
  await expect(total.locator("i")).toHaveCount(1);

  // Administrador: mesma família, um degrau abaixo — sem o ponto.
  const administrador = pilula("Administrador");
  await expect(administrador).toBeVisible();
  await expect(administrador).toHaveClass(/pill-info/);
  await expect(administrador).not.toHaveClass(/pill-total/);
  await expect(administrador.locator("i")).toHaveCount(0);

  // Quem não administra fica neutro — e é o contraste que dá sentido aos dois.
  const gestor = pilula("Gestor do Clube");
  await expect(gestor).toBeVisible();
  await expect(gestor).toHaveClass(/pill-neutra/);

  await semViolacoesAxe(page);
});
