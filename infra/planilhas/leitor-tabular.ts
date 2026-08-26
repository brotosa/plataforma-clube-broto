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
import JSZip from "jszip";

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
    // Célula de data malformada no arquivo real vira `Invalid Date`, e
    // `toISOString()` sobre ela LANÇA — o que derrubava a importação
    // inteira com erro genérico em vez de recusar a linha pela causa
    // nomeada (RN55). Data ilegível é texto vazio: o parser de cada
    // relatório então a trata como valor ausente, sem crashar o arquivo.
    return Number.isNaN(valor.getTime()) ? "" : valor.toISOString().slice(0, 10);
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

/**
 * Recupera do XML CRU os valores numéricos que o ExcelJS estraga na leitura.
 *
 * **Por que existe.** O ExcelJS decide que uma célula é data pelo formato de
 * número (`numFmt`) e, na hora de carregar, converte o serial para `Date` —
 * descartando o número original. Quando o serial é grande demais para uma
 * data (um CPF de 11 dígitos, por exemplo), a conversão estoura em
 * `Invalid Date` e o valor verdadeiro **some**. Foi exatamente o que a
 * primeira exportação real de "Resgate e Compras" trouxe: a coluna de CPF
 * veio com formato `yyyy-mm-dd hh:mm:ss`, herança de estilo, e todo CPF
 * virava `Invalid Date`.
 *
 * O número certo continua íntegro no `<v>` do XML — é ele que este mapa
 * resgata, chaveado por endereço de célula (ex.: "C2"), **só para células
 * numéricas** (sem atributo `t` ou `t="n"`; nunca texto). O leitor o
 * consulta apenas quando o ExcelJS entregou `Invalid Date`, então datas de
 * verdade e qualquer outra célula passam intocadas.
 *
 * É best-effort: qualquer falha ao abrir o zip devolve mapa vazio, e o
 * leitor cai no comportamento anterior (célula vira texto vazio) sem quebrar.
 */
async function seriaisNumericosBrutos(conteudo: Buffer): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    const zip = await JSZip.loadAsync(conteudo);

    // Resolve o arquivo da primeira aba pelo rel do workbook — o nome
    // `sheet1.xml` é convenção, não garantia.
    const workbookXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
    const primeiroRid = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
    const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
    const alvoDoRel = primeiroRid
      ? new RegExp(`Id="${primeiroRid}"[^>]*Target="([^"]+)"`).exec(relsXml)?.[1]
      : undefined;
    const alvo = alvoDoRel ?? relsXml.match(/Target="(worksheets\/sheet[^"]+)"/)?.[1];
    const caminhoAba = alvo
      ? alvo.startsWith("/")
        ? alvo.slice(1)
        : `xl/${alvo.replace(/^\.\//, "")}`
      : "xl/worksheets/sheet1.xml";

    const sheetXml = (await zip.file(caminhoAba)?.async("string")) ?? "";
    // `<c r="C2" s="1"><v>123</v></c>` e a forma auto-fechada `<c .../>`.
    const celulas = sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs);
    for (const [, atributosBrutos, corpo] of celulas) {
      const atributos = atributosBrutos ?? "";
      const ref = atributos.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const tipo = atributos.match(/\bt="([^"]+)"/)?.[1];
      // Só numéricas: célula de texto guarda em `<v>` o índice da string
      // compartilhada, não o dado — resgatá-lo seria corromper.
      if (tipo && tipo !== "n") continue;
      const valor = corpo?.match(/<v>(.*?)<\/v>/s)?.[1];
      if (valor) mapa.set(ref, valor);
    }
  } catch {
    // Best-effort: sem o resgate, o leitor mantém o comportamento anterior.
  }
  return mapa;
}

export async function lerXlsxTabular(conteudo: Buffer): Promise<ArquivoTabularLido> {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.load(conteudo as unknown as ArrayBuffer);
  const aba = pasta.worksheets[0];
  if (!aba) {
    return { colunas: [], linhas: [] };
  }
  const seriaisBrutos = await seriaisNumericosBrutos(conteudo);
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
      const celula = aba.getRow(numero).getCell(indice);
      let texto = celulaComoTexto(celula.value);
      // O ExcelJS coagiu um número a `Invalid Date` (célula numérica com
      // formato de data e serial fora de faixa): recupera o número cru do
      // XML, que ele descartou. Ver `seriaisNumericosBrutos`.
      if (!texto && celula.value instanceof Date && Number.isNaN(celula.value.getTime())) {
        texto = seriaisBrutos.get(celula.address) ?? "";
      }
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
