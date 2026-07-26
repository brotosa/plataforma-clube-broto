import { describe, expect, it } from "vitest";
import { regiaoDaUf } from "@/dominio/geografia/regioes";
import {
  ALTURA_MAPA,
  LARGURA_MAPA,
  PROVENIENCIA_GEOMETRIA,
  UFS_PROJETADAS,
  raioDoMarcador,
  ufProjetada,
} from "./projecao";

/**
 * O asset de geometria é gerado por script e commitado. Estes testes são o
 * guarda-corpo: se alguém regerar o arquivo de uma fonte errada, truncar o
 * JSON ou trocar a projeção, a suíte acusa antes de a tela sair torta.
 */
describe("geometria do Brasil — asset versionado, projetado no servidor", () => {
  it("traz as 27 unidades federativas, todas com região conhecida", () => {
    expect(UFS_PROJETADAS).toHaveLength(27);
    for (const uf of UFS_PROJETADAS) {
      expect(regiaoDaUf(uf.sigla), `${uf.sigla} sem região`).not.toBeNull();
      expect(uf.nome.length).toBeGreaterThan(2);
    }
  });

  it("cada UF tem contorno real, não um marcador solto", () => {
    for (const uf of UFS_PROJETADAS) {
      expect(uf.contorno.startsWith("M"), uf.sigla).toBe(true);
      // Contorno de estado tem centenas de vértices; um retângulo desenhado
      // à mão teria uma dúzia de caracteres.
      expect(uf.contorno.length, uf.sigla).toBeGreaterThan(200);
    }
  });

  it("toda projeção cai dentro do quadro do SVG", () => {
    for (const uf of UFS_PROJETADAS) {
      expect(uf.centro.x, uf.sigla).toBeGreaterThanOrEqual(0);
      expect(uf.centro.x, uf.sigla).toBeLessThanOrEqual(LARGURA_MAPA);
      expect(uf.centro.y, uf.sigla).toBeGreaterThanOrEqual(0);
      expect(uf.centro.y, uf.sigla).toBeLessThanOrEqual(ALTURA_MAPA);
    }
  });

  it("a orientação geográfica está certa — norte em cima, leste à direita", () => {
    const am = ufProjetada("AM")!;
    const sp = ufProjetada("SP")!;
    const rs = ufProjetada("RS")!;
    const pe = ufProjetada("PE")!;

    // Amazonas fica a noroeste de São Paulo.
    expect(sp.centro.x).toBeGreaterThan(am.centro.x);
    expect(sp.centro.y).toBeGreaterThan(am.centro.y);
    // Rio Grande do Sul é o extremo sul do país.
    expect(rs.centro.y).toBe(Math.max(...UFS_PROJETADAS.map((uf) => uf.centro.y)));
    // Pernambuco fica no litoral leste, à direita de São Paulo.
    expect(pe.centro.x).toBeGreaterThan(sp.centro.x);
  });

  it("declara a proveniência da geometria — a tela exibe este texto", () => {
    expect(PROVENIENCIA_GEOMETRIA).toMatch(/Natural Earth/);
    expect(PROVENIENCIA_GEOMETRIA).toMatch(/domínio público/i);
  });

  it("sigla desconhecida não devolve UF nenhuma", () => {
    expect(ufProjetada("XX")).toBeUndefined();
  });
});

describe("raio do marcador — área proporcional ao volume", () => {
  it("volume zero não desenha marcador", () => {
    expect(raioDoMarcador(0, 10)).toBe(0);
    expect(raioDoMarcador(5, 0)).toBe(0);
  });

  it("o maior volume tem o maior raio, e cresce menos que linearmente", () => {
    const maior = raioDoMarcador(100, 100);
    const metade = raioDoMarcador(50, 100);
    expect(maior).toBeGreaterThan(metade);
    // Raio proporcional ao valor exageraria as diferenças: a metade do
    // volume deve render MAIS que a metade do raio.
    expect(metade).toBeGreaterThan(maior / 2);
  });

  it("volume mínimo ainda rende marcador visível", () => {
    expect(raioDoMarcador(1, 1000)).toBeGreaterThanOrEqual(5);
  });
});
