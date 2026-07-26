import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  entrar,
  resolverDoArquivoEnv,
  submeterERepintar,
  runId,
  semRolagemHorizontal,
  semViolacoesAxe,
  tabelaColapsadaEmCards,
  semearAliadoAtivoComContrato,
  semearSolucaoCompleta,
} from "./ajudantes";
import { gerarAssinantesSinteticos } from "../infra/assinantes/fixtures-sinteticas";
import { cifrarCpf, hashCpf } from "../infra/assinantes/protecao-cpf";

/**
 * E2e da F12 (critério do prompt da Onda 4): o ciclo completo —
 * criar campanha → simular público → conteúdo com sugestão aceita
 * MANUALMENTE → peças → metas → ativar (validações da RN38 e kit v1) →
 * painel nos dois níveis (público com estado "aguarda") → encerrar com a
 * RN40 exibindo o aviso das exclusivas.
 *
 * A cesta e as ofertas vêm de aliado semeado pelos ajudantes; os
 * assinantes são os SINTÉTICOS do gerador determinístico (marcados),
 * como manda o CLAUDE.md. Axe-core roda nas quatro telas novas e a T22 e
 * a T25 são verificadas a 380px.
 */

// Chaves de proteção de CPF: o seeder hasheia CPF sintético direto no
// teste, e o Playwright não lê o .env (no CI vêm do ambiente do job).
resolverDoArquivoEnv(["CPF_HASH_KEY", "APP_ENCRYPTION_KEY"]);

const NOME_ALIADO = `Aliado E2E Campanhas ${runId()}`;
const NOME_CAMPANHA = `Campanha E2E ${runId()}`;
const NOME_CESTA = `Cesta E2E ${runId()}`;
const SINTETICOS = gerarAssinantesSinteticos(5, 31);
const UF_DO_PUBLICO = "MG";

/** Varredura axe com a UI assentada (mesma disciplina da F11). */
async function axeComUiAssentada(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.title.trim().length > 0 &&
      Array.from(document.querySelectorAll("*")).every((elemento) =>
        elemento.getAnimations().every((animacao) => animacao.playState !== "running"),
      ),
  );
  await semViolacoesAxe(page);
}

/**
 * Precondição idempotente: aliado ativo com solução, uma oferta publicada
 * de vitrine, uma oferta publicada EXCLUSIVA da campanha (para a RN40) e
 * assinantes sintéticos em MG (público da campanha).
 */
async function semearCenarioDeCampanha(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // Campanhas/cestas de execuções anteriores desta suíte.
    const campanhas = await prisma.campanha.findMany({
      where: { nome: { startsWith: "Campanha E2E" } },
      select: { id: true },
    });
    const idsCampanhas = campanhas.map(({ id }) => id);
    await prisma.oferta.updateMany({
      where: { destinacaoCampanhaId: { in: idsCampanhas } },
      data: { destinacao: "VITRINE", destinacaoCampanhaId: null },
    });
    await prisma.kitCampanha.deleteMany({ where: { campanhaId: { in: idsCampanhas } } });
    await prisma.metaCampanha.deleteMany({ where: { campanhaId: { in: idsCampanhas } } });
    await prisma.pecaCampanha.deleteMany({ where: { campanhaId: { in: idsCampanhas } } });
    await prisma.campanhaOferta.deleteMany({ where: { campanhaId: { in: idsCampanhas } } });
    await prisma.campanhaCesta.deleteMany({ where: { campanhaId: { in: idsCampanhas } } });
    await prisma.aprovacaoSolicitacao.deleteMany({
      where: { tipoEntidade: "ATIVACAO_CAMPANHA" },
    });
    await prisma.campanha.deleteMany({ where: { id: { in: idsCampanhas } } });

    const cestas = await prisma.cesta.findMany({
      where: { nome: { startsWith: "Cesta E2E" } },
      select: { id: true },
    });
    const idsCestas = cestas.map(({ id }) => id);
    await prisma.oferta.updateMany({
      where: { destinacaoCestaId: { in: idsCestas } },
      data: { destinacao: "VITRINE", destinacaoCestaId: null },
    });
    await prisma.cestaOferta.deleteMany({ where: { cestaId: { in: idsCestas } } });
    await prisma.cesta.deleteMany({ where: { id: { in: idsCestas } } });

    // Aliado + solução + ofertas publicadas.
    const empresa = await semearAliadoAtivoComContrato(NOME_ALIADO);
    const solucao = await semearSolucaoCompleta(empresa.id, `Solução E2E Campanhas ${runId()}`);
    const pctDesconto = await prisma.tipoBeneficio.findUniqueOrThrow({
      where: { slug: "PCT_DESCONTO" },
    });
    const checkoutClube = await prisma.mecanica.findUniqueOrThrow({
      where: { slug: "CHECKOUT_CLUBE" },
    });
    await prisma.oferta.createMany({
      data: [
        {
          solucaoId: solucao.id,
          titulo: `Oferta de vitrine E2E ${runId()}`,
          natureza: "BENEFICIO",
          tipoBeneficioId: pctDesconto.id,
          mecanicaId: checkoutClube.id,
          precoDe: 100,
          precoPor: 80,
          vigenciaInicio: new Date("2026-08-01T00:00:00Z"),
          status: "PUBLICADA",
        },
        {
          solucaoId: solucao.id,
          titulo: `Oferta exclusiva E2E ${runId()}`,
          natureza: "BENEFICIO",
          tipoBeneficioId: pctDesconto.id,
          mecanicaId: checkoutClube.id,
          precoDe: 200,
          precoPor: 150,
          vigenciaInicio: new Date("2026-08-01T00:00:00Z"),
          status: "PUBLICADA",
        },
      ],
    });

    // Público sintético em MG (marcado como SINTÉTICO pelo gerador).
    await prisma.assinante.deleteMany({ where: { nome: { startsWith: "[E2E-F12]" } } });
    for (const sintetico of SINTETICOS) {
      await prisma.assinante.create({
        data: {
          nome: `[E2E-F12] ${sintetico.nome}`,
          cpfHash: hashCpf(sintetico.cpf),
          cpfCifrado: cifrarCpf(sintetico.cpf),
          uf: UF_DO_PUBLICO,
          municipio: "Uberaba",
          preferencia: "AGRICULTURA",
          statusBase: "ATIVO",
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial("F12 — ciclo completo da campanha (T22 → T23 → T25)", () => {
  test("cestas: RN41 bloqueia a cesta com oferta não publicada e libera quando tudo está publicado", async ({
    page,
  }) => {
    await semearCenarioDeCampanha();
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas/cestas");
    await axeComUiAssentada(page);

    await page.getByRole("button", { name: "+ Nova cesta" }).click();
    await page.getByLabel("Nome").fill(NOME_CESTA);
    await page.getByLabel("Narrativa").fill("Cesta montada pelo e2e da F12.");
    await page.getByRole("button", { name: "Criar cesta" }).click();

    // Cesta vazia não entra em campanha (RN41 visível na tela).
    await expect(page.getByText(/Cesta vazia/)).toBeVisible();

    await submeterERepintar(page, async () => {
      await page.getByRole("button", { name: "Adicionar" }).first().click();
    });
    await expect(page.getByText("Publicada").first()).toBeVisible();
    await expect(page.getByText(/Cesta vazia/)).toHaveCount(0);
    await axeComUiAssentada(page);
  });

  test("modelagem: público simulado, sugestão aceita à mão, peça, meta e portas da RN38", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas");
    await axeComUiAssentada(page);

    await page.getByRole("button", { name: "+ Nova campanha" }).click();
    await page.getByLabel("Nome").fill(NOME_CAMPANHA);
    await page.getByRole("button", { name: "Criar campanha" }).click();
    await expect(page).toHaveURL(/\/campanhas\/[a-z0-9]+$/);
    await axeComUiAssentada(page);

    // Público: filtros montados no construtor IMPORTADO da F11 — a
    // contagem viva é o simulador de alcance.
    await page.getByRole("radio", { name: /Montar filtros agora/ }).check();
    await page.getByRole("button", { name: "+ Adicionar regra" }).click();
    await page.getByLabel("Campo da regra 1").selectOption("uf");
    await page.getByLabel("Valor da regra 1").selectOption(UF_DO_PUBLICO);
    await expect(page.locator(".viva-n")).toHaveText(String(SINTETICOS.length));
    await page.getByRole("button", { name: "Salvar público" }).click();

    // Conteúdo: a sugestão aparece rotulada e é aceita por ato humano.
    await page.getByRole("button", { name: /Conteúdo/ }).first().click();
    await expect(page.getByText(/A recomendação é assistiva/)).toBeVisible();
    const itemDaCesta = page.locator(".cont-it").filter({ hasText: NOME_CESTA });
    await itemDaCesta.getByRole("button", { name: "Adicionar" }).click();
    await expect(itemDaCesta.getByRole("button", { name: "Remover" })).toBeVisible();

    // Peça: formato da lista de domínio nova + texto genérico do Clube.
    await page.getByRole("button", { name: /^Peças/ }).first().click();
    await page.getByLabel("Formato").selectOption({ label: "E-mail" });
    await page.getByLabel("Título").fill("Sua safra merece o Clube Broto");
    await page.getByLabel("Texto").fill("Ofertas selecionadas para quem planta e cria.");
    await page.getByRole("button", { name: "+ Adicionar peça" }).click();
    await expect(page.getByText("E-mail — Sua safra merece o Clube Broto")).toBeVisible();

    // Metas: resgates (nível por oferta) e conversão % (avisa que depende
    // da telemetria por CPF — RN44).
    await page.getByRole("button", { name: /^Metas/ }).first().click();
    await page.getByLabel("Tipo de meta").selectOption("RESGATES");
    await page.getByLabel("Alvo").fill("1");
    await page.getByRole("button", { name: "Adicionar meta" }).click();
    await page.getByLabel("Tipo de meta").selectOption("CONVERSAO_PCT");
    await expect(page.getByText(/requer telemetria por CPF/)).toBeVisible();
    await page.getByLabel("Alvo").fill("10");
    await page.getByRole("button", { name: "Adicionar meta" }).click();

    // Revisão: as três portas da RN38 explicadas; vigência libera a ativação.
    await page.getByRole("button", { name: /Revisão e ativação/ }).first().click();
    await expect(
      page.getByText(/A campanha precisa de vigência definida/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Ativar campanha" })).toBeDisabled();
    await page.getByLabel("Vigência — início").fill("2026-08-01");
    await page.getByLabel("Vigência — fim").fill("2026-08-31");
    await page.getByLabel("Instruções à operação").fill("Disparar na primeira semana.");
    await page.getByLabel("Instruções à operação").blur();
    await expect(page.getByRole("button", { name: "Ativar campanha" })).toBeEnabled();
    await axeComUiAssentada(page);
  });

  test("ativação congela o público, gera o kit v1 e leva ao painel", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas");
    await page.getByRole("link", { name: NOME_CAMPANHA }).click();
    await page.getByRole("button", { name: /Revisão e ativação/ }).first().click();
    // Botão habilitado = as três portas da RN38 atendidas no SERVIDOR
    // (as portas vêm renderizadas de lá); só então a ativação é pedida.
    const ativar = page.getByRole("button", { name: "Ativar campanha" });
    await expect(ativar).toBeEnabled();
    await ativar.click();

    // Modal de confirmação explica o congelamento e a herança da RN34.
    await expect(page.getByRole("dialog", { name: "Ativar campanha" })).toBeVisible();
    await expect(page.getByText(/finalidade preenchida pelo nome da campanha/)).toBeVisible();
    // Aguarda a RESPOSTA da server action e recarrega (padrão de
    // estabilização da suíte). Recarregar também torna a asserção
    // independente do push do cliente: campanha já ativa faz a rota de
    // modelagem redirecionar para o painel no servidor.
    await submeterERepintar(page, async () => {
      await page.getByRole("button", { name: "Ativar e gerar kit v1" }).click();
    });

    // Recusa de validação aparece como aviso na própria tela: assertá-la
    // primeiro transforma um timeout mudo em mensagem legível. O seletor é
    // o aviso da tela — o anunciador de rota do Next também tem role=alert.
    await expect(page.locator('.aviso-inline[role="alert"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/painel$/);
    await expect(
      page.getByText(`público congelado: ${SINTETICOS.length}`),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Baixar kit" })).toBeVisible();
    await expect(page.getByText("v1").first()).toBeVisible();
    await axeComUiAssentada(page);
  });

  test("painel declara o nível de cada número e a conversão aguarda telemetria por CPF", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas");
    await page.getByRole("link", { name: NOME_CAMPANHA }).click();
    await expect(page).toHaveURL(/\/painel$/);

    // Nível por oferta declarado nos cartões e na tabela de desempenho.
    await expect(page.getByText("por oferta").first()).toBeVisible();
    await expect(page.getByText(/Atribuição por oferta/)).toBeVisible();
    // Conversão %: sem granularidade por CPF, responde indisponível.
    await expect(page.getByText("indisponível — aguarda telemetria por CPF")).toBeVisible();
  });

  test("encerrar exibe o aviso da RN40 e pausa a oferta exclusiva", async ({ page }) => {
    // A oferta exclusiva é vinculada pela T5 (destinação = campanha).
    const prisma = new PrismaClient();
    try {
      const campanha = await prisma.campanha.findFirstOrThrow({ where: { nome: NOME_CAMPANHA } });
      await prisma.oferta.updateMany({
        where: { titulo: `Oferta exclusiva E2E ${runId()}` },
        data: { destinacao: "CAMPANHA", destinacaoCampanhaId: campanha.id },
      });
    } finally {
      await prisma.$disconnect();
    }

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas");
    await page.getByRole("link", { name: NOME_CAMPANHA }).click();
    await expect(page).toHaveURL(/\/painel$/);

    await page.getByRole("button", { name: "Encerrar campanha" }).click();
    const dialogo = page.getByRole("dialog", { name: "Encerrar campanha" });
    await expect(dialogo).toBeVisible();
    // O nome aparece duas vezes: na frase do aviso e na lista do que será
    // pausado — a asserção mira o item da lista.
    await expect(
      dialogo.getByRole("listitem").filter({ hasText: `Oferta exclusiva E2E ${runId()}` }),
    ).toBeVisible();
    await expect(dialogo.getByText(/reversão manual/)).toBeVisible();
    // Padrão de estabilização da suíte: aguarda a resposta da server action
    // e recarrega — o refresh do App Router nem sempre repinta o DOM no
    // runner lento (o banco muda, a tela não).
    await submeterERepintar(page, async () => {
      await dialogo.getByRole("button", { name: "Encerrar campanha" }).click();
    });

    await expect(page.getByText("Encerrada").first()).toBeVisible();

    const prismaVerificacao = new PrismaClient();
    try {
      const exclusiva = await prismaVerificacao.oferta.findFirstOrThrow({
        where: { titulo: `Oferta exclusiva E2E ${runId()}` },
      });
      expect(exclusiva.status).toBe("PAUSADA");
      const vitrine = await prismaVerificacao.oferta.findFirstOrThrow({
        where: { titulo: `Oferta de vitrine E2E ${runId()}` },
      });
      expect(vitrine.status).toBe("PUBLICADA");
    } finally {
      await prismaVerificacao.$disconnect();
    }
  });

  test("T22 e T25 consultáveis a 380px", async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 });
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/campanhas");
    await expect(page.getByRole("heading", { name: "Campanhas" })).toBeVisible();
    await expect(page.getByText(NOME_CAMPANHA)).toBeVisible();
    // Sinais objetivos da F5, além da consulta: a tela cabe na viewport e a
    // tabela vira cards com rótulo em toda célula. Foi esta checagem que
    // encontrou a coluna "Campanha" sem `data-label` aqui e a "Oferta" sem
    // rótulo no painel — no colapso a linha aparecia sem dizer o que era.
    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await axeComUiAssentada(page);

    await page.getByRole("link", { name: NOME_CAMPANHA }).click();
    await expect(page).toHaveURL(/\/painel$/);
    await expect(page.getByText(/público congelado/).first()).toBeVisible();
    await semRolagemHorizontal(page);
    await tabelaColapsadaEmCards(page);
    await axeComUiAssentada(page);
  });
});
