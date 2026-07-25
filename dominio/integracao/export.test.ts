import { describe, expect, it } from "vitest";
import {
  GenericJsonCsvAdapter,
  type ItemPublicavel,
  type PacoteExport,
  calcularDiffPublicacao,
} from "./export";

function item(over: Partial<ItemPublicavel> = {}): ItemPublicavel {
  return {
    acao: "PUBLICAR",
    idOferta: "of-1",
    idExternoMinutrade: "EXT-1",
    aliado: "Aliado Exemplo",
    idSellerExterno: "SELLER-1",
    solucao: "Solução Exemplo",
    categoria: "Insumos",
    titulo: "Oferta Exemplo",
    natureza: "BENEFICIO",
    tipoBeneficio: "PCT_DESCONTO",
    mecanica: "CHECKOUT_CLUBE",
    precoDe: 100,
    precoPor: 85,
    cupomCodigoRegras: null,
    vigenciaInicio: "2026-07-01",
    vigenciaFim: null,
    status: "PUBLICADA",
    ...over,
  };
}

function pacote(itens: ItemPublicavel[]): PacoteExport {
  return { geradoEm: "2026-07-25T12:00:00.000Z", itens };
}

describe("calcularDiffPublicacao (RN10)", () => {
  it("primeira publicação: tudo é adicionado", () => {
    const diff = calcularDiffPublicacao(null, pacote([item({ idOferta: "a" }), item({ idOferta: "b" })]));
    expect(diff.adicionadas.sort()).toEqual(["a", "b"]);
    expect(diff.alteradas).toEqual([]);
    expect(diff.removidas).toEqual([]);
  });

  it("detecta alteração de conteúdo de uma oferta que permanece publicada", () => {
    const anterior = pacote([item({ idOferta: "a", precoPor: 85 })]);
    const atual = pacote([item({ idOferta: "a", precoPor: 70 })]);
    const diff = calcularDiffPublicacao(anterior, atual);
    expect(diff.alteradas).toEqual(["a"]);
    expect(diff.adicionadas).toEqual([]);
    expect(diff.removidas).toEqual([]);
  });

  it("oferta sem mudança de conteúdo não entra em alteradas", () => {
    const anterior = pacote([item({ idOferta: "a" })]);
    const atual = pacote([item({ idOferta: "a" })]);
    expect(calcularDiffPublicacao(anterior, atual)).toEqual({
      adicionadas: [],
      alteradas: [],
      removidas: [],
    });
  });

  it("oferta que saiu do conjunto publicável é 'removida' (cascata RN04)", () => {
    const anterior = pacote([item({ idOferta: "a" }), item({ idOferta: "b" })]);
    const atual = pacote([item({ idOferta: "a" })]);
    expect(calcularDiffPublicacao(anterior, atual).removidas).toEqual(["b"]);
  });

  it("itens DESPUBLICAR não contam como publicados no diff", () => {
    const anterior = pacote([item({ idOferta: "a" })]);
    const atual = pacote([
      item({ idOferta: "a" }),
      item({ idOferta: "b", acao: "DESPUBLICAR" }),
    ]);
    const diff = calcularDiffPublicacao(anterior, atual);
    expect(diff.adicionadas).toEqual([]); // 'b' é despublicação, não adição
    expect(diff.removidas).toEqual([]);
  });
});

describe("GenericJsonCsvAdapter", () => {
  const adapter = new GenericJsonCsvAdapter();

  it("gera dois arquivos: JSON e CSV com carimbo de data", () => {
    const arquivos = adapter.serializar(pacote([item()]));
    expect(arquivos.map((a) => a.nomeArquivo)).toEqual([
      "catalogo_broto_20260725.json",
      "catalogo_broto_20260725.csv",
    ]);
    expect(arquivos[0]?.tipoConteudo).toBe("application/json");
    expect(arquivos[1]?.tipoConteudo).toBe("text/csv");
  });

  it("o JSON reproduz o pacote canônico", () => {
    const original = pacote([item()]);
    const arquivos = adapter.serializar(original);
    expect(JSON.parse(arquivos[0]?.conteudo ?? "")).toEqual(original);
  });

  it("o CSV tem cabeçalho + uma linha por item, com preços formatados", () => {
    const arquivos = adapter.serializar(
      pacote([item({ precoDe: 100, precoPor: 85 }), item({ idOferta: "of-2", acao: "DESPUBLICAR" })]),
    );
    const linhas = (arquivos[1]?.conteudo ?? "").split("\r\n");
    expect(linhas[0]).toContain("acao;id_oferta;");
    expect(linhas).toHaveLength(3); // cabeçalho + 2
    expect(linhas[1]).toContain(";100.00;85.00;");
    expect(linhas[2]?.startsWith("DESPUBLICAR;of-2;")).toBe(true);
  });

  it("escapa separador, aspas e quebra de linha no CSV", () => {
    const arquivos = adapter.serializar(
      pacote([item({ titulo: 'Oferta "top"; 3x', cupomCodigoRegras: "linha1\nlinha2" })]),
    );
    const csv = arquivos[1]?.conteudo ?? "";
    expect(csv).toContain('"Oferta ""top""; 3x"');
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it("campos nulos viram vazio no CSV (nada inventado)", () => {
    const arquivos = adapter.serializar(
      pacote([item({ precoDe: null, precoPor: null, categoria: null, vigenciaFim: null })]),
    );
    const linha = (arquivos[1]?.conteudo ?? "").split("\r\n")[1] ?? "";
    // preco_de;preco_por vazios e sem invenção de valores
    expect(linha).toContain(";;");
  });
});
