import { expect, test } from "@playwright/test";
import {
  entrar,
  prisma,
  runId,
  semViolacoesAxe,
  semearEmpresaRadar,
  submeterERepintar,
} from "./ajudantes";

/**
 * F8 pela interface — T11 (dossiê de due diligence), em testes isolados no
 * padrão da F6/F7: cada teste semeia sua própria precondição no banco.
 *
 * Cobertura: estado vazio com as duas saídas (gerar/inserir), inserção
 * manual validada contra o schema do template, RN19 ponta a ponta (tarja
 * "requer revisão" → marcar como revisado com autor e data), estado de
 * falha com nova tentativa, entrada pelo menu do card da T8 e axe-core
 * limpo nos quatro estados da tela.
 *
 * O ambiente de e2e não configura ANTHROPIC_API_KEY nem tarifa: a tela
 * mostra a indisponibilidade da geração automática e o caminho manual
 * segue operável — exatamente o comportamento esperado em desenvolvimento.
 */

/** Conteúdo mínimo válido nas dez etapas (schema do template versionado). */
function conteudoDoDossie(nomeEmpresa: string) {
  return {
    resumo_executivo: `${nomeEmpresa} opera conectividade rural no Brasil.`,
    perfil: [
      {
        indicador: "Ano de fundação",
        valor: "2011",
        fonte: "https://exemplo.com.br/sobre",
        confianca: "Alto",
      },
      {
        indicador: "Receita",
        valor: "Não foi encontrada informação pública",
        fonte: "Não foi encontrada informação pública",
        confianca: "Baixo",
      },
    ],
    produtos: [
      {
        nome: "Plano rural",
        descricao: "Conectividade via satélite.",
        problema: "Falta de internet no campo.",
        publico: "Produtores rurais",
        preco: "Não foi encontrada informação pública",
        cobranca: "Assinatura mensal",
        integracoes: "Não foi encontrada informação pública",
        tecnologias: "Satélite geoestacionário",
        diferenciais: "Cobertura nacional",
        fontes: ["https://exemplo.com.br/planos"],
      },
    ],
    impacto_produtor: [
      {
        indicador: "Redução de custo",
        valor: "Não foi encontrada informação pública",
        estudo_de_caso: "Não foi encontrada informação pública",
        fonte: "Não foi encontrada informação pública",
      },
    ],
    mercado: {
      clientes: ["Cooperativas"],
      parceiros: ["Revendas regionais"],
      observacoes: "Distribuição por revendas.",
      fontes: ["https://exemplo.com.br/parceiros"],
    },
    concorrencia: [
      {
        empresa: "Concorrente A",
        comparacao: "Preço menor, cobertura mais restrita.",
        fontes: ["https://exemplo.com.br/imprensa"],
      },
    ],
    swot: {
      forcas: ["Cobertura nacional"],
      fraquezas: ["Preço acima da média"],
      oportunidades: ["Expansão no agro"],
      ameacas: ["Constelações LEO"],
    },
    gaps: [
      {
        informacao: "Número de clientes ativos",
        importancia: "Alta",
        pergunta_sugerida: "Quantos clientes ativos vocês têm hoje?",
      },
    ],
    roteiro_reuniao: Array.from(
      { length: 15 },
      (_valor, indice) => `Pergunta ${indice + 1} sobre produto, tecnologia e ROI.`,
    ),
    fechamento: "As seções são consistentes entre si.",
    fontes_consultadas: ["https://exemplo.com.br/sobre", "https://exemplo.com.br/planos"],
  };
}

test.describe("dossiê de due diligence — T11 (F8)", () => {
  test("estado vazio: duas saídas, geração indisponível sem ambiente e axe limpo", async ({
    page,
  }) => {
    const nome = `Radar E2E ${runId()}-t11-vazio`;
    const empresa = await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto(`/mercado/${empresa.id}/dossie`);

    await expect(page.getByRole("heading", { level: 1, name: nome })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Dossiê público ainda não gerado" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar dossiê" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Inserir manualmente" })).toBeEnabled();
    await expect(
      page.getByText("geração automática indisponível", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("ANTHROPIC_API_KEY")).toBeVisible();

    await semViolacoesAxe(page);
  });

  test("inserção manual recusa conteúdo fora do schema e aceita o JSON do template", async ({
    page,
  }) => {
    const nome = `Radar E2E ${runId()}-t11-manual`;
    const empresa = await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto(`/mercado/${empresa.id}/dossie`);
    await page.getByRole("button", { name: "Inserir manualmente" }).click();

    // O prompt do template fica à mão para gerar o dossiê por fora.
    await page.getByText("Ver o prompt do template").click();
    await expect(page.getByLabel("Prompt de sistema")).toContainText("Analista Sênior");
    await expect(page.getByLabel("Prompt de usuário")).toContainText(nome);

    // Fora do schema: recusa com o campo apontado, sem gravar nada.
    await page.getByLabel("Conteúdo do dossiê (JSON)").fill('{"resumo_executivo": "só isso"}');
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Salvar dossiê" }).click(),
    );
    expect(await prisma.dossie.count({ where: { empresaId: empresa.id } })).toBe(0);

    // Conteúdo válido: grava e passa a exibir as dez seções.
    await page.getByRole("button", { name: "Inserir manualmente" }).click();
    await page
      .getByLabel("Conteúdo do dossiê (JSON)")
      .fill(JSON.stringify(conteudoDoDossie(nome)));
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Salvar dossiê" }).click(),
    );

    await expect(page.getByRole("heading", { name: "Dossiê público — 10 seções" })).toBeVisible();
    for (const titulo of [
      "1 · Resumo executivo",
      "2 · Perfil da empresa",
      "3 · Produtos",
      "4 · Impacto para o produtor",
      "5 · Mercado",
      "6 · Concorrência",
      "7 · SWOT",
      "8 · Gaps da pesquisa",
      "9 · Roteiro para reunião",
      "10 · Fechamento",
    ]) {
      await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    }
    // Ausência de dado tem forma própria — nunca um número plausível.
    await expect(page.getByText("Não foi encontrada informação pública").first()).toBeVisible();
    await expect(page.getByText("origem: inserido manualmente")).toBeVisible();

    await semViolacoesAxe(page);
  });

  test("RN19: nasce requerendo revisão e a revisão grava autor e data", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-t11-rn19`;
    const empresa = await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto(`/mercado/${empresa.id}/dossie`);
    await page.getByRole("button", { name: "Inserir manualmente" }).click();
    await page
      .getByLabel("Conteúdo do dossiê (JSON)")
      .fill(JSON.stringify(conteudoDoDossie(nome)));
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Salvar dossiê" }).click(),
    );

    await expect(page.getByText("Gerado automaticamente — requer revisão.")).toBeVisible();
    await expect(
      page.getByText("nenhum campo dele preenche nota de indicador"),
    ).toBeVisible();

    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Marcar como revisado" }).click(),
    );

    await expect(page.getByText("revisado por Scout (desenvolvimento)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como revisado" })).toHaveCount(0);

    const dossie = await prisma.dossie.findFirstOrThrow({ where: { empresaId: empresa.id } });
    expect(dossie.revisado).toBe(true);
    expect(dossie.revisorId).not.toBeNull();
    expect(dossie.revisadoEm).not.toBeNull();

    await semViolacoesAxe(page);
  });

  test("falha exibe motivo e oferece nova tentativa (axe limpo no estado de erro)", async ({
    page,
  }) => {
    const nome = `Radar E2E ${runId()}-t11-falha`;
    const empresa = await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });
    const scout = await prisma.usuario.findFirstOrThrow({
      where: { papel: "ANALISTA_SCOUT", email: { endsWith: "@dev.clubebroto.local" } },
    });
    const dossie = await prisma.dossie.create({
      data: {
        empresaId: empresa.id,
        status: "FALHA",
        origem: "GERADO_IA",
        solicitanteId: scout.id,
        versaoTemplate: "v1@e2e",
        erro: "A consulta às fontes públicas falhou.",
      },
    });
    await prisma.dossieExecucao.create({
      data: {
        dossieId: dossie.id,
        provedor: "anthropic",
        tentativa: 1,
        iniciadaEm: new Date(),
        concluidaEm: new Date(),
        duracaoMs: 4_200,
        tokensEntrada: 12_000,
        tokensSaida: 800,
        buscasWeb: 2,
        custoBrl: "0.4800",
        sucesso: false,
        erro: "A consulta às fontes públicas falhou.",
        versaoTemplate: "v1@e2e",
      },
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto(`/mercado/${empresa.id}/dossie`);

    await expect(page.getByText("A consulta às fontes públicas falhou.").first()).toBeVisible();
    // Sem ambiente configurado, a nova tentativa fica indisponível e a
    // inserção manual continua sendo a saída.
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Inserir manualmente" })).toBeEnabled();

    // Telemetria de consumo: custo e duração aparecem por execução.
    await expect(page.getByRole("heading", { name: "Execuções" })).toBeVisible();
    await expect(page.getByText("R$ 0,48")).toBeVisible();

    await semViolacoesAxe(page);
  });

  test("o dossiê é alcançável pelo menu do card no funil (T8)", async ({ page }) => {
    const nome = `Radar E2E ${runId()}-t11-menu`;
    await semearEmpresaRadar(nome, {
      estagio: "EM_AVALIACAO",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");
    await page.getByRole("button", { name: `Ações de ${nome}` }).click();
    await page.getByRole("menuitem", { name: "Dossiê de due diligence" }).click();

    await expect(page).toHaveURL(/\/mercado\/[^/]+\/dossie$/);
    await expect(
      page.getByRole("heading", { name: "Dossiê público ainda não gerado" }),
    ).toBeVisible();
  });
});
