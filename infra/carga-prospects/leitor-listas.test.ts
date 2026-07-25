import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  LIMITE_LINHAS_IMPORTACAO,
  lerCsv,
  lerListaDeProspects,
} from "./leitor-listas";

describe("leitor tolerante de listas de prospects (T9)", () => {
  it("lê CSV com ponto e vírgula (formato usual do Excel brasileiro)", () => {
    const lista = lerCsv("Empresa;Site;Segmento\nViasat Brasil;https://viasat.com.br;Tecnologia e Software\n");
    expect(lista.cabecalhos).toEqual(["Empresa", "Site", "Segmento"]);
    expect(lista.linhas).toHaveLength(1);
    expect(lista.linhas[0]).toEqual({
      numero: 2,
      valores: {
        Empresa: "Viasat Brasil",
        Site: "https://viasat.com.br",
        Segmento: "Tecnologia e Software",
      },
    });
  });

  it("lê CSV com vírgula e campo entre aspas contendo o delimitador", () => {
    const lista = lerCsv('Empresa,Cidade\n"Empresa, com vírgula",Curitiba\n');
    expect(lista.linhas[0]?.valores["Empresa"]).toBe("Empresa, com vírgula");
  });

  it("ignora linhas em branco preservando o número original (quarentena aponta a linha certa)", () => {
    const lista = lerCsv("Empresa\nPrimeira\n\nSegunda\n");
    expect(lista.linhas.map((linha) => linha.numero)).toEqual([2, 4]);
    expect(lista.linhas.map((linha) => linha.valores["Empresa"])).toEqual([
      "Primeira",
      "Segunda",
    ]);
  });

  it("recusa arquivo acima do teto de linhas por importação", () => {
    const linhas = Array.from(
      { length: LIMITE_LINHAS_IMPORTACAO + 5 },
      (_, i) => `Linha ${i}`,
    );
    const csv = `Empresa\n${linhas.join("\n")}\n`;
    expect(() => lerCsv(csv)).toThrow(/máximo por importação/);
  });

  it("lê XLSX pela primeira aba, chaveando pelo cabeçalho", async () => {
    const pasta = new ExcelJS.Workbook();
    const aba = pasta.addWorksheet("Prospects");
    aba.addRow(["Empresa", "Site"]);
    aba.addRow(["Viasat Brasil", "https://viasat.com.br"]);
    const conteudo = Buffer.from(await pasta.xlsx.writeBuffer());

    const lista = await lerListaDeProspects("prospects.xlsx", conteudo);
    expect(lista.cabecalhos).toEqual(["Empresa", "Site"]);
    expect(lista.linhas[0]?.valores["Empresa"]).toBe("Viasat Brasil");
  });

  it("arquivo sem linhas de dados não explode o leitor (decisão fica no caso de uso)", () => {
    const lista = lerCsv("Empresa;Site\n");
    expect(lista.linhas).toEqual([]);
  });
});
