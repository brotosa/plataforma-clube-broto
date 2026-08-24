import { expect, test, type Page } from "@playwright/test";
import {
  cnpjDeNome,
  entrar,
  limparAliadoPorNome,
  runId,
  semViolacoesAxe,
  semearAliadoAtivoComContrato,
  semearAliadoEmNegociacao,
  semearImportacaoProspectsComQuarentena,
  semearAliadoEmNegociacaoM2Completo,
  semearOfertaPublicada,
  semearSolucaoCompleta,
  submeterERepintar,
} from "./ajudantes";

/**
 * Abre a aba Soluções da ficha navegando pelo `href`, não pelo clique.
 *
 * O clique num `<Link>` do App Router com prefetch é sujeito a corrida sob
 * carga: a navegação não acontece e o teste espera por um cabeçalho que nunca
 * chega ("Soluções do aliado" não encontrado). O arquivo já usava este padrão
 * duas linhas adiante, para "+ Nova solução"/"+ Nova oferta"; aqui ele fecha
 * a última fonte de flakiness da suíte (F5). O clique em si segue coberto —
 * `teclado.spec.ts` navega as abas por Enter e verifica o efeito.
 */
async function irParaAbaSolucoes(page: Page): Promise<void> {
  const href = await page
    .getByRole("link", { name: "Soluções", exact: true })
    .getAttribute("href");
  await page.goto(href!);
  await expect(page.getByRole("heading", { name: "Soluções do aliado" })).toBeVisible();
}

/** Abas da T2 (ficha do aliado) — espelham `ABAS` em app/(plataforma)/aliados/[id]/page.tsx. */
const ABAS_DA_FICHA = [
  "visao",
  "solucoes",
  "ofertas",
  "comercial",
  "scouting",
  "contatos",
  "integracao",
] as const;

/**
 * Fluxo principal da F2 pela interface, reescrito como testes ISOLADOS
 * (critério de estabilidade): cada teste semeia sua própria precondição
 * direto no banco (via Prisma, rápido e determinístico) e exercita a ÚNICA
 * ação de UI que verifica. Nenhum teste depende de outro ter rodado — um
 * retry re-executa só o teste que falhou, sem recriar entidades de chave
 * única (o que quebrava a antiga cadeia describe.serial no retry).
 *
 * Os nomes derivam de runId() (estável na execução) + um token por teste,
 * então CNPJs/nomes não colidem entre testes; a semeadura é idempotente
 * (deleta o homônimo antes de criar). Cobertura e asserções preservadas:
 * criar aliado (T1) → contato+contrato → promoção RN06 → solução (T3,
 * RN01/RN09) → oferta+publicação (T5, RN02/RN09/RN11) e lista transversal
 * (T4) → bloqueio de recompensa com preço. Teclado (T7) e axe seguem
 * isolados no fim.
 */

test.describe("fluxo principal — testes isolados (F2)", () => {
  test("analista cria o aliado com dados M2 (T1)", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-t1`;
    await limparAliadoPorNome(nome); // idempotência: apaga execução anterior

    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto("/aliados/novo");
    await page.getByLabel("Nome fantasia (nome de exibição)").fill(nome);
    await page.getByLabel("Razão social").fill(`${nome} LTDA`);
    await page.getByLabel("CNPJ").fill(cnpjDeNome(nome));
    // F15 (RN54): o campo "Logo (chave do arquivo)", que pedia um endereço
    // no S3, saiu do formulário — a marca passou a ser arquivo enviado no
    // cartão próprio da tela de edição, coberto por marca-aliado.spec.ts.
    await page.getByLabel("Descrição institucional").fill("Aliado criado pelo fluxo e2e.");
    await page.getByLabel("Município").fill("Curitiba");
    await page.getByLabel("UF", { exact: true }).selectOption("PR");
    await page.getByRole("checkbox", { name: "Tecnologia e Software" }).check();
    await page.getByRole("button", { name: "Criar aliado" }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(page.getByText("Em negociação")).toBeVisible();
  });

  test("analista registra contato e contrato (bloco comercial)", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-t2`;
    await semearAliadoEmNegociacao(nome); // cru: sem contato/contrato ainda

    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    await page.getByRole("link", { name: new RegExp(nome) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);

    await page.getByRole("link", { name: "Contatos" }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Contato Comercial E2E");
    await page.getByLabel("E-mail", { exact: true }).fill(`comercial+${runId()}t2@e2e.local`);
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Adicionar contato" }).click(),
    );
    // Sinal durável: o contato aparece na tabela após a revalidação
    await expect(page.getByRole("cell", { name: "Contato Comercial E2E" })).toBeVisible();

    await page.getByRole("link", { name: "Comercial" }).click();
    await page.getByLabel("Data-base da vigência").fill("2026-07-01");
    await page.getByLabel("Comissão (%)").fill("5");
    await page.getByLabel("Ambientes de pagamento habilitados").selectOption("AMBOS");
    await page.getByLabel("Anexo do contrato (chave do arquivo)").fill("s3://contratos/e2e.pdf");
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Registrar contrato" }).click(),
    );
    // A revalidação troca o formulário pela visão do contrato vigente
    await expect(page.getByRole("heading", { name: "Contrato vigente" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Encerrar contrato" })).toBeVisible();
  });

  test("cartão de pendência: /aliados?completude=incompletos recorta a lista e limpa", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-incompleto`;
    await semearAliadoEmNegociacao(nome); // cru (sem contato/contrato/categoria) → incompleto

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/aliados?completude=incompletos");

    // O banner explica o recorte e o aliado incompleto aparece nele.
    await expect(page.getByText(/cadastros incompletos/i)).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(nome) })).toBeVisible();

    // "Limpar filtro" devolve à lista sem o parâmetro.
    await page.getByRole("link", { name: "Limpar filtro" }).click();
    await expect(page).toHaveURL(/\/aliados$/);
    await expect(page.getByText(/cadastros incompletos/i)).toHaveCount(0);
  });

  test("radar: histórico de prospects deixa ver quais linhas foram para quarentena", async ({ page }) => {
    const arquivo = `[E2E-PROSPECT ${runId()}] aliados-mapeados.csv`;
    await semearImportacaoProspectsComQuarentena(arquivo);

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado/radar");

    const linha = page.locator("#historico-prospects tr", { hasText: arquivo });
    await expect(linha).toBeVisible();
    await expect(linha.getByText(/em quarentena/)).toBeVisible();

    // Expandir mostra "linha: motivo" de cada recusada — o que faltava ver.
    await linha.locator("summary").click();
    await expect(linha.getByText(/Sem categoria-alvo reconhecida/)).toBeVisible();
    await expect(linha.getByText(/CNPJ ausente/)).toBeVisible();
  });

  test("promoção com usuário distinto vira Aliada ativa (RN06)", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-t3`;
    await semearAliadoEmNegociacaoM2Completo(nome); // promovível (M2 completo)

    // Analista solicita a promoção — entra na fila (RN06)
    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    await page.getByRole("link", { name: new RegExp(nome) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Solicitar promoção a Aliada ativa" }).click(),
    );
    await expect(page.getByText("Promoção aguardando aprovação")).toBeVisible();

    // Aprovador (usuário DISTINTO do solicitante — RN06) aprova
    await entrar(page, "aprovador@dev.clubebroto.local");
    await page.goto("/aprovacoes");
    const dossie = page.locator("details", { hasText: nome });
    await dossie.locator("summary").click();
    // Aprovar é ação NO LUGAR: a aprovação commita de forma confiável, mas o
    // soft-refresh do App Router pode não repintar a fila no CI lento.
    // Recarrega em laço até a pendência sumir (efeito RN06 já persistido).
    await dossie.getByRole("button", { name: "Aprovar", exact: true }).click();
    await expect(async () => {
      await page.reload();
      await expect(dossie).toHaveCount(0, { timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    const linha = page.getByRole("row", { name: new RegExp(nome) });
    await expect(linha.getByText("Aliado ativo")).toBeVisible();
  });

  test("cria solução com card completo (T3, RN01/RN09)", async ({ page }) => {
    const nome = `Aliado E2E ${runId()}-t4`;
    const nomeSolucao = `Solução E2E ${runId()}-t4`;
    await semearAliadoAtivoComContrato(nome); // ALIADA_ATIVA (RN01)

    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    await page.getByRole("link", { name: new RegExp(nome) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await irParaAbaSolucoes(page);
    // Navegação pelo href (clique em Link com prefetch é sujeito a corrida no CI)
    const hrefNovaSolucao = await page
      .getByRole("link", { name: "+ Nova solução" })
      .getAttribute("href");
    await page.goto(hrefNovaSolucao!);
    await page.waitForURL(/\/solucoes\/nova/);
    await page.waitForLoadState("networkidle"); // hidratação completa antes de interagir

    await page.getByLabel("Nome da solução").fill(nomeSolucao);
    await page.getByLabel("Descrição curta (texto do card)").fill("Solução criada pelo e2e.");
    await page.getByLabel("Categoria").selectOption({ label: "Tecnologia e Software" });
    await page.getByRole("checkbox", { name: "Todas" }).check();
    await page.getByRole("checkbox", { name: "Cobertura nacional" }).check();
    /**
     * F17 (RN60) — a régua para em 88% aqui, e isso é o comportamento
     * certo, não uma regressão.
     *
     * O campo "Imagem do card (chave do arquivo)" deixou de existir: a
     * imagem virou arquivo da plataforma, e arquivo exige a solução já
     * criada (é 1:1 com ela). Então os sete itens que dependem só do
     * formulário fecham antes de salvar, e o oitavo fecha no cartão de
     * envio da tela de edição — que é o que o teste seguinte cobre.
     */
    await expect(page.getByText("88%")).toBeVisible();
    await page.waitForLoadState("networkidle"); // formulário assentado antes de submeter
    await page.getByRole("button", { name: "Criar solução" }).click();
    // Sinal durável do redirect: o título da solução na ficha (mais robusto que
    // waitForURL sob o App Router no runner lento do CI).
    await expect(page.getByRole("heading", { level: 1, name: nomeSolucao })).toBeVisible({
      timeout: 30_000,
    });

    // F17 — e o oitavo item fecha aqui, com a imagem enviada: a régua
    // chega a 100% e a solução fica publicável (RN02).
    /**
     * `setInputFiles` dispara o evento de mudança uma vez só: se o React
     * ainda não atou o `onChange`, ele se perde e o clique seguinte vira
     * POST nativo. Reenviar até o nome aparecer ao lado do botão é a
     * prova de hidratação — mesmo padrão de `imagem-solucao.spec.ts`.
     */
    await expect(async () => {
      await page.getByLabel("Enviar a imagem do card").setInputFiles({
        name: "card.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
      await expect(page.getByText("card.png").first()).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole("button", { name: "Enviar imagem" }).click();
    await expect(page.getByText("Imagem do card atualizada.")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
  });

  test("cria e publica oferta (T5, RN02/RN09/RN11) e aparece na lista transversal (T4)", async ({
    page,
  }) => {
    const nome = `Aliado E2E ${runId()}-t5`;
    const nomeSolucao = `Solução E2E ${runId()}-t5`;
    const tituloOferta = `15% de desconto E2E ${runId()}-t5`;
    const aliado = await semearAliadoAtivoComContrato(nome);
    await semearSolucaoCompleta(aliado.id, nomeSolucao); // card completo (RN09)

    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    await page.getByRole("link", { name: new RegExp(nome) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await irParaAbaSolucoes(page);
    await page.getByRole("link", { name: nomeSolucao }).click();
    await page.waitForURL(/\/solucoes\/(?!nova$)[a-z0-9]+$/);
    // Navegação direta pelo href (o clique em link com prefetch se mostrou
    // sujeito a corrida no ambiente de teste)
    const hrefNovaOferta = await page
      .getByRole("link", { name: "+ Nova oferta" })
      .getAttribute("href");
    await page.goto(hrefNovaOferta!);
    await page.waitForURL(/\/ofertas\/nova/);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Título comercial").fill(tituloOferta);
    await page.getByRole("radio", { name: /Benefício/ }).check();
    await page.getByLabel("Tipo de benefício").selectOption({ label: "% desconto" });
    // Tipo Percentual: o campo de % substitui preço de/por (some o preço).
    await page.getByLabel("Percentual de desconto (%)").fill("15");
    await page.getByRole("radio", { name: /Checkout no clube/ }).check();
    await page.getByLabel("Vigência início").fill("2026-07-01");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Criar oferta (rascunho)" }).click();
    // Sinal durável do redirect: o pill de status na ficha da oferta.
    await expect(page.getByText("Rascunho")).toBeVisible({ timeout: 30_000 });

    // Assenta a ficha (hidratação) antes de publicar, para o clique despachar
    // a ação de forma confiável.
    await page.waitForLoadState("networkidle");
    // Publicar é ação NO LUGAR (revalidatePath, sem redirect). A publicação
    // commita de forma confiável (verificado no banco), mas o refresh RSC da
    // própria ação colide com um reload único e às vezes deixa a ficha
    // mostrando o estado PRÉ-commit ("Rascunho"). Recarrega em laço até o
    // estado persistido convergir no DOM — sem mascarar defeito: um estado
    // que nunca persistisse esgotaria o tempo e falharia.
    await page.getByRole("button", { name: "Publicar oferta" }).click();
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Publicada", { exact: true })).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // T4 — a oferta publicada aparece na lista transversal com a coluna
    // Natureza (visualizar é de todos os papéis — ficha §2; segue com o
    // analista já autenticado, evitando um relogin desnecessário).
    await page.goto("/ofertas");
    await expect(page.getByRole("columnheader", { name: "Natureza" })).toBeVisible();
    const linha = page.getByRole("row", { name: new RegExp(tituloOferta) });
    await expect(linha.getByText("Benefício", { exact: true })).toBeVisible();
    await expect(linha.getByText("Publicada")).toBeVisible();
  });

  test("recompensa com preço é bloqueada com explicação (validação de natureza)", async ({
    page,
  }) => {
    const nome = `Aliado E2E ${runId()}-t6`;
    const nomeSolucao = `Solução E2E ${runId()}-t6`;
    const aliado = await semearAliadoAtivoComContrato(nome);
    await semearSolucaoCompleta(aliado.id, nomeSolucao);

    await entrar(page, "analista@dev.clubebroto.local");
    await page.goto(`/aliados?busca=${encodeURIComponent(nome)}`);
    await page.getByRole("link", { name: new RegExp(nome) }).click();
    await page.waitForURL(/\/aliados\/[a-z0-9]+/);
    await irParaAbaSolucoes(page);
    await page.getByRole("link", { name: nomeSolucao }).click();
    await page.waitForURL(/\/solucoes\/(?!nova$)[a-z0-9]+$/);
    const hrefNovaRecompensa = await page
      .getByRole("link", { name: "+ Nova oferta" })
      .getAttribute("href");
    await page.goto(hrefNovaRecompensa!);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Título comercial").fill(`Recompensa E2E ${runId()}-t6`);
    // Nome completo do radio-card de natureza (evita colidir com a mecânica
    // "Recompensa gratuita")
    await page.getByRole("radio", { name: /Recompensa Produto\/serviço gratuito/ }).check();
    // Preços ficam desabilitados — a UI ensina a definição contratual
    await expect(page.getByLabel("Preço por (R$)")).toBeDisabled();
    await expect(page.getByText("Recompensa é gratuidade — preços ficam zerados.")).toBeVisible();
  });
});

test("T7 inteira navegável por teclado: interruptor nativo liga e desliga", async ({ page }) => {
  await entrar(page, "gestor@dev.clubebroto.local");
  await page.goto("/aprovacoes/regras");
  await page.waitForLoadState("networkidle"); // hidratação completa antes do teclado

  // Independente do estado inicial: alterna, confere a inversão e restaura
  const interruptor = () =>
    page.getByRole("switch", { name: /exigência de aprovação para Publicação de oferta/i });
  const inicial = (await interruptor().getAttribute("aria-checked")) === "true";

  // Alterna por teclado e confere após recarregar: o refresh do App Router
  // pode não repintar o interruptor no runner lento do CI (o banco muda, o DOM
  // não); recarregar garante o estado já persistido. Restaura ao final para
  // não vazar estado para outras suítes (ex.: a checagem do motor na fundação).
  const alternarPorTeclado = async (esperado: boolean) => {
    await interruptor().focus();
    await submeterERepintar(page, () => page.keyboard.press("Enter"));
    await expect(interruptor()).toHaveAttribute("aria-checked", String(esperado));
  };
  await alternarPorTeclado(!inicial);
  await alternarPorTeclado(inicial);
});

/**
 * Auditoria AAA (F5) das telas da Onda 1 — T1, T2 (as SETE abas), T3, T5, T6
 * e T7, mais os formulários de criação e edição. A F2 varria só um subconjunto
 * (T1, a aba Comercial, T4/T6/T7): abas e formulários inteiros nunca tinham
 * passado pelo axe. A precondição é semeada aqui para que as telas que só
 * existem com dados (ficha da solução, ficha da oferta, edição) sejam
 * realmente varridas — e não silenciosamente puladas.
 */
test("axe-core (AAA) sem violações nas telas da Onda 1", async ({ page }) => {
  const nome = `Aliado E2E ${runId()}-axe`;
  const nomeSolucao = `Solução E2E ${runId()}-axe`;
  const tituloOferta = `Oferta E2E ${runId()}-axe`;
  const aliado = await semearAliadoAtivoComContrato(nome);
  const solucao = await semearSolucaoCompleta(aliado.id, nomeSolucao);
  const oferta = await semearOfertaPublicada(solucao.id, tituloOferta);

  await entrar(page, "gestor@dev.clubebroto.local");

  const rotas = [
    "/aliados", // T1
    "/aliados/novo",
    ...ABAS_DA_FICHA.map((aba) => `/aliados/${aliado.id}?aba=${aba}`), // T2
    `/aliados/${aliado.id}/editar`,
    `/aliados/${aliado.id}/solucoes/nova`, // T3 (formulário)
    `/aliados/${aliado.id}/solucoes/${solucao.id}`, // T3 (ficha)
    `/aliados/${aliado.id}/solucoes/${solucao.id}/ofertas/nova`, // T5 (formulário)
    `/ofertas/${oferta.id}`, // T5 (ficha)
    `/ofertas/${oferta.id}/editar`,
    "/ofertas", // T4
    "/aprovacoes", // T6
    "/aprovacoes/regras", // T7
  ];

  for (const rota of rotas) {
    await page.goto(rota);
    await semViolacoesAxe(page);
  }
});
