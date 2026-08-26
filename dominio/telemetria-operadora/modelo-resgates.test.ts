import { describe, expect, it } from "vitest";
import { CABECALHO_MODELO_RESGATES, gerarModeloResgatesCsv } from "./modelo-resgates";
import { detectarLayout } from "./layouts";
import { classificarEvento } from "./tipo-de-evento";

describe("modelo de referência do relatório de resgates da operadora", () => {
  const csv = gerarModeloResgatesCsv();
  const linhas = csv.trim().split(/\r?\n/);
  const cabecalho = linhas[0]!.split(";");

  it("o cabeçalho do modelo é o formato real, e é detectado como RESGATES", () => {
    expect(cabecalho).toEqual([...CABECALHO_MODELO_RESGATES]);
    // A cerca do requisito: o modelo mostra exatamente o layout que o
    // importador reconhece — baixar a referência e conferir tem de bater.
    expect(detectarLayout(cabecalho).tipo).toBe("RESGATES");
  });

  it("traz um exemplo de resgate e um de compra (classificação pela leitura)", () => {
    const idxTipo = cabecalho.indexOf("Tipo de Oferta");
    const tipos = linhas.slice(1).map((l) => l.split(";")[idxTipo]!);
    const classes = tipos.map(classificarEvento);
    expect(classes).toContain("RESGATE");
    expect(classes).toContain("COMPRA");
  });

  it("o CPF de exemplo é sintético (dígitos repetidos), nunca de pessoa real", () => {
    expect(csv).toContain("111.111.111-11");
  });
});
