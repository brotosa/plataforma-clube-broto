import { expect, test, type Page } from "@playwright/test";
import {
  entrar,
  limparAliadoPorNome,
  prisma,
  runId,
  semViolacoesAxe,
  semearEmpresaRadar,
  submeterERepintar,
} from "./ajudantes";

/**
 * F9 pela interface — T13 (mapa de cobertura), T14 (metas) e o percurso
 * completo da Onda 2 com os anexos da RN20: radar → avaliação →
 * priorização → handoff → promoção → aprovação.
 *
 * O percurso é um teste só, e de propósito: o valor dele está justamente
 * em atravessar as telas na ordem em que a operação atravessa, com a
 * troca de papel a cada etapa (scout, comercial, gestor, aprovador) — é o
 * único teste da suíte que prova que a cadeia inteira fecha.
 */

/** Conteúdo mínimo válido do dossiê nas dez seções (schema do template). */
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

/** Abre o menu de ações do card no kanban da T8. */
async function abrirMenuDoCard(page: Page, nome: string) {
  await page.getByRole("button", { name: `Ações de ${nome}` }).click();
  await expect(page.getByRole("menu", { name: `Ações de ${nome}` })).toBeVisible();
}

/** Move o card pelo menu e espera o toast de confirmação. */
async function moverCard(page: Page, nome: string, destino: string) {
  await abrirMenuDoCard(page, nome);
  await page.getByRole("menuitem", { name: `Mover para ${destino}` }).click();
  await expect(page.getByRole("status")).toContainText(destino, { ignoreCase: true });
}

test.describe("cobertura, metas e o percurso da Onda 2 — T13/T14/RN20 (F9)", () => {
  test("T13: matriz por categoria com gap destacado e célula abrindo o funil filtrado", async ({
    page,
  }) => {
    const nome = `Radar E2E ${runId()}-t13`;
    const empresa = await semearEmpresaRadar(nome, {
      estagio: "MAPEADA",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });
    const categoria = await prisma.categoria.findUniqueOrThrow({
      where: { slug: "TECNOLOGIA_E_SOFTWARE" },
    });

    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado?aba=cobertura");
    await expect(page.getByRole("heading", { level: 1, name: "Mapa de cobertura" })).toBeVisible();

    // A linha da categoria semeada conta a empresa na coluna Mapeada.
    const linha = page.getByRole("row", { name: new RegExp(categoria.nome) });
    await expect(linha).toBeVisible();
    const celula = linha.getByRole("link", {
      name: new RegExp(`Abrir funil filtrado em ${categoria.nome}.*Mapeada`),
    });
    await expect(celula).toBeVisible();

    // Gap = categoria sem nenhuma aliada ativa; é derivado, não escrito.
    const ativasNaCategoria = await prisma.empresa.count({
      where: { estagio: "ALIADA_ATIVA", categorias: { some: { categoriaId: categoria.id } } },
    });
    if (ativasNaCategoria === 0) {
      await expect(linha.getByText(/^gap/)).toBeVisible();
    }

    // A célula leva ao funil filtrado na categoria. A navegação é conferida
    // pelo href e refeita com goto: o clique em <Link> depende da hidratação
    // e do RSC em voo, corrida que já mordeu esta suíte antes (mesmo padrão
    // adotado em fluxo-principal.spec.ts).
    await expect(celula).toHaveAttribute("href", `/mercado?categoria=${categoria.id}`);
    await page.goto(`/mercado?categoria=${categoria.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Funil de mercado" })).toBeVisible();
    await expect(page.getByText(nome)).toBeVisible();

    await page.goto("/mercado?aba=cobertura");
    await semViolacoesAxe(page);

    await limparAliadoPorNome(empresa.nomeFantasia);
  });

  test("T14: meta vigente lida de metas_periodo, com a origem declarada", async ({ page }) => {
    const meta = await prisma.metaPeriodo.findFirst({
      where: { categoriaId: null },
      orderBy: { inicio: "desc" },
    });

    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto("/mercado?aba=metas");
    await expect(page.getByRole("heading", { level: 1, name: "Metas" })).toBeVisible();

    if (meta) {
      // O número vem do banco — a tela não conhece nenhuma meta de código.
      await expect(page.getByText(`de ${meta.valor} — meta`)).toBeVisible();
      await expect(page.getByText(meta.origem)).toBeVisible();
    } else {
      await expect(page.getByText("meta não definida")).toBeVisible();
    }

    // RN22: realizado é promoção efetivada; a carga inicial não conta.
    await expect(
      page.getByText("As aliadas da carga inicial nasceram ativas e não contam como promoção."),
    ).toBeVisible();

    await semViolacoesAxe(page);
  });

  test("percurso da Onda 2: radar → avaliação → priorização → handoff → promoção com anexos (RN20)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const nome = `Radar E2E ${runId()}-onda2`;
    const empresa = await semearEmpresaRadar(nome, {
      estagio: "MAPEADA",
      origem: "SCOUTING_ATIVO",
      categoriaSlug: "TECNOLOGIA_E_SOFTWARE",
    });

    // ---------------------------------------------------------------
    // 1. Scout: mapeada → em avaliação, avalia (T10) e insere o dossiê (T11)
    // ---------------------------------------------------------------
    await entrar(page, "scout@dev.clubebroto.local");
    await page.goto("/mercado");
    await moverCard(page, nome, "Em avaliação");

    await page.goto(`/mercado/${empresa.id}/avaliacao`);
    await page
      .getByRole("radiogroup", { name: /Presença geográfica/ })
      .getByRole("radio", { name: "Nota 4" })
      .click();
    await page.getByRole("button", { name: /Fit de Negócio/ }).click();
    await page
      .getByRole("radiogroup", { name: /Culturas atendidas/ })
      .getByRole("radio", { name: "Nota 4" })
      .click();
    await page.getByRole("radio", { name: "Avançar" }).check();
    await page.getByRole("button", { name: "Concluir avaliação" }).click();
    const confirmacao = page.getByRole("dialog", { name: `Concluir avaliação de ${nome}` });
    await confirmacao.getByRole("button", { name: "Concluir avaliação" }).click();
    await expect(page.getByRole("status")).toContainText("score 80");

    await page.goto(`/mercado/${empresa.id}/dossie`);
    await page.getByRole("button", { name: "Inserir manualmente" }).click();
    await page.getByLabel("Conteúdo do dossiê (JSON)").fill(JSON.stringify(conteudoDoDossie(nome)));
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Salvar dossiê" }).click(),
    );
    // RN19: o dossiê nasce requerendo revisão — e assim viaja para a fila.
    await expect(page.getByText("requer revisão").first()).toBeVisible();

    // RN15: com avaliação fechada, priorizar fica disponível.
    await page.goto("/mercado");
    await moverCard(page, nome, "Priorizada");

    // ---------------------------------------------------------------
    // 2. Comercial: handoff para negociação assumindo para si (RN16)
    // ---------------------------------------------------------------
    await entrar(page, "comercial@dev.clubebroto.local");
    await page.goto("/mercado");
    await abrirMenuDoCard(page, nome);
    await page.getByRole("menuitem", { name: "Mover para Em negociação" }).click();
    const handoff = page.getByRole("dialog", { name: `Mover ${nome} para Em negociação` });
    await expect(handoff).toBeVisible();
    const comercial = await prisma.usuario.findFirstOrThrow({
      where: { email: "comercial@dev.clubebroto.local" },
    });
    await handoff.getByLabel("Responsável comercial").selectOption(comercial.id);
    await handoff.getByRole("button", { name: "Confirmar handoff" }).click();
    await expect(page.getByRole("status")).toContainText(
      "com responsável comercial designado",
    );

    // ---------------------------------------------------------------
    // 3. Gestor: ficha M1 (T12), pré-requisitos de M2 e pedido de promoção
    // ---------------------------------------------------------------
    await entrar(page, "gestor@dev.clubebroto.local");
    await page.goto(`/aliados/${empresa.id}?aba=m1`);
    await expect(
      page.getByRole("heading", { name: "Ficha Cadastral · M1 — Pré-onboarding" }),
    ).toBeVisible();

    await page.getByLabel("Razão social").fill(`${nome} LTDA`);
    await page
      .getByLabel("Apresentação institucional (texto do card)")
      .fill("Conectividade via satélite para o produtor rural.");
    await page
      .getByLabel(/^Diferenciais/)
      .fill("Cobertura nacional\nInstalação em 48h");
    await page.getByLabel("Modelo de negócio").fill("Assinatura mensal");
    await page.getByRole("checkbox", { name: "Pequeno" }).check();
    await page.getByLabel("Público-alvo · natureza").selectOption("AMBAS");
    // O formulário M1 é cliente e se repinta sozinho (router.refresh): o
    // retorno da ação aparece no <div role="status"> — recarregar aqui
    // apagaria justamente a confirmação que se quer verificar.
    await page.getByRole("button", { name: "Salvar seções A e B" }).click();
    await expect(page.getByRole("status")).toContainText("seções A e B");

    // Seção D — declaração datada, marcada como autodeclarada (nunca vira nota).
    await page.getByLabel("Ticket médio (R$)").fill("350");
    await page.getByLabel("NPS (-100 a 100)").fill("62");
    await page.getByRole("button", { name: "Registrar declaração" }).click();
    await expect(page.getByRole("status")).toContainText("autodeclarada");

    // Seção F — a oferta pretendida que a promoção converterá em rascunho.
    await page.getByLabel("Título da oferta pretendida").fill(`Plano rural ${runId()}`);
    await page.getByLabel("Preço de (R$)").fill("200");
    await page.getByLabel("Preço por (R$)").fill("160");
    await page
      .getByLabel("Instruções de resgate pós-voucher")
      .fill("Voucher direciona ao administrador comercial do aliado.");
    await page.getByLabel("Tipo de benefício").selectOption({ index: 1 });
    await page.getByLabel("Mecânica de resgate").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Adicionar oferta pretendida" }).click();
    await expect(page.getByRole("status")).toContainText("seção F");
    await expect(page.getByRole("cell", { name: `Plano rural ${runId()}` })).toBeVisible();

    await semViolacoesAxe(page);

    // As abas Scouting e Dossiê mostram o que a Onda 2 produziu, sem duplicar.
    await page.goto(`/aliados/${empresa.id}?aba=scouting`);
    await expect(
      page.getByRole("heading", { name: "Última avaliação fechada · versão 1" }),
    ).toBeVisible();
    await expect(page.getByText("/ 100 · ScoutCB")).toBeVisible();
    await expect(page.getByRole("cell", { name: "62" })).toBeVisible();
    await semViolacoesAxe(page);

    await page.goto(`/aliados/${empresa.id}?aba=dossie`);
    await expect(page.getByRole("heading", { name: "1 · Resumo executivo" })).toBeVisible();
    await semViolacoesAxe(page);

    // Pré-requisitos de M2 (régua da Onda 1, intocada pela F9).
    await prisma.empresa.update({
      where: { id: empresa.id },
      data: { cnpj: "11111111111180", enderecoMunicipio: "Curitiba", enderecoUf: "PR" },
    });
    await page.goto(`/aliados/${empresa.id}?aba=contatos`);
    await page.getByLabel("Nome", { exact: true }).fill("Contato Comercial E2E");
    await page.getByLabel("E-mail", { exact: true }).fill(`comercial+${runId()}f9@e2e.local`);
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Adicionar contato" }).click(),
    );
    await page.goto(`/aliados/${empresa.id}?aba=comercial`);
    await page.getByLabel("Data-base da vigência").fill("2026-07-01");
    await page.getByLabel("Comissão (%)").fill("5");
    await page.getByLabel("Ambientes de pagamento habilitados").selectOption("AMBOS");
    await page.getByLabel("Anexo do contrato (chave do arquivo)").fill("s3://contratos/f9.pdf");
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Registrar contrato" }).click(),
    );

    await page.goto(`/aliados/${empresa.id}`);
    await submeterERepintar(page, () =>
      page.getByRole("button", { name: "Solicitar promoção a Aliada ativa" }).click(),
    );
    await expect(page.getByText("Promoção aguardando aprovação")).toBeVisible();

    // ---------------------------------------------------------------
    // 4. Aprovador: decide vendo os anexos da RN20 (usuário distinto, RN06)
    // ---------------------------------------------------------------
    await entrar(page, "aprovador@dev.clubebroto.local");
    await page.goto("/aprovacoes");
    const caso = page.locator("details", { hasText: nome });
    await caso.locator("summary").click();
    await expect(caso.getByText("Avaliação de scout anexada")).toBeVisible();
    await expect(caso.getByText("score 80")).toBeVisible();
    await expect(caso.getByText("recomendação: Avançar")).toBeVisible();
    await expect(caso.getByText("Dossiê de due diligence anexado")).toBeVisible();
    await expect(caso.getByText("requer revisão", { exact: true })).toBeVisible();
    await expect(caso.getByText("Gerado automaticamente —")).toBeVisible();
    await semViolacoesAxe(page);

    await caso.getByRole("button", { name: "Aprovar", exact: true }).click();
    await expect(async () => {
      await page.reload();
      await expect(caso).toHaveCount(0, { timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // A promoção efetivou e converteu a oferta pretendida em rascunho.
    const promovida = await prisma.empresa.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(promovida.estagio).toBe("ALIADA_ATIVA");
    const pretendida = await prisma.ofertaPretendida.findFirstOrThrow({
      where: { empresaId: empresa.id },
    });
    expect(pretendida.status).toBe("CONVERTIDA");
    const rascunho = await prisma.oferta.findUniqueOrThrow({ where: { id: pretendida.ofertaId! } });
    expect(rascunho.status).toBe("RASCUNHO");

    await limparAliadoPorNome(nome);
  });
});
