import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import type { TabelaPivotada } from "@/dominio/relatorios/pivo";
import {
  TETO_POR_FORMATO,
  avisoDeCorte,
  levaAvisoPorDentro,
  tabelaParaTsv,
  type Procedencia,
} from "@/dominio/relatorios/saida";
import { montarDocumentoHtml } from "./saida-html";
import { montarPlanilhaXlsx } from "./saida-xlsx";

/**
 * RN83–RN85 — o que cada formato carrega.
 *
 * Os testes que mais importam aqui são os do **corte** e os do **escape**, e
 * pelo mesmo motivo de fundo: um arquivo é conferido longe de onde foi
 * pedido. Quem o abre não tem a tela ao lado para comparar, não sabe quais
 * filtros foram aplicados e não tem a quem perguntar "veio tudo?".
 */

const TABELA: TabelaPivotada = {
  dimensoes: [
    { chave: "d0", rotulo: "Aliado", papel: "LINHA", campo: "aliado-nome", tipo: "TEXTO" },
  ],
  medidas: [{ chave: "v0", rotulo: "Ofertas", campo: "oferta-titulo", tipo: "NUMERO" }],
  linhas: [
    { chaves: ["AGROMOVE"], celulas: { v0: 28 } },
    { chaves: ["Sem categoria"], celulas: { v0: null } },
    { chaves: ['Aliada "X" & <Cia>'], celulas: { v0: 3 } },
  ],
} as unknown as TabelaPivotada;

const procedencia = (mudancas: Partial<Procedencia> = {}): Procedencia => ({
  assunto: "Ofertas do Clube · por Aliado",
  filtros: ["Situação é Publicada"],
  autor: "Gestor (desenvolvimento)",
  geradoEm: new Date("2026-09-17T18:30:00.000Z"),
  linhas: 3,
  truncado: false,
  teto: TETO_POR_FORMATO.HTML,
  ...mudancas,
});

describe("RN85 — o corte é dito por dentro do arquivo", () => {
  it("sem corte, não há aviso nenhum a inventar", () => {
    expect(avisoDeCorte(procedencia())).toBeNull();
  });

  it("o aviso traz as linhas que vieram e o teto — não só 'foi cortado'", () => {
    const texto = avisoDeCorte(procedencia({ truncado: true, linhas: 5000, teto: 5000 }));
    expect(texto).toContain("5.000");
    // E oferece o caminho (RN55): recusa sem saída é pior que recusa.
    expect(texto).toMatch(/[Ee]streite/);
  });

  it("o CSV NÃO leva o aviso por dentro, e os outros três levam", () => {
    // O CSV é o formato de máquina: uma linha de aviso no topo quebraria
    // quem o consome, que é justamente para quem ele existe.
    expect(levaAvisoPorDentro("CSV")).toBe(false);
    expect(levaAvisoPorDentro("HTML")).toBe(true);
    expect(levaAvisoPorDentro("XLSX")).toBe(true);
    expect(levaAvisoPorDentro("AREA_TRANSFERENCIA")).toBe(true);
  });

  it("o HTML cortado mostra o aviso, e ele IMPRIME", () => {
    const html = montarDocumentoHtml({
      titulo: "Ofertas",
      tabela: TABELA,
      procedencia: procedencia({ truncado: true, linhas: 5000, teto: 5000 }),
    });
    expect(html).toContain("Resultado cortado");
    // A asserção que importa: o estilo do aviso não está atrás de
    // `@media screen`. Se estivesse, o papel mentiria por omissão.
    const estilo = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    const blocoDeTela = /@media\s+screen\s*\{[\s\S]*?\.corte/.test(estilo);
    expect(blocoDeTela).toBe(false);
    expect(estilo).toContain(".corte{");
  });
});

describe("RN85 — a procedência acompanha o arquivo", () => {
  it("o HTML declara assunto, autor, filtros e linhas", () => {
    const html = montarDocumentoHtml({ titulo: "Ofertas", tabela: TABELA, procedencia: procedencia() });
    expect(html).toContain("Ofertas do Clube");
    expect(html).toContain("Gestor (desenvolvimento)");
    expect(html).toContain("Situação é Publicada");
  });

  it("sem filtro, diz que é o conjunto completo — não omite a linha", () => {
    /*
     * Omitir seria ambíguo: quem recebe não saberia se não havia filtro ou
     * se a informação se perdeu. É a disciplina da RN53 aplicada ao arquivo.
     */
    const html = montarDocumentoHtml({
      titulo: "Ofertas",
      tabela: TABELA,
      procedencia: procedencia({ filtros: [] }),
    });
    expect(html).toContain("conjunto completo");
  });

  it("a finalidade aparece quando foi declarada, e só então", () => {
    const com = montarDocumentoHtml({
      titulo: "Assinantes",
      tabela: TABELA,
      procedencia: procedencia({ finalidade: "Campanha de safra 2026" }),
    });
    expect(com).toContain("Campanha de safra 2026");
    expect(com).toContain("Finalidade declarada");

    const sem = montarDocumentoHtml({ titulo: "Ofertas", tabela: TABELA, procedencia: procedencia() });
    expect(sem).not.toContain("Finalidade declarada");
  });
});

describe("o HTML não deixa o dado quebrar o documento", () => {
  it("nome de aliado com < e aspas sai escapado", () => {
    // Não é hipótese de ataque: é um nome digitado por gente. Sem escape, o
    // documento quebra sozinho.
    const html = montarDocumentoHtml({ titulo: "Ofertas", tabela: TABELA, procedencia: procedencia() });
    expect(html).toContain("&lt;Cia&gt;");
    expect(html).not.toContain("<Cia>");
  });

  it("o SVG recebido é HIGIENIZADO, e não ecoado", () => {
    /*
     * O SVG chega pelo corpo da requisição: o navegador manda o que a tela
     * desenhou, mas a ROTA recebe o que quem chamou quis mandar. Um script
     * ali sairia num documento que circula por e-mail e é aberto por outra
     * pessoa, noutro computador.
     */
    const html = montarDocumentoHtml({
      titulo: "Ofertas",
      tabela: TABELA,
      procedencia: procedencia(),
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    });
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("<script>");
    // E o desenho legítimo sobrevive — higienizar não é descartar.
    expect(html).toContain("<rect");
  });

  it("lacuna sai como traço, nunca como zero", () => {
    const html = montarDocumentoHtml({ titulo: "Ofertas", tabela: TABELA, procedencia: procedencia() });
    expect(html).toContain('<td class="vazia">—</td>');
  });
});

describe("TSV — o formato sem arquivo", () => {
  it("separa por tabulação, que é o que cola em colunas", () => {
    const tsv = tabelaParaTsv(TABELA);
    expect(tsv.split("\n")[0]).toBe("Aliado\tOfertas");
    expect(tsv.split("\n")[1]).toBe("AGROMOVE\t28");
  });

  it("lacuna vira célula vazia, e não zero", () => {
    expect(tabelaParaTsv(TABELA).split("\n")[2]).toBe("Sem categoria\t");
  });

  it("tabulação dentro de um valor não desalinha a tabela inteira", () => {
    /*
     * Sem a troca por espaço, um único valor com tabulação empurraria todas
     * as colunas seguintes daquela linha — e o estrago apareceria como dado
     * na coluna errada, que é pior que um espaçamento perdido.
     */
    const suja = {
      ...TABELA,
      linhas: [{ chaves: ["Com\ttab\nquebra"], celulas: { v0: 1 } }],
    } as unknown as TabelaPivotada;
    const linha = tabelaParaTsv(suja).split("\n")[1];
    expect(linha).toBe("Com tab quebra\t1");
  });
});

describe("XLSX — número é número, data é data", () => {
  async function abrir(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it("o número entra como número, não como texto", async () => {
    const wb = await abrir(
      await montarPlanilhaXlsx({ titulo: "Ofertas", tabela: TABELA, procedencia: procedencia() }),
    );
    const aba = wb.getWorksheet("Resultado")!;
    // Linha 1 é o cabeçalho (sem corte); a 2 é a primeira de dado.
    expect(aba.getCell(2, 2).value).toBe(28);
    expect(typeof aba.getCell(2, 2).value).toBe("number");
  });

  it("lacuna fica vazia — não vira zero na planilha", async () => {
    const wb = await abrir(
      await montarPlanilhaXlsx({ titulo: "Ofertas", tabela: TABELA, procedencia: procedencia() }),
    );
    const valor = wb.getWorksheet("Resultado")!.getCell(3, 2).value;
    expect(valor ?? null).toBeNull();
  });

  it("tem aba de procedência, com os filtros", async () => {
    const wb = await abrir(
      await montarPlanilhaXlsx({ titulo: "Ofertas", tabela: TABELA, procedencia: procedencia() }),
    );
    const aba = wb.getWorksheet("Procedência");
    expect(aba).toBeDefined();
    const textos = (aba!.getColumn(2).values as unknown[]).map((v) => String(v ?? ""));
    expect(textos.join(" ")).toContain("Situação é Publicada");
  });

  it("cortada, o aviso está ACIMA do cabeçalho na primeira aba", async () => {
    /*
     * Não basta estar na aba de procedência: para quem abre e olha a
     * primeira, uma planilha cortada que só avisa na segunda aba é uma
     * planilha completa. O aviso tem de estar onde os olhos caem.
     */
    const wb = await abrir(
      await montarPlanilhaXlsx({
        titulo: "Ofertas",
        tabela: TABELA,
        procedencia: procedencia({ truncado: true, linhas: 5000, teto: 5000 }),
      }),
    );
    const aba = wb.getWorksheet("Resultado")!;
    expect(String(aba.getCell(1, 1).value ?? "")).toContain("Resultado cortado");
    // E o cabeçalho desceu para a linha 3, com o dado a partir da 4.
    expect(aba.getCell(3, 1).value).toBe("Aliado");
  });
});
