import { describe, expect, it } from "vitest";
import {
  chaveCnpj,
  extrairCampos,
  normalizarComparavel,
  separarCategorias,
  sugerirMapeamento,
  validarMapeamento,
} from "./mapeamento";

describe("sugestão de mapeamento por cabeçalho (ponto de partida do passo 2)", () => {
  it("reconhece nomes usuais de coluna, sem depender de layout fixo", () => {
    expect(
      sugerirMapeamento(["Empresa", "Site", "CNPJ", "Segmento", "Observações"]),
    ).toEqual({
      Empresa: "NOME",
      Site: "SITE",
      CNPJ: "CNPJ",
      Segmento: "CATEGORIA",
      Observações: "IGNORAR",
    });
  });

  it("sugere NOME apenas uma vez, mesmo com colunas parecidas", () => {
    const sugestao = sugerirMapeamento(["Nome", "Nome fantasia"]);
    expect(Object.values(sugestao).filter((alvo) => alvo === "NOME")).toHaveLength(1);
  });

  it("cabeçalho desconhecido cai em IGNORAR (decisão fica com a pessoa)", () => {
    expect(sugerirMapeamento(["Coluna Nova do Layout"])).toEqual({
      "Coluna Nova do Layout": "IGNORAR",
    });
  });
});

describe("validação do mapeamento", () => {
  it("exige exatamente uma coluna para NOME", () => {
    expect(validarMapeamento({ A: "SITE" })).toContain(
      "Mapeie exatamente uma coluna para Nome de exibição.",
    );
    expect(validarMapeamento({ A: "NOME", B: "NOME" })).toContain(
      "Mapeie exatamente uma coluna para Nome de exibição.",
    );
    expect(validarMapeamento({ A: "NOME" })).toEqual([]);
  });

  it("não aceita dois destinos exclusivos iguais", () => {
    expect(validarMapeamento({ A: "NOME", B: "CNPJ", C: "CNPJ" })).toContain(
      "Mapeie no máximo uma coluna para CNPJ.",
    );
  });
});

describe("extração de campos pela configuração", () => {
  it("aplica o mapeamento escolhido e ignora o resto", () => {
    expect(
      extrairCampos(
        { Empresa: " Viasat Brasil ", Site: "https://viasat.com.br", Extra: "x" },
        { Empresa: "NOME", Site: "SITE", Extra: "IGNORAR" },
      ),
    ).toEqual({
      nomeFantasia: "Viasat Brasil",
      site: "https://viasat.com.br",
      cnpj: null,
      categoriasTexto: null,
    });
  });

  it("célula vazia vira null (ausência = pendente, nunca inventado)", () => {
    expect(extrairCampos({ Empresa: "  " }, { Empresa: "NOME" }).nomeFantasia).toBeNull();
  });
});

describe("chaves de deduplicação (CNPJ/nome)", () => {
  it("normaliza nome para comparação: caixa, acentos e espaços", () => {
    expect(normalizarComparavel("  Viasat   BRASIL ")).toBe("viasat brasil");
    expect(normalizarComparavel("Órbita Serviços")).toBe("orbita servicos");
  });

  it("chave de CNPJ tira a máscara e preserva letras (CNPJ alfanumérico)", () => {
    expect(chaveCnpj("11.222.333/0001-81")).toBe("11222333000181");
    // Alfanumérico: as letras NÃO podem cair (senão duas empresas colidiriam).
    expect(chaveCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(chaveCnpj(null)).toBe("");
  });

  it("separa múltiplas categorias por ; , / ou |", () => {
    expect(separarCategorias("Tecnologia e Software; Logística e Transporte")).toEqual([
      "Tecnologia e Software",
      "Logística e Transporte",
    ]);
    expect(separarCategorias(null)).toEqual([]);
  });
});
