import type { NaturezaOferta } from "@prisma/client";

/**
 * Ficha Cadastral do Aliado v1 — momento **M1 · Pré-onboarding**, o
 * formulário do estágio *Em negociação*
 * (docs/especificacao/ficha-cadastral-aliado-v1.md).
 *
 * O princípio que este módulo materializa é o da **obrigatoriedade
 * progressiva**: três momentos, três réguas — o formulário nunca exige na
 * negociação o que só importa na publicação. M1 pede seções A parcial, B,
 * C (1 contato), D, E parcial e F; CNPJ, endereço completo e contrato
 * anexado são régua de M2 (promoção), que já existe na Onda 1 e continua
 * valendo — este módulo não a repete nem a relaxa.
 */

/** Seções da ficha, no vocabulário do documento. */
export const SECOES_M1 = [
  { id: "A", titulo: "Identificação" },
  { id: "B", titulo: "Classificação" },
  { id: "C", titulo: "Contatos com papel" },
  { id: "D", titulo: "Indicadores declarados" },
  { id: "E", titulo: "Comercial Clube" },
  { id: "F", titulo: "Ofertas pretendidas" },
] as const;

export type SecaoM1 = (typeof SECOES_M1)[number]["id"];

export interface DadosM1 {
  // A — identificação (parcial em M1: sem CNPJ nem endereço completo)
  nomeFantasia: string;
  razaoSocial: string | null;
  site: string | null;
  descricaoInstitucional: string | null;
  diferenciais: ReadonlyArray<string>;
  // B — classificação
  categorias: number;
  modeloNegocio: string | null;
  publicoPorte: ReadonlyArray<string>;
  publicoNatureza: string | null;
  // C — contatos com papel
  contatos: number;
  // D — indicadores declarados
  temIndicadoresDeclarados: boolean;
  // E — comercial (parcial em M1: comissão e ambientes; contrato é M2)
  comissaoDefinida: boolean;
  ambientesDefinidos: boolean;
  // F — ofertas pretendidas
  ofertasPretendidas: number;
}

/** Limite da seção A: até 5 diferenciais curtos, um por linha. */
export const MAXIMO_DE_DIFERENCIAIS = 5;

export interface CompletudeDaSecao {
  secao: SecaoM1;
  titulo: string;
  completa: boolean;
  /** O que falta, em linguagem de quem preenche. */
  pendencias: string[];
}

/**
 * Régua de M1 por seção. Nada aqui bloqueia a gravação — o formulário é
 * de negociação e se preenche aos poucos; a completude é informativa e
 * vira pré-requisito só na promoção (M2, regra da Onda 1).
 */
export function completudeM1(dados: DadosM1): CompletudeDaSecao[] {
  const secoes: CompletudeDaSecao[] = [];

  const pendenciasA: string[] = [];
  if (!dados.nomeFantasia.trim()) pendenciasA.push("Nome fantasia (nome de exibição na vitrine)");
  if (!dados.descricaoInstitucional?.trim()) {
    pendenciasA.push("Apresentação institucional (texto de card)");
  }
  if (dados.diferenciais.length === 0) pendenciasA.push("Ao menos um diferencial");
  secoes.push({ secao: "A", titulo: "Identificação", completa: pendenciasA.length === 0, pendencias: pendenciasA });

  const pendenciasB: string[] = [];
  if (dados.categorias === 0) pendenciasB.push("Categoria da taxonomia do Clube");
  if (!dados.modeloNegocio?.trim()) pendenciasB.push("Modelo de negócio");
  if (dados.publicoPorte.length === 0) pendenciasB.push("Porte do produtor atendido");
  if (!dados.publicoNatureza) pendenciasB.push("Natureza do público (PF, PJ ou ambas)");
  secoes.push({ secao: "B", titulo: "Classificação", completa: pendenciasB.length === 0, pendencias: pendenciasB });

  secoes.push({
    secao: "C",
    titulo: "Contatos com papel",
    completa: dados.contatos >= 1,
    pendencias: dados.contatos >= 1 ? [] : ["Ao menos um contato com papel tipado"],
  });

  secoes.push({
    secao: "D",
    titulo: "Indicadores declarados",
    completa: dados.temIndicadoresDeclarados,
    pendencias: dados.temIndicadoresDeclarados
      ? []
      : ["Nenhuma declaração registrada (ticket, NPS, churn, clientes, fundação)"],
  });

  const pendenciasE: string[] = [];
  if (!dados.comissaoDefinida) pendenciasE.push("Comissão % (take rate)");
  if (!dados.ambientesDefinidos) pendenciasE.push("Ambientes de pagamento habilitados");
  secoes.push({
    secao: "E",
    titulo: "Comercial Clube",
    completa: pendenciasE.length === 0,
    pendencias: pendenciasE,
  });

  secoes.push({
    secao: "F",
    titulo: "Ofertas pretendidas",
    completa: dados.ofertasPretendidas >= 1,
    pendencias:
      dados.ofertasPretendidas >= 1 ? [] : ["Nenhuma oferta pretendida estruturada"],
  });

  return secoes;
}

/** Percentual de seções completas — o medidor do topo do formulário. */
export function percentualM1(secoes: ReadonlyArray<CompletudeDaSecao>): number {
  if (secoes.length === 0) return 0;
  return Math.round((secoes.filter((secao) => secao.completa).length / secoes.length) * 100);
}

export interface OfertaPretendidaInformada {
  natureza: NaturezaOferta;
  titulo: string;
  precoDe: number | null;
  precoPor: number | null;
  instrucoesResgate: string | null;
}

/**
 * Validação da seção F — o formulário ensina a definição contratual:
 * Recompensa é gratuidade para experimentar; desconto é Benefício. É a
 * mesma regra da oferta real (dominio/ofertas/regras.ts), aplicada já na
 * intenção, para o erro não nascer no cadastro.
 */
export function validarOfertaPretendida(oferta: OfertaPretendidaInformada): string[] {
  const erros: string[] = [];

  if (!oferta.titulo.trim()) {
    erros.push("A oferta pretendida precisa de um título.");
  }

  const temPreco = (oferta.precoDe ?? 0) > 0 || (oferta.precoPor ?? 0) > 0;
  if (oferta.natureza === "RECOMPENSA" && temPreco) {
    erros.push(
      "Recompensa é gratuidade para experimentar (definição contratual): os valores devem ficar zerados. Desconto é Benefício.",
    );
  }
  if (oferta.natureza === "BENEFICIO" && !temPreco) {
    erros.push(
      "Benefício pressupõe valor ou desconto — informe preço de/por. Sem valor, a natureza é Recompensa.",
    );
  }
  if (!oferta.instrucoesResgate?.trim()) {
    erros.push(
      "Informe as instruções de resgate pós-voucher (URL ou fluxo de contato) — é o que o assinante faz depois do voucher.",
    );
  }

  return erros;
}

/** Seção D — faixas dos indicadores autodeclarados. */
export interface IndicadoresDeclaradosInformados {
  ticketMedio: number | null;
  nps: number | null;
  churnMensalPct: number | null;
  numeroClientes: number | null;
  anoFundacao: number | null;
}

export function validarIndicadoresDeclarados(
  dados: IndicadoresDeclaradosInformados,
  anoCorrente: number,
): string[] {
  const erros: string[] = [];
  const informado = Object.values(dados).some((valor) => valor !== null);
  if (!informado) {
    erros.push("Informe ao menos um indicador declarado.");
  }
  if (dados.nps !== null && (dados.nps < -100 || dados.nps > 100)) {
    erros.push("NPS vai de -100 a 100.");
  }
  if (dados.churnMensalPct !== null && (dados.churnMensalPct < 0 || dados.churnMensalPct > 100)) {
    erros.push("Churn mensal é um percentual entre 0 e 100.");
  }
  if (dados.ticketMedio !== null && dados.ticketMedio < 0) {
    erros.push("Ticket médio não pode ser negativo.");
  }
  if (dados.numeroClientes !== null && dados.numeroClientes < 0) {
    erros.push("Número de clientes não pode ser negativo.");
  }
  if (dados.anoFundacao !== null && (dados.anoFundacao < 1800 || dados.anoFundacao > anoCorrente)) {
    erros.push(`Ano de fundação deve estar entre 1800 e ${anoCorrente}.`);
  }
  return erros;
}

/** Seção A — os diferenciais são até cinco itens curtos, um por linha. */
export function normalizarDiferenciais(bruto: string): string[] {
  return bruto
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)
    .slice(0, MAXIMO_DE_DIFERENCIAIS);
}
