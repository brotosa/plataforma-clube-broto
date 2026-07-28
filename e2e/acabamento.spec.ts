import { expect, test } from "@playwright/test";
import { entrar, prisma, semViolacoesAxe } from "./ajudantes";

/**
 * F22 (Onda 14) pela interface — acabamento.
 *
 * Quatro frentes com efeito visível: o atalho de teclado, os complementos
 * do guia, a barra de volta do R1 no papel e o espaçamento dos
 * formulários em grade. Nenhuma delas cria tela: o que se prova aqui é
 * que a mudança chegou onde devia e não mexeu no resto.
 */

const ATALHO = "Pular para o conteúdo";

test.describe("atalho de teclado — pular para o conteúdo", () => {
  test("Tab do topo revela o atalho; Enter entrega o foco ao conteúdo", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    const atalho = page.getByRole("link", { name: ATALHO });

    // Escondido enquanto ninguém o procura: fora da tela por
    // deslocamento, e não por display/visibility — que o tirariam da
    // ordem de foco e o tornariam inalcançável.
    await expect(atalho).toBeAttached();
    const caixaEscondido = await atalho.boundingBox();
    expect(caixaEscondido?.x ?? 0, "atalho fora da tela em repouso").toBeLessThan(0);

    // Primeiro Tab a partir do topo do documento: é ele quem chega.
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press("Tab");
    await expect(atalho).toBeFocused();

    const caixaVisivel = await atalho.boundingBox();
    expect(caixaVisivel?.x ?? -1, "atalho visível ao receber foco").toBeGreaterThanOrEqual(0);

    await page.keyboard.press("Enter");

    // Entrega o FOCO, e não só a rolagem: o próximo Tab continua de
    // dentro do conteúdo, e não do topo da lateral que se quis pular.
    await expect(page.locator("main#conteudo")).toBeFocused();
  });

  test("o atalho é o PRIMEIRO focável, antes de qualquer item da lateral", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");

    const primeiro = await page.evaluate(() => {
      const focaveis = [
        ...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
      ].filter((no) => no.offsetParent !== null || no.classList.contains("skip"));
      return focaveis[0]?.textContent?.trim() ?? "";
    });
    expect(primeiro).toBe(ATALHO);
  });

  test("sobrevive à troca de rota e à lateral recolhida", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.getByRole("button", { name: "Recolher ou expandir menu" }).click();
    await page.goto("/aliados");

    await page.evaluate(() => document.body.focus());
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: ATALHO })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#conteudo")).toBeFocused();
  });

  test("axe AAA continua limpo com o atalho na página", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await semViolacoesAxe(page);

    // E com o atalho em foco, que é quando ele existe na tela — o
    // contraste da caixa branca sobre o azul só é medível assim.
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press("Tab");
    await semViolacoesAxe(page);
  });
});

test.describe("guia — os quatro complementos com origem declarada", () => {
  const complementos = [
    { secao: "j1", origem: "Complemento — Onda 8", trecho: "até 200 KB" },
    { secao: "j2", origem: "Complemento — Onda 10", trecho: "até 400 KB" },
    { secao: "j4", origem: "Complemento — Onda 13", trecho: "até 1 MB" },
    { secao: "j5", origem: "Complemento — Onda 8", trecho: "dois caminhos" },
  ] as const;

  for (const { secao, origem, trecho } of complementos) {
    test(`§${secao} traz o bloco «${origem}», ao final da seção`, async ({ page }) => {
      await entrar(page, "gestor@dev.clubebroto.local");
      await page.goto(`/ajuda#${secao}`);

      const bloco = page.locator(`#${secao} .gd-compl`);
      await expect(bloco).toHaveCount(1);
      await expect(bloco).toContainText(origem);
      await expect(bloco).toContainText(trecho);

      // Ao final: nenhum irmão depois dele dentro da seção.
      const ultimo = await bloco.evaluate((no) => no.nextElementSibling === null);
      expect(ultimo, `bloco de §${secao} é o último da seção`).toBe(true);
    });
  }

  test("o texto transcrito continua antes do complemento, e não depois", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ajuda#j1");

    // Uma frase do documento do Design, que precisa estar acima do bloco.
    const posicoes = await page.evaluate(() => {
      const secao = document.getElementById("j1");
      const complemento = secao?.querySelector(".gd-compl");
      const jornada = secao?.querySelector(".gd-jorn");
      if (!secao || !complemento || !jornada) return null;
      return {
        transcrito: jornada.getBoundingClientRect().top,
        complemento: complemento.getBoundingClientRect().top,
      };
    });
    expect(posicoes).not.toBeNull();
    expect(posicoes!.transcrito).toBeLessThan(posicoes!.complemento);
  });

  test("axe AAA limpo na ajuda, com o atalho do shell e o do guia na mesma página", async ({
    page,
  }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/ajuda");
    await semViolacoesAxe(page);
  });
});

test.describe("R1 — a barra de volta sai do papel", () => {
  const NOME = "[E2E-F22] Patrocinadora da impressão";

  /**
   * CNPJ próprio, e não por capricho: o número é único no cadastro, e
   * cada suíte limpa apenas o SEU prefixo de razão social. Reaproveitar o
   * de `patrocinadores.spec.ts` fez a semeadura dele quebrar em sete
   * testes — a linha desta suíte sobrevivia à limpeza daquela.
   */
  const CNPJ = "04252011000110";

  test.beforeEach(async () => {
    const anteriores = await prisma.patrocinador.findMany({
      where: { razaoSocial: { startsWith: "[E2E-F22]" } },
      select: { id: true, contrato: { select: { id: true } } },
    });
    const ids = anteriores.map((p) => p.id);
    const contratos = anteriores.flatMap((p) => (p.contrato ? [p.contrato.id] : []));
    await prisma.minutaContrato.deleteMany({ where: { contratoId: { in: contratos } } });
    await prisma.relatorioPatrocinador.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.vinculoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.contratoPatrocinio.deleteMany({ where: { patrocinadorId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidadeId: { in: [...ids, ...contratos] } },
    });
    await prisma.patrocinador.deleteMany({ where: { id: { in: ids } } });
  });

  test("na tela a barra aparece; na impressão, não", async ({ page }) => {
    const patrocinador = await prisma.patrocinador.create({
      data: {
        razaoSocial: NOME,
        cnpj: CNPJ,
        contrato: {
          create: {
            vigenciaInicio: new Date("2026-01-01T00:00:00.000Z"),
            vigenciaFim: new Date("2026-12-31T00:00:00.000Z"),
            assinaturasAdquiridas: 100,
          },
        },
      },
      select: { id: true },
    });

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/patrocinadores/${patrocinador.id}`);

    await page.getByRole("button", { name: "Gerar relatório" }).click();
    await page.getByLabel("Período — início").fill("2026-02-01");
    await page.getByLabel("Período — fim").fill("2026-07-31");
    await page.getByLabel("Finalidade").fill("conferência de impressão do e2e");
    await page.getByRole("button", { name: "Gerar", exact: true }).click();
    await page.waitForURL(/\/patrocinadores\/.+\/relatorio\/.+/, { timeout: 30_000 });

    const barra = page.getByRole("link", { name: "← Voltar à ficha do patrocinador" });
    await expect(barra).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(barra).toBeHidden();

    // E o documento em si permanece — some a navegação, não o conteúdo.
    await expect(page.getByRole("heading", { name: NOME, level: 1 })).toBeVisible();
    await expect(page.getByText("conferência de impressão do e2e")).toBeVisible();

    await page.emulateMedia({ media: "screen" });
    await expect(barra).toBeVisible();
  });
});

test.describe("formulários em grade — a linha volta a respirar", () => {
  test("T32 usa a classe, com 14px entre linhas e 16px entre colunas", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/patrocinadores");
    await page.getByRole("button", { name: "Novo patrocinador" }).click();

    const grade = page.locator("form .form-grid").first();
    await expect(grade).toBeVisible();

    const medidas = await grade.evaluate((no) => {
      const estilo = getComputedStyle(no);
      return {
        display: estilo.display,
        linha: estilo.rowGap,
        coluna: estilo.columnGap,
        colunas: estilo.gridTemplateColumns.split(" ").length,
      };
    });
    expect(medidas.display).toBe("grid");
    expect(medidas.linha).toBe("14px");
    expect(medidas.coluna).toBe("16px");
    expect(medidas.colunas).toBe(2);
  });

  test("o rótulo de uma linha não encosta no campo da linha de cima", async ({ page }) => {
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/patrocinadores");
    await page.getByRole("button", { name: "Novo patrocinador" }).click();

    // O defeito era exatamente este: com row-gap zero, a distância entre o
    // fim de um campo e o rótulo do campo de baixo era 0.
    const folga = await page.locator("form .form-grid").first().evaluate((grade) => {
      const campos = [...grade.querySelectorAll<HTMLElement>(".field")];
      let menor = Number.POSITIVE_INFINITY;
      for (const campo of campos) {
        const caixa = campo.getBoundingClientRect();
        for (const outro of campos) {
          const dele = outro.getBoundingClientRect();
          // Só linhas diferentes, e só o de baixo em relação ao de cima.
          if (dele.top >= caixa.bottom) {
            menor = Math.min(menor, dele.top - caixa.bottom);
          }
        }
      }
      return menor;
    });
    expect(folga, "folga vertical entre linhas do formulário").toBeGreaterThanOrEqual(14);
  });
});
