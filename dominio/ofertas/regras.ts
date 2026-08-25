import type {
  AmbientePagamento,
  EstagioEmpresa,
  NaturezaOferta,
  StatusContrato,
  StatusOferta,
  StatusSolucao,
} from "@prisma/client";

/**
 * Regras de negócio da Oferta (ficha §3.3 e §4), como funções puras.
 * Os serviços de escrita (infra) usam estas funções antes de persistir.
 */

// ---------------------------------------------------------------------
// RN11 — compatibilidade mecânica × ambiente habilitado do aliado
// ---------------------------------------------------------------------

/** Slugs das mecânicas seed (taxonomia v1). */
export type MecanicaSlug =
  | "CHECKOUT_CLUBE"
  | "CHECKOUT_EXTERNO"
  | "RECOMPENSA_GRATUITA";

/**
 * RN11: checkout no clube exige ambiente DENTRO_PLATAFORMA habilitado;
 * checkout externo exige FORA_PLATAFORMA; recompensa gratuita independe.
 * AMBOS habilita as duas mecânicas de checkout.
 */
export function mecanicaCompativelComAmbiente(
  mecanica: MecanicaSlug,
  ambientes: AmbientePagamento | null,
): boolean {
  if (mecanica === "RECOMPENSA_GRATUITA") {
    return true;
  }
  if (!ambientes) {
    return false;
  }
  if (mecanica === "CHECKOUT_CLUBE") {
    return ambientes === "DENTRO_PLATAFORMA" || ambientes === "AMBOS";
  }
  return ambientes === "FORA_PLATAFORMA" || ambientes === "AMBOS";
}

/** Explicação institucional exibida pela UI quando a mecânica está desabilitada. */
export function explicacaoIncompatibilidade(mecanica: MecanicaSlug): string {
  if (mecanica === "CHECKOUT_CLUBE") {
    return "Exige o ambiente de pagamento dentro da Plataforma habilitado no bloco comercial do aliado (RN11).";
  }
  if (mecanica === "CHECKOUT_EXTERNO") {
    return "Exige o ambiente de pagamento fora da Plataforma habilitado no bloco comercial do aliado (RN11).";
  }
  return "";
}

// ---------------------------------------------------------------------
// Validações de natureza (decisão de 24/07 — três valores)
// ---------------------------------------------------------------------

export interface DadosNaturezaOferta {
  natureza: NaturezaOferta;
  tipoBeneficioSlug: string | null;
  precoDe: number | null;
  precoPor: number | null;
  cupomCodigoRegras: string | null;
  modalidadePagamento: "UNICA" | "RECORRENTE" | null;
  /**
   * Benefício com Tipo = Percentual de desconto. Inteiro 1–100. Opcional aqui
   * de propósito: só é validado quando informado, para não reprovar ofertas
   * Percentual anteriores à adoção do campo (que têm preço de/por e este vazio).
   */
  percentualDesconto?: number | null;
}

/**
 * Consistência entre natureza, tipo de benefício, preços e campos
 * condicionais (ficha §3.3):
 * - Recompensa: gratuita — preços zero/vazios; tipo gratuidade.
 * - Gratuidade ⇒ natureza Recompensa.
 * - Cupom de desconto: desconto definido. O código/regras do cupom é
 *   opcional (pode não existir na carga) — decisão de negócio de 24/08.
 * - Modalidade de pagamento (única/recorrente): somente Benefícios.
 */
export function validarNatureza(dados: DadosNaturezaOferta): string[] {
  const erros: string[] = [];

  if (dados.natureza === "RECOMPENSA") {
    const temPreco =
      (dados.precoDe !== null && dados.precoDe !== 0) ||
      (dados.precoPor !== null && dados.precoPor !== 0);
    if (temPreco) {
      erros.push(
        "Recompensa é gratuidade para experimentar (definição contratual): preços devem ficar zerados. Desconto é Benefício.",
      );
    }
    if (dados.tipoBeneficioSlug && dados.tipoBeneficioSlug !== "GRATUIDADE") {
      erros.push("Recompensa exige tipo de benefício Gratuidade.");
    }
  }

  if (dados.tipoBeneficioSlug === "GRATUIDADE" && dados.natureza !== "RECOMPENSA") {
    erros.push("Gratuidade implica natureza Recompensa (ficha §3.3).");
  }

  if (dados.natureza === "CUPOM_DESCONTO") {
    // O código/regras do cupom é opcional: pode não existir na carga e nunca
    // é obrigatório em nenhuma natureza (decisão de negócio de 24/08).
    const descontoDefinido =
      dados.tipoBeneficioSlug === "PCT_DESCONTO" ||
      dados.tipoBeneficioSlug === "VALOR_FIXO" ||
      (dados.precoDe !== null && dados.precoPor !== null && dados.precoPor < dados.precoDe);
    if (!descontoDefinido) {
      erros.push("Cupom de desconto exige desconto definido (percentual, valor fixo ou preço de/por).");
    }
  }

  if (dados.modalidadePagamento && dados.natureza !== "BENEFICIO") {
    erros.push("Modalidade de pagamento (única/recorrente) aplica-se somente a Benefícios.");
  }

  // Percentual de desconto: quando informado, é inteiro de 1 a 100. Só valida
  // se veio preenchido — ofertas Percentual anteriores ao campo têm este vazio
  // e não podem regredir. O tipo Percentual, por si, já conta como desconto
  // definido acima; o número, quando presente, tem de ser sadio.
  if (dados.percentualDesconto !== null && dados.percentualDesconto !== undefined) {
    const p = dados.percentualDesconto;
    if (!Number.isInteger(p) || p < 1 || p > 100) {
      erros.push("Percentual de desconto deve ser um número inteiro entre 1 e 100.");
    }
  }

  return erros;
}

// ---------------------------------------------------------------------
// RN09 — régua de completude do card
// ---------------------------------------------------------------------

export interface DadosCompletudeCard {
  aliado: {
    nomeFantasia: string | null;
    /**
     * F15 (RN54) — marca guardada pela plataforma. É a fonte a partir daqui.
     */
    temMarca: boolean;
    /**
     * OBSOLETO desde a F15: endereço S3 do logotipo, de um bucket nunca
     * provisionado. Continua sendo lido **apenas como fallback**, para que
     * nenhum aliado que porventura tenha o campo preenchido perca o ponto
     * de completude que já contava — a régua da RN09 não pode mudar de
     * valor por causa da troca de armazenamento. Sai junto com a coluna.
     */
    logoUrl: string | null;
  };
  solucao: {
    nome: string | null;
    descricaoCurta: string | null;
    temCategoria: boolean;
    quantidadeCulturas: number;
    coberturaNacional: boolean;
    quantidadeUfs: number;
    /**
     * F17 (RN60) — imagem do card guardada pela plataforma. É a fonte a
     * partir daqui.
     */
    temImagem: boolean;
    /**
     * OBSOLETO desde a F17: endereço de objeto da imagem do card, de um
     * bucket nunca provisionado. Continua sendo lido **apenas como
     * fallback**, para que nenhuma solução que porventura tenha o campo
     * preenchido perca o ponto de completude que já contava — a régua da
     * RN09 não pode mudar de valor por causa da troca de armazenamento.
     * Sai junto com a coluna. Mesmo tratamento que a F15 deu a `logoUrl`.
     */
    imagemCardUrl: string | null;
  };
}

export interface ItemCompletude {
  rotulo: string;
  ok: boolean;
  /**
   * Item informativo que NÃO trava a publicação (não entra no cálculo de
   * `completa`/`percentual`). Continua visível na régua para orientar. A
   * imagem do card é opcional desde 24/08 (decisão de negócio) — o texto do
   * card (descrição curta) segue obrigatório.
   */
  opcional?: boolean;
}

/**
 * RN09 — conjunto mínimo do card para publicar oferta: nome de exibição e
 * logo do aliado; nome, descrição curta, categoria, culturas e cobertura da
 * solução. A imagem do card é item OPCIONAL (24/08): aparece na régua, mas
 * não bloqueia a publicação. Alimenta a régua visível nas telas.
 */
export function calcularCompletudeCard(dados: DadosCompletudeCard): {
  itens: ItemCompletude[];
  percentual: number;
  completa: boolean;
} {
  const itens: ItemCompletude[] = [
    { rotulo: "Nome de exibição do aliado", ok: Boolean(dados.aliado.nomeFantasia?.trim()) },
    // F15 — a marca da plataforma satisfaz o item; o endereço S3 obsoleto
    // continua satisfazendo quem já o tinha, para a régua não regredir.
    { rotulo: "Logo do aliado", ok: dados.aliado.temMarca || Boolean(dados.aliado.logoUrl?.trim()) },
    { rotulo: "Nome da solução", ok: Boolean(dados.solucao.nome?.trim()) },
    { rotulo: "Descrição curta da solução", ok: Boolean(dados.solucao.descricaoCurta?.trim()) },
    { rotulo: "Categoria da solução", ok: dados.solucao.temCategoria },
    { rotulo: "Culturas atendidas", ok: dados.solucao.quantidadeCulturas > 0 },
    {
      rotulo: "Cobertura (UFs ou nacional)",
      ok: dados.solucao.coberturaNacional || dados.solucao.quantidadeUfs > 0,
    },
    // F17 — a imagem da plataforma satisfaz o item; o endereço obsoleto
    // continua satisfazendo quem já o tinha, para a régua não regredir.
    {
      rotulo: "Imagem do card",
      ok: dados.solucao.temImagem || Boolean(dados.solucao.imagemCardUrl?.trim()),
      // Opcional (24/08): permanece na régua como orientação, mas não trava a
      // publicação — some do numerador/denominador do percentual e de `completa`.
      opcional: true,
    },
  ];
  // Só os itens obrigatórios contam para o percentual e para `completa`. Os
  // opcionais aparecem na lista, mas não movem a régua nem bloqueiam publicar.
  const obrigatorios = itens.filter((item) => !item.opcional);
  const feitos = obrigatorios.filter((item) => item.ok).length;
  return {
    itens,
    percentual: Math.round((feitos / obrigatorios.length) * 100),
    completa: feitos === obrigatorios.length,
  };
}

// ---------------------------------------------------------------------
// RN02 — condições estruturais de publicação
// ---------------------------------------------------------------------

export interface CondicoesPublicacao {
  estagioEmpresa: EstagioEmpresa;
  statusContrato: StatusContrato | null;
  statusSolucao: StatusSolucao;
  completudeCard: boolean;
  mecanicaCompativel: boolean;
}

/**
 * RN02 — oferta só pode ser publicada se a solução estiver ativa e o
 * aliado em estágio Aliada ativa com contrato vigente; soma-se a régua
 * RN09 e a compatibilidade RN11. Retorna a lista de impedimentos.
 */
export function impedimentosDePublicacao(condicoes: CondicoesPublicacao): string[] {
  const impedimentos: string[] = [];
  if (condicoes.estagioEmpresa !== "ALIADA_ATIVA") {
    impedimentos.push("Aliado não está em estágio Aliada ativa (RN02).");
  }
  if (condicoes.statusContrato !== "VIGENTE") {
    impedimentos.push("Aliado sem contrato vigente (RN02).");
  }
  if (condicoes.statusSolucao !== "ATIVA") {
    impedimentos.push("Solução inativa (RN02).");
  }
  if (!condicoes.completudeCard) {
    impedimentos.push("Conjunto mínimo do card incompleto (RN09).");
  }
  if (!condicoes.mecanicaCompativel) {
    impedimentos.push("Mecânica de resgate incompatível com os ambientes habilitados (RN11).");
  }
  return impedimentos;
}

// ---------------------------------------------------------------------
// RN03 — expiração automática por vigência
// ---------------------------------------------------------------------

/** Compara apenas datas (dia), sem componente de hora. */
export function estaExpirada(vigenciaFim: Date | null, hoje: Date): boolean {
  if (!vigenciaFim) {
    return false; // fim vazio = prazo indeterminado
  }
  const fim = new Date(vigenciaFim);
  fim.setUTCHours(0, 0, 0, 0);
  const corrente = new Date(hoje);
  corrente.setUTCHours(0, 0, 0, 0);
  return fim.getTime() < corrente.getTime();
}

/**
 * Dias que faltam para o fim da vigência. Prazo indeterminado devolve null
 * (nunca "muitos dias"); vigência já vencida devolve número negativo, e
 * quem exibe decide o que fazer com isso.
 */
export function diasAteVencer(vigenciaFim: Date | null, hoje: Date): number | null {
  if (!vigenciaFim) {
    return null;
  }
  const fim = new Date(vigenciaFim);
  fim.setUTCHours(0, 0, 0, 0);
  const corrente = new Date(hoje);
  corrente.setUTCHours(0, 0, 0, 0);
  const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((fim.getTime() - corrente.getTime()) / MILISSEGUNDOS_POR_DIA);
}

/**
 * Régua "vigência a vencer" (alerta na T4 e no sino): oferta ainda no ar
 * cuja vigência termina dentro da janela vigente. A janela entra por
 * parâmetro — desde a F10 vem do Parametrizador (chave
 * OFERTA_VIGENCIA_A_VENCER_DIAS), 15 dias na implantação.
 */
export function estaAVencer(
  vigenciaFim: Date | null,
  hoje: Date,
  janelaEmDias: number,
): boolean {
  const dias = diasAteVencer(vigenciaFim, hoje);
  if (dias === null) {
    return false;
  }
  return dias >= 0 && dias <= janelaEmDias;
}

// ---------------------------------------------------------------------
// RN10 — flag Pendente de republicação
// ---------------------------------------------------------------------

/** Campos publicáveis da oferta: alterá-los após o export liga a flag. */
const CAMPOS_PUBLICAVEIS: ReadonlyArray<string> = [
  "titulo",
  "natureza",
  "tipoBeneficioId",
  "precoDe",
  "precoPor",
  "cupomCodigoRegras",
  "modalidadePagamento",
  "mecanicaId",
  "urlResgateExterno",
  "instrucoesResgate",
  "vigenciaInicio",
  "vigenciaFim",
  "status",
];

/**
 * RN10 — alterar campos publicáveis de uma oferta Publicada liga a flag
 * Pendente de republicação (o export seguinte a limpa).
 */
export function deveMarcarRepublicacao(
  statusAtual: StatusOferta,
  camposAlterados: ReadonlyArray<string>,
): boolean {
  if (statusAtual !== "PUBLICADA") {
    return false;
  }
  return camposAlterados.some((campo) => CAMPOS_PUBLICAVEIS.includes(campo));
}
