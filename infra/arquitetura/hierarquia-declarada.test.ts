import { describe, expect, it } from "vitest";

import { ASSUNTOS } from "@/dominio/relatorios/catalogo";
import { filtroDoClique, nivelSeguinte } from "@/dominio/relatorios/interacao";

/**
 * Cerca da RN92 — hierarquia declarada tem de ser hierarquia que funciona.
 *
 * **A regra diz que declarar a hierarquia errada é pior que não declarar
 * nenhuma**, porque ela passa a parecer oficial: quem lê o caminho no catálogo
 * conclui que aquela é a leitura correta do negócio. Este arquivo mecaniza
 * exatamente essa frase — o que ele não deixa passar é a declaração que
 * *parece* certa e não desce.
 *
 * Quebra o build, não avisa.
 */

const declaradas = ASSUNTOS.flatMap((assunto) =>
  (assunto.hierarquias ?? []).map((hierarquia) => ({ assunto, hierarquia })),
);

describe("RN92 — as hierarquias declaradas", () => {
  /*
   * Anti-cegueira. Todas as asserções abaixo varrem uma lista; se a lista
   * esvaziar — alguém renomeia o campo `hierarquias`, ou o catálogo perde as
   * declarações — elas passariam todas sem examinar nada.
   */
  it("existem, e cobrem os assuntos que foram decididos", () => {
    expect(declaradas.length).toBeGreaterThanOrEqual(4);
    const comHierarquia = [...new Set(declaradas.map(({ assunto }) => assunto.slug))].sort();
    expect(comHierarquia).toEqual(["aliados", "assinantes", "ofertas"]);
  });

  it("cada nível é um campo QUE EXISTE no próprio assunto", () => {
    const fantasmas: string[] = [];
    for (const { assunto, hierarquia } of declaradas) {
      for (const nivel of hierarquia.niveis) {
        if (!assunto.campos.some((campo) => campo.slug === nivel)) {
          fantasmas.push(`${assunto.slug}.${hierarquia.chave} → ${nivel}`);
        }
      }
    }
    expect(fantasmas).toEqual([]);
  });

  it("nenhum nível é campo indisponível (RN77)", () => {
    const apagados: string[] = [];
    for (const { assunto, hierarquia } of declaradas) {
      for (const nivel of hierarquia.niveis) {
        const campo = assunto.campos.find((candidato) => candidato.slug === nivel);
        if (campo?.indisponivel) apagados.push(`${assunto.slug}.${hierarquia.chave} → ${nivel}`);
      }
    }
    expect(apagados).toEqual([]);
  });

  /**
   * Descer é trocar a dimensão **e** recortar o valor de onde se desceu. Um
   * nível que não pode virar filtro faria a descida mostrar tudo — que não é
   * descer, é trocar de pergunta.
   */
  it("todo nível NÃO-FOLHA pode virar filtro, senão a descida não recorta", () => {
    const semRecorte: string[] = [];
    for (const { assunto, hierarquia } of declaradas) {
      for (const nivel of hierarquia.niveis.slice(0, -1)) {
        if (!filtroDoClique(assunto.campos, nivel, "valor-qualquer").pode) {
          semRecorte.push(`${assunto.slug}.${hierarquia.chave} → ${nivel}`);
        }
      }
    }
    expect(semRecorte).toEqual([]);
  });

  it("tem pelo menos dois níveis — um nível só não é caminho", () => {
    const curtas = declaradas
      .filter(({ hierarquia }) => hierarquia.niveis.length < 2)
      .map(({ assunto, hierarquia }) => `${assunto.slug}.${hierarquia.chave}`);
    expect(curtas).toEqual([]);
  });

  it("não repete campo dentro do mesmo caminho", () => {
    const ciclos = declaradas
      .filter(({ hierarquia }) => new Set(hierarquia.niveis).size !== hierarquia.niveis.length)
      .map(({ assunto, hierarquia }) => `${assunto.slug}.${hierarquia.chave}`);
    expect(ciclos).toEqual([]);
  });

  /**
   * Um campo em duas hierarquias do mesmo assunto tornaria `nivelSeguinte`
   * dependente da ORDEM de declaração — a descida iria para um lugar ou outro
   * conforme quem editou o arquivo por último. É o tipo de defeito que não se
   * enxerga lendo o resultado.
   */
  it("nenhum campo aparece em duas hierarquias do mesmo assunto", () => {
    const ambiguos: string[] = [];
    for (const assunto of ASSUNTOS) {
      const vistos = new Map<string, string>();
      for (const hierarquia of assunto.hierarquias ?? []) {
        for (const nivel of hierarquia.niveis) {
          const antes = vistos.get(nivel);
          if (antes) ambiguos.push(`${assunto.slug}.${nivel} (${antes} e ${hierarquia.chave})`);
          else vistos.set(nivel, hierarquia.chave);
        }
      }
    }
    expect(ambiguos).toEqual([]);
  });

  it("a folha não desce, e os demais níveis descem", () => {
    for (const { assunto, hierarquia } of declaradas) {
      const folha = hierarquia.niveis[hierarquia.niveis.length - 1]!;
      expect(nivelSeguinte(assunto.hierarquias, folha)).toBeNull();
      for (const nivel of hierarquia.niveis.slice(0, -1)) {
        expect(nivelSeguinte(assunto.hierarquias, nivel), `${assunto.slug}.${nivel}`).not.toBeNull();
      }
    }
  });

  /**
   * O que NÃO foi declarado, declarado como não declarado.
   *
   * `ofertas` tem `aliado-uf` e **não** tem `aliado-municipio` — a geografia
   * ali não existe, e a ausência é achado, não esquecimento. Sem este teste,
   * alguém acrescentaria o município ao assunto um dia e ninguém lembraria de
   * que havia um caminho esperando por ele.
   */
  it("ofertas não tem hierarquia de geografia, porque não tem município", () => {
    const ofertas = ASSUNTOS.find((assunto) => assunto.slug === "ofertas")!;
    expect(ofertas.campos.some((campo) => campo.slug === "aliado-municipio")).toBe(false);
    expect((ofertas.hierarquias ?? []).map((h) => h.chave)).toEqual(["portfolio"]);
  });
});
