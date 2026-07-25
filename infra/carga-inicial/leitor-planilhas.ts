import ExcelJS from "exceljs";
import {
  type LinhaOferta,
  type LinhaSeller,
  normalizarTexto,
} from "@/dominio/carga-inicial/mapeamento";

/**
 * Leitura das planilhas reais da carga inicial (dados/), por NOME de
 * coluna — tolerante a colunas novas e à futura terceira fonte (dump do
 * catálogo Minutrade, [A CONFIRMAR]): colunas desconhecidas são
 * preservadas em `dadosOriginais` sem quebrar o parser.
 */

export interface LinhaLida<T> {
  campos: T;
  /** Linha completa da planilha, chaveada pelo cabeçalho. */
  dadosOriginais: Record<string, unknown>;
}

function indicePorCabecalho(aba: ExcelJS.Worksheet): Map<string, number> {
  const indice = new Map<string, number>();
  aba.getRow(1).eachCell({ includeEmpty: false }, (celula, coluna) => {
    const nome = normalizarTexto(celula.value);
    if (nome) {
      indice.set(nome.toLowerCase(), coluna);
    }
  });
  return indice;
}

function celula(aba: ExcelJS.Worksheet, linha: number, coluna: number | undefined): unknown {
  if (!coluna) return null;
  const valor = aba.getRow(linha).getCell(coluna).value;
  if (valor && typeof valor === "object" && "result" in valor) {
    return (valor as { result: unknown }).result; // célula de fórmula
  }
  if (valor && typeof valor === "object" && "richText" in valor) {
    return (valor as { richText: Array<{ text: string }> }).richText
      .map((parte) => parte.text)
      .join("");
  }
  return valor;
}

function comoNumero(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function comoData(valor: unknown): Date | null {
  if (valor instanceof Date) return valor;
  if (typeof valor === "string" && valor.trim()) {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }
  return null;
}

function linhaCompleta(
  aba: ExcelJS.Worksheet,
  indice: Map<string, number>,
  linha: number,
): Record<string, unknown> {
  const registro: Record<string, unknown> = {};
  for (const [nome, coluna] of indice) {
    const valor = celula(aba, linha, coluna);
    registro[nome] = valor instanceof Date ? valor.toISOString() : (valor ?? null);
  }
  return registro;
}

function abaDeDados(pasta: ExcelJS.Workbook, arquivo: string): ExcelJS.Worksheet {
  const aba = pasta.worksheets[0];
  if (!aba) {
    throw new Error(`Planilha sem abas: ${arquivo}`);
  }
  return aba;
}

function exigirColunas(
  indice: Map<string, number>,
  obrigatorias: string[],
  arquivo: string,
): void {
  const ausentes = obrigatorias.filter((nome) => !indice.has(nome.toLowerCase()));
  if (ausentes.length > 0) {
    throw new Error(
      `Colunas obrigatórias ausentes em ${arquivo}: ${ausentes.join(", ")}. ` +
        "O layout da planilha mudou — ajuste o leitor antes de importar.",
    );
  }
}

export async function lerPlanilhaSellers(
  caminho: string,
): Promise<Array<LinhaLida<LinhaSeller>>> {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.readFile(caminho);
  const aba = abaDeDados(pasta, caminho);
  const indice = indicePorCabecalho(aba);
  exigirColunas(indice, ["Id do Seller", "Seller"], caminho);

  const linhas: Array<LinhaLida<LinhaSeller>> = [];
  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const idSellerExterno = normalizarTexto(
      celula(aba, numero, indice.get("id do seller")),
    );
    const nomeSeller = normalizarTexto(celula(aba, numero, indice.get("seller")));
    if (!idSellerExterno && !nomeSeller) {
      continue; // linha em branco no fim da planilha
    }
    linhas.push({
      campos: {
        linha: numero,
        idSellerExterno,
        nomeSeller,
        dataEntrada: comoData(celula(aba, numero, indice.get("data de entrada do seller"))),
      },
      dadosOriginais: linhaCompleta(aba, indice, numero),
    });
  }
  return linhas;
}

export async function lerPlanilhaOfertas(
  caminho: string,
): Promise<Array<LinhaLida<LinhaOferta>>> {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.readFile(caminho);
  const aba = abaDeDados(pasta, caminho);
  const indice = indicePorCabecalho(aba);
  exigirColunas(
    indice,
    ["Id do Seller", "Produto", "CheckOut", "Status da Oferta"],
    caminho,
  );

  const linhas: Array<LinhaLida<LinhaOferta>> = [];
  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const idSellerExterno = normalizarTexto(
      celula(aba, numero, indice.get("id do seller")),
    );
    const produto = normalizarTexto(celula(aba, numero, indice.get("produto")));
    if (!idSellerExterno && !produto) {
      continue;
    }
    linhas.push({
      campos: {
        linha: numero,
        idSellerExterno,
        nomeSeller: normalizarTexto(celula(aba, numero, indice.get("seller"))),
        idOfertaExterno: normalizarTexto(celula(aba, numero, indice.get("id da oferta"))),
        statusOferta: normalizarTexto(celula(aba, numero, indice.get("status da oferta"))),
        produto,
        checkout: normalizarTexto(celula(aba, numero, indice.get("checkout"))),
        preco: comoNumero(celula(aba, numero, indice.get("preço do produto"))),
        desconto: comoNumero(celula(aba, numero, indice.get("desconto"))),
        precoFinal: comoNumero(celula(aba, numero, indice.get("preço final do produto"))),
        dataOferta: comoData(celula(aba, numero, indice.get("data da oferta"))),
        resgates: comoNumero(celula(aba, numero, indice.get("resgates"))),
        compras: comoNumero(celula(aba, numero, indice.get("compras"))),
      },
      dadosOriginais: linhaCompleta(aba, indice, numero),
    });
  }
  return linhas;
}
