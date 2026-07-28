/**
 * Leitor tabular CANÔNICO da plataforma — CSV e XLSX, colunas e linhas
 * CRUAS, chaveadas pelo cabeçalho original. Não dá significado a nada:
 * quem interpreta é o mapeador de cada módulo.
 *
 * **Extraído na F20 de `infra/assinantes/leitor-arquivo.ts`**, que nasceu
 * na F11 e era genérico desde sempre — só o nome era de assinantes. A
 * telemetria da operadora (RN67) precisa exatamente do mesmo leitor, e um
 * segundo caminho paralelo para a mesma coisa é o defeito que a disciplina
 * de generalização da RN60 existe para impedir. A extração é literal: o
 * comportamento observável é o mesmo, e `infra/assinantes/leitor-arquivo.
 * test.ts` continua verde sem uma linha alterada — é ele que prova.
 *
 * Tolerâncias documentadas:
 * - CSV: BOM removido; delimitador , ou ; detectado pelo cabeçalho; aspas
 *   duplas com escape ("") e quebras de linha dentro de aspas.
 * - XLSX: primeira aba; células numéricas viram texto; datas viram ISO.
 * - **Coluna sem nome no cabeçalho é descartada.** Na F11 era detalhe de
 *   robustez; na F20 é a primeira das higienes declaradas no prompt §3 —
 *   os dois relatórios de catálogo da operadora trazem uma coluna de
 *   índice sem nome na primeira posição, e é aqui que ela morre, antes de
 *   qualquer parser vê-la. Ver `dominio/telemetria-operadora/
 *   higienes.test.ts`, que a cobra do lado de quem depende dela.
 */

import { ErroDeArquivo } from "@/dominio/erros/falhas";
import ExcelJS from "exceljs";

export interface ArquivoTabularLido {
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

export function lerCsvTabular(conteudo: Buffer): ArquivoTabularLido {
  const texto = conteudo.toString("utf8").replace(/^﻿/, "");
  const linhasDoArquivo = linhasLogicas(texto);
  const cabecalho = linhasDoArquivo[0];
  if (!cabecalho?.trim()) {
    return { colunas: [], linhas: [] };
  }
  const delimitador = detectarDelimitador(cabecalho);
  const colunas = dividirCsv(cabecalho, delimitador).map((c) => c.trim());

  const linhas: ArquivoTabularLido["linhas"] = [];
  for (let i = 1; i < linhasDoArquivo.length; i += 1) {
    const bruta = linhasDoArquivo[i];
    if (!bruta || !bruta.trim()) {
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

export async function lerXlsxTabular(conteudo: Buffer): Promise<ArquivoTabularLido> {
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
    // Higiene 1 (prompt §3): coluna sem nome não vira coluna de dado.
    if (nome) {
      colunas.push(nome);
      colunaPorIndice.set(indice, nome);
    }
  });

  const linhas: ArquivoTabularLido["linhas"] = [];
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

/** Escolhe o leitor pela extensão (CSV ou XLSX). */
export async function lerArquivoTabular(
  nomeArquivo: string,
  conteudo: Buffer,
): Promise<ArquivoTabularLido> {
  if (/\.xlsx$/i.test(nomeArquivo)) {
    return lerXlsxTabular(conteudo);
  }
  if (/\.csv$/i.test(nomeArquivo)) {
    return lerCsvTabular(conteudo);
  }
  throw new ErroDeArquivo("Formato de arquivo não suportado: envie CSV ou XLSX.");
}
