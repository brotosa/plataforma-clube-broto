import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lerArquivoTabular } from "@/infra/planilhas/leitor-tabular";
import { detectarLayout, layoutENominal, normalizarNomeDeColuna } from "./layouts";

const RAIZ = join(import.meta.dirname, "..", "..");

/**
 * Detecção pelo CABEÇALHO (RN67; prompt §3) — nunca pelo nome do arquivo.
 *
 * Os dois casos de catálogo rodam contra as amostras REAIS de `dados/`.
 * Os dois nominais rodam contra cabeçalhos montados a partir do que a
 * ficha §3 enumera, porque arquivo nominal real não entra no repositório
 * (ficha §7) — e o que eles provam é a tolerância, já que as grafias são
 * `[A CONFIRMAR — Minutrade]`.
 */

describe("detecção de layout — amostras reais de catálogo", () => {
  it("reconhece o arquivo de sellers pelo cabeçalho", async () => {
    const conteudo = readFileSync(join(RAIZ, "dados", "Lista_de_Sellers_1.xlsx"));
    const lido = await lerArquivoTabular("Lista_de_Sellers_1.xlsx", conteudo);
    expect(detectarLayout(lido.colunas)).toEqual({ tipo: "SELLERS", motivo: null });
  });

  it("reconhece o arquivo de ofertas pelo cabeçalho", async () => {
    const conteudo = readFileSync(join(RAIZ, "dados", "Lista_de_Ofertas_3.xlsx"));
    const lido = await lerArquivoTabular("Lista_de_Ofertas_3.xlsx", conteudo);
    expect(detectarLayout(lido.colunas)).toEqual({ tipo: "OFERTAS", motivo: null });
  });

  it("o NOME do arquivo não participa da decisão", async () => {
    // O sufixo é aleatório na origem: o mesmo relatório volta como _4, _5.
    // Trocar o nome (inclusive por um que mente) não muda a leitura.
    const conteudo = readFileSync(join(RAIZ, "dados", "Lista_de_Ofertas_3.xlsx"));
    const lido = await lerArquivoTabular("Lista_de_Sellers_99.xlsx", conteudo);
    expect(detectarLayout(lido.colunas).tipo).toBe("OFERTAS");
  });

  it("os dois catálogos não se confundem, apesar de compartilharem colunas", async () => {
    const sellers = await lerArquivoTabular(
      "s.xlsx",
      readFileSync(join(RAIZ, "dados", "Lista_de_Sellers_1.xlsx")),
    );
    const ofertas = await lerArquivoTabular(
      "o.xlsx",
      readFileSync(join(RAIZ, "dados", "Lista_de_Ofertas_3.xlsx")),
    );
    // "Id do Seller" e "Seller" estão nos dois.
    expect(sellers.colunas).toContain("Id do Seller");
    expect(ofertas.colunas).toContain("Id do Seller");
    expect(detectarLayout(sellers.colunas).tipo).toBe("SELLERS");
    expect(detectarLayout(ofertas.colunas).tipo).toBe("OFERTAS");
  });
});

describe("detecção de layout — nominais [A CONFIRMAR]", () => {
  it("reconhece usuários pela coluna nativa Patrocinador mais o perfil", () => {
    const colunas = ["Nome", "CPF", "E-mail", "Patrocinador", "Perfil", "Plano"];
    expect(detectarLayout(colunas).tipo).toBe("USUARIOS");
  });

  it("reconhece resgates por produto mais a data do evento", () => {
    const colunas = ["CPF", "Data do Resgate", "Produto", "Tipo de Oferta", "Seller"];
    expect(detectarLayout(colunas).tipo).toBe("RESGATES");
  });

  it("continua reconhecendo resgates quando a operadora atender o item 2 da requisição", () => {
    // "Id da Oferta" é justamente a coluna que o item 2 pede. Se ela
    // desclassificasse o layout, a detecção quebraria no dia em que o
    // pedido fosse atendido — e nada no arquivo pareceria errado.
    const colunas = ["CPF", "Data do Resgate", "Produto", "Seller", "Id da Oferta"];
    expect(detectarLayout(colunas).tipo).toBe("RESGATES");
  });

  it("tolera variação de caixa, acento e pontuação no cabeçalho", () => {
    expect(detectarLayout(["PATROCINADOR", "PERFIL DE ASSINATURA"]).tipo).toBe("USUARIOS");
    expect(detectarLayout(["Produto", "Data do Evento:"]).tipo).toBe("RESGATES");
  });

  it("reconhece o arquivo REAL de Resgate e Compras (sem 'Produto', com Id_oferta e id_voucher)", () => {
    // Cabeçalho observado na primeira importação real (ago/2026): não tem
    // coluna "Produto" — o evento é identificado por "Tipo de Oferta" e
    // "id_voucher", e a data chama "Data da compra ou resgate".
    const colunas = [
      "Data da compra ou resgate",
      "cpf",
      "Id_Seller",
      "Id_oferta",
      "id_voucher",
      "Tipo de Oferta",
      "Valor",
      "Canal",
    ];
    expect(detectarLayout(colunas).tipo).toBe("RESGATES");
  });

  it("marca os dois nominais como portadores de dado pessoal", () => {
    expect(layoutENominal("USUARIOS")).toBe(true);
    expect(layoutENominal("RESGATES")).toBe(true);
    expect(layoutENominal("SELLERS")).toBe(false);
    expect(layoutENominal("OFERTAS")).toBe(false);
  });
});

describe("detecção de layout — recusa nomeada", () => {
  it("cabeçalho estranho não vira palpite: devolve nulo com a causa", () => {
    const deteccao = detectarLayout(["coluna a", "coluna b"]);
    expect(deteccao.tipo).toBeNull();
    expect(deteccao.motivo).toContain("não corresponde a nenhum dos quatro relatórios");
  });

  it("a mensagem de recusa não manda tentar de novo (RN55)", () => {
    const deteccao = detectarLayout(["nada", "a ver"]);
    expect(deteccao.motivo?.toLowerCase()).not.toContain("tente novamente");
    expect(deteccao.motivo?.toLowerCase()).not.toContain("tentar novamente");
  });

  it("cabeçalho vazio é recusa, não escolha do primeiro layout", () => {
    expect(detectarLayout([]).tipo).toBeNull();
  });
});

describe("normalização de nome de coluna", () => {
  it("iguala caixa, acento, pontuação final e espaço repetido", () => {
    expect(normalizarNomeDeColuna("Seller com ofertas ativas?")).toBe(
      "seller com ofertas ativas",
    );
    expect(normalizarNomeDeColuna("  CheckOut  ")).toBe("checkout");
    expect(normalizarNomeDeColuna("Preço  Final")).toBe("preco final");
  });
});
