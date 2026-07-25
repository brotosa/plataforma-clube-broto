import { expect, test } from "@playwright/test";
import { entrar, prisma, runId, semViolacoesAxe, submeterERepintar } from "./ajudantes";

/**
 * E2E do Parametrizador (F10 — T15, T16 e T17).
 *
 * Cobre os critérios de aceite verificáveis pela interface: o Administrador
 * edita e os demais leem (RN23), a contagem de uso aparece antes de
 * inativar (RN24), renomear reflete em todos os usos, a régua alterada
 * muda o comportamento vivo, a RN28 barra meta sobreposta e a família
 * sensível liga na T7 e passa a exigir aprovação. Axe-core limpo nas três
 * telas, inclusive no estado vazio e na visão de leitura.
 */

const ADMIN = "administrador@dev.clubebroto.local";
const GESTOR = "gestor@dev.clubebroto.local";

test("T15 — hub do Administrador: famílias, estruturais e taxas em standby", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Parametrizador" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Parametrizador" })).toBeVisible();

  await expect(page.getByText("Você pode editar")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir editor" }).first()).toBeVisible();

  // RN26 — estruturais com justificativa e etiqueta de somente leitura.
  await expect(page.getByRole("heading", { name: "Estruturais — somente leitura" })).toBeVisible();
  await expect(page.getByText("Naturezas da oferta")).toBeVisible();
  await expect(page.getByText("somente leitura").first()).toBeVisible();

  // Taxas em standby (decisão de 24/07) e link para a T7.
  await expect(page.getByText("em standby — edição não habilitada")).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir regras de aprovação" })).toBeVisible();

  await semViolacoesAxe(page);
});

test("RN23 — quem não é Administrador lê o hub com banner e sem ações de escrita", async ({
  page,
}) => {
  await entrar(page, GESTOR);
  await page.goto("/parametrizador");
  await expect(page.getByRole("heading", { level: 1, name: "Parametrizador" })).toBeVisible();

  await expect(
    page.getByText("a edição de parâmetros é restrita ao Administrador da Plataforma"),
  ).toBeVisible();
  await expect(page.getByText("Você pode editar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Abrir editor" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver lista" }).first()).toBeVisible();

  // Na T17 o Gestor vê os valores, mas nenhum campo editável nem botão.
  await page.goto("/parametrizador/valores");
  await expect(page.getByRole("heading", { level: 1, name: "Valores de regra" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Criar meta" })).toHaveCount(0);
  await semViolacoesAxe(page);
});

test("T16 — indicadores: busca, campos do caso rico e axe limpo", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/parametrizador/listas/indicadores");
  await expect(
    page.getByRole("heading", { level: 1, name: "Indicadores de scout" }),
  ).toBeVisible();

  // O caso rico: grupo, dimensão e peso além do nome.
  await expect(page.getByLabel("Grupo")).toBeVisible();
  await expect(page.getByLabel("Dimensão de medição")).toBeVisible();
  await expect(page.getByLabel("Peso")).toBeVisible();
  await expect(page.getByText("não re-pontua avaliações fechadas")).toBeVisible();

  // Busca por teclado, sem mouse.
  const busca = page.getByRole("searchbox", { name: "Buscar item na lista" });
  await busca.fill("Tempo de mercado");
  await busca.press("Enter");
  await expect(page.getByRole("link", { name: /Tempo de mercado/ })).toBeVisible();
  await expect(page.getByText("1 de 23 indicadores")).toBeVisible();

  await semViolacoesAxe(page);
});

test("T16 — estado vazio da lista sem seed (perfil de cliente) é honesto e acessível", async ({
  page,
}) => {
  await entrar(page, ADMIN);
  await page.goto("/parametrizador/listas/perfil-cliente");
  await expect(page.getByRole("heading", { level: 1, name: "Perfil de cliente" })).toBeVisible();
  await expect(
    page.getByText("ainda não foi definido pelo negócio", { exact: false }),
  ).toBeVisible();
  await semViolacoesAxe(page);
});

test("RN24 — criar, renomear com propagação e inativar com contagem de uso", async ({ page }) => {
  const nome = `Cultura E2E ${runId()}`;
  const renomeada = `${nome} renomeada`;
  await prisma.cultura.deleteMany({ where: { nome: { in: [nome, renomeada] } } });

  await entrar(page, ADMIN);
  await page.goto("/parametrizador/listas/culturas");

  await page.getByRole("button", { name: "+ Novo item" }).click();
  // Escopado pelo id: com o cartão de criação aberto existem dois campos
  // "Nome" na tela (o do item novo e o do item selecionado no detalhe).
  await page.locator("#novo-nome").fill(nome);
  await submeterERepintar(page, async () => {
    await page.getByRole("button", { name: "Criar item" }).click();
  });

  const criada = await prisma.cultura.findFirstOrThrow({ where: { nome } });
  await page.goto(`/parametrizador/listas/culturas?item=${criada.id}`);
  await expect(page.getByRole("heading", { level: 2, name: nome })).toBeVisible();
  // RN24 — sem uso, a frase é explícita em vez de um número solto.
  await expect(page.getByText("Sem uso registrado")).toBeVisible();
  await expect(page.getByText("Excluir não existe nesta plataforma.")).toBeVisible();

  // Renomear: update simples, propagação automática (itens são por id).
  await page.locator("#pm-nome").fill(renomeada);
  await submeterERepintar(page, async () => {
    await page.getByRole("button", { name: "Salvar alterações" }).click();
  });
  expect((await prisma.cultura.findUniqueOrThrow({ where: { id: criada.id } })).nome).toBe(
    renomeada,
  );

  // Inativar: confirma o diálogo com a contagem e o item permanece na base.
  page.once("dialog", (dialogo) => dialogo.accept());
  await submeterERepintar(page, async () => {
    await page.getByRole("button", { name: "Inativar item" }).click();
  });
  const inativada = await prisma.cultura.findUniqueOrThrow({ where: { id: criada.id } });
  expect(inativada.ativa).toBe(false);

  await page.goto(`/parametrizador/listas/culturas?item=${criada.id}`);
  await expect(page.getByText("inativo").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reativar item" })).toBeVisible();

  await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: criada.id } });
  await prisma.cultura.delete({ where: { id: criada.id } });
});

test("T17 — régua alterada muda a T8 na hora; meta 24/ano e comissão 5% vivas", async ({
  page,
}) => {
  await entrar(page, ADMIN);
  await page.goto("/parametrizador/valores");
  await expect(page.getByRole("heading", { level: 1, name: "Valores de regra" })).toBeVisible();

  // Efeito prospectivo declarado na tela (RN25).
  await expect(page.getByText("efeito prospectivo", { exact: false })).toBeVisible();

  // Seeds reais de 24/07 vivos no produto.
  await expect(page.getByLabel("Comissão-padrão")).toHaveValue("5");
  await expect(page.getByText("Meta — anual, geral")).toBeVisible();
  await expect(page.getByText("Novos aliados em 2026", { exact: false })).toBeVisible();

  // Tetos do dossiê nascem sem valor: pendência declarada, não número.
  await expect(page.getByLabel("Teto mensal")).toHaveValue("");
  await expect(page.getByText("sem histórico — nunca definido").first()).toBeVisible();

  await semViolacoesAxe(page);

  // A régua do envelhecimento passa a valer na T8 sem deploy.
  await page.getByLabel("Envelhecimento do funil — grau leve").fill("1");
  await submeterERepintar(page, async () => {
    await page
      .locator("form", { has: page.getByLabel("Envelhecimento do funil — grau leve") })
      .getByRole("button", { name: "Salvar" })
      .click();
  });

  await page.goto("/mercado");
  await expect(page.getByText("leve ≥ 1 dias", { exact: false })).toBeVisible();

  // Devolve a régua ao estado de implantação e confere o histórico da T17.
  await page.goto("/parametrizador/valores");
  await page.getByLabel("Envelhecimento do funil — grau leve").fill("14");
  await submeterERepintar(page, async () => {
    await page
      .locator("form", { has: page.getByLabel("Envelhecimento do funil — grau leve") })
      .getByRole("button", { name: "Salvar" })
      .click();
  });
  await expect(page.getByText("de 1 para 14", { exact: false })).toBeVisible();
});

test("RN28 — a T17 avisa do conflito antes de enviar e o serviço recusa", async ({ page }) => {
  await entrar(page, ADMIN);
  await page.goto("/parametrizador/valores");

  // Meta anual geral já existe (24/ano): o aviso aparece na digitação.
  await expect(
    page.getByText("Já existe meta geral para 2026", { exact: false }),
  ).toBeVisible();

  await submeterERepintar(page, async () => {
    await page.getByLabel("Novos aliados no período").fill("30");
    await page.getByRole("button", { name: "Criar meta" }).click();
  });
  await expect(page.getByText("RN28", { exact: false }).first()).toBeVisible();
  expect(await prisma.metaPeriodo.count({ where: { periodo: "ANUAL", categoriaId: null } })).toBe(1);
});

test("RN27 — ligar a família sensível na T7 muda o comportamento sem deploy", async ({ page }) => {
  await entrar(page, GESTOR);
  await page.goto("/aprovacoes/regras");
  const cartao = page.locator(".card", {
    has: page.getByRole("heading", { name: "Parâmetro sensível" }),
  });
  await expect(cartao.getByText("Aprovação desligada")).toBeVisible();
  await submeterERepintar(page, async () => {
    await cartao.getByRole("switch").click();
  });
  await expect(cartao.getByText("Aprovação exigida")).toBeVisible();

  // Agora a escrita sensível entra na fila em vez de valer na hora.
  await entrar(page, ADMIN);
  await page.goto("/parametrizador/valores");
  await expect(page.getByText("está ligada (RN27)", { exact: false })).toBeVisible();
  await page.getByLabel("Comissão-padrão").fill("8");
  await submeterERepintar(page, async () => {
    await page
      .locator("form", { has: page.getByLabel("Comissão-padrão") })
      .getByRole("button", { name: "Salvar" })
      .click();
  });
  const linha = await prisma.valorRegra.findUniqueOrThrow({
    where: { chave: "COMISSAO_PADRAO_PCT" },
  });
  expect(Number(linha.valor)).toBe(5);
  expect(
    await prisma.aprovacaoSolicitacao.count({
      where: { tipoEntidade: "PARAMETRO_SENSIVEL", estado: "SOLICITADA" },
    }),
  ).toBeGreaterThan(0);

  // Desliga de volta e limpa a fila para não vazar estado às outras suítes.
  await entrar(page, GESTOR);
  await page.goto("/aprovacoes/regras");
  await submeterERepintar(page, async () => {
    await page
      .locator(".card", { has: page.getByRole("heading", { name: "Parâmetro sensível" }) })
      .getByRole("switch")
      .click();
  });
  await prisma.aprovacaoSolicitacao.deleteMany({ where: { tipoEntidade: "PARAMETRO_SENSIVEL" } });
});
