import { expect, test } from "@playwright/test";
import { entrar, semViolacoesAxe } from "./ajudantes";

/**
 * O desdobramento do papel de administração (Onda 15, ficha §5.1).
 *
 * A matriz já é cobrada célula a célula em `permissoes.test.ts`. O que estes
 * testes provam é outra coisa, e é o que nenhum teste de unidade alcança: que
 * o desdobramento **chega à tela** — que o Admin encontra o que administra e
 * não encontra o que não opera, e que o acesso total encontra tudo.
 *
 * A distinção mais fácil de quebrar sem ninguém notar é a do Patrocinadores:
 * os dois papéis **veem** a ficha inteira, e só um dos dois vê os botões de
 * escrita. Um `podeExecutar` trocado ali não derruba nenhuma página — só faz
 * um botão aparecer para quem não devia.
 */

const ADMIN = "admin@dev.clubebroto.local";
const ACESSO_TOTAL = "administrador@dev.clubebroto.local";

test("o Admin administra a plataforma — e não opera o negócio", async ({ page }) => {
  await entrar(page, ADMIN);
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

test("o acesso total encontra também o que o Admin não opera", async ({ page }) => {
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
 * RN74 continua estreita: a isenção de bloqueio é do acesso total e de mais
 * ninguém. O Admin configura o portal — inclusive o próprio bloqueio — e ainda
 * assim é bloqueável como qualquer pessoa. Aqui se verifica o lado visível
 * disso: ele tem a tela, e a tela diz que a isenção não é dele.
 */
test("o Admin configura o bloqueio, mas a isenção da RN74 não é dele", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/configuracoes?aba=bloqueios");
  await expect(page.getByRole("heading", { name: "Bloqueio por tentativas de login" })).toBeVisible();
  // A frase aparece DUAS vezes na aba — na descrição da seção e na prévia da
  // política —, então o localizador precisa do trecho que só existe na
  // primeira; sem ele o teste falha por ambiguidade, não por ausência.
  await expect(
    page.getByText(/nunca é bloqueado — a conta que faz o desbloqueio não pode se trancar/),
  ).toBeVisible();
});
