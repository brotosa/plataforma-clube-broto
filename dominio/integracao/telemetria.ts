import type { TipoEventoTelemetria } from "@prisma/client";

/**
 * Importação de telemetria (Minutrade → Broto), ficha §6 — domínio puro.
 *
 * Layout-alvo (uma linha por evento, separador `;`):
 *   data_hora_evento; cpf_assinante; id_seller; id_oferta; id_voucher;
 *   tipo_evento; valor_transacao; canal
 *
 * O **cardápio real de eventos da Minutrade é [A CONFIRMAR]**: só os três
 * degraus contratuais são reconhecidos (MAPA_TIPO_EVENTO). Qualquer outro
 * valor NÃO é adivinhado — a linha vai para quarentena com motivo.
 *
 * O `cpf` é lido apenas para ser transformado em hash na camada de escrita
 * (LGPD, Onda 1): não há coluna para o CPF cru no modelo, então ele nunca é
 * persistido. O dado pessoal pleno só entra na Onda 5.
 */

/** CSV `tipo_evento` → enum. Fechado por decisão de negócio ([A CONFIRMAR]). */
export const MAPA_TIPO_EVENTO: Readonly<Record<string, TipoEventoTelemetria>> = {
  emissao_voucher: "EMISSAO_VOUCHER",
  resgate_voucher: "RESGATE_VOUCHER",
  compra_confirmada: "COMPRA_CONFIRMADA",
};

export interface LinhaTelemetria {
  linha: number;
  dataEvento: Date | null;
  cpf: string | null;
  idSellerExterno: string | null;
  idOfertaExterno: string | null;
  idVoucher: string | null;
  tipo: TipoEventoTelemetria | null;
  tipoBruto: string;
  valor: number | null;
  canal: string | null;
  dadosOriginais: Record<string, string>;
}

// ---------------------------------------------------------------------
// Leitura tolerante de CSV (puro)
// ---------------------------------------------------------------------

/** Tokeniza um CSV (delimitador `;`), respeitando aspas e quebras internas. */
export function analisarCsv(texto: string, delimitador = ";"): string[][] {
  const registros: string[][] = [];
  let campo = "";
  let registro: string[] = [];
  let dentroDeAspas = false;

  const fecharCampo = () => {
    registro.push(campo);
    campo = "";
  };
  const fecharRegistro = () => {
    fecharCampo();
    registros.push(registro);
    registro = [];
  };

  for (let i = 0; i < texto.length; i++) {
    const caractere = texto.charAt(i);
    if (dentroDeAspas) {
      if (caractere === '"') {
        if (texto.charAt(i + 1) === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += caractere;
      }
      continue;
    }
    if (caractere === '"') {
      dentroDeAspas = true;
    } else if (caractere === delimitador) {
      fecharCampo();
    } else if (caractere === "\n") {
      fecharRegistro();
    } else if (caractere !== "\r") {
      campo += caractere;
    }
  }
  if (campo !== "" || registro.length > 0) {
    fecharRegistro();
  }
  // Descarta linhas totalmente vazias.
  return registros.filter((linha) => linha.some((valor) => valor.trim() !== ""));
}

/** Aliases de cabeçalho aceitos para cada campo (tolerância a variações). */
const ALIASES_CABECALHO: Readonly<Record<keyof CamposCabecalho, ReadonlyArray<string>>> = {
  dataEvento: ["data_hora_evento", "data_hora", "data", "data_evento"],
  cpf: ["cpf_assinante", "cpf"],
  idSellerExterno: ["id_seller", "id_do_seller", "seller"],
  idOfertaExterno: ["id_oferta", "id_da_oferta", "oferta"],
  idVoucher: ["id_voucher", "voucher"],
  tipo: ["tipo_evento", "tipo", "evento"],
  valor: ["valor_transacao", "valor", "valor_pago"],
  canal: ["canal"],
};

interface CamposCabecalho {
  dataEvento: number;
  cpf: number;
  idSellerExterno: number;
  idOfertaExterno: number;
  idVoucher: number;
  tipo: number;
  valor: number;
  canal: number;
}

export class ErroDeLayoutTelemetria extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeLayoutTelemetria";
  }
}

function normalizarCabecalho(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
}

function numeroTelemetria(bruto: string): number | null {
  const limpo = bruto.trim();
  if (limpo === "") return null;
  const normalizado = limpo.includes(",") && !limpo.includes(".")
    ? limpo.replace(",", ".")
    : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

function dataTelemetria(bruto: string): Date | null {
  const limpo = bruto.trim();
  if (limpo === "") return null;
  const iso = limpo.includes("T") ? limpo : limpo.replace(" ", "T");
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

function valorOuNulo(bruto: string | undefined): string | null {
  const limpo = (bruto ?? "").trim();
  return limpo === "" ? null : limpo;
}

/**
 * Lê o CSV de telemetria em linhas estruturadas. O cabeçalho é casado por
 * NOME (tolerante à ordem e a colunas extras); a ausência de uma coluna
 * essencial é erro de layout claro, não dado errado.
 */
export function lerCsvTelemetria(texto: string): LinhaTelemetria[] {
  const matriz = analisarCsv(texto);
  const cabecalho = matriz[0];
  if (!cabecalho) {
    throw new ErroDeLayoutTelemetria("Arquivo de telemetria vazio (sem cabeçalho).");
  }
  const normalizado = cabecalho.map(normalizarCabecalho);
  const indices = {} as CamposCabecalho;
  const essenciais: ReadonlyArray<keyof CamposCabecalho> = [
    "dataEvento",
    "idVoucher",
    "tipo",
  ];
  for (const campo of Object.keys(ALIASES_CABECALHO) as Array<keyof CamposCabecalho>) {
    const indice = normalizado.findIndex((nome) =>
      ALIASES_CABECALHO[campo].includes(nome),
    );
    indices[campo] = indice;
    if (indice === -1 && essenciais.includes(campo)) {
      throw new ErroDeLayoutTelemetria(
        `Coluna essencial ausente no CSV de telemetria: ${campo} (aceitas: ${ALIASES_CABECALHO[campo].join(", ")}).`,
      );
    }
  }

  const linhas: LinhaTelemetria[] = [];
  for (let i = 1; i < matriz.length; i++) {
    const colunas = matriz[i] ?? [];
    const ler = (indice: number) => (indice >= 0 ? valorOuNulo(colunas[indice]) : null);
    const dadosOriginais: Record<string, string> = {};
    cabecalho.forEach((nome, coluna) => {
      dadosOriginais[normalizado[coluna] ?? nome] = (colunas[coluna] ?? "").trim();
    });

    const tipoBruto = ler(indices.tipo) ?? "";
    const tipo = MAPA_TIPO_EVENTO[normalizarCabecalho(tipoBruto)] ?? null;
    const dataBruta = ler(indices.dataEvento) ?? "";
    const valorBruto = ler(indices.valor) ?? "";

    linhas.push({
      linha: i,
      dataEvento: dataTelemetria(dataBruta),
      cpf: ler(indices.cpf),
      idSellerExterno: ler(indices.idSellerExterno),
      idOfertaExterno: ler(indices.idOfertaExterno),
      idVoucher: ler(indices.idVoucher),
      tipo,
      tipoBruto,
      valor: numeroTelemetria(valorBruto),
      canal: ler(indices.canal),
      dadosOriginais,
    });
  }
  return linhas;
}

// ---------------------------------------------------------------------
// Validação linha a linha (quarentena com motivo)
// ---------------------------------------------------------------------

/** Motivos de quarentena; vazio = linha válida. Nada é adivinhado. */
export function validarLinhaTelemetria(linha: LinhaTelemetria): string[] {
  const motivos: string[] = [];
  if (!linha.dataEvento) {
    motivos.push("Data/hora do evento inválida ou ausente.");
  }
  if (!linha.idVoucher) {
    motivos.push("Id do voucher ausente.");
  }
  if (!linha.tipo) {
    motivos.push(
      `Tipo de evento desconhecido: "${linha.tipoBruto}" (cardápio da Minutrade [A CONFIRMAR]).`,
    );
  }
  if (linha.tipo === "COMPRA_CONFIRMADA" && linha.valor === null) {
    motivos.push("Compra confirmada sem valor de transação.");
  }
  return motivos;
}
