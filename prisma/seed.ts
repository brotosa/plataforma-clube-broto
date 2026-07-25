/**
 * Seed da plataforma (F1 + Onda 2).
 *
 * Regra inviolável: nenhum dado de negócio inventado. Este seed grava apenas:
 *  1. Taxonomias v1 documentadas na ficha v0.6 e no protótipo v2.1
 *     (categorias reais da vitrine, culturas do formulário T3, UFs — fato
 *     público —, tipos de benefício, mecânicas e motivos de suspensão RN12);
 *  2. Regras do motor de aprovação no estado inicial exigido pela RN06
 *     (promoção a Aliada ativa LIGADA; publicação de Oferta DESLIGADA);
 *  3. Indicadores de scouting (F7) — transposição fiel das duas tabelas do
 *     ScoutCB versionadas em docs/especificacao/indicadores-scoutcb-seed.md;
 *  4. Usuários internos de DESENVOLVIMENTO (um por papel) — credenciais de
 *     teste para login/RBAC, nunca pessoas reais; ignorados quando
 *     NODE_ENV=production.
 *
 * Empresas, soluções, ofertas e telemetria entram apenas pela carga inicial
 * das planilhas reais (F3).
 */
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { DIMENSOES_MEDICAO } from "../dominio/avaliacao/dimensoes";

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

/**
 * Indicadores de scouting (F7) — transposição fiel de
 * docs/especificacao/indicadores-scoutcb-seed.md, tabelas "Indicadores a
 * serem medidos — Empresa" e "— Produto" do ScoutCB, na ordem do documento:
 * [nome, o que mede, dimensão de medição]. Pesos v1 = 1 uniforme (default
 * do schema; o ScoutCB não define pesos — a ponderação torna-se editável
 * por dimensão na F10/RN25).
 */
const INDICADORES_EMPRESA: ReadonlyArray<[string, string, string]> = [
  ["Presença geográfica (UFs atendidas)", "Alcance territorial da operação", "Capilaridade"],
  ["Canais e parcerias de distribuição", "Capacidade de chegar ao produtor", "Capilaridade"],
  ["Culturas atendidas", "Aderência às culturas do público do Clube", "Fit de Negócio"],
  ["Modelo de negócio", "Compatibilidade do modelo com a intermediação do Clube", "Fit de Negócio"],
  ["Tempo de mercado", "Maturidade e experiência acumulada", "Dimensão e Maturidade"],
  ["Número de colaboradores", "Porte da estrutura", "Dimensão e Maturidade"],
  ["Senioridade dos sócios e do time", "Qualificação e histórico das lideranças", "Senioridade e Compliance"],
  ["Certificações e conformidade", "Regularidade, certificações e compliance", "Senioridade e Compliance"],
  ["Número de clientes ativos", "Base instalada", "Escala da operação"],
  ["Área monitorada/atendida (ha)", "Escala física da operação no campo", "Escala da operação"],
  ["Retenção e satisfação de clientes", "Qualidade percebida da operação (churn, NPS quando disponível)", "Sucesso da operação"],
  ["Casos de sucesso documentados", "Evidência pública de resultado entregue", "Sucesso da operação"],
  ["Complementaridade ao portfólio do Clube", "Preenchimento de lacunas de categoria da vitrine", "GAP de Portfólio"],
  ["Investimentos e funding recebidos", "Capitalização e fôlego financeiro", "Saúde do caixa"],
  ["Faturamento/receita (quando público)", "Sustentação econômica da operação", "Saúde do caixa"],
  ["Crescimento e clientes/parcerias relevantes", "Tração comercial e validação de mercado", "Tração"],
];

const INDICADORES_PRODUTO: ReadonlyArray<[string, string, string]> = [
  ["Relevância para o produtor do Clube", "Quanto o produto importa para o assinante-alvo", "Relevância de Mercado"],
  ["Diferenciais tecnológicos", "Grau de inovação frente ao disponível no mercado", "Inovação"],
  ["Proposta de valor e impacto (ROI para o produtor)", "Clareza do benefício e resultado mensurável", "Proposta de Valor e Eficácia"],
  ["Facilidade de adoção e implantação", "Barreira de entrada para o produtor usar", "Proposta de Valor e Eficácia"],
  ["Adequação de preço/ticket ao público-alvo", "Compatibilidade do preço com o perfil do assinante", "Público-alvo"],
  ["Segmentos e portes atendidos", "Aderência ao recorte de público do Clube", "Público-alvo"],
  ["Concorrentes diretos e posicionamento", "Densidade competitiva e diferenciação", "Concorrência"],
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

  // Indicadores do ScoutCB (F7): a dimensão de cada linha precisa ser uma
  // das 14 dimensões canônicas e pertencer ao grupo da tabela de origem —
  // divergência aqui é erro de transcrição, e o seed para em vez de gravar.
  const indicadoresPorGrupo: ReadonlyArray<["EMPRESA" | "PRODUTO", ReadonlyArray<[string, string, string]>]> = [
    ["EMPRESA", INDICADORES_EMPRESA],
    ["PRODUTO", INDICADORES_PRODUTO],
  ];
  let ordemIndicador = 0;
  for (const [grupo, indicadores] of indicadoresPorGrupo) {
    for (const [nome, descricao, dimensao] of indicadores) {
      const dimensaoCanonica = DIMENSOES_MEDICAO.find((d) => d.nome === dimensao);
      if (!dimensaoCanonica || dimensaoCanonica.grupo !== grupo) {
        throw new Error(
          `Indicador "${nome}": dimensão "${dimensao}" não confere com as 14 dimensões do grupo ${grupo}.`,
        );
      }
      // Não sobrescreve peso nem ativo em re-execuções: passam a ser
      // geridos no produto (Parametrizador, Onda 3 / F10).
      await prisma.indicador.upsert({
        where: { slug: slugDe(nome) },
        update: { nome, descricao, grupo, dimensao, ordem: ordemIndicador },
        create: { slug: slugDe(nome), nome, descricao, grupo, dimensao, ordem: ordemIndicador },
      });
      ordemIndicador += 1;
    }
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

  // Meta vigente de novos aliados (Onda 2, RN22 / ficha da Onda 3 §3.2):
  // 24 novos aliados por ano, geral, sem abertura por categoria —
  // decisão de negócio registrada em 24/07/2026. O valor mora na tabela,
  // nunca no código: a T14 apenas o lê e a edição chega no Parametrizador
  // (Onda 3, T17). O upsert não sobrescreve o valor em re-execuções, para
  // que uma meta ajustada pelo negócio sobreviva ao seed.
  const anoDaMetaVigente = 2026;
  const metaGeralVigente = await prisma.metaPeriodo.findFirst({
    where: {
      periodo: "ANUAL",
      categoriaId: null,
      inicio: new Date(Date.UTC(anoDaMetaVigente, 0, 1)),
    },
  });
  if (!metaGeralVigente) {
    await prisma.metaPeriodo.create({
      data: {
        periodo: "ANUAL",
        inicio: new Date(Date.UTC(anoDaMetaVigente, 0, 1)),
        fim: new Date(Date.UTC(anoDaMetaVigente + 1, 0, 1)),
        categoriaId: null,
        valor: 24,
        origem: "Decisão de negócio de 24/07/2026 (ficha da Onda 3 §3.2)",
      },
    });
  }

  // Usuários de teste nunca entram em produção por padrão. Ambientes de
  // DEMONSTRAÇÃO hospedados (ex.: Vercel) habilitam explicitamente com
  // PERMITIR_USUARIOS_DEV="true" — flag nomeada, decisão consciente.
  const permitirUsuariosDev =
    process.env.NODE_ENV !== "production" ||
    process.env.PERMITIR_USUARIOS_DEV === "true";
  if (!permitirUsuariosDev) {
    console.log(
      `Seed: taxonomias, regras de aprovação e ${ordemIndicador} indicadores do ScoutCB gravados (produção — usuários de desenvolvimento ignorados).`,
    );
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
    `Seed: taxonomias, regras de aprovação, ${ordemIndicador} indicadores do ScoutCB, meta vigente de novos aliados e ${USUARIOS_DEV.length} usuários de desenvolvimento gravados.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
