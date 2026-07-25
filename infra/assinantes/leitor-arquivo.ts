/**
 * Leitor dos arquivos de assinantes da T20 — "CSV ou XLSX" (protótipo
 * v6.1). O dicionário real do arquivo do comprador é [A CONFIRMAR]
 * (ficha §10): o leitor entrega colunas e linhas CRUAS, chaveadas pelo
 * cabeçalho original; quem dá significado é o mapeador de colunas.
 *
 * Tolerâncias documentadas:
 * - CSV: BOM removido; delimitador , ou ; detectado pelo cabeçalho;
 *   aspas duplas com escape ("") e quebras de linha dentro de aspas.
 * - XLSX: primeira aba; células numéricas viram texto (ver observação
 *   sobre zeros à esquerda no caso de uso); datas viram ISO.
 */

import ExcelJS from "exceljs";

export interface ArquivoAssinantesLido {
  colunas: string[];
  /** numero = linha no arquivo (cabeçalho é a 1; dados começam na 2). */
  linhas: Array<{ numero: number; valores: Record<string, string> }>;
}

function detectarDelimitador(cabecalho: string): string {
  const pontoEVirgula = (cabecalho.match(/;/g) ?? []).length;
  const virgula = (cabecalho.match(/,/g) ?? []).length;
  return pontoEVirgula > virgula ? ";" : ",";
}

/** Divide uma linha CSV respeitando aspas duplas (RFC 4180). */
function dividirCsv(linha: string, delimitador: string): string[] {
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
  return campos;
}

/** Junta linhas físicas quando uma quebra acontece dentro de aspas. */
function linhasLogicas(texto: string): string[] {
  const resultado: string[] = [];
  let atual = "";
  let aspasAbertas = 0;
  for (const linhaFisica of texto.split(/\r\n|\n|\r/)) {
    atual = atual ? `${atual}\n${linhaFisica}` : linhaFisica;
    aspasAbertas = (atual.match(/"/g) ?? []).length;
    if (aspasAbertas % 2 === 0) {
      resultado.push(atual);
      atual = "";
    }
  }
  if (atual) {
    resultado.push(atual);
  }
  return resultado;
}

export function lerCsvAssinantes(conteudo: Buffer): ArquivoAssinantesLido {
  const texto = conteudo.toString("utf8").replace(/^﻿/, "");
  const linhasDoArquivo = linhasLogicas(texto);
  if (linhasDoArquivo.length === 0 || !linhasDoArquivo[0].trim()) {
    return { colunas: [], linhas: [] };
  }
  const delimitador = detectarDelimitador(linhasDoArquivo[0]);
  const colunas = dividirCsv(linhasDoArquivo[0], delimitador).map((c) => c.trim());

  const linhas: ArquivoAssinantesLido["linhas"] = [];
  for (let i = 1; i < linhasDoArquivo.length; i += 1) {
    const bruta = linhasDoArquivo[i];
    if (!bruta.trim()) {
      continue;
    }
    const valores = dividirCsv(bruta, delimitador);
    const registro: Record<string, string> = {};
    colunas.forEach((coluna, indice) => {
      registro[coluna] = (valores[indice] ?? "").trim();
    });
    linhas.push({ numero: i + 1, valores: registro });
  }
  return { colunas, linhas };
}

function celulaComoTexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) {
    return "";
  }
  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 10);
  }
  if (typeof valor === "object") {
    if ("result" in valor) {
      return celulaComoTexto((valor as { result: ExcelJS.CellValue }).result);
    }
    if ("richText" in valor) {
      return (valor as { richText: Array<{ text: string }> }).richText
        .map((parte) => parte.text)
        .join("")
        .trim();
    }
    if ("text" in valor) {
      return String((valor as { text: string }).text).trim();
    }
    return "";
  }
  return String(valor).trim();
}

export async function lerXlsxAssinantes(conteudo: Buffer): Promise<ArquivoAssinantesLido> {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.load(conteudo as unknown as ArrayBuffer);
  const aba = pasta.worksheets[0];
  if (!aba) {
    return { colunas: [], linhas: [] };
  }
  const colunas: string[] = [];
  const colunaPorIndice = new Map<number, string>();
  aba.getRow(1).eachCell({ includeEmpty: false }, (celula, indice) => {
    const nome = celulaComoTexto(celula.value);
    if (nome) {
      colunas.push(nome);
      colunaPorIndice.set(indice, nome);
    }
  });

  const linhas: ArquivoAssinantesLido["linhas"] = [];
  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const registro: Record<string, string> = {};
    let temValor = false;
    for (const [indice, coluna] of colunaPorIndice) {
      const texto = celulaComoTexto(aba.getRow(numero).getCell(indice).value);
      registro[coluna] = texto;
      if (texto) {
        temValor = true;
      }
    }
    if (temValor) {
      linhas.push({ numero, valores: registro });
    }
  }
  return { colunas, linhas };
}

/** Escolhe o leitor pela extensão (CSV ou XLSX — T20). */
export async function lerArquivoAssinantes(
  nomeArquivo: string,
  conteudo: Buffer,
): Promise<ArquivoAssinantesLido> {
  if (/\.xlsx$/i.test(nomeArquivo)) {
    return lerXlsxAssinantes(conteudo);
  }
  if (/\.csv$/i.test(nomeArquivo)) {
    return lerCsvAssinantes(conteudo);
  }
  throw new Error("Formato de arquivo não suportado: envie CSV ou XLSX.");
}
