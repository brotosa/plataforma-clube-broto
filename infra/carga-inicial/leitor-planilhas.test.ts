import { describe, expect, it } from "vitest";
import {
  validarLinhaOferta,
  validarLinhaSeller,
  chaveAgrupamento,
} from "@/dominio/carga-inicial/mapeamento";
import { lerPlanilhaOfertas, lerPlanilhaSellers } from "./leitor-planilhas";

/**
 * O leitor é testado contra as PLANILHAS REAIS de dados/ — nenhuma
 * fixture inventada. Os números esperados vêm da própria base.
 */
describe("leitor das planilhas reais da carga inicial", () => {
  it("lê os 46 sellers com id, nome e data de entrada, sem quarentena", async () => {
    const linhas = await lerPlanilhaSellers("dados/Lista_de_Sellers_1.xlsx");
    expect(linhas).toHaveLength(46);
    for (const { campos } of linhas) {
      expect(validarLinhaSeller(campos)).toEqual([]);
      expect(campos.dataEntrada).toBeInstanceOf(Date);
    }
    // Nome com espaço à direita na planilha chega normalizado
    expect(linhas.some(({ campos }) => campos.nomeSeller === "Cyan Analytics")).toBe(true);
  });

  it("lê as 192 ofertas reais, todas válidas contra a lista de sellers", async () => {
    const [sellers, ofertas] = await Promise.all([
      lerPlanilhaSellers("dados/Lista_de_Sellers_1.xlsx"),
      lerPlanilhaOfertas("dados/Lista_de_Ofertas_3.xlsx"),
    ]);
    const idsSellers = new Set(sellers.map(({ campos }) => campos.idSellerExterno));
    expect(ofertas).toHaveLength(192);
    for (const { campos } of ofertas) {
      expect(validarLinhaOferta(campos, idsSellers)).toEqual([]);
    }
  });

  it("a heurística de agrupamento propõe 147 soluções (24 com 2+ ofertas)", async () => {
    const ofertas = await lerPlanilhaOfertas("dados/Lista_de_Ofertas_3.xlsx");
    const grupos = new Map<string, number>();
    for (const { campos } of ofertas) {
      const chave = chaveAgrupamento(campos.idSellerExterno, campos.produto);
      grupos.set(chave, (grupos.get(chave) ?? 0) + 1);
    }
    expect(grupos.size).toBe(147);
    expect([...grupos.values()].filter((quantidade) => quantidade > 1)).toHaveLength(24);
  });

  it("preserva a linha completa em dadosOriginais (tolerância a colunas futuras)", async () => {
    const linhas = await lerPlanilhaSellers("dados/Lista_de_Sellers_1.xlsx");
    const primeira = linhas[0]!;
    expect(primeira.dadosOriginais["id do seller"]).toBeTruthy();
    // Coluna que o modelo não usa, mas que fica disponível para conferência
    expect("ofertas ativas" in primeira.dadosOriginais).toBe(true);
  });
});
