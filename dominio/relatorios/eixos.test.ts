import { describe, expect, it } from "vitest";

import { ASSUNTOS, assuntoPorSlug, campoPorSlug } from "./catalogo";
import { validarEstruturaDefinicao } from "./compilador";
import {
  EIXOS_DO_PAINEL,
  type EixoDoPainel,
  aplicarFiltroDoPainel,
  avisoDeEixoNaoAplicado,
  validarFiltroDoPainel,
} from "./eixos";

/**
 * RN89 — o filtro por eixo declarado.
 *
 * O teste que mais importa aqui é o do **aviso**, e não o da aplicação.
 *
 * Que o filtro filtre é o caminho feliz, e um defeito ali aparece na hora: o
 * número não muda. Que o bloco **não filtrado avise** é o que ninguém vê
 * falhar — dois blocos lado a lado, um filtrado e outro não, parecem
 * responder à mesma pergunta, e quem olha compara os dois números.
 */

const definicao = (assunto: string) =>
  validarEstruturaDefinicao({
    assunto,
    linhas: [],
    colunas: [],
    valores: [],
    filtros: [],
  });

const assuntoDe = (slug: string) => assuntoPorSlug(slug)!;

describe("cada assunto declara eixos que EXISTEM nele", () => {
  /*
   * A cerca que impede a declaração inventada.
   *
   * Um eixo apontando para campo que não existe não quebra nada no dia em
   * que é escrito: o filtro simplesmente não é montado, ou o compilador
   * recusa a consulta inteira — e o bloco some do painel com uma mensagem
   * que ninguém liga à declaração. Isto falha na hora.
   */
  it.each(ASSUNTOS.map((assunto) => [assunto.slug, assunto] as const))(
    "%s: todo eixo declarado aponta para campo do próprio assunto",
    (_slug, assunto) => {
      for (const [eixo, campo] of Object.entries(assunto.eixos ?? {})) {
        expect(campoPorSlug(assunto, campo), `${assunto.slug}.${eixo} → ${campo}`).toBeDefined();
      }
    },
  );

  it("o eixo PERÍODO só aponta para campo de DATA", () => {
    // Um período sobre campo de texto compararia string, e o resultado seria
    // plausível e errado — que é pior que um erro.
    for (const assunto of ASSUNTOS) {
      const campo = assunto.eixos?.PERIODO;
      if (!campo) continue;
      expect(campoPorSlug(assunto, campo)?.tipo, `${assunto.slug} → ${campo}`).toBe("DATA");
    }
  });

  it("Assinantes NÃO declara Período — é o caso que prova o desenho", () => {
    /*
     * A única data dela é `as-vencimento`, que é FUTURA. Amarrá-la a um eixo
     * que na Auditoria significa "quando aconteceu" produziria dois filtros
     * com o mesmo rótulo e sentidos opostos.
     *
     * Se alguém a declarar um dia, este teste é o lugar de discutir — não o
     * código que quebrou depois.
     */
    expect(assuntoDe("assinantes").eixos?.PERIODO).toBeUndefined();
    expect(assuntoDe("assinantes").eixos?.UF).toBe("as-uf");
  });

  it("Ofertas NÃO declara UF — sede do aliado não é abrangência da oferta (RN52)", () => {
    // O único campo de UF do assunto é a UF da SEDE DO ALIADO, emprestada de
    // outra entidade. Declará-la faria o painel dizer "MT" significando
    // "ofertas de aliados sediados em MT".
    expect(assuntoDe("ofertas").eixos?.UF).toBeUndefined();
    expect(assuntoDe("ofertas").eixos?.PERIODO).toBe("oferta-vigencia-inicio");
  });
});

describe("aplicarFiltroDoPainel — estreita o bloco, nunca o substitui", () => {
  it("sem filtro, a definição volta intacta", () => {
    const original = definicao("auditoria");
    const { definicao: saida, naoAplicados } = aplicarFiltroDoPainel(
      original,
      assuntoDe("auditoria"),
      null,
    );
    expect(saida).toBe(original);
    expect(naoAplicados).toEqual([]);
  });

  it("o período vira dois filtros no campo declarado", () => {
    const { definicao: saida, naoAplicados } = aplicarFiltroDoPainel(
      definicao("auditoria"),
      assuntoDe("auditoria"),
      { periodo: { de: "2026-01-01", ate: "2026-03-31" } },
    );
    expect(naoAplicados).toEqual([]);
    expect(saida.filtros).toHaveLength(2);
    expect(saida.filtros.every((filtro) => filtro.campo === "au-data")).toBe(true);
  });

  it("a UF vira UM filtro com vários valores, e não vários filtros", () => {
    /*
     * Vários filtros de igualdade sobre o mesmo campo produziriam um E entre
     * eles, e nenhuma linha é de duas UFs ao mesmo tempo: o bloco voltaria
     * sempre vazio. O compilador já trata lista como "qualquer um destes".
     */
    const { definicao: saida } = aplicarFiltroDoPainel(
      definicao("aliados"),
      assuntoDe("aliados"),
      { uf: ["MT", "GO"] },
    );
    expect(saida.filtros).toHaveLength(1);
    expect(saida.filtros[0]?.valores).toEqual(["MT", "GO"]);
  });

  it("os filtros do painel ENTRAM depois dos do bloco — não os apagam", () => {
    // Um filtro de painel que substituísse o do bloco faria o bloco responder
    // outra pergunta, com o mesmo título.
    const comFiltroProprio = validarEstruturaDefinicao({
      assunto: "aliados",
      linhas: [],
      colunas: [],
      valores: [],
      filtros: [{ campo: "aliado-estagio", operador: "igual", valores: ["ALIADA_ATIVA"] }],
    });
    const { definicao: saida } = aplicarFiltroDoPainel(
      comFiltroProprio,
      assuntoDe("aliados"),
      { uf: ["MT"] },
    );
    expect(saida.filtros).toHaveLength(2);
    expect(saida.filtros[0]?.campo).toBe("aliado-estagio");
  });
});

describe("o que NÃO se aplica é declarado — a parte que ninguém vê falhar", () => {
  it("período num assunto que não o declara volta como não aplicado", () => {
    const { definicao: saida, naoAplicados } = aplicarFiltroDoPainel(
      definicao("assinantes"),
      assuntoDe("assinantes"),
      { periodo: { de: "2026-01-01" } },
    );
    expect(naoAplicados).toEqual(["PERIODO"]);
    // E o essencial: NENHUM filtro foi inventado para caber.
    expect(saida.filtros).toHaveLength(0);
  });

  it("UF num assunto sem UF volta como não aplicada", () => {
    const { naoAplicados } = aplicarFiltroDoPainel(definicao("campanhas"), assuntoDe("campanhas"), {
      uf: ["MT"],
    });
    expect(naoAplicados).toEqual(["UF"]);
  });

  it("um eixo pega e o outro não — e o aviso diz QUAL", () => {
    /*
     * O caso que mais engana. Em Assinantes, a UF filtra e o período não:
     * dizer "o filtro não se aplica" seria falso, e dizer nada seria pior.
     */
    const { definicao: saida, naoAplicados } = aplicarFiltroDoPainel(
      definicao("assinantes"),
      assuntoDe("assinantes"),
      { periodo: { de: "2026-01-01" }, uf: ["MT"] },
    );
    expect(naoAplicados).toEqual(["PERIODO"]);
    expect(saida.filtros).toHaveLength(1);
    expect(avisoDeEixoNaoAplicado(naoAplicados)).toContain("Período");
    expect(avisoDeEixoNaoAplicado(naoAplicados)).not.toContain("UF");
  });

  it("sem eixo não aplicado, não há aviso a inventar", () => {
    expect(avisoDeEixoNaoAplicado([])).toBeNull();
  });

  it("o aviso diz que os números são do CONJUNTO INTEIRO, não só que falhou", () => {
    // "Não se aplica" sozinho deixaria a pessoa sem saber o que está vendo.
    const texto = avisoDeEixoNaoAplicado(["PERIODO", "UF"]);
    expect(texto).toContain("conjunto inteiro");
    expect(texto).toContain("Período");
    expect(texto).toContain("UF");
  });
});

describe("validarFiltroDoPainel — entrada de fora", () => {
  it("o que não é objeto vira ausência de filtro", () => {
    for (const entrada of [null, undefined, 42, "periodo", []]) {
      expect(validarFiltroDoPainel(entrada)).toBeNull();
    }
  });

  it("data em formato estranho é descartada, não repassada", () => {
    expect(validarFiltroDoPainel({ periodo: { de: "01/01/2026" } })).toBeNull();
    expect(validarFiltroDoPainel({ periodo: { de: "2026-01-01" } })?.periodo?.de).toBe("2026-01-01");
  });

  it("UF fora do formato é descartada", () => {
    expect(validarFiltroDoPainel({ uf: ["MT", "minas", "", 7] })?.uf).toEqual(["MT"]);
  });

  it("todo eixo do conjunto fechado tem rótulo", () => {
    for (const eixo of EIXOS_DO_PAINEL) {
      expect(avisoDeEixoNaoAplicado([eixo as EixoDoPainel])).toBeTruthy();
    }
  });
});
