import { describe, expect, it } from "vitest";

import {
  acrescentarBloco,
  alternarLargura,
  moverBloco,
  removerBloco,
  rotuloDoMovimento,
} from "./edicao-painel";
import { MAXIMO_DE_BLOCOS, type BlocoDoPainel } from "./painel";

/**
 * RN94 — os atos de edição do painel.
 *
 * O que estes testes protegem não é "o array foi reordenado": é que **cada
 * recusa existe e diz a coisa certa**. Um `moverBloco` que devolvesse o array
 * intacto em vez de recusar passaria por qualquer teste de caminho feliz, e o
 * botão ficaria sem efeito sem que nada denunciasse.
 */

function bloco(titulo: string, largura: "METADE" | "INTEIRA" = "METADE"): BlocoDoPainel {
  return {
    titulo,
    largura,
    definicao: { assunto: "ofertas", linhas: [], colunas: [], valores: [], filtros: [] },
    visualizacao: { tipo: "TABELA", ajustes: {} },
  } as unknown as BlocoDoPainel;
}

const TRES = [bloco("A"), bloco("B"), bloco("C")];

describe("moverBloco", () => {
  it("sobe uma posição e não mexe no resto", () => {
    const resultado = moverBloco(TRES, 1, "SUBIR");
    expect(resultado.pode).toBe(true);
    if (!resultado.pode) return;
    expect(resultado.blocos.map((item) => item.titulo)).toEqual(["B", "A", "C"]);
  });

  it("desce uma posição", () => {
    const resultado = moverBloco(TRES, 1, "DESCER");
    expect(resultado.pode).toBe(true);
    if (!resultado.pode) return;
    expect(resultado.blocos.map((item) => item.titulo)).toEqual(["A", "C", "B"]);
  });

  it("não muta a lista original — a tela redesenha do que voltou", () => {
    moverBloco(TRES, 1, "SUBIR");
    expect(TRES.map((item) => item.titulo)).toEqual(["A", "B", "C"]);
  });

  /**
   * A recusa que mais importa: nas pontas ele **não dá a volta**.
   *
   * Um "subir" que levasse o primeiro bloco para o fim seria a mudança mais
   * destrutiva possível num clique repetido — e num painel de doze blocos
   * ninguém perceberia de imediato.
   */
  it("recusa nas pontas, com o motivo escrito, em vez de dar a volta", () => {
    const primeiro = moverBloco(TRES, 0, "SUBIR");
    expect(primeiro.pode).toBe(false);
    if (primeiro.pode) return;
    expect(primeiro.motivo).toMatch(/primeiro/i);

    const ultimo = moverBloco(TRES, 2, "DESCER");
    expect(ultimo.pode).toBe(false);
    if (ultimo.pode) return;
    expect(ultimo.motivo).toMatch(/último/i);
  });

  it("recusa índice fora de faixa — inclusive não inteiro e negativo", () => {
    for (const indice of [-1, 3, 99, 1.5, Number.NaN]) {
      const resultado = moverBloco(TRES, indice, "SUBIR");
      expect(resultado.pode, String(indice)).toBe(false);
    }
  });
});

describe("removerBloco", () => {
  it("tira o bloco daquela posição", () => {
    const resultado = removerBloco(TRES, 1);
    expect(resultado.pode).toBe(true);
    if (!resultado.pode) return;
    expect(resultado.blocos.map((item) => item.titulo)).toEqual(["A", "C"]);
  });

  /**
   * Ficha §8.2 — o painel PODE ficar vazio.
   *
   * Recusar a remoção do último prenderia quem quer trocar todos os blocos:
   * a saída seria apagar o painel e refazê-lo, perdendo nome, visibilidade e
   * filtro.
   */
  it("permite esvaziar o painel", () => {
    const resultado = removerBloco([bloco("único")], 0);
    expect(resultado.pode).toBe(true);
    if (!resultado.pode) return;
    expect(resultado.blocos).toEqual([]);
  });

  it("recusa índice fora de faixa", () => {
    expect(removerBloco(TRES, 7).pode).toBe(false);
  });
});

describe("alternarLargura", () => {
  it("vai e volta, e só no bloco tocado", () => {
    const ida = alternarLargura(TRES, 0);
    expect(ida.pode).toBe(true);
    if (!ida.pode) return;
    expect(ida.blocos[0]?.largura).toBe("INTEIRA");
    expect(ida.blocos[1]?.largura).toBe("METADE");

    const volta = alternarLargura(ida.blocos, 0);
    expect(volta.pode).toBe(true);
    if (!volta.pode) return;
    expect(volta.blocos[0]?.largura).toBe("METADE");
  });

  it("recusa índice fora de faixa", () => {
    expect(alternarLargura(TRES, -2).pode).toBe(false);
  });
});

describe("acrescentarBloco", () => {
  it("põe no fim", () => {
    const resultado = acrescentarBloco(TRES, bloco("D"));
    expect(resultado.pode).toBe(true);
    if (!resultado.pode) return;
    expect(resultado.blocos.map((item) => item.titulo)).toEqual(["A", "B", "C", "D"]);
  });

  /**
   * O teto vale na edição, e não só na criação.
   *
   * Um teto que só valesse ao criar não é um teto: bastaria criar com um
   * bloco e acrescentar vinte, um a um, pelo "Pôr no painel".
   */
  it("recusa no teto, e a recusa NOMEIA o número (RN55)", () => {
    const cheio = Array.from({ length: MAXIMO_DE_BLOCOS }, (_, i) => bloco(`B${i}`));
    const resultado = acrescentarBloco(cheio, bloco("excedente"));
    expect(resultado.pode).toBe(false);
    if (resultado.pode) return;
    expect(resultado.motivo).toContain(String(MAXIMO_DE_BLOCOS));
  });
});

describe("rotuloDoMovimento", () => {
  /**
   * Ficha §8.3 — o caminho por teclado nasce primeiro.
   *
   * Uma seta sem nome é um botão que quem navega por teclado não consegue
   * distinguir de onze outros iguais. O rótulo diz o DESTINO, e não a seta.
   */
  it("diz para onde vai, com a posição e o total", () => {
    expect(rotuloDoMovimento(TRES, 1, "SUBIR")).toBe("Subir B para a posição 1 de 3");
    expect(rotuloDoMovimento(TRES, 1, "DESCER")).toBe("Descer B para a posição 3 de 3");
  });

  /**
   * `null` onde o movimento não existe — e a tela então NÃO monta o botão.
   *
   * Oferecer e recusar é pior que não oferecer: quem navega por teclado
   * percorreria um controle que nunca faz nada.
   */
  it("devolve null nas pontas e fora de faixa", () => {
    expect(rotuloDoMovimento(TRES, 0, "SUBIR")).toBeNull();
    expect(rotuloDoMovimento(TRES, 2, "DESCER")).toBeNull();
    expect(rotuloDoMovimento(TRES, 9, "SUBIR")).toBeNull();
  });
});
