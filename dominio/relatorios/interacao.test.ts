import { describe, expect, it } from "vitest";

import { ASSUNTOS } from "./catalogo";
import {
  descidaDoClique,
  filtroDoClique,
  filtroJaAplicado,
  nivelSeguinte,
  rotuloDaAcaoDeClique,
  rotuloDaDescida,
} from "./interacao";

/**
 * RN91 — clicar filtra pelo catálogo.
 *
 * Os testes rodam contra os **assuntos reais**, não contra fixture: o que a
 * regra promete é sobre o catálogo que está no ar, e um catálogo de mentira
 * provaria só que a função lê o que lhe deram. Foi assim que a medição da
 * ficha achou as 34 dimensões sem operador de vazio.
 */

function campos(slug: string) {
  const achado = ASSUNTOS.find((candidato) => candidato.slug === slug);
  if (!achado) throw new Error(`assunto ${slug} não existe`);
  return achado.campos;
}

describe("filtroDoClique — o caminho normal", () => {
  it("clicar num valor vira filtro de igualdade com o valor BRUTO", () => {
    const resultado = filtroDoClique(campos("ofertas"), "oferta-natureza", "BENEFICIO");
    expect(resultado).toEqual({
      pode: true,
      filtro: { campo: "oferta-natureza", operador: "igual", valores: ["BENEFICIO"] },
    });
  });

  /**
   * O defeito que a RN91(a) nomeia. "BENEFICIO" na coluna é "Benefício
   * (Checkout Broto)" na tela; filtrar pelo rótulo não acha nada, e não achar
   * nada devolve um relatório vazio com toda a cara de resposta.
   */
  it("o rótulo da tela NÃO é o que viaja — ele nem sequer é consultado aqui", () => {
    const comRotulo = filtroDoClique(campos("ofertas"), "oferta-natureza", "Benefício");
    // A função não sabe traduzir, e é justamente por isso que quem a chama tem
    // de lhe passar o bruto: ela aceitaria o rótulo como se fosse valor.
    expect(comRotulo).toMatchObject({ pode: true });
    expect(comRotulo).not.toMatchObject({ filtro: { valores: ["BENEFICIO"] } });
  });

  it("booleano vira o texto que o molde ::boolean do compilador entende", () => {
    const resultado = filtroDoClique(campos("ofertas"), "oferta-pendente-republicacao", true);
    expect(resultado).toMatchObject({ filtro: { valores: ["true"] } });
  });

  it("número vira texto, como todo valor de filtro da definição", () => {
    const campoNumerico = campos("funil").find(
      (campo) =>
        !campo.indisponivel && campo.tipo === "NUMERO" && campo.operadores.includes("igual"),
    );
    if (!campoNumerico) return; // nenhum no catálogo hoje; o teste não inventa um
    expect(filtroDoClique(campos("funil"), campoNumerico.slug, 42)).toMatchObject({
      filtro: { valores: ["42"] },
    });
  });
});

describe("filtroDoClique — as três recusas", () => {
  it("campo fora do catálogo é RECUSADO, nunca ignorado (RN75)", () => {
    const resultado = filtroDoClique(campos("ofertas"), "campo-que-nao-existe", "x");
    expect(resultado.pode).toBe(false);
  });

  it("campo indisponível devolve o motivo do próprio catálogo (RN77)", () => {
    const comMotivo = ASSUNTOS.flatMap((a) =>
      a.campos.filter((c) => c.indisponivel).map((c) => ({ a, c })),
    )[0];
    if (!comMotivo) throw new Error("o catálogo deveria ter campo indisponível");
    const resultado = filtroDoClique(comMotivo.a.campos, comMotivo.c.slug, "x");
    expect(resultado).toEqual({ pode: false, motivo: comMotivo.c.indisponivel });
  });

  /**
   * A recusa que a medição da ficha produziu: 34 das 71 dimensões usáveis não
   * declaram `vazio`, e a RN53 obriga a lacuna a aparecer como traço.
   */
  it("lacuna em campo COM operador de vazio abre, e o filtro não leva valor", () => {
    // `ofertas.aliado-uf` declara vazio (medido).
    expect(filtroDoClique(campos("ofertas"), "aliado-uf", null)).toEqual({
      pode: true,
      filtro: { campo: "aliado-uf", operador: "vazio", valores: [] },
    });
  });

  it("lacuna em campo SEM operador de vazio recusa, e nomeia o campo", () => {
    // `ofertas.oferta-natureza` declara só igual e diferente (medido).
    const resultado = filtroDoClique(campos("ofertas"), "oferta-natureza", null);
    expect(resultado.pode).toBe(false);
    if (resultado.pode) throw new Error("deveria recusar");
    expect(resultado.motivo).toContain("ausência de valor");
  });

  it("texto vazio conta como lacuna, e não vira filtro por string vazia", () => {
    // Seria outra pergunta devolvendo outro número com a mesma cara.
    expect(filtroDoClique(campos("ofertas"), "oferta-natureza", "")).toMatchObject({
      pode: false,
    });
    expect(filtroDoClique(campos("ofertas"), "aliado-uf", "")).toMatchObject({
      filtro: { operador: "vazio" },
    });
  });

  /**
   * Recusa que a ficha NÃO previa e a implementação encontrou.
   *
   * O compilador trata `igual` sobre data como "naquele dia" — num
   * `timestamp`, `= '18/09'` só casaria com a meia-noite exata. Mas a célula
   * do pivô pode ser um instante, e o clique alargaria a seleção de um
   * instante para um dia sem dizer: o número voltaria diferente do que estava
   * na célula clicada.
   */
  it("dimensão de DATA recusa, e explica que o filtro recortaria o dia inteiro", () => {
    const campoData = ASSUNTOS.flatMap((a) =>
      a.campos.filter((c) => !c.indisponivel && c.tipo === "DATA").map((c) => ({ a, c })),
    )[0];
    if (!campoData) throw new Error("o catálogo deveria ter campo de data");
    const resultado = filtroDoClique(campoData.a.campos, campoData.c.slug, "2026-09-18T14:32:00.000Z");
    expect(resultado.pode).toBe(false);
    if (resultado.pode) throw new Error("deveria recusar");
    expect(resultado.motivo).toContain("dia inteiro");
  });
});

/**
 * A varredura que prende a medição da ficha.
 *
 * Sem ela, um campo novo sem operador de igualdade entraria no catálogo e o
 * clique passaria a recusar num ponto qualquer sem ninguém perceber — e a
 * afirmação "71 de 71" da ficha envelheceria calada.
 */
describe("o catálogo inteiro, varrido", () => {
  const dimensoes = ASSUNTOS.flatMap((a) =>
    a.campos
      .filter((c) => !c.indisponivel && ["TEXTO", "LISTA", "BOOLEANO"].includes(c.tipo))
      .map((c) => ({ a, c })),
  );

  it("há dimensões para varrer — a lista não pode ter esvaziado em silêncio", () => {
    expect(dimensoes.length).toBeGreaterThanOrEqual(71);
  });

  it("TODA dimensão de texto, lista ou booleano aceita o clique num valor", () => {
    const recusadas = dimensoes.filter(
      ({ a, c }) => !filtroDoClique(a.campos, c.slug, "valor-qualquer").pode,
    );
    expect(recusadas.map(({ a, c }) => `${a.slug}.${c.slug}`)).toEqual([]);
  });

  it("a lacuna abre em umas e recusa em outras — e as duas metades existem", () => {
    const abrem = dimensoes.filter(({ a, c }) => filtroDoClique(a.campos, c.slug, null).pode);
    const recusam = dimensoes.length - abrem.length;
    // Medido ao escrever a ficha: 37 abrem, 34 recusam. O teste não fixa os
    // números — fixa que NENHUMA das duas metades é vazia, que é a premissa
    // da regra. Se uma zerar, a recusa virou letra morta ou universal.
    expect(abrem.length).toBeGreaterThan(0);
    expect(recusam).toBeGreaterThan(0);
  });
});

describe("filtroJaAplicado", () => {
  const filtro = { campo: "aliado-uf", operador: "igual" as const, valores: ["SP"] };

  it("reconhece o repetido", () => {
    expect(filtroJaAplicado([filtro], { ...filtro })).toBe(true);
  });

  it("não confunde valores diferentes do mesmo campo", () => {
    expect(filtroJaAplicado([filtro], { ...filtro, valores: ["MG"] })).toBe(false);
  });

  it("não confunde operadores diferentes do mesmo campo", () => {
    expect(filtroJaAplicado([filtro], { ...filtro, operador: "vazio", valores: [] })).toBe(false);
  });
});

describe("rotuloDaAcaoDeClique — o nome que o teclado ouve antes de acionar", () => {
  it("diz o que vai acontecer, não só o valor", () => {
    const rotulo = rotuloDaAcaoDeClique("UF da sede", "SP", {
      pode: true,
      filtro: { campo: "aliado-uf", operador: "igual", valores: ["SP"] },
    });
    expect(rotulo).toBe("Filtrar por UF da sede: SP");
    // "SP" sozinho seria o nome de um botão que ninguém sabe que é botão.
    expect(rotulo).not.toBe("SP");
  });

  it("a lacuna tem nome próprio, e não repete o traço", () => {
    expect(
      rotuloDaAcaoDeClique("UF da sede", "—", {
        pode: true,
        filtro: { campo: "aliado-uf", operador: "vazio", valores: [] },
      }),
    ).toBe("Filtrar por UF da sede sem valor");
  });

  it("recusa também tem nome — o ponto não fica mudo", () => {
    expect(
      rotuloDaAcaoDeClique("Natureza", "—", { pode: false, motivo: "qualquer" }),
    ).toContain("não é possível filtrar");
  });
});

describe("descidaDoClique — RN92", () => {
  const ALIADOS = ASSUNTOS.find((a) => a.slug === "aliados")!;

  it("desce da UF para o município E leva o recorte junto", () => {
    const r = descidaDoClique(ALIADOS.campos, ALIADOS.hierarquias, "aliado-uf", "SP");
    expect(r).toEqual({
      pode: true,
      de: "aliado-uf",
      para: "aliado-municipio",
      rotuloDestino: expect.any(String),
      filtro: { campo: "aliado-uf", operador: "igual", valores: ["SP"] },
    });
  });

  /**
   * As duas metades são obrigatórias. Descer em "São Paulo" sem filtrar por
   * São Paulo mostraria os municípios do país inteiro — não é descer, é trocar
   * de pergunta.
   */
  it("a descida SEMPRE carrega o filtro do valor de onde se desceu", () => {
    const r = descidaDoClique(ALIADOS.campos, ALIADOS.hierarquias, "aliado-uf", "SP");
    if (!r.pode) throw new Error("deveria descer");
    expect(r.filtro.valores).toEqual(["SP"]);
  });

  it("a folha não desce", () => {
    expect(
      descidaDoClique(ALIADOS.campos, ALIADOS.hierarquias, "aliado-municipio", "Campinas").pode,
    ).toBe(false);
  });

  it("campo fora de hierarquia nenhuma não desce", () => {
    expect(descidaDoClique(ALIADOS.campos, ALIADOS.hierarquias, "aliado-nome", "X").pode).toBe(
      false,
    );
  });

  it("assunto sem hierarquia declarada não desce em campo nenhum", () => {
    const auditoria = ASSUNTOS.find((a) => a.slug === "auditoria")!;
    expect(auditoria.hierarquias).toBeUndefined();
    for (const campo of auditoria.campos) {
      expect(descidaDoClique(auditoria.campos, auditoria.hierarquias, campo.slug, "x").pode).toBe(
        false,
      );
    }
  });

  /**
   * A composição que evita duas listas de recusa. Se o valor não pode virar
   * filtro, a descida não acontece — e pelo MESMO motivo, com o mesmo texto.
   */
  it("valor que não vira filtro também não desce, e devolve o motivo do filtro", () => {
    const OFERTAS = ASSUNTOS.find((a) => a.slug === "ofertas")!;
    // `solucao-categoria` declara vazio; a lacuna desce.
    expect(
      descidaDoClique(OFERTAS.campos, OFERTAS.hierarquias, "solucao-categoria", null).pode,
    ).toBe(true);
    // Já `solucao-nome` não declara vazio: a lacuna nem filtra, nem desce.
    const semVazio = descidaDoClique(OFERTAS.campos, OFERTAS.hierarquias, "solucao-nome", null);
    expect(semVazio.pode).toBe(false);
    if (semVazio.pode) throw new Error("deveria recusar");
    expect(semVazio.motivo).toContain("ausência de valor");
  });

  it("o nome do botão diz o DESTINO, não a seta", () => {
    const r = descidaDoClique(ALIADOS.campos, ALIADOS.hierarquias, "aliado-uf", "SP");
    expect(rotuloDaDescida("SP", r)).toMatch(/^Descer para .+ em SP$/);
  });

  it("sem descida não há rótulo — o botão nem é montado", () => {
    const r = descidaDoClique(ALIADOS.campos, ALIADOS.hierarquias, "aliado-nome", "X");
    expect(rotuloDaDescida("X", r)).toBeNull();
  });
});

describe("nivelSeguinte", () => {
  const OFERTAS = ASSUNTOS.find((a) => a.slug === "ofertas")!;

  it("percorre o caminho declarado, um nível por vez", () => {
    expect(nivelSeguinte(OFERTAS.hierarquias, "solucao-categoria")?.para).toBe("solucao-nome");
    expect(nivelSeguinte(OFERTAS.hierarquias, "solucao-nome")?.para).toBe("oferta-titulo");
    expect(nivelSeguinte(OFERTAS.hierarquias, "oferta-titulo")).toBeNull();
  });

  it("hierarquia ausente devolve nulo sem quebrar", () => {
    expect(nivelSeguinte(undefined, "qualquer")).toBeNull();
  });
});
