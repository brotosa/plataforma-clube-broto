import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import { lerArquivoTabular, lerCsvTabular, lerXlsxTabular } from "./leitor-tabular";

/**
 * O leitor tabular canônico já é coberto de ponta a ponta por
 * `infra/assinantes/leitor-arquivo.test.ts` (a extração da F20 não mudou o
 * comportamento observável). Este arquivo cobre a recuperação que a
 * primeira importação real de "Resgate e Compras" (ago/2026) forçou:
 * célula NUMÉRICA que a operadora exportou com formato de DATA.
 */

async function comoBuffer(pasta: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await pasta.xlsx.writeBuffer());
}

describe("recuperação de número estragado por formato de data", () => {
  it("recupera o CPF de 11 dígitos que o ExcelJS coagiu a Invalid Date", async () => {
    // O defeito real: a coluna de CPF veio com `numFmt` de data e o serial
    // (um CPF) estoura a faixa de datas do JS, virando `Invalid Date`. Sem
    // a recuperação, `toISOString()` LANÇA e derruba o arquivo inteiro; com
    // ela, o número volta íntegro do `<v>` do XML.
    const pasta = new ExcelJS.Workbook();
    const aba = pasta.addWorksheet("R");
    aba.addRow(["Data", "cpf"]);
    const linha = aba.addRow([new Date(Date.UTC(2026, 7, 21)), 11144477735]);
    linha.getCell(2).numFmt = "yyyy-mm-dd hh:mm:ss.000";

    const lido = await lerXlsxTabular(await comoBuffer(pasta));

    expect(lido.colunas).toEqual(["Data", "cpf"]);
    expect(lido.linhas).toHaveLength(1);
    // O CPF volta como o inteiro cru — não vazio, não "Invalid Date".
    expect(lido.linhas[0]!.valores.cpf).toBe("11144477735");
    // E a data DE VERDADE, ao lado, continua lida como ISO: a recuperação
    // só toca a célula que o ExcelJS estragou, nunca as datas legítimas.
    expect(lido.linhas[0]!.valores.Data).toBe("2026-08-21");
  });

  it("um CPF com zero à esquerda volta como número de 10 dígitos (o zero se repõe adiante)", async () => {
    // Excel guarda CPF-como-número perdendo o zero inicial. O leitor
    // devolve o inteiro cru (10 dígitos); repor o zero é do consumidor de
    // CPF (`resolverAssinantesPorCpf`), gated pelo dígito verificador.
    const pasta = new ExcelJS.Workbook();
    const aba = pasta.addWorksheet("R");
    aba.addRow(["cpf"]);
    const linha = aba.addRow([1234567890]); // 10 dígitos: perdeu o zero
    linha.getCell(1).numFmt = "yyyy-mm-dd";

    const lido = await lerXlsxTabular(await comoBuffer(pasta));
    expect(lido.linhas[0]!.valores.cpf).toBe("1234567890");
  });

  it("data legítima segue virando ISO, sem recuperação nenhuma", async () => {
    // Guarda de não-regressão: o caminho comum de data (serial pequeno,
    // conversão válida) não passa a depender do resgate de XML.
    const pasta = new ExcelJS.Workbook();
    const aba = pasta.addWorksheet("R");
    aba.addRow(["quando"]);
    aba.addRow([new Date(Date.UTC(2026, 0, 15))]);

    const lido = await lerArquivoTabular("d.xlsx", await comoBuffer(pasta));
    expect(lido.linhas[0]!.valores.quando).toBe("2026-01-15");
  });
});

describe("CSV exportado de planilha — coluna de índice e grade vazia", () => {
  it("descarta coluna sem nome (higiene 1) e linha só de delimitadores", () => {
    // O formato do CSV real de "Resgate e Compras": uma coluna de índice
    // sem nome na frente, colunas vazias à direita e a grade preenchida
    // com dezenas de linhas ";;;;". Sem tratar, cada linha vazia virava
    // uma recusa de CPF fantasma — o defeito que o usuário reportou.
    const csv =
      [
        ";Data;cpf;Canal;;;",
        "1;21/08/2026;11144477735;web;;;",
        ";;;;;;",
        ";;;;;;",
        ";;;;;;",
      ].join("\n") + "\n";

    const lido = lerCsvTabular(Buffer.from(csv, "utf8"));
    // As colunas sem nome não entram.
    expect(lido.colunas).toEqual(["Data", "cpf", "Canal"]);
    // Só a linha com dado; as três ";;;;" ficam de fora.
    expect(lido.linhas).toHaveLength(1);
    expect(lido.linhas[0]!.valores).toEqual({
      Data: "21/08/2026",
      cpf: "11144477735",
      Canal: "web",
    });
  });
});
