import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import {
  type EstagioEmpresa,
  type OrigemEmpresa,
  PrismaClient,
} from "@prisma/client";
import { expect, type Page } from "@playwright/test";

/**
 * Ajudantes compartilhados da suíte e2e — a espinha da estabilização no
 * runner lento do CI. Três técnicas contra a flakiness herdada de F1/F2:
 *
 * 1. Identificador de execução ESTÁVEL (runId): fixado uma vez no
 *    globalSetup (configuracao-global.ts) e lido aqui. Sobrevive ao
 *    reinício de worker (o env é herdado do processo principal) e, ainda
 *    que não propagasse, cai num valor numérico fixo — nunca um novo
 *    Date.now() a cada reload do módulo, que dessincronizava cadeias serial.
 * 2. Semeadura idempotente (deletar-e-criar por nome): cada teste prepara
 *    seu próprio estado direto no banco via Prisma, apagando antes qualquer
 *    entidade homônima — re-execução e retry ficam seguros (sem colisão de
 *    CNPJ único).
 * 3. Isolamento: os seeders abaixo permitem que cada teste crie sua
 *    precondição sozinho, sem depender de outro teste ter rodado.
 */

/**
 * Resolve DATABASE_URL a partir do .env quando o ambiente não a fornece
 * (o Next carrega o .env; o Playwright, não). Mesmo padrão de
 * integracao.spec.ts / configuracao-global.ts.
 */
export function resolverDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  try {
    const env = readFileSync(".env", "utf8");
    const linha = env.split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (linha) {
      process.env.DATABASE_URL = linha.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
    }
  } catch {
    /* sem banco: os próprios testes falharão com contexto */
  }
}

resolverDatabaseUrl();

/** Instância única de Prisma para os seeders da suíte (workers:1). */
export const prisma = new PrismaClient();

export const SENHA = process.env.SENHA_USUARIOS_DEV ?? "clube-broto-dev";

/**
 * Identificador de execução estável, definido uma vez no globalSetup. O
 * fallback numérico fixo garante estabilidade mesmo se o env não propagar
 * a um worker reiniciado — o oposto do antigo `Date.now()` no topo do
 * módulo, que gerava um sufixo novo a cada reload.
 */
export function runId(): string {
  return process.env.E2E_RUN_ID || "424242";
}

/**
 * Gera um CNPJ estruturalmente válido (módulo 11) a partir de um número.
 * Números distintos ⇒ CNPJs distintos (evita colisão da chave única entre
 * testes que criam aliados na mesma execução).
 */
export function cnpjValido(sufixo: number): string {
  const base = String(Math.abs(Math.trunc(sufixo))).padStart(12, "1").slice(-12);
  const digito = (corpo: string): number => {
    let soma = 0;
    let peso = 2;
    for (let i = corpo.length - 1; i >= 0; i -= 1) {
      soma += Number(corpo[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(base);
  const d2 = digito(base + String(d1));
  return `${base}${d1}${d2}`;
}

/** Hash numérico determinístico e estável de um nome (0..1e9). */
function numeroDeNome(nome: string): number {
  let h = 0;
  for (let i = 0; i < nome.length; i += 1) {
    h = (h * 31 + nome.charCodeAt(i)) % 1_000_000_000;
  }
  return h;
}

/** CNPJ válido e único derivado do nome do aliado (determinístico). */
export function cnpjDeNome(nome: string): string {
  return cnpjValido(numeroDeNome(nome));
}

/**
 * Login limpo: zera cookies antes de autenticar. Além de deixar cada teste
 * independente do estado de sessão anterior, permite trocar de usuário
 * dentro do mesmo teste (RN06) — sem isso, /entrar redireciona quem já
 * está autenticado para /aliados e o formulário some.
 */
export async function entrar(page: Page, email: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/entrar");
  // Se uma sessão anterior sobreviveu à limpeza (corrida de cookie observada
  // ao trocar de usuário no mesmo teste), /entrar redireciona para /aliados e
  // o formulário some. Limpa e recarrega uma vez até o campo aparecer.
  if (!(await page.getByLabel("E-mail").isVisible().catch(() => false))) {
    await page.context().clearCookies();
    await page.goto("/entrar");
  }
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/aliados");
}

/**
 * Tags da varredura AAA (F5). O padrão do AxeBuilder cobre A e AA; a política
 * do projeto é AAA, então as tags entram explicitamente — e as três regras AAA
 * que o axe-core traz DESLIGADAS por padrão são ligadas nome a nome, porque
 * `runOnly` por tag não as acorda sozinho.
 */
const TAGS_AAA = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

const REGRAS_AAA_DESLIGADAS_POR_PADRAO = {
  "color-contrast-enhanced": { enabled: true }, // 1.4.6 — contraste 7:1
  "identical-links-same-purpose": { enabled: true }, // 2.4.9
  "meta-refresh-no-exceptions": { enabled: true }, // 3.2.5
};

/**
 * EXCEÇÃO NOMEADA — superfícies em azul puro da marca (`--azul` #465eff).
 *
 * Texto branco sobre o azul puro (sidebar, botões primários) e o azul puro
 * como cor do item ativo da sidebar ficam em 4,87:1: passam em AA (≥4,5:1) e
 * reprovam em AAA (≥7:1). Elevar exige ESCURECER O AZUL DA MARCA em toda a
 * superfície do produto — decisão de identidade visual/especificação, não
 * ajuste de CSS. Fica isolada e visível aqui até a definição do negócio
 * (ver `docs/acessibilidade-aaa.md`), no mesmo padrão dos `[A CONFIRMAR]`:
 * o gate não deixa de existir, ele declara o que ainda não foi decidido.
 *
 * A exceção é fechada pela ASSINATURA DE COR e só vale para
 * `color-contrast-enhanced` — qualquer outra regra, ou qualquer outro par de
 * cores, continua reprovando a suíte.
 */
export const AZUL_PURO_DA_MARCA = "#465eff";

function ehExcecaoDeSuperficieDaMarca(regra: string, resumo: string): boolean {
  if (regra !== "color-contrast-enhanced") return false;
  return (
    resumo.includes(`foreground color: ${AZUL_PURO_DA_MARCA}`) ||
    resumo.includes(`background color: ${AZUL_PURO_DA_MARCA}`)
  );
}

/**
 * Espera a animação de entrada `.tela` (`@keyframes tela-in`, 160ms) terminar.
 *
 * Sem isso a varredura de contraste é uma corrida: durante o fade a opacidade
 * ainda não é 1, o navegador compõe a cor do texto com o fundo e o axe mede
 * um valor que NÃO é o que o usuário enxerga (observado: --azul-texto-aaa
 * #1632F2 lido como #203af2, --paragrafo-aaa #524F47 como #59564f e o próprio
 * azul da marca #465EFF como #475FFF — este último escapando até da exceção
 * nomeada por assinatura de cor). O critério AAA vale para a tela assentada.
 */
async function telaAssentada(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const tela = document.querySelector(".tela");
    if (!tela) return true;
    return tela.getAnimations().every((animacao) => animacao.playState === "finished");
  });
}

/**
 * Varredura axe-core em modo AAA, após a tela assentar (h1 único por tela).
 * Descarta apenas os nós cobertos pela exceção nomeada acima; todo o resto
 * precisa estar zerado.
 */
export async function semViolacoesAxe(page: Page): Promise<void> {
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await telaAssentada(page);
  const resultado = await new AxeBuilder({ page })
    .options({
      runOnly: { type: "tag", values: TAGS_AAA },
      rules: REGRAS_AAA_DESLIGADAS_POR_PADRAO,
    })
    .analyze();

  const violacoes = resultado.violations
    .map((violacao) => ({
      ...violacao,
      nodes: violacao.nodes.filter(
        (no) => !ehExcecaoDeSuperficieDaMarca(violacao.id, no.failureSummary ?? ""),
      ),
    }))
    .filter((violacao) => violacao.nodes.length > 0);

  // Mensagem legível: regra + alvo + resumo, em vez do dump inteiro do axe.
  const relatorio = violacoes.flatMap((violacao) =>
    violacao.nodes.map(
      (no) =>
        `${violacao.id} (${violacao.impact}) em ${no.target.join(" ")}: ` +
        `${(no.failureSummary ?? "").split("\n").slice(1).join(" ").trim()}`,
    ),
  );
  expect(relatorio, `axe AAA em ${page.url()}`).toEqual([]);
}

/**
 * Executa uma server action *no lugar* (sem redirect) e recarrega para que a
 * asserção veja o estado já persistido: o refresh do App Router
 * (revalidatePath) nem sempre repinta o DOM no runner lento do CI — o banco
 * muda, o DOM não. Aguarda a RESPOSTA do POST antes de recarregar (recarregar
 * cedo abortaria a ação em voo).
 */
export async function submeterERepintar(
  page: Page,
  acionar: () => Promise<void>,
): Promise<void> {
  await Promise.all([
    page.waitForResponse((resposta) => resposta.request().method() === "POST", {
      timeout: 30_000,
    }),
    acionar(),
  ]);
  await page.reload();
}

// ---------------------------------------------------------------------
// Seeders idempotentes (deletar-e-criar direto no Prisma) — cada teste
// semeia sua própria precondição, rápido e determinístico.
// ---------------------------------------------------------------------

/** Id do usuário de desenvolvimento por papel (para responsáveis de scout). */
async function idUsuarioPorPapel(papel: string): Promise<string> {
  const usuario = await prisma.usuario.findFirstOrThrow({
    where: { papel: papel as never, email: { endsWith: "@dev.clubebroto.local" } },
  });
  return usuario.id;
}

/**
 * Apaga uma empresa e TODOS os seus filhos por nome (idempotência). Espelha
 * a limpeza de configuracao-global.ts e integracao.integracao.test.ts:
 * ofertas → telemetria/acumulados primeiro, depois vínculos de solução,
 * solução, contrato, contatos, categorias, solicitações e auditoria por
 * entidadeId — mais notas/registros/staging do funil (no-op para aliados).
 */
export async function limparAliadoPorNome(nome: string): Promise<void> {
  const empresas = await prisma.empresa.findMany({
    where: { nomeFantasia: nome },
    include: { solucoes: { include: { ofertas: { select: { id: true } } } } },
  });
  for (const empresa of empresas) {
    const solucaoIds = empresa.solucoes.map((solucao) => solucao.id);
    const ofertaIds = empresa.solucoes.flatMap((solucao) =>
      solucao.ofertas.map((oferta) => oferta.id),
    );
    await prisma.telemetriaEvento.deleteMany({ where: { ofertaId: { in: ofertaIds } } });
    await prisma.telemetriaAcumuladoInicial.deleteMany({ where: { ofertaId: { in: ofertaIds } } });
    await prisma.aprovacaoSolicitacao.deleteMany({
      where: { entidadeId: { in: [empresa.id, ...solucaoIds, ...ofertaIds] } },
    });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidadeId: { in: [empresa.id, ...solucaoIds, ...ofertaIds] } },
    });
    await prisma.oferta.deleteMany({ where: { id: { in: ofertaIds } } });
    await prisma.solucaoCultura.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: { in: solucaoIds } } });
    await prisma.solucao.deleteMany({ where: { id: { in: solucaoIds } } });
    await prisma.contratoComercial.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.contatoEmpresa.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.notaRapida.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.registroNegociacao.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.stagingEmpresa.deleteMany({ where: { empresaIdEfetivada: empresa.id } });
    await prisma.empresaCategoria.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.empresa.delete({ where: { id: empresa.id } });
  }
}

/** Aliado "cru" em EM_NEGOCIACAO (identidade só) — sem contato/contrato. */
export async function semearAliadoEmNegociacao(nome: string) {
  await limparAliadoPorNome(nome);
  return prisma.empresa.create({
    data: {
      nomeFantasia: nome,
      razaoSocial: `${nome} LTDA`,
      cnpj: cnpjDeNome(nome),
      estagio: "EM_NEGOCIACAO",
      dataEntrada: new Date("2026-01-01T00:00:00Z"),
      estagioDesde: new Date(),
      enderecoMunicipio: "Curitiba",
      enderecoUf: "PR",
      logoUrl: "s3://logos/e2e.svg",
      descricaoInstitucional: "Aliado semeado pelo e2e.",
    },
  });
}

/**
 * Aliado EM_NEGOCIACAO PROMOVÍVEL (M2 completo, ficha §3.1): identidade com
 * CNPJ válido + endereço, ≥1 contato e contrato VIGENTE com anexo,
 * comissão % e ambientes de pagamento — pendenciasDePromocao() vazia.
 */
export async function semearAliadoEmNegociacaoM2Completo(nome: string) {
  await limparAliadoPorNome(nome);
  return prisma.empresa.create({
    data: {
      nomeFantasia: nome,
      razaoSocial: `${nome} LTDA`,
      cnpj: cnpjDeNome(nome),
      estagio: "EM_NEGOCIACAO",
      dataEntrada: new Date("2026-01-01T00:00:00Z"),
      estagioDesde: new Date(),
      enderecoMunicipio: "Curitiba",
      enderecoUf: "PR",
      logoUrl: "s3://logos/e2e.svg",
      descricaoInstitucional: "Aliado M2 completo semeado pelo e2e.",
      contatos: {
        create: [
          { papel: "COMERCIAL", nome: "Contato Comercial E2E", email: "comercial@e2e.local" },
        ],
      },
      contratos: {
        create: [
          {
            status: "VIGENTE",
            ambientesPagamento: "AMBOS",
            comissaoPct: 5,
            vigenciaBase: new Date("2026-01-01T00:00:00Z"),
            anexoS3Key: "s3://contratos/e2e.pdf",
          },
        ],
      },
    },
  });
}

/**
 * Aliada ATIVA com contrato VIGENTE (AMBOS), logo e categoria vinculada —
 * base pronta para criar solução (RN01) e publicar oferta (RN02/RN11).
 */
export async function semearAliadoAtivoComContrato(nome: string) {
  await limparAliadoPorNome(nome);
  const categoria = await prisma.categoria.findFirstOrThrow();
  return prisma.empresa.create({
    data: {
      nomeFantasia: nome,
      razaoSocial: `${nome} LTDA`,
      cnpj: cnpjDeNome(nome),
      estagio: "ALIADA_ATIVA",
      dataEntrada: new Date("2026-01-01T00:00:00Z"),
      estagioDesde: new Date(),
      enderecoMunicipio: "Curitiba",
      enderecoUf: "PR",
      logoUrl: "s3://logos/e2e.svg",
      descricaoInstitucional: "Aliado ativo semeado pelo e2e.",
      contatos: {
        create: [
          { papel: "COMERCIAL", nome: "Contato Comercial E2E", email: "comercial@e2e.local" },
        ],
      },
      contratos: {
        create: [
          {
            status: "VIGENTE",
            ambientesPagamento: "AMBOS",
            comissaoPct: 10,
            vigenciaBase: new Date("2026-01-01T00:00:00Z"),
            anexoS3Key: "s3://contratos/e2e.pdf",
          },
        ],
      },
      categorias: { create: [{ categoriaId: categoria.id }] },
    },
  });
}

/**
 * Solução com CARD COMPLETO (RN09): nome, descrição curta, categoria, ≥1
 * cultura (Todas), cobertura nacional e imagem do card. A empresa deve ter
 * nomeFantasia + logoUrl (garantido por semearAliadoAtivoComContrato).
 * Idempotente: apaga solução homônima da empresa e suas dependências.
 */
export async function semearSolucaoCompleta(empresaId: string, nome: string) {
  const existentes = await prisma.solucao.findMany({
    where: { empresaId, nome },
    include: { ofertas: { select: { id: true } } },
  });
  for (const solucao of existentes) {
    const ofertaIds = solucao.ofertas.map((oferta) => oferta.id);
    await prisma.telemetriaEvento.deleteMany({ where: { ofertaId: { in: ofertaIds } } });
    await prisma.telemetriaAcumuladoInicial.deleteMany({ where: { ofertaId: { in: ofertaIds } } });
    await prisma.aprovacaoSolicitacao.deleteMany({
      where: { entidadeId: { in: [solucao.id, ...ofertaIds] } },
    });
    await prisma.auditoriaEvento.deleteMany({
      where: { entidadeId: { in: [solucao.id, ...ofertaIds] } },
    });
    await prisma.oferta.deleteMany({ where: { id: { in: ofertaIds } } });
    await prisma.solucaoCultura.deleteMany({ where: { solucaoId: solucao.id } });
    await prisma.solucaoUf.deleteMany({ where: { solucaoId: solucao.id } });
    await prisma.solucao.delete({ where: { id: solucao.id } });
  }
  const categoria = await prisma.categoria.findFirstOrThrow();
  const cultura = await prisma.cultura.findUniqueOrThrow({ where: { slug: "TODAS" } });
  return prisma.solucao.create({
    data: {
      empresaId,
      nome,
      descricaoCurta: "Solução semeada pelo e2e.",
      categoriaId: categoria.id,
      imagemCardUrl: "s3://cards/e2e.png",
      coberturaNacional: true,
      status: "ATIVA",
      culturas: { create: [{ culturaId: cultura.id }] },
    },
  });
}

/**
 * Oferta PUBLICADA de benefício com % de desconto (mecânica Checkout no
 * clube — compatível com o contrato AMBOS dos seeders acima, RN11). Serve às
 * telas que só existem com uma oferta real: ficha da oferta, edição da oferta
 * e as abas Ofertas da T2. Idempotente por título dentro da solução.
 */
export async function semearOfertaPublicada(solucaoId: string, titulo: string) {
  const existentes = await prisma.oferta.findMany({ where: { solucaoId, titulo } });
  for (const oferta of existentes) {
    await prisma.telemetriaEvento.deleteMany({ where: { ofertaId: oferta.id } });
    await prisma.telemetriaAcumuladoInicial.deleteMany({ where: { ofertaId: oferta.id } });
    await prisma.aprovacaoSolicitacao.deleteMany({ where: { entidadeId: oferta.id } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: oferta.id } });
    await prisma.oferta.delete({ where: { id: oferta.id } });
  }
  const tipoBeneficio = await prisma.tipoBeneficio.findUniqueOrThrow({
    where: { slug: "PCT_DESCONTO" },
  });
  const mecanica = await prisma.mecanica.findUniqueOrThrow({
    where: { slug: "CHECKOUT_CLUBE" },
  });
  return prisma.oferta.create({
    data: {
      solucaoId,
      titulo,
      natureza: "BENEFICIO",
      tipoBeneficioId: tipoBeneficio.id,
      mecanicaId: mecanica.id,
      precoDe: 100,
      precoPor: 85,
      vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
      status: "PUBLICADA",
    },
  });
}

/**
 * Solicitação de aprovação já DECIDIDA sobre uma entidade — enche o histórico
 * da T6, que só renderiza a tabela quando há decisão registrada. Respeita a
 * RN06 no dado semeado (solicitante ≠ aprovador). Idempotente por entidade.
 */
export async function semearDecisaoDeAprovacao(entidadeId: string) {
  await prisma.aprovacaoSolicitacao.deleteMany({ where: { entidadeId } });
  const [solicitante, aprovador] = await Promise.all([
    idUsuarioPorPapel("ANALISTA"),
    idUsuarioPorPapel("APROVADOR"),
  ]);
  return prisma.aprovacaoSolicitacao.create({
    data: {
      tipoEntidade: "PROMOCAO_ALIADA_ATIVA",
      entidadeId,
      solicitanteId: solicitante,
      aprovadorId: aprovador,
      estado: "APROVADA",
      decididoEm: new Date(),
    },
  });
}

/**
 * Empresa no radar/funil (F6) em estágio configurável. Sem CNPJ (entrada de
 * radar), categoria vinculada, datas de radar preenchidas. Idempotente.
 * Em EM_AVALIACAO já atribui um responsável de scout (RN14); em DESCARTADA
 * grava motivo tipificado (RN17).
 */
export async function semearEmpresaRadar(
  nome: string,
  opcoes?: {
    estagio?: EstagioEmpresa;
    origem?: OrigemEmpresa;
    categoriaSlug?: string;
    motivoDescarteSlug?: string;
  },
) {
  await limparAliadoPorNome(nome);
  const estagio = opcoes?.estagio ?? "MAPEADA";
  const categoria = opcoes?.categoriaSlug
    ? await prisma.categoria.findUniqueOrThrow({ where: { slug: opcoes.categoriaSlug } })
    : await prisma.categoria.findFirstOrThrow();
  const motivoDescarte =
    estagio === "DESCARTADA"
      ? await prisma.motivoDescarte.findUniqueOrThrow({
          where: { slug: opcoes?.motivoDescarteSlug ?? "SEM_FIT_DE_NEGOCIO" },
        })
      : null;
  const responsavelScoutId =
    estagio === "EM_AVALIACAO" || estagio === "PRIORIZADA"
      ? await idUsuarioPorPapel("ANALISTA_SCOUT")
      : null;
  return prisma.empresa.create({
    data: {
      nomeFantasia: nome,
      estagio,
      origem: opcoes?.origem ?? "SCOUTING_ATIVO",
      dataEntradaRadar: new Date(),
      estagioDesde: new Date(),
      responsavelScoutId,
      motivoDescarteId: motivoDescarte?.id ?? null,
      categorias: { create: [{ categoriaId: categoria.id }] },
    },
  });
}
