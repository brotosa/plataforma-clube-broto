import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { lerArquivoAssinantes, lerCsvAssinantes } from "./leitor-arquivo";

describe("leitor CSV de assinantes (T20)", () => {
  it("lê cabeçalho e linhas com delimitador vírgula", () => {
    const lido = lerCsvAssinantes(
      Buffer.from("cpf,nome\n11144477735,Nome Sintético\n", "utf8"),
    );
    expect(lido.colunas).toEqual(["cpf", "nome"]);
    expect(lido.linhas).toEqual([
      { numero: 2, valores: { cpf: "11144477735", nome: "Nome Sintético" } },
    ]);
  });

  it("detecta ponto e vírgula, remove BOM e ignora linhas vazias", () => {
    const lido = lerCsvAssinantes(
      Buffer.from("﻿cpf;nome\n111;Nome A\n\n222;Nome B\n", "utf8"),
    );
    expect(lido.colunas).toEqual(["cpf", "nome"]);
    expect(lido.linhas.map((linha) => linha.numero)).toEqual([2, 4]);
  });

  it("respeita aspas: delimitador interno, aspas escapadas e quebra de linha", () => {
    const csv = 'cpf,endereco\n111,"Rua A, 10 — ""Sítio"" Novo\nZona Rural, Sorriso/MT"\n';
    const lido = lerCsvAssinantes(Buffer.from(csv, "utf8"));
    expect(lido.linhas).toHaveLength(1);
    expect(lido.linhas[0]?.valores.endereco).toBe(
      'Rua A, 10 — "Sítio" Novo\nZona Rural, Sorriso/MT',
    );
  });

  it("arquivo vazio devolve estrutura vazia sem lançar", () => {
    expect(lerCsvAssinantes(Buffer.from("", "utf8"))).toEqual({
      colunas: [],
      linhas: [],
    });
  });
});

describe("leitor XLSX de assinantes (T20)", () => {
  it("lê a primeira aba por cabeçalho, convertendo números e datas em texto", async () => {
    const pasta = new ExcelJS.Workbook();
    const aba = pasta.addWorksheet("Base");
    aba.addRow(["cpf", "nome", "vencimento"]);
    aba.addRow([11144477735, "Nome Sintético", new Date(Date.UTC(2026, 8, 12))]);
    const conteudo = Buffer.from(await pasta.xlsx.writeBuffer());

    const lido = await lerArquivoAssinantes("base.xlsx", conteudo);
    expect(lido.colunas).toEqual(["cpf", "nome", "vencimento"]);
    expect(lido.linhas).toEqual([
      {
        numero: 2,
        valores: {
          cpf: "11144477735",
          nome: "Nome Sintético",
          vencimento: "2026-09-12",
        },
      },
    ]);
  });

  it("recusa extensões fora de CSV/XLSX com mensagem institucional", async () => {
    await expect(
      lerArquivoAssinantes("base.pdf", Buffer.from("")),
    ).rejects.toThrow("CSV ou XLSX");
  });
});
