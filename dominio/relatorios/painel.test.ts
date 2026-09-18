import { describe, expect, it } from "vitest";

import { ErroDeRelatorioInvalido } from "./compilador";
import { MAXIMO_DE_BLOCOS, validarBlocos, validarPainelParaGravar } from "./painel";

/**
 * RN86–RN88 — o que o painel aceita guardar e o que aceita abrir.
 *
 * As duas funções são de propósito **assimétricas**, e é isso que os testes
 * daqui provam: gravar é rígido, abrir é tolerante.
 *
 * Gravar acontece com a pessoa na tela, podendo corrigir — recusar ali é
 * barato. Abrir acontece um mês depois, talvez com outra pessoa, talvez com
 * o catálogo já mudado: recusar o painel inteiro nesse momento tiraria dela
 * os onze blocos que continuam bons por causa de um que não.
 */

const DEFINICAO = {
  assunto: "ofertas",
  linhas: ["aliado-nome"],
  colunas: [],
  valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
  filtros: [],
};

const bloco = (mudancas: Record<string, unknown> = {}) => ({
  titulo: "Ofertas por aliado",
  definicao: DEFINICAO,
  visualizacao: { tipo: "BARRAS", ajustes: {} },
  largura: "METADE",
  ...mudancas,
});

describe("validarPainelParaGravar — rígido, porque a pessoa está na tela", () => {
  it("aceita um painel bem montado", () => {
    const painel = validarPainelParaGravar({ nome: "Segunda-feira", blocos: [bloco()] });
    expect(painel.nome).toBe("Segunda-feira");
    expect(painel.blocos).toHaveLength(1);
    expect(painel.blocos[0]?.visualizacao.tipo).toBe("BARRAS");
  });

  it("painel sem bloco nenhum é recusado", () => {
    // Um painel vazio não é um rascunho útil: ele aparece na galeria e abre
    // numa tela em branco, que quem clicar vai tomar por defeito.
    expect(() => validarPainelParaGravar({ nome: "Vazio", blocos: [] })).toThrow(
      ErroDeRelatorioInvalido,
    );
  });

  it("acima do teto, a recusa NOMEIA o número — não corta em silêncio", () => {
    /*
     * Cortar silenciosamente faria o painel salvar menos do que a pessoa
     * montou, e ela só descobriria ao reabrir — quando já não lembra o que
     * tinha posto.
     */
    const demais = Array.from({ length: MAXIMO_DE_BLOCOS + 1 }, () => bloco());
    try {
      validarPainelParaGravar({ nome: "Grande demais", blocos: demais });
      throw new Error("deveria ter recusado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeRelatorioInvalido);
      const mensagem = (erro as ErroDeRelatorioInvalido).message;
      expect(mensagem).toContain(String(MAXIMO_DE_BLOCOS));
      expect(mensagem).toContain(String(MAXIMO_DE_BLOCOS + 1));
    }
  });

  it("bloco com definição inválida é recusado, e o erro diz QUAL bloco", () => {
    // Sem o número e o título, quem tem oito blocos não sabe onde mexer.
    try {
      validarPainelParaGravar({
        nome: "Com um ruim",
        blocos: [bloco(), bloco({ titulo: "Quebrado", definicao: { assunto: "inexistente" } })],
      });
      throw new Error("deveria ter recusado");
    } catch (erro) {
      const mensagem = (erro as ErroDeRelatorioInvalido).message;
      expect(mensagem).toContain("Bloco 2");
      expect(mensagem).toContain("Quebrado");
    }
  });

  it("nome curto demais é recusado", () => {
    expect(() => validarPainelParaGravar({ nome: "ab", blocos: [bloco()] })).toThrow(
      ErroDeRelatorioInvalido,
    );
  });
});

describe("validarBlocos — tolerante, porque abrir é outro momento", () => {
  it("bloco ruim vira recusa com motivo, e os bons atravessam", () => {
    /*
     * A asserção central da RN87 aplicada ao conteúdo: um bloco que não abre
     * não pode derrubar os outros. O painel é justamente o lugar onde isso
     * mais importa, porque ele existe para ser olhado inteiro.
     */
    const lidos = validarBlocos([
      bloco(),
      bloco({ titulo: "Saiu do catálogo", definicao: { assunto: "assunto-que-nao-existe" } }),
      bloco({ titulo: "Terceiro" }),
    ]);

    expect(lidos).toHaveLength(3);
    expect(lidos[0]?.ok).toBe(true);
    expect(lidos[1]?.ok).toBe(false);
    expect(lidos[2]?.ok).toBe(true);
  });

  it("a recusa de leitura traz título e motivo — nunca é muda (RN55)", () => {
    const [recusado] = validarBlocos([
      bloco({ titulo: "Quebrado", definicao: { assunto: "nao-existe" } }),
    ]);
    expect(recusado?.ok).toBe(false);
    if (recusado?.ok === false) {
      expect(recusado.titulo).toBe("Quebrado");
      expect(recusado.motivo.length).toBeGreaterThan(10);
    }
  });

  it("o que não é lista vira painel sem bloco, e não erro", () => {
    // JSONB é entrada de fora: um painel gravado por uma versão anterior
    // pode ter qualquer coisa ali, e travar a tela não ajudaria ninguém.
    for (const entrada of [null, undefined, 42, "blocos", {}]) {
      expect(validarBlocos(entrada)).toEqual([]);
    }
  });

  it("acima do teto, a LEITURA corta — e é o único lugar onde cortar é certo", () => {
    /*
     * Assimetria deliberada em relação à gravação. Aqui não há ninguém para
     * corrigir nada: o painel já está guardado, com treze blocos, porque o
     * teto mudou ou porque a versão anterior permitia. Mostrar doze é melhor
     * que recusar o painel inteiro — e o que ficou de fora volta a caber se
     * o teto subir.
     */
    const lidos = validarBlocos(Array.from({ length: MAXIMO_DE_BLOCOS + 3 }, () => bloco()));
    expect(lidos).toHaveLength(MAXIMO_DE_BLOCOS);
  });

  it("bloco sem título ganha um, em vez de sair em branco na tela", () => {
    const [lido] = validarBlocos([bloco({ titulo: undefined })]);
    expect(lido?.ok).toBe(true);
    if (lido?.ok) expect(lido.bloco.titulo).toBe("Bloco sem título");
  });

  it("largura desconhecida cai para metade, e não quebra a grade", () => {
    const [lido] = validarBlocos([bloco({ largura: "TRIPLA" })]);
    if (lido?.ok) expect(lido.bloco.largura).toBe("METADE");
  });
});
