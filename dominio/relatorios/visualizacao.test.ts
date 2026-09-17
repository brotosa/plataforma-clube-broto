import { describe, expect, it } from "vitest";

import type { TabelaPivotada } from "./pivo";
import {
  AJUSTES_DO_TIPO,
  MAXIMO_DE_FATIAS,
  TIPOS_DE_VISUALIZACAO,
  type FormaDoResultado,
  formaDoResultado,
  marcasDoDesenho,
  tipoEfetivo,
  tiposDisponiveis,
  validarVisualizacao,
} from "./visualizacao";

/**
 * RN80–RN82 — o que o Gerador aceita desenhar, e o que ele recusa.
 *
 * Os testes que mais importam aqui são os de RECUSA, e por um motivo que vale
 * dizer: um gráfico errado não parece errado. Uma tabela com o número trocado
 * é conferível linha a linha; uma barra de altura zero no lugar de uma lacuna
 * é indistinguível de um zero verdadeiro, e ninguém vai conferir.
 */

const FORMA_BASE: FormaDoResultado = {
  dimensoes: 1,
  medidas: 1,
  linhas: 5,
  primeiraDimensaoEhData: false,
  niveisDeAtribuicaoMisturados: false,
  truncado: false,
};

const forma = (mudancas: Partial<FormaDoResultado> = {}): FormaDoResultado => ({
  ...FORMA_BASE,
  ...mudancas,
});

const servem = (f: FormaDoResultado) =>
  tiposDisponiveis(f)
    .filter((item) => item.disponivel)
    .map((item) => item.tipo);

const motivoDe = (f: FormaDoResultado, tipo: string) =>
  tiposDisponiveis(f).find((item) => item.tipo === tipo)?.motivo ?? "";

describe("RN80 — a forma do resultado decide quais tipos servem", () => {
  it("uma dimensão e uma medida: barras, colunas e rosca", () => {
    expect(servem(forma())).toEqual(["TABELA", "BARRAS", "COLUNAS", "ROSCA"]);
  });

  it("dimensão de data destrava linha e área", () => {
    expect(servem(forma({ primeiraDimensaoEhData: true }))).toContain("LINHA");
    expect(servem(forma({ primeiraDimensaoEhData: true }))).toContain("AREA");
  });

  it("sem data, linha e área são recusadas — e o motivo explica", () => {
    expect(servem(forma())).not.toContain("LINHA");
    expect(motivoDe(forma(), "LINHA")).toMatch(/continuidade/);
  });

  it("uma medida sozinha, sem dimensão nenhuma: número grande", () => {
    const so = forma({ dimensoes: 0, linhas: 1 });
    expect(servem(so)).toContain("NUMERO");
    // E os que comparam categorias saem, porque não há categoria.
    expect(servem(so)).not.toContain("BARRAS");
  });

  it("número grande é recusado quando há mais de um valor", () => {
    expect(motivoDe(forma(), "NUMERO")).toMatch(/um valor só/);
  });

  it("a TABELA nunca é recusada, em forma nenhuma", () => {
    const formas = [
      forma(),
      forma({ truncado: true }),
      forma({ medidas: 0 }),
      forma({ linhas: 0 }),
      forma({ niveisDeAtribuicaoMisturados: true }),
      forma({ dimensoes: 0, medidas: 0, linhas: 0 }),
    ];
    for (const f of formas) {
      expect(servem(f), JSON.stringify(f)).toContain("TABELA");
    }
  });
});

describe("RN82 — as recusas que impedem o desenho de mentir", () => {
  it("resultado truncado derruba TODOS os desenhos, não só um", () => {
    /*
     * A recusa é geral de propósito. Um gráfico sobre amostra cortada não é
     * aproximado — é arbitrário: o corte segue a ordenação da consulta, e a
     * maior barra pode não estar no desenho.
     */
    expect(servem(forma({ truncado: true }))).toEqual(["TABELA"]);
    expect(motivoDe(forma({ truncado: true }), "BARRAS")).toMatch(/cortado/);
  });

  it("níveis de atribuição misturados derrubam o eixo comum (RN43)", () => {
    const f = forma({ niveisDeAtribuicaoMisturados: true });
    expect(servem(f)).toEqual(["TABELA"]);
    expect(motivoDe(f, "COLUNAS")).toMatch(/níveis de atribuição/);
  });

  it("sem medida não há o que desenhar", () => {
    expect(servem(forma({ medidas: 0 }))).toEqual(["TABELA"]);
    expect(motivoDe(forma({ medidas: 0 }), "BARRAS")).toMatch(/sem um número/);
  });

  it("a rosca tem teto de fatias, e o motivo traz o número encontrado", () => {
    expect(servem(forma({ linhas: MAXIMO_DE_FATIAS }))).toContain("ROSCA");
    const demais = forma({ linhas: MAXIMO_DE_FATIAS + 1 });
    expect(servem(demais)).not.toContain("ROSCA");
    expect(motivoDe(demais, "ROSCA")).toContain(String(MAXIMO_DE_FATIAS + 1));
  });

  it("toda recusa tem motivo escrito — nenhuma é muda (RN55)", () => {
    const formas = [
      forma(),
      forma({ truncado: true }),
      forma({ medidas: 0 }),
      forma({ linhas: 0 }),
      forma({ dimensoes: 0, linhas: 1 }),
      forma({ linhas: 40 }),
      forma({ primeiraDimensaoEhData: true, linhas: 1 }),
    ];
    for (const f of formas) {
      for (const item of tiposDisponiveis(f)) {
        if (item.disponivel) continue;
        expect(item.motivo, `${item.tipo} recusado sem motivo`).toBeTruthy();
        expect(item.motivo!.length, `${item.tipo}: motivo curto demais`).toBeGreaterThan(20);
      }
    }
  });
});

describe("tipoEfetivo — cai para tabela sem perder a escolha", () => {
  it("mantém o tipo quando a forma o comporta", () => {
    expect(tipoEfetivo("BARRAS", forma())).toBe("BARRAS");
  });

  it("cai para tabela quando a forma deixa de comportar", () => {
    // O caso real: a pessoa tira a última dimensão enquanto monta.
    expect(tipoEfetivo("BARRAS", forma({ dimensoes: 0, linhas: 1 }))).toBe("TABELA");
  });
});

describe("validarVisualizacao — entrada de fora, e o JSONB guardado", () => {
  it("o que não é objeto vira o padrão", () => {
    for (const entrada of [null, undefined, 42, "BARRAS", []]) {
      expect(validarVisualizacao(entrada).tipo).toBe("TABELA");
    }
  });

  it("tipo desconhecido vira tabela, e não erro", () => {
    // Um relatório salvo pode ser aberto depois de um tipo sair do catálogo.
    expect(validarVisualizacao({ tipo: "MAPA_DE_CALOR" }).tipo).toBe("TABELA");
  });

  it("só os ajustes que o TIPO admite atravessam", () => {
    /*
     * Sem o recorte, um relatório salvo como barras e trocado para rosca
     * carregaria `orientacao` para sempre: invisível na tela, viva no JSONB,
     * e pronta para confundir quem for depurar o documento guardado.
     */
    const visual = validarVisualizacao({
      tipo: "ROSCA",
      ajustes: { orientacao: "VERTICAL", limite: 4, empilhamento: "EMPILHADO" },
    });
    expect(visual.ajustes.limite).toBe(4);
    expect(visual.ajustes.orientacao).toBeUndefined();
    expect(visual.ajustes.empilhamento).toBeUndefined();
  });

  it("limite fora da faixa é descartado, não truncado para a borda", () => {
    expect(validarVisualizacao({ tipo: "BARRAS", ajustes: { limite: 0 } }).ajustes.limite)
      .toBeUndefined();
    expect(validarVisualizacao({ tipo: "BARRAS", ajustes: { limite: 999 } }).ajustes.limite)
      .toBeUndefined();
    expect(validarVisualizacao({ tipo: "BARRAS", ajustes: { limite: "7" } }).ajustes.limite)
      .toBe(7);
  });

  it("todo tipo tem entrada em AJUSTES_DO_TIPO — nenhum fica sem decisão", () => {
    // Exaustivo por construção no tipo; esta asserção pega o caso em que
    // alguém acrescenta um tipo e esquece de decidir os ajustes dele.
    for (const tipo of TIPOS_DE_VISUALIZACAO) {
      expect(AJUSTES_DO_TIPO[tipo], tipo).toBeDefined();
    }
  });
});

describe("marcasDoDesenho — a lacuna atravessa inteira", () => {
  const tabela: TabelaPivotada = {
    dimensoes: [{ chave: "d0", rotulo: "Categoria", papel: "LINHA", campo: "c", tipo: "TEXTO" }],
    medidas: [{ chave: "v0", rotulo: "Ofertas", campo: "o", tipo: "NUMERO" }],
    linhas: [
      { chaves: ["Insumos"], celulas: { v0: 12 } },
      { chaves: ["Serviços"], celulas: { v0: null } },
      { chaves: ["Máquinas"], celulas: { v0: 30 } },
    ],
  } as unknown as TabelaPivotada;

  const rotular = (linha: TabelaPivotada["linhas"][number]) => String(linha.chaves[0]);

  it("nenhum null vira zero em nenhum ponto do caminho", () => {
    const marcas = marcasDoDesenho(tabela, { tipo: "BARRAS", ajustes: {} }, rotular);
    const servicos = marcas.find((m) => m.rotulo === "Serviços");
    expect(servicos?.valor).toBeNull();
    // A asserção que importa: não é 0, e não sumiu.
    expect(servicos?.valor).not.toBe(0);
    expect(marcas).toHaveLength(3);
  });

  it("a lacuna vai para o FIM da ordenação — ela não é 'a menor'", () => {
    const marcas = marcasDoDesenho(
      tabela,
      { tipo: "BARRAS", ajustes: { ordenar: "MENOR" } },
      rotular,
    );
    expect(marcas.map((m) => m.rotulo)).toEqual(["Insumos", "Máquinas", "Serviços"]);
  });

  it("ordena por maior valor por padrão", () => {
    const marcas = marcasDoDesenho(tabela, { tipo: "BARRAS", ajustes: {} }, rotular);
    expect(marcas.map((m) => m.rotulo)).toEqual(["Máquinas", "Insumos", "Serviços"]);
  });

  it("o limite corta CATEGORIAS, não marcas soltas", () => {
    const marcas = marcasDoDesenho(
      tabela,
      { tipo: "BARRAS", ajustes: { limite: 2 } },
      rotular,
    );
    expect(new Set(marcas.map((m) => m.rotulo))).toEqual(new Set(["Máquinas", "Insumos"]));
  });
});

describe("formaDoResultado — deriva do RESULTADO, não da definição", () => {
  it("reconhece dimensão de data pela projeção", () => {
    const tabela = {
      dimensoes: [{ chave: "d0", rotulo: "Mês", papel: "LINHA", campo: "m", tipo: "DATA" }],
      medidas: [{ chave: "v0", rotulo: "Quantos", campo: "q", tipo: "NUMERO" }],
      linhas: [{ chaves: ["2026-01"], celulas: { v0: 3 } }],
    } as unknown as TabelaPivotada;
    expect(formaDoResultado(tabela).primeiraDimensaoEhData).toBe(true);
  });

  it("truncado e níveis misturados chegam por fora, e não da tabela", () => {
    const tabela = {
      dimensoes: [],
      medidas: [],
      linhas: [],
    } as unknown as TabelaPivotada;
    const f = formaDoResultado(tabela, { truncado: true, niveisDeAtribuicaoMisturados: true });
    expect(f.truncado).toBe(true);
    expect(f.niveisDeAtribuicaoMisturados).toBe(true);
  });
});
