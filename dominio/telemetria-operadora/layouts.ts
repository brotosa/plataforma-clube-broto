/**
 * Detecção do layout **pelo cabeçalho, nunca pelo nome do arquivo**
 * (RN67; prompt §3).
 *
 * O nome traz sufixo aleatório da operadora — "Lista_de_Ofertas_3.xlsx",
 * "Lista_de_Sellers_1.xlsx" —, então o número muda a cada geração e não
 * identifica coisa alguma. Já o cabeçalho descreve o conteúdo, e é ele
 * que decide.
 *
 * **O que foi observado em arquivo real e o que não foi.** Os dois
 * layouts de catálogo (`SELLERS` e `OFERTAS`) têm as amostras em `dados/`
 * e as assinaturas abaixo são transcrições do cabeçalho delas. Os dois
 * nominais (`USUARIOS` e `RESGATES`) **não têm amostra no repositório e
 * nunca terão** (RN69, ficha §7): as assinaturas deles vêm dos campos que
 * a ficha §3 enumera e são `[A CONFIRMAR — Minutrade]`. Por isso cada
 * exigência aceita várias grafias — a primeira importação real é o teste
 * de verdade, e é ela que confirma ou corrige esta lista.
 */

/** Os quatro relatórios (ficha §1). */
export type TipoLayoutTelemetria = "USUARIOS" | "RESGATES" | "SELLERS" | "OFERTAS";

/**
 * Normaliza um nome de coluna para comparação: minúsculas, sem acento,
 * sem espaço repetido e sem pontuação de borda.
 *
 * "Seller com ofertas ativas?" e "seller com ofertas ativas" são a mesma
 * coluna; a operadora já mudou capitalização entre gerações ("CheckOut").
 */
export function normalizarNomeDeColuna(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[?:.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface AssinaturaDeLayout {
  tipo: TipoLayoutTelemetria;
  /**
   * Cada item é um grupo de grafias aceitas para UMA exigência: basta uma
   * delas estar no cabeçalho. Todos os grupos precisam ser satisfeitos.
   */
  exigidas: string[][];
  /**
   * Colunas que, se presentes, DESCLASSIFICAM o layout. Existem porque os
   * quatro relatórios compartilham nomes: "Produto" e "Seller" aparecem
   * tanto no catálogo de ofertas quanto no extrato nominal, e sem esta
   * lista um arquivo de ofertas poderia ser lido como extrato.
   */
  proibidas?: string[];
  /** Verdadeiro quando o layout traz dado pessoal (RN69, ficha §7). */
  nominal: boolean;
}

const ASSINATURAS: readonly AssinaturaDeLayout[] = [
  {
    // Transcrito de `dados/Lista_de_Sellers_1.xlsx`: "Id do Seller",
    // "Seller", "Data de Entrada do Seller", "Ofertas Ativas", "Ofertas
    // Inativas", "Seller com ofertas ativas?".
    tipo: "SELLERS",
    exigidas: [["id do seller"], ["ofertas ativas"], ["ofertas inativas"]],
    nominal: false,
  },
  {
    // Transcrito de `dados/Lista_de_Ofertas_3.xlsx`. As três exigências
    // são justamente as que o de sellers não tem.
    tipo: "OFERTAS",
    exigidas: [["id da oferta"], ["resgates"], ["compras"]],
    nominal: false,
  },
  {
    // [A CONFIRMAR — Minutrade]. A única coluna que a ficha nomeia com
    // certeza é a nativa `Patrocinador` (RN63); as demais grafias são
    // hipóteses tolerantes sobre os campos que a ficha §3 enumera.
    tipo: "USUARIOS",
    exigidas: [
      ["patrocinador"],
      [
        "perfil",
        "perfil de assinatura",
        "tipo de assinatura",
        "assinatura",
        "status do usuario",
        "situacao do usuario",
      ],
    ],
    proibidas: ["resgates", "compras", "ofertas ativas"],
    nominal: true,
  },
  {
    // [A CONFIRMAR — Minutrade]. Derivado dos campos que a ficha §3
    // enumera para o evento: data, produto, tipo de oferta, seller.
    //
    // As proibidas são o que separa este layout do catálogo de ofertas,
    // que também tem "Produto" e "Seller" — e são as colunas de CONTADOR,
    // de propósito. "Id da Oferta" seria o discriminador óbvio e está
    // fora da lista: é exatamente a coluna que o item 2 da requisição de
    // 27/07 pede que a operadora passe a mandar no extrato. Proibi-la
    // aqui faria a detecção quebrar no dia em que o pedido fosse
    // atendido — e quebrar por termos conseguido o que pedimos é o pior
    // tipo de defeito, porque nada no arquivo pareceria errado.
    tipo: "RESGATES",
    exigidas: [
      ["produto"],
      ["data do resgate", "data do evento", "data", "data de resgate"],
    ],
    proibidas: ["resgates", "compras", "ofertas ativas"],
    nominal: true,
  },
];

/** Layouts que trazem dado pessoal — nunca commitados (ficha §7). */
export function layoutENominal(tipo: TipoLayoutTelemetria): boolean {
  return ASSINATURAS.find((a) => a.tipo === tipo)?.nominal ?? false;
}

function satisfaz(assinatura: AssinaturaDeLayout, presentes: Set<string>): boolean {
  if (assinatura.proibidas?.some((coluna) => presentes.has(coluna))) {
    return false;
  }
  return assinatura.exigidas.every((grupo) => grupo.some((nome) => presentes.has(nome)));
}

export interface DeteccaoDeLayout {
  tipo: TipoLayoutTelemetria | null;
  /**
   * Por que não foi possível decidir, quando não foi. Nomeia a causa
   * (RN55) e nunca sugere repetir o envio: reenviar o mesmo arquivo dá o
   * mesmo resultado, e o que resolve é conferir o cabeçalho.
   */
  motivo: string | null;
}

/**
 * Decide o layout a partir das colunas do cabeçalho.
 *
 * Empate é recusa, não escolha arbitrária: dois layouts satisfeitos pelo
 * mesmo cabeçalho significam que a assinatura de um deles está errada, e
 * adivinhar gravaria o arquivo no lugar errado — silenciosamente.
 */
export function detectarLayout(colunas: readonly string[]): DeteccaoDeLayout {
  const presentes = new Set(colunas.map(normalizarNomeDeColuna));
  const candidatos = ASSINATURAS.filter((assinatura) => satisfaz(assinatura, presentes));

  if (candidatos.length === 1) {
    return { tipo: candidatos[0]!.tipo, motivo: null };
  }
  if (candidatos.length === 0) {
    return {
      tipo: null,
      motivo:
        "O cabeçalho não corresponde a nenhum dos quatro relatórios da operadora " +
        "(usuários, resgates, sellers, ofertas). Confira se o arquivo é o relatório " +
        "certo e se veio com a linha de cabeçalho.",
    };
  }
  return {
    tipo: null,
    motivo:
      `O cabeçalho corresponde a mais de um relatório (${candidatos
        .map((c) => c.tipo)
        .join(", ")}), então não é possível decidir qual é sem risco de gravar no ` +
      "lugar errado. Confira o arquivo com a operadora.",
  };
}
