import { describe, expect, it } from "vitest";
import { INDICE_DO_GUIA, SECAO_DE_ABERTURA } from "@/conteudo/guia-plataforma/indice";
import { MAPA_AJUDA, resolverOrigem, secaoParaOrigem } from "./mapa-contextual";

/**
 * RN59 — Contexto orienta, nunca aprisiona.
 *
 * Três frentes: o mapa abre na seção certa, a volta devolve à tela exata de
 * origem, e o caminho que chega pela URL é entrada não confiável.
 */

describe("RN59 — a ajuda abre na seção do módulo de origem (ficha §1.3)", () => {
  /** A tabela da ficha, linha por linha, pelas rotas que a implementam. */
  const casos: ReadonlyArray<readonly [string, string]> = [
    // Dashboard · Cobertura · Mapa da rede · Metas do funil → 4.5
    ["/", "j5"],
    ["/aliados/cobertura", "j5"],
    ["/aliados/mapa", "j5"],
    ["/mercado?aba=cobertura", "j5"],
    ["/mercado?aba=metas", "j5"],
    // Mercado & Scout (radar, avaliação, dossiê, ficha M1) → 4.1
    ["/mercado", "j1"],
    ["/mercado/radar", "j1"],
    ["/mercado/cmpsa123/avaliacao", "j1"],
    ["/mercado/cmpsa123/dossie", "j1"],
    // Aliados & Soluções (lista, ficha) → 4.1
    ["/aliados", "j1"],
    ["/aliados/cma1b2c3", "j1"],
    ["/aliados/novo", "j1"],
    ["/aliados/cma1b2c3/editar", "j1"],
    // Cadastro de solução · Ofertas → 4.2
    ["/aliados/cma1b2c3/solucoes/nova", "j2"],
    ["/aliados/cma1b2c3/solucoes/csol9", "j2"],
    ["/ofertas", "j2"],
    ["/ofertas/cof55/editar", "j2"],
    ["/ofertas/telemetria", "j2"],
    // Assinantes → 4.3
    ["/assinantes", "j3"],
    ["/assinantes/segmentos", "j3"],
    ["/assinantes/importacoes", "j3"],
    // Campanhas & Cestas → 4.4
    ["/campanhas", "j4"],
    ["/campanhas/ccmp1/painel", "j4"],
    ["/campanhas/cestas", "j4"],
    // Parametrizador → 4.6
    ["/parametrizador", "j6"],
    ["/parametrizador/valores", "j6"],
    // Usuários → 5
    ["/usuarios", "papeis"],
    // Aprovações · Auditoria → 3
    ["/aprovacoes", "princ"],
    ["/aprovacoes/regras", "princ"],
    ["/auditoria", "princ"],
  ];

  it.each(casos)("%s abre em #%s", (caminho, secao) => {
    expect(secaoParaOrigem(caminho)).toBe(secao);
  });

  it("a aba de Mercado decide entre 4.1 e 4.5 — o caminho sozinho não basta", () => {
    expect(secaoParaOrigem("/mercado")).toBe("j1");
    expect(secaoParaOrigem("/mercado?aba=metas")).toBe("j5");
  });

  it("toda seção do mapa existe no sumário do guia", () => {
    const conhecidas = new Set(INDICE_DO_GUIA.map((entrada) => entrada.id));
    for (const modulo of MAPA_AJUDA) {
      expect(conhecidas, `seção de ${modulo.padrao}`).toContain(modulo.secao);
    }
  });
});

describe("RN59 — módulo sem mapeamento abre na abertura, nunca em erro", () => {
  const semMapeamento = [
    "/carga-inicial", // módulo real, fora da tabela da ficha
    "/rota-que-nao-existe",
    "/",
  ] as const;

  it("a carga inicial é módulo conhecido sem seção atribuída", () => {
    expect(secaoParaOrigem("/carga-inicial")).toBe(SECAO_DE_ABERTURA);
  });

  it("caminho desconhecido abre na abertura", () => {
    expect(secaoParaOrigem("/rota-que-nao-existe")).toBe(SECAO_DE_ABERTURA);
  });

  it.each(semMapeamento)("%s nunca lança", (caminho) => {
    expect(() => secaoParaOrigem(caminho)).not.toThrow();
  });

  it("origem ausente ou vazia abre na abertura, sem volta", () => {
    for (const vazio of [null, undefined, ""]) {
      expect(secaoParaOrigem(vazio)).toBe(SECAO_DE_ABERTURA);
      expect(resolverOrigem(vazio)).toBeNull();
    }
  });
});

describe("RN59 — a volta devolve à tela exata de origem", () => {
  it("caminho válido volta com destino e rótulo do módulo", () => {
    expect(resolverOrigem("/aliados")).toEqual({
      destino: "/aliados",
      rotulo: "Aliados & Soluções",
      secao: "j1",
    });
  });

  it("rota dinâmica volta para o registro, não para a lista", () => {
    const origem = resolverOrigem("/aliados/cma1b2c3");
    expect(origem?.destino).toBe("/aliados/cma1b2c3");
  });

  it("a aba faz parte da tela e sobrevive à volta", () => {
    const origem = resolverOrigem("/mercado?aba=metas");
    expect(origem?.destino).toBe("/mercado?aba=metas");
    expect(origem?.rotulo).toBe("Mercado & Scout");
  });

  it("caminho não reconhecido não tem volta — e nenhum destino é inventado", () => {
    expect(resolverOrigem("/rota-que-nao-existe")).toBeNull();
    expect(resolverOrigem("/entrar")).toBeNull();
  });
});

describe("RN59 — o caminho de origem é entrada não confiável", () => {
  /**
   * Os dois que atravessam checagem ingênua de prefixo. `//externo.com` é
   * URL protocol-relative: o navegador a resolve como host externo, e ela
   * "começa com /". `https://externo.com` não começa com barra, mas passa
   * em qualquer teste do tipo "não contém `javascript:`".
   */
  const redirecionamentoAberto = [
    "//externo.com",
    "//externo.com/phishing",
    "https://externo.com",
    "http://externo.com/x",
  ] as const;

  it.each(redirecionamentoAberto)("%s é recusado — sem volta", (hostil) => {
    expect(resolverOrigem(hostil)).toBeNull();
    expect(secaoParaOrigem(hostil)).toBe(SECAO_DE_ABERTURA);
  });

  it.each([
    "javascript:alert(1)",
    "/\\externo.com",
    "\\\\externo.com",
    "/%2F%2Fexterno.com",
    "/aliados/../../etc/passwd",
    "aliados",
    "/aliados#j4",
  ])("%s é recusado", (hostil) => {
    expect(resolverOrigem(hostil)).toBeNull();
  });

  it("o destino é reconstruído dos segmentos, nunca ecoado", () => {
    // A query volta reserializada: o `URLSearchParams` percent-codifica, de
    // modo que o texto de saída não é o texto de entrada mesmo quando o
    // caminho é aceito.
    const origem = resolverOrigem("/aliados?busca=a%20b&ordem=nome");
    expect(origem?.destino).toBe("/aliados?busca=a+b&ordem=nome");
    expect(origem?.destino.startsWith("/aliados")).toBe(true);
  });

  it("caminho absurdamente longo ou fundo é recusado", () => {
    expect(resolverOrigem(`/aliados/${"a".repeat(200)}`)).toBeNull();
    expect(resolverOrigem(`/${"a/".repeat(20)}`)).toBeNull();
    expect(resolverOrigem(`/aliados?${"x=1&".repeat(100)}`)).toBeNull();
  });

  it("nenhum destino aceito escapa da origem do site", () => {
    // Fecha a propriedade que interessa: o que sai daqui é sempre caminho
    // relativo à raiz, então não há para onde redirecionar fora do site.
    for (const caminho of ["/", "/aliados", "/mercado?aba=metas", "/campanhas/c1/painel"]) {
      const destino = resolverOrigem(caminho)?.destino ?? "";
      expect(destino.startsWith("/")).toBe(true);
      expect(destino.startsWith("//")).toBe(false);
      expect(new URL(destino, "https://plataforma.broto.com.br").origin).toBe(
        "https://plataforma.broto.com.br",
      );
    }
  });
});
