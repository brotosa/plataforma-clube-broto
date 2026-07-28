import type { AssinanteSintetico } from "@/infra/assinantes/fixtures-sinteticas";

/**
 * Fixtures SINTÉTICAS dos dois relatórios nominais da operadora
 * (ficha §7; prompt §7).
 *
 * **Por que elas existem.** Os arquivos reais de usuários e de resgates
 * trazem nome, e-mail, telefone e agora CPF de mais de mil titulares, e
 * **não entram no repositório em nenhuma hipótese** — nem como amostra de
 * teste. Com a chegada do CPF a restrição ficou mais dura, não menos. O
 * caminho nominal inteiro é exercitado aqui, com estrutura igual à do
 * arquivo real e dados fabricados, no padrão dos
 * `*-SINTETICO-homologacao.csv` que a homologação já usa.
 *
 * **Duas fixtures, não uma**, porque os dois estados importam e o segundo
 * não é hipotético:
 *
 * 1. **com a coluna de CPF** — a junção acontece: vínculo criado, perfil
 *    atualizado, evento gravado;
 * 2. **sem a coluna de CPF** — arquivos anteriores à requisição de 27/07
 *    são assim, e a importação deles precisa recusar toda linha com a
 *    causa certa, sem gravar nada e sem lançar exceção. Falhar bem é
 *    comportamento especificado, não acidente.
 *
 * Os CPFs vêm de `gerarAssinantesSinteticos`, que os forma
 * algoritmicamente (base aleatória + dígitos verificadores) — jamais de
 * pessoa real. O cabeçalho é `[A CONFIRMAR — Minutrade]`: reproduz o que
 * a ficha §3 enumera, e a primeira importação real é quem o confirma.
 */

/** O de-para da RN63, do lado da fonte. */
export type PerfilNaFonte = "Assinatura Patrocinada" | "Assinatura Paga";

export interface LinhaUsuarioSintetica {
  assinante: AssinanteSintetico;
  perfil: PerfilNaFonte;
  /** Valor da coluna nativa `Patrocinador`; "Broto" vira Promocional Broto. */
  patrocinador: string;
  estado: "Usuário Cadastrado" | "Usuário Freemium" | "Assinante";
  plano: "Mensal" | "Anual";
  periodicidade: string;
  metodoPagamento: string;
  preco: string;
}

/**
 * Os três valores observados na coluna `Tipo de Oferta` do extrato — é
 * ela que separa resgate de compra dentro do mesmo relatório
 * (`dominio/telemetria-operadora/tipo-de-evento.ts`).
 */
export type TipoDeOfertaNaFonte =
  | "Recompensa gratuita"
  | "Checkout no clube"
  | "Checkout externo";

export interface LinhaResgateSintetica {
  assinante: AssinanteSintetico;
  data: string;
  produto: string;
  /** Aceita valor fora dos três, para exercitar o não classificado. */
  tipoOferta: TipoDeOfertaNaFonte | (string & {});
  seller: string;
}

/**
 * CSV de usuários.
 *
 * `comColunaDeCpf: false` reproduz o arquivo histórico: mesma estrutura,
 * sem a coluna de chave. É a fixture que prova a causa
 * `SEM_COLUNA_DE_CPF`.
 *
 * `comMascara: true` escreve o CPF como 000.000.000-00 — a presença ou
 * não da máscara é `[A CONFIRMAR]` (ficha §8), e o parser tolera as duas.
 */
export function gerarCsvUsuariosSintetico(
  linhas: ReadonlyArray<LinhaUsuarioSintetica>,
  opcoes: { comColunaDeCpf: boolean; comMascara?: boolean; nomeDaColunaCpf?: string } = {
    comColunaDeCpf: true,
  },
): string {
  const nomeCpf = opcoes.nomeDaColunaCpf ?? "CPF";
  const cabecalho = [
    ...(opcoes.comColunaDeCpf ? [nomeCpf] : []),
    "Nome",
    "E-mail",
    "Telefone",
    "Patrocinador",
    "Perfil",
    "Status do Usuário",
    "Plano",
    "Periodicidade",
    "Método de Pagamento",
    "Preço",
  ];
  const corpo = linhas.map((linha) =>
    [
      ...(opcoes.comColunaDeCpf
        ? [opcoes.comMascara ? mascarar(linha.assinante.cpf) : linha.assinante.cpf]
        : []),
      linha.assinante.nome,
      linha.assinante.email,
      // Higiene 3: o artefato de planilha que o arquivo real traz.
      `'${linha.assinante.telefone}`,
      linha.patrocinador,
      linha.perfil,
      linha.estado,
      linha.plano,
      linha.periodicidade,
      linha.metodoPagamento,
      linha.preco,
    ].join(";"),
  );
  return [cabecalho.join(";"), ...corpo].join("\n") + "\n";
}

/** CSV de resgates nominais, nos mesmos dois estados. */
export function gerarCsvResgatesSintetico(
  linhas: ReadonlyArray<LinhaResgateSintetica>,
  opcoes: { comColunaDeCpf: boolean; comMascara?: boolean } = { comColunaDeCpf: true },
): string {
  const cabecalho = [
    ...(opcoes.comColunaDeCpf ? ["CPF do Cliente"] : []),
    "Nome",
    "Data do Resgate",
    "Produto",
    "Tipo de Oferta",
    "Seller",
  ];
  const corpo = linhas.map((linha) =>
    [
      ...(opcoes.comColunaDeCpf
        ? [opcoes.comMascara ? mascarar(linha.assinante.cpf) : linha.assinante.cpf]
        : []),
      linha.assinante.nome,
      linha.data,
      linha.produto,
      linha.tipoOferta,
      linha.seller,
    ].join(";"),
  );
  return [cabecalho.join(";"), ...corpo].join("\n") + "\n";
}

function mascarar(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

/**
 * CSV de catálogo de ofertas, para os testes que precisam de um conteúdo
 * controlado (idempotência, higienes, divergência) em vez da amostra real
 * de 192 linhas.
 *
 * O cabeçalho é o REAL, transcrito de `dados/Lista_de_Ofertas_3.xlsx` —
 * inclusive a coluna de índice sem nome na primeira posição, que é a
 * higiene 1.
 */
export function gerarCsvOfertasSintetico(
  linhas: ReadonlyArray<{
    idSeller: string;
    seller: string;
    idOferta: string;
    status: string;
    produto: string;
    data: string;
    resgates: string;
    compras: string;
  }>,
): string {
  const cabecalho =
    ",Id do Seller,Seller,Id da Oferta,Status da Oferta,Produto,CheckOut," +
    "Preço do Produto,Desconto,Preço Final do Produto,Data da Oferta,Resgates,Compras";
  const corpo = linhas.map((linha, indice) =>
    [
      String(indice + 1),
      linha.idSeller,
      linha.seller,
      linha.idOferta,
      linha.status,
      linha.produto,
      "Recompensa gratuita",
      "0",
      "0",
      "0",
      linha.data,
      linha.resgates,
      linha.compras,
    ].join(","),
  );
  return [cabecalho, ...corpo].join("\n") + "\n";
}

/** CSV de catálogo de sellers, com o emoji do status (higiene 2). */
export function gerarCsvSellersSintetico(
  linhas: ReadonlyArray<{
    idSeller: string;
    seller: string;
    dataEntrada: string;
    ofertasAtivas: string;
    ofertasInativas: string;
  }>,
): string {
  const cabecalho =
    ",Id do Seller,Seller,Data de Entrada do Seller,Ofertas Ativas," +
    "Ofertas Inativas,Seller com ofertas ativas?";
  const corpo = linhas.map((linha, indice) =>
    [
      String(indice + 1),
      linha.idSeller,
      linha.seller,
      linha.dataEntrada,
      linha.ofertasAtivas,
      linha.ofertasInativas,
      Number(linha.ofertasAtivas) > 0
        ? "🟢 Seller com oferta ativa"
        : "🔴 Seller sem oferta ativa",
    ].join(","),
  );
  return [cabecalho, ...corpo].join("\n") + "\n";
}
