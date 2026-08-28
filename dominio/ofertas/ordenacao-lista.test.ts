import { describe, expect, it } from "vitest";

import {
  compararNumeroAusenteAoFim,
  compararPorColuna,
  ordenarLista,
  passaFiltroTelemetria,
  semTelemetria,
  type LinhaOrdenavel,
} from "./ordenacao-lista";

function linha(parcial: Partial<LinhaOrdenavel> = {}): LinhaOrdenavel {
  return {
    titulo: "Oferta",
    aliadoNome: "Aliado",
    naturezaRotulo: "Recompensa",
    statusRotulo: "Publicada",
    emitidos: 0,
    resgExtrato: 0,
    comprasExtrato: 0,
    resgCatalogo: null,
    comprasCatalogo: null,
    temCatalogo: false,
    vigenciaFimMs: null,
    atualizadoEmMs: 0,
    ...parcial,
  };
}

describe("compararNumeroAusenteAoFim", () => {
  it("mantém a ausência sempre por último, em qualquer direção", () => {
    // asc: presente antes de ausente
    expect(compararNumeroAusenteAoFim(5, null, 1)).toBeLessThan(0);
    expect(compararNumeroAusenteAoFim(null, 5, 1)).toBeGreaterThan(0);
    // desc (fator -1): ainda assim ausente vem por último
    expect(compararNumeroAusenteAoFim(5, null, -1)).toBeLessThan(0);
    expect(compararNumeroAusenteAoFim(null, 5, -1)).toBeGreaterThan(0);
  });

  it("duas ausências empatam", () => {
    expect(compararNumeroAusenteAoFim(null, null, 1)).toBe(0);
    expect(compararNumeroAusenteAoFim(null, null, -1)).toBe(0);
  });

  it("ordena os presentes pela direção", () => {
    expect(compararNumeroAusenteAoFim(1, 2, 1)).toBeLessThan(0);
    expect(compararNumeroAusenteAoFim(1, 2, -1)).toBeGreaterThan(0);
  });
});

describe("semTelemetria e passaFiltroTelemetria", () => {
  it("reconhece a oferta sem telemetria alguma", () => {
    expect(semTelemetria(linha())).toBe(true);
    expect(semTelemetria(linha({ emitidos: 1 }))).toBe(false);
    expect(semTelemetria(linha({ temCatalogo: true, resgCatalogo: 0, comprasCatalogo: 0 }))).toBe(
      false,
    );
  });

  it("com-emissão: só ofertas com voucher emitido", () => {
    expect(passaFiltroTelemetria(linha({ emitidos: 3 }), "com-emissao")).toBe(true);
    expect(passaFiltroTelemetria(linha({ emitidos: 0 }), "com-emissao")).toBe(false);
  });

  it("com-resgate (extrato) e com-compra (extrato) leem o extrato nominal", () => {
    expect(passaFiltroTelemetria(linha({ resgExtrato: 2 }), "com-resg-extrato")).toBe(true);
    expect(passaFiltroTelemetria(linha({ resgExtrato: 0 }), "com-resg-extrato")).toBe(false);
    expect(passaFiltroTelemetria(linha({ comprasExtrato: 1 }), "com-compra-extrato")).toBe(true);
    expect(passaFiltroTelemetria(linha({ comprasExtrato: 0 }), "com-compra-extrato")).toBe(false);
  });

  it("com-resgate/compra (catálogo) tratam ausência como não-atende", () => {
    expect(passaFiltroTelemetria(linha({ resgCatalogo: 5, temCatalogo: true }), "com-resg-catalogo")).toBe(
      true,
    );
    // Ausência (null) não atende "com resgate de catálogo".
    expect(passaFiltroTelemetria(linha({ resgCatalogo: null }), "com-resg-catalogo")).toBe(false);
    // Contador importado com zero medido também não atende "com".
    expect(
      passaFiltroTelemetria(linha({ resgCatalogo: 0, temCatalogo: true }), "com-resg-catalogo"),
    ).toBe(false);
    expect(
      passaFiltroTelemetria(linha({ comprasCatalogo: 4, temCatalogo: true }), "com-compra-catalogo"),
    ).toBe(true);
    expect(passaFiltroTelemetria(linha({ comprasCatalogo: null }), "com-compra-catalogo")).toBe(
      false,
    );
  });

  it("sem-telemetria só passa quem não tem nenhuma medida", () => {
    expect(passaFiltroTelemetria(linha(), "sem-telemetria")).toBe(true);
    expect(passaFiltroTelemetria(linha({ resgExtrato: 1 }), "sem-telemetria")).toBe(false);
    expect(passaFiltroTelemetria(linha({ temCatalogo: true }), "sem-telemetria")).toBe(false);
  });
});

describe("compararPorColuna", () => {
  it("ordena texto por localeCompare pt-BR nas duas direções", () => {
    const a = linha({ titulo: "Alfa" });
    const b = linha({ titulo: "Beta" });
    expect(compararPorColuna(a, b, "titulo", "asc")).toBeLessThan(0);
    expect(compararPorColuna(a, b, "titulo", "desc")).toBeGreaterThan(0);
  });

  it("ordena por rótulo (o que a tela mostra), não pelo enum", () => {
    const a = linha({ naturezaRotulo: "Benefício (Checkout Broto)" });
    const b = linha({ naturezaRotulo: "Recompensa" });
    expect(compararPorColuna(a, b, "natureza", "asc")).toBeLessThan(0);
  });

  it("ordena os numéricos de telemetria", () => {
    const menos = linha({ emitidos: 1 });
    const mais = linha({ emitidos: 9 });
    expect(compararPorColuna(menos, mais, "emitidos", "asc")).toBeLessThan(0);
    expect(compararPorColuna(menos, mais, "emitidos", "desc")).toBeGreaterThan(0);
  });

  it("na coluna de catálogo, ausência fica por último em qualquer direção", () => {
    const com = linha({ resgCatalogo: 3, temCatalogo: true });
    const sem = linha({ resgCatalogo: null });
    expect(compararPorColuna(com, sem, "resg-catalogo", "asc")).toBeLessThan(0);
    expect(compararPorColuna(com, sem, "resg-catalogo", "desc")).toBeLessThan(0);
  });

  it("na coluna de vigência, a indeterminada fica por último", () => {
    const comFim = linha({ vigenciaFimMs: 1000 });
    const semFim = linha({ vigenciaFimMs: null });
    expect(compararPorColuna(comFim, semFim, "vigencia", "asc")).toBeLessThan(0);
    expect(compararPorColuna(comFim, semFim, "vigencia", "desc")).toBeLessThan(0);
  });
});

describe("ordenarLista", () => {
  const idem = (l: LinhaOrdenavel) => l;

  it("não muta a entrada e ordena por coluna", () => {
    const entrada = [linha({ titulo: "C" }), linha({ titulo: "A" }), linha({ titulo: "B" })];
    const copia = [...entrada];
    const saida = ordenarLista(entrada, idem, "titulo", "asc");
    expect(saida.map((l) => l.titulo)).toEqual(["A", "B", "C"]);
    expect(entrada).toEqual(copia); // intacta
  });

  it("desempata pela recência (mais recente primeiro) quando a coluna empata", () => {
    const antigo = linha({ emitidos: 5, atualizadoEmMs: 100, titulo: "antigo" });
    const novo = linha({ emitidos: 5, atualizadoEmMs: 200, titulo: "novo" });
    const saida = ordenarLista([antigo, novo], idem, "emitidos", "asc");
    expect(saida.map((l) => l.titulo)).toEqual(["novo", "antigo"]);
  });

  it("projeta itens ricos sem duplicar os campos", () => {
    type Item = { id: string; chave: LinhaOrdenavel };
    const itens: Item[] = [
      { id: "x", chave: linha({ emitidos: 1 }) },
      { id: "y", chave: linha({ emitidos: 9 }) },
    ];
    const saida = ordenarLista(itens, (i) => i.chave, "emitidos", "desc");
    expect(saida.map((i) => i.id)).toEqual(["y", "x"]);
  });
});
