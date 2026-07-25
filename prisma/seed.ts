/**
 * Seed da fundação (F1).
 *
 * Regra inviolável: nenhum dado de negócio inventado. Este seed grava apenas:
 *  1. Taxonomias v1 documentadas na ficha v0.6 e no protótipo v2.1
 *     (categorias reais da vitrine, culturas do formulário T3, UFs — fato
 *     público —, tipos de benefício, mecânicas e motivos de suspensão RN12);
 *  2. Regras do motor de aprovação no estado inicial exigido pela RN06
 *     (promoção a Aliada ativa LIGADA; publicação de Oferta DESLIGADA);
 *  3. Usuários internos de DESENVOLVIMENTO (um por papel) — credenciais de
 *     teste para login/RBAC, nunca pessoas reais; ignorados quando
 *     NODE_ENV=production.
 *
 * Empresas, soluções, ofertas e telemetria entram apenas pela carga inicial
 * das planilhas reais (F3).
 */
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

/** Categorias reais da vitrine (ficha §3.2, taxonomia v1). */
const CATEGORIAS = [
  "Consultorias e Serviços Profissionais",
  "Formação e Capacitação",
  "Saúde e Bem-estar no Campo",
  "Regularização e Documentação",
  "Certificações e ESG",
  "Mercado e Inteligência Comercial",
  "Agricultura e Pecuária de Precisão",
  "Máquinas e Equipamentos",
  "Tecnologia e Software",
  "Armazenagem e Pós-Colheita",
  "Logística e Transporte",
];

/** Culturas do formulário T3 do protótipo v2.1 (inclui "Todas", ficha §3.2). */
const CULTURAS = ["Todas", "Grãos", "Cana", "Café", "Pecuária", "HF"];

/** Unidades federativas do Brasil (fato público; cobertura da ficha §3.2). */
const UFS: ReadonlyArray<[string, string]> = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
];

/** Tipos de benefício (ficha §3.3, lista fixa na v1). */
const TIPOS_BENEFICIO: ReadonlyArray<[string, string]> = [
  ["PCT_DESCONTO", "% desconto"],
  ["VALOR_FIXO", "Valor fixo"],
  ["GRATUIDADE", "Gratuidade"],
  ["CONDICAO_ESPECIAL", "Condição especial"],
];

/** Mecânicas de resgate (ficha §3.3; mapeamento contratual da RN11). */
const MECANICAS: ReadonlyArray<[string, string]> = [
  ["CHECKOUT_CLUBE", "Checkout no clube"],
  ["CHECKOUT_EXTERNO", "Checkout externo"],
  ["RECOMPENSA_GRATUITA", "Recompensa gratuita"],
];

/** Motivos tipificados de suspensão (RN12). */
const MOTIVOS_SUSPENSAO: ReadonlyArray<[string, string]> = [
  ["INADIMPLENCIA_COMISSAO", "Inadimplência de comissão >30 dias"],
  ["DECISAO_CURADORIA", "Decisão de curadoria"],
  ["OUTROS", "Outros (descrever)"],
];

/** Motivos tipificados de descarte no funil (RN17, ficha Onda 2 §4). */
const MOTIVOS_DESCARTE: ReadonlyArray<[string, string]> = [
  ["SEM_FIT_DE_NEGOCIO", "Sem fit de negócio"],
  ["IMATURIDADE", "Imaturidade"],
  ["SOBREPOSICAO_COM_ALIADO_ATUAL", "Sobreposição com aliado atual"],
  ["RECUSOU_CONDICOES", "Recusou condições"],
  ["SEM_RESPOSTA", "Sem resposta"],
  ["OUTRO", "Outro (descrever)"],
];

/** Usuários de desenvolvimento — um por papel; nunca em produção. */
const USUARIOS_DEV: ReadonlyArray<{
  nome: string;
  email: string;
  papel: "GESTOR" | "ANALISTA" | "ANALISTA_SCOUT" | "COMERCIAL" | "APROVADOR" | "LEITURA";
}> = [
  { nome: "Gestor (desenvolvimento)", email: "gestor@dev.clubebroto.local", papel: "GESTOR" },
  { nome: "Analista (desenvolvimento)", email: "analista@dev.clubebroto.local", papel: "ANALISTA" },
  { nome: "Scout (desenvolvimento)", email: "scout@dev.clubebroto.local", papel: "ANALISTA_SCOUT" },
  { nome: "Comercial (desenvolvimento)", email: "comercial@dev.clubebroto.local", papel: "COMERCIAL" },
  { nome: "Aprovador (desenvolvimento)", email: "aprovador@dev.clubebroto.local", papel: "APROVADOR" },
  { nome: "Leitura (desenvolvimento)", email: "leitura@dev.clubebroto.local", papel: "LEITURA" },
];

function slugDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

async function main() {
  for (const [ordem, nome] of CATEGORIAS.entries()) {
    await prisma.categoria.upsert({
      where: { slug: slugDe(nome) },
      update: { nome, ordem },
      create: { slug: slugDe(nome), nome, ordem },
    });
  }

  for (const [ordem, nome] of CULTURAS.entries()) {
    await prisma.cultura.upsert({
      where: { slug: slugDe(nome) },
      update: { nome, ordem },
      create: { slug: slugDe(nome), nome, ordem },
    });
  }

  for (const [sigla, nome] of UFS) {
    await prisma.uf.upsert({
      where: { sigla },
      update: { nome },
      create: { sigla, nome },
    });
  }

  for (const [ordem, [slug, nome]] of TIPOS_BENEFICIO.entries()) {
    await prisma.tipoBeneficio.upsert({
      where: { slug },
      update: { nome, ordem },
      create: { slug, nome, ordem },
    });
  }

  for (const [ordem, [slug, nome]] of MECANICAS.entries()) {
    await prisma.mecanica.upsert({
      where: { slug },
      update: { nome, ordem },
      create: { slug, nome, ordem },
    });
  }

  for (const [ordem, [slug, nome]] of MOTIVOS_SUSPENSAO.entries()) {
    await prisma.motivoSuspensao.upsert({
      where: { slug },
      update: { nome, ordem },
      create: { slug, nome, ordem },
    });
  }

  for (const [ordem, [slug, nome]] of MOTIVOS_DESCARTE.entries()) {
    await prisma.motivoDescarte.upsert({
      where: { slug },
      update: { nome, ordem },
      create: { slug, nome, ordem },
    });
  }

  // Estado inicial do motor de aprovação (RN06): nasce com promoção a
  // Aliada ativa LIGADA e publicação de Oferta DESLIGADA. O upsert não
  // sobrescreve `exigida` em re-execuções: reconfiguração é feita em T7.
  await prisma.aprovacaoRegra.upsert({
    where: { tipoEntidade: "PROMOCAO_ALIADA_ATIVA" },
    update: {},
    create: { tipoEntidade: "PROMOCAO_ALIADA_ATIVA", exigida: true },
  });
  await prisma.aprovacaoRegra.upsert({
    where: { tipoEntidade: "PUBLICACAO_OFERTA" },
    update: {},
    create: { tipoEntidade: "PUBLICACAO_OFERTA", exigida: false },
  });

  // Usuários de teste nunca entram em produção por padrão. Ambientes de
  // DEMONSTRAÇÃO hospedados (ex.: Vercel) habilitam explicitamente com
  // PERMITIR_USUARIOS_DEV="true" — flag nomeada, decisão consciente.
  const permitirUsuariosDev =
    process.env.NODE_ENV !== "production" ||
    process.env.PERMITIR_USUARIOS_DEV === "true";
  if (!permitirUsuariosDev) {
    console.log("Seed: taxonomias e regras de aprovação gravadas (produção — usuários de desenvolvimento ignorados).");
    return;
  }

  const senha = process.env.SENHA_USUARIOS_DEV ?? "clube-broto-dev";
  const senhaHash = hashSync(senha, 10);
  for (const u of USUARIOS_DEV) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: { papel: u.papel },
      create: { ...u, senhaHash },
    });
  }
  console.log(
    `Seed: taxonomias, regras de aprovação e ${USUARIOS_DEV.length} usuários de desenvolvimento gravados.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
