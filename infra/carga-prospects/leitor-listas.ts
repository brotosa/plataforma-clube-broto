import ExcelJS from "exceljs";
import { ErroDeArquivo } from "@/dominio/erros/falhas";

/**
 * Leitura tolerante do arquivo de prospects (T9): CSV ou XLSX, qualquer
 * conjunto de colunas — o significado de cada uma é decidido no passo de
 * mapeamento (o layout real das listas é [A CONFIRMAR]). Linhas viram
 * registros chaveados pelo cabeçalho original; colunas desconhecidas são
 * preservadas.
 */

/** Teto operacional da importação (texto do protótipo v6.1 na T9). */
export const LIMITE_LINHAS_IMPORTACAO = 500;

export interface ListaLida {
  cabecalhos: string[];
  linhas: Array<{ numero: number; valores: Record<string, unknown> }>;
}

/**
 * Layout ou limite do arquivo importado. Estende `ErroDeArquivo` (F15,
 * RN55) para que a mensagem — que já dizia o que fazer — chegue à tela em
 * vez de virar genérica no caminho.
 */
class ErroDeLeitura extends ErroDeArquivo {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeLeitura";
  }
}
export { ErroDeLeitura };

function validarTamanho(totalLinhas: number): void {
  if (totalLinhas > LIMITE_LINHAS_IMPORTACAO) {
    throw new ErroDeLeitura(
      `A lista tem ${totalLinhas} linhas — o máximo por importação é ${LIMITE_LINHAS_IMPORTACAO}. Divida o arquivo e importe em partes.`,
    );
  }
}

/** Detecta o delimitador olhando o cabeçalho: ";" vence "," quando empata a favor do formato brasileiro. */
function detectarDelimitador(cabecalho: string): string {
  const pontoEVirgula = (cabecalho.match(/;/g) ?? []).length;
  const virgula = (cabecalho.match(/,/g) ?? []).length;
  const tabulacao = (cabecalho.match(/\t/g) ?? []).length;
  if (tabulacao > pontoEVirgula && tabulacao > virgula) return "\t";
  return pontoEVirgula >= virgula ? ";" : ",";
}

/** Divide uma linha CSV respeitando aspas duplas (RFC 4180 na prática). */
function dividirLinhaCsv(linha: string, delimitador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const caractere = linha[i];
    if (entreAspas) {
      if (caractere === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i += 1;
        } else {
          entreAspas = false;
        }
      } else {
        atual += caractere;
      }
    } else if (caractere === '"') {
      entreAspas = true;
    } else if (caractere === delimitador) {
      campos.push(atual);
      atual = "";
    } else {
      atual += caractere;
    }
  }
  campos.push(atual);
  return campos.map((campo) => campo.trim());
}

export function lerCsv(conteudo: string): ListaLida {
  // Numeração pelo ARQUIVO (linha 1 = cabeçalho): a quarentena aponta a
  // linha original, então linhas em branco pulam sem renumerar as demais.
  const linhasTexto = conteudo.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const primeiraComConteudo = linhasTexto.findIndex((linha) => linha.trim() !== "");
  const linhaDeCabecalho = primeiraComConteudo === -1 ? undefined : linhasTexto[primeiraComConteudo];
  if (linhaDeCabecalho === undefined) {
    throw new ErroDeLeitura("O arquivo está vazio.");
  }
  const delimitador = detectarDelimitador(linhaDeCabecalho);
  const cabecalhos = dividirLinhaCsv(linhaDeCabecalho, delimitador).filter(Boolean);
  if (cabecalhos.length === 0) {
    throw new ErroDeLeitura("A primeira linha do arquivo precisa ser o cabeçalho das colunas.");
  }
  validarTamanho(linhasTexto.filter((linha) => linha.trim() !== "").length - 1);

  const linhas: ListaLida["linhas"] = [];
  for (let indice = primeiraComConteudo + 1; indice < linhasTexto.length; indice += 1) {
    const linhaTexto = linhasTexto[indice];
    if (linhaTexto === undefined || linhaTexto.trim() === "") {
      continue; // linha em branco no meio/fim do arquivo
    }
    const valores = dividirLinhaCsv(linhaTexto, delimitador);
    const registro: Record<string, unknown> = {};
    cabecalhos.forEach((cabecalho, posicao) => {
      registro[cabecalho] = valores[posicao] ?? null;
    });
    if (Object.values(registro).every((valor) => !String(valor ?? "").trim())) {
      continue;
    }
    linhas.push({ numero: indice + 1, valores: registro });
  }
  return { cabecalhos, linhas };
}

export async function lerXlsx(conteudo: Buffer): Promise<ListaLida> {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.load(conteudo as unknown as ArrayBuffer);
  const aba = pasta.worksheets[0];
  if (!aba) {
    throw new ErroDeLeitura("A planilha não tem abas.");
  }

  const cabecalhos: string[] = [];
  const colunaDoCabecalho = new Map<number, string>();
  aba.getRow(1).eachCell({ includeEmpty: false }, (celula, coluna) => {
    const nome = valorDaCelula(celula.value);
    if (nome) {
      cabecalhos.push(nome);
      colunaDoCabecalho.set(coluna, nome);
    }
  });
  if (cabecalhos.length === 0) {
    throw new ErroDeLeitura("A primeira linha da planilha precisa ser o cabeçalho das colunas.");
  }
  validarTamanho(Math.max(0, aba.rowCount - 1));

  const linhas: ListaLida["linhas"] = [];
  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const registro: Record<string, unknown> = {};
    for (const [coluna, cabecalho] of colunaDoCabecalho) {
      registro[cabecalho] = valorDaCelula(aba.getRow(numero).getCell(coluna).value);
    }
    if (Object.values(registro).every((valor) => !String(valor ?? "").trim())) {
      continue;
    }
    linhas.push({ numero, valores: registro });
  }
  return { cabecalhos, linhas };
}

function valorDaCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object" && "result" in (valor as object)) {
    return String((valor as { result: unknown }).result ?? "");
  }
  if (typeof valor === "object" && "richText" in (valor as object)) {
    return (valor as { richText: Array<{ text: string }> }).richText
      .map((parte) => parte.text)
      .join("");
  }
  if (typeof valor === "object" && "text" in (valor as object)) {
    return String((valor as { text: unknown }).text ?? "");
  }
  return String(valor).trim();
}

/** Lê o arquivo pelo nome: .xlsx pela planilha, qualquer outro como CSV. */
export async function lerListaDeProspects(
  nomeArquivo: string,
  conteudo: Buffer,
): Promise<ListaLida> {
  if (/\.xlsx$/i.test(nomeArquivo)) {
    return lerXlsx(conteudo);
  }
  return lerCsv(conteudo.toString("utf-8"));
}
