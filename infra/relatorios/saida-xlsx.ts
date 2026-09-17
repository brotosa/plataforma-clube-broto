import ExcelJS from "exceljs";

import { rotularDimensao, type Celula, type TabelaPivotada } from "@/dominio/relatorios/pivo";
import { avisoDeCorte, type Procedencia } from "@/dominio/relatorios/saida";

/**
 * RN83/RN85 — o resultado como planilha de verdade.
 *
 * ## O que isto ganha sobre o CSV, e é só isto
 *
 * **Tipo.** No CSV tudo é texto, e o Excel reinterpreta ao abrir: número com
 * separador vira texto, data vira o que a configuração regional do
 * computador de quem abre decidir. Aqui número entra como número e data como
 * data, e a mesma planilha aberta em duas máquinas mostra a mesma coisa.
 *
 * Fora isso: cabeçalho congelado, largura calculada e a procedência numa aba
 * própria. Nada de fórmula, nada de gráfico, nada de formatação condicional
 * — planilha aqui é **dado**, e quem quer o desenho usa o HTML.
 *
 * ## O gráfico NÃO vai
 *
 * ExcelJS embute imagem, não SVG. Converter exigiria um rasterizador no
 * servidor — o mesmo custo que fez o PDF ficar de fora, com menos retorno,
 * porque quem abre planilha quer os números.
 *
 * ## O que este módulo não faz
 *
 * Não consulta nada: recebe tabela pronta e devolve bytes (RN83).
 */

/** Teto de largura de coluna, em caracteres. */
const LARGURA_MAXIMA = 52;
const LARGURA_MINIMA = 10;

/**
 * Quantas linhas medir para calcular a largura das colunas.
 *
 * Medir cinquenta mil linhas para descobrir a largura de uma coluna custa
 * mais que escrever a planilha. As primeiras duzentas dão uma estimativa que
 * erra pouco, e o erro é cosmético — uma coluna estreita demais se arrasta
 * com o mouse; uma exportação lenta, não.
 */
const LINHAS_PARA_MEDIR = 200;

export interface PlanilhaDeRelatorio {
  titulo: string;
  tabela: TabelaPivotada;
  procedencia: Procedencia;
}

export async function montarPlanilhaXlsx(planilha: PlanilhaDeRelatorio): Promise<Buffer> {
  const { tabela, procedencia } = planilha;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma de gestão do Clube";
  wb.created = procedencia.geradoEm;

  const aba = wb.addWorksheet("Resultado");
  const corte = avisoDeCorte(procedencia);

  const cabecalhos = [
    ...tabela.dimensoes.map((dimensao) => dimensao.rotulo),
    ...tabela.medidas.map((medida) =>
      medida.contexto ? `${medida.rotulo} · ${medida.contexto}` : medida.rotulo,
    ),
  ];

  /*
   * RN85 — o aviso de corte fica ACIMA do cabeçalho, na primeira aba.
   *
   * Na aba de procedência também, mas não só lá: uma planilha cortada que só
   * avisa numa segunda aba é, para quem abre e olha a primeira, uma planilha
   * completa. O aviso tem de estar onde os olhos caem.
   */
  let linhaDoCabecalho = 1;
  if (corte) {
    const aviso = aba.addRow([corte]);
    aviso.font = { bold: true, color: { argb: "FF8A5A00" } };
    aba.mergeCells(1, 1, 1, Math.max(1, cabecalhos.length));
    aba.addRow([]);
    linhaDoCabecalho = 3;
  }

  const linhaCabecalho = aba.addRow(cabecalhos);
  linhaCabecalho.font = { bold: true };
  linhaCabecalho.eachCell((celula) => {
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F6F2" } };
    celula.border = { bottom: { style: "thin", color: { argb: "FFE3E0D6" } } };
  });

  for (const linha of tabela.linhas) {
    const valores: Array<string | number | Date | null> = [
      ...linha.chaves.map((chave, indice) =>
        rotularDimensao(chave, tabela.dimensoes[indice]?.rotulosDeValor),
      ),
      ...tabela.medidas.map((medida) => paraCelulaDePlanilha(linha.celulas[medida.chave] ?? null)),
    ];
    aba.addRow(valores);
  }

  /*
   * Congela tudo que está acima do cabeçalho, e o próprio cabeçalho junto.
   * Com o aviso de corte, são três linhas em vez de uma — senão o aviso
   * some ao rolar, que é justamente quando a pessoa está lendo as linhas
   * que ele qualifica.
   */
  aba.views = [{ state: "frozen", ySplit: linhaDoCabecalho }];
  aba.autoFilter = {
    from: { row: linhaDoCabecalho, column: 1 },
    to: { row: linhaDoCabecalho, column: Math.max(1, cabecalhos.length) },
  };

  ajustarLarguras(aba, cabecalhos, tabela);
  montarAbaDeProcedencia(wb, planilha);

  // `Buffer.from` e não conversão de tipo: a tipagem do ExcelJS devolve o
  // Buffer do navegador, e é assim que o resto da casa já resolve isso.
  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

/**
 * Número continua número, data continua data — que é a razão de o XLSX
 * existir ao lado do CSV.
 *
 * Booleano vira "Sim"/"Não" em vez de VERDADEIRO/FALSO: é o mesmo texto que
 * a tela e o CSV já usam, e planilha que fala outro idioma da tela obriga
 * quem confere a traduzir de cabeça.
 */
function paraCelulaDePlanilha(valor: Celula): string | number | Date | null {
  if (valor === null) return null;
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (typeof valor === "number") return valor;

  const texto = String(valor);
  // ISO completo, que é como `timestamp` chega do driver. Data solta
  // ("2026-08-18") fica como texto de propósito: virar Date aqui a
  // deslocaria pelo fuso de quem abre, e a data mudaria de dia.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto)) {
    const data = new Date(texto);
    if (!Number.isNaN(data.getTime())) return data;
  }
  return texto;
}

function ajustarLarguras(
  aba: ExcelJS.Worksheet,
  cabecalhos: ReadonlyArray<string>,
  tabela: TabelaPivotada,
): void {
  const amostra = tabela.linhas.slice(0, LINHAS_PARA_MEDIR);
  cabecalhos.forEach((cabecalho, indice) => {
    let maior = cabecalho.length;
    for (const linha of amostra) {
      const ehDimensao = indice < tabela.dimensoes.length;
      const bruto = ehDimensao
        ? rotularDimensao(linha.chaves[indice] ?? null, tabela.dimensoes[indice]?.rotulosDeValor)
        : String(linha.celulas[tabela.medidas[indice - tabela.dimensoes.length]?.chave ?? ""] ?? "");
      maior = Math.max(maior, bruto.length);
    }
    aba.getColumn(indice + 1).width = Math.min(
      LARGURA_MAXIMA,
      Math.max(LARGURA_MINIMA, maior + 2),
    );
  });
}

/**
 * A aba de procedência.
 *
 * Existe porque o arquivo circula muito além de quem o pediu: vira anexo, vai
 * para pasta compartilhada, é aberto semanas depois por alguém que não sabe
 * o que foi perguntado. Sem ela, a planilha é um monte de número solto —
 * e número solto é exatamente o que se cita errado em reunião.
 */
function montarAbaDeProcedencia(wb: ExcelJS.Workbook, planilha: PlanilhaDeRelatorio): void {
  const { procedencia } = planilha;
  const aba = wb.addWorksheet("Procedência");
  aba.getColumn(1).width = 26;
  aba.getColumn(2).width = 78;

  const escrever = (termo: string, valor: string) => {
    const linha = aba.addRow([termo, valor]);
    linha.getCell(1).font = { bold: true };
    linha.getCell(2).alignment = { wrapText: true, vertical: "top" };
  };

  escrever("Relatório", planilha.titulo);
  escrever("Assunto", procedencia.assunto);
  escrever("Gerado por", procedencia.autor);
  escrever(
    "Gerado em",
    procedencia.geradoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
  );
  escrever("Linhas", procedencia.linhas.toLocaleString("pt-BR"));
  if (procedencia.finalidade) escrever("Finalidade declarada", procedencia.finalidade);
  escrever(
    "Filtros",
    procedencia.filtros.length > 0
      ? procedencia.filtros.join("\n")
      : "nenhum — conjunto completo do assunto",
  );

  const corte = avisoDeCorte(procedencia);
  if (corte) {
    const linha = aba.addRow(["Atenção", corte]);
    linha.getCell(1).font = { bold: true, color: { argb: "FF8A5A00" } };
    linha.getCell(2).font = { color: { argb: "FF8A5A00" } };
    linha.getCell(2).alignment = { wrapText: true, vertical: "top" };
  }
}
