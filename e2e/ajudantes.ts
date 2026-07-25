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

/** Varredura axe-core após a tela assentar (h1 único por tela). */
export async function semViolacoesAxe(page: Page): Promise<void> {
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  const resultado = await new AxeBuilder({ page }).analyze();
  expect(resultado.violations).toEqual([]);
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
 * entidadeId — mais notas/registros/staging do funil e avaliações de scout
 * com suas notas (F7; no-op para aliados sem avaliação).
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
    const avaliacaoIds = (
      await prisma.avaliacaoScout.findMany({
        where: { empresaId: empresa.id },
        select: { id: true },
      })
    ).map((avaliacao) => avaliacao.id);
    await prisma.avaliacaoNota.deleteMany({ where: { avaliacaoId: { in: avaliacaoIds } } });
    await prisma.avaliacaoScout.deleteMany({ where: { id: { in: avaliacaoIds } } });
    await prisma.telemetriaEvento.deleteMany({ where: { ofertaId: { in: ofertaIds } } });
    await prisma.telemetriaAcumuladoInicial.deleteMany({ where: { ofertaId: { in: ofertaIds } } });
    await prisma.aprovacaoSolicitacao.deleteMany({
      where: { entidadeId: { in: [empresa.id, ...solucaoIds, ...ofertaIds] } },
    });
    await prisma.auditoriaEvento.deleteMany({
      where: {
        entidadeId: { in: [empresa.id, ...solucaoIds, ...ofertaIds, ...avaliacaoIds] },
      },
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
