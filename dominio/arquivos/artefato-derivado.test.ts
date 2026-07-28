import { describe, expect, it } from "vitest";
import {
  ARTEFATOS_DERIVADOS,
  classificarChave,
  ErroDeArquivoAusente,
  erroDeArquivoAusente,
  excessoDeTeto,
  mensagemDeArquivoAusente,
  PREFIXO_POR_ARTEFATO,
  TETO_POR_ARTEFATO,
} from "./artefato-derivado";

/**
 * RN71 — as decisões que o domínio toma sobre arquivo derivado, sem banco
 * e sem disco: de quem é a chave, o que a falta de conteúdo diz e o que
 * cada teto faz quando é ultrapassado.
 *
 * O teste que mais importa aqui é o da **assimetria dos tetos**: arquivo
 * enviado recusa, artefato gerado não. Foi decisão explícita, e é o tipo
 * de coisa que alguém "uniformiza" numa refatoração de boa-fé — e a
 * uniformização deixaria a campanha sem poder ativar e sem remédio.
 */

const CHAVE_DE_PECA = "pecas/cmp123/abc123def456.png";
const CHAVE_DE_SNAPSHOT = "listas-contato/2026-07-28-cme456.csv";
const CHAVE_DE_KIT = "kits/cmp123/v1-kit-safra.zip";

describe("RN71 · a chave diz de que artefato ela é", () => {
  it("classifica os três prefixos", () => {
    expect(classificarChave(CHAVE_DE_PECA)).toBe("IMAGEM_DE_PECA");
    expect(classificarChave(CHAVE_DE_SNAPSHOT)).toBe("SNAPSHOT_DE_EXPORTACAO");
    expect(classificarChave(CHAVE_DE_KIT)).toBe("KIT_DE_EXECUCAO");
  });

  it("prefixo desconhecido não é classificado — e não vira exceção", () => {
    expect(classificarChave("outra-coisa/arquivo.bin")).toBeNull();
    expect(classificarChave("")).toBeNull();
  });

  it("todo artefato tem prefixo e teto declarados", () => {
    for (const artefato of ARTEFATOS_DERIVADOS) {
      expect(PREFIXO_POR_ARTEFATO[artefato]).toMatch(/\/$/);
      expect(TETO_POR_ARTEFATO[artefato]).toBeGreaterThan(0);
    }
  });

  it("os tetos são os da ficha §4: 1 MB, 25 MB e 50 MB", () => {
    expect(TETO_POR_ARTEFATO.IMAGEM_DE_PECA).toBe(1024 * 1024);
    expect(TETO_POR_ARTEFATO.SNAPSHOT_DE_EXPORTACAO).toBe(25 * 1024 * 1024);
    expect(TETO_POR_ARTEFATO.KIT_DE_EXECUCAO).toBe(50 * 1024 * 1024);
  });
});

describe("RN71 · chave órfã nomeia a causa e o remédio (RN55)", () => {
  it("cada artefato diz o que fazer, com o verbo dele", () => {
    expect(mensagemDeArquivoAusente(CHAVE_DE_PECA)).toContain("Reenvie a imagem");
    expect(mensagemDeArquivoAusente(CHAVE_DE_SNAPSHOT)).toContain("Refaça a exportação");
    expect(mensagemDeArquivoAusente(CHAVE_DE_KIT)).toContain("Gere uma nova versão do kit");
  });

  it("a mensagem nomeia o artefato, não fala em erro genérico", () => {
    expect(mensagemDeArquivoAusente(CHAVE_DE_PECA)).toContain("A imagem da peça");
    expect(mensagemDeArquivoAusente(CHAVE_DE_KIT)).toContain("O pacote do kit");
    for (const chave of [CHAVE_DE_PECA, CHAVE_DE_SNAPSHOT, CHAVE_DE_KIT]) {
      expect(mensagemDeArquivoAusente(chave)).not.toMatch(/tente novamente/i);
    }
  });

  /**
   * A chave carrega id de campanha e de exportação — identificador
   * interno, que a RN55 proíbe na interface. É o detalhe que passa
   * despercebido justamente porque incluí-la pareceria "ajudar a
   * diagnosticar".
   */
  it("a chave NUNCA entra na mensagem", () => {
    for (const chave of [CHAVE_DE_PECA, CHAVE_DE_SNAPSHOT, CHAVE_DE_KIT]) {
      const mensagem = mensagemDeArquivoAusente(chave);
      expect(mensagem).not.toContain(chave);
      expect(mensagem).not.toContain("cmp123");
      expect(mensagem).not.toContain("cme456");
      expect(mensagem).not.toContain("/");
    }
  });

  it("prefixo desconhecido ainda produz mensagem útil, não vazamento", () => {
    const mensagem = mensagemDeArquivoAusente("qualquer/coisa.bin");
    expect(mensagem).toContain("não está no armazenamento da plataforma");
    expect(mensagem).not.toContain("qualquer/coisa.bin");
  });

  it("o erro é da classe que a RN55 reconhece, e carrega o artefato", () => {
    const erro = erroDeArquivoAusente(CHAVE_DE_KIT);
    expect(erro).toBeInstanceOf(ErroDeArquivoAusente);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.artefato).toBe("KIT_DE_EXECUCAO");
    expect(erro.message).toBe(mensagemDeArquivoAusente(CHAVE_DE_KIT));
  });
});

describe("RN71 · o teto, e o que ele faz depende de quem produziu o arquivo", () => {
  it("dentro do teto não há excesso — nem no limite exato", () => {
    expect(excessoDeTeto(CHAVE_DE_PECA, TETO_POR_ARTEFATO.IMAGEM_DE_PECA)).toBeNull();
    expect(excessoDeTeto(CHAVE_DE_SNAPSHOT, 1024)).toBeNull();
    expect(excessoDeTeto(CHAVE_DE_KIT, 0)).toBeNull();
  });

  it("imagem de peça acima do teto RECUSA, com tamanho, teto e como reduzir", () => {
    const excesso = excessoDeTeto(CHAVE_DE_PECA, 2 * 1024 * 1024);
    expect(excesso).not.toBeNull();
    expect(excesso!.recusa).toBe(true);
    expect(excesso!.mensagem).toContain("A imagem da peça");
    expect(excesso!.mensagem).toContain("2 MB");
    expect(excesso!.mensagem).toContain("1 MB");
    expect(excesso!.mensagem).toContain("WEBP");
  });

  /**
   * O coração da correção: kit e snapshot **não** recusam. Quem está na
   * tela não tem como encolher um artefato que a plataforma gerou, então
   * travar aqui deixaria a campanha sem ativar e sem saída.
   */
  it("kit e snapshot acima do teto NÃO recusam — sinalizam a condição objetiva", () => {
    const doKit = excessoDeTeto(CHAVE_DE_KIT, 60 * 1024 * 1024);
    const doSnapshot = excessoDeTeto(CHAVE_DE_SNAPSHOT, 30 * 1024 * 1024);

    for (const excesso of [doKit, doSnapshot]) {
      expect(excesso).not.toBeNull();
      expect(excesso!.recusa).toBe(false);
      expect(excesso!.mensagem).toContain("gravado assim mesmo");
      expect(excesso!.mensagem).toContain("condição objetiva da RN71");
      expect(excesso!.mensagem).toContain("adapter");
    }
    // E cada um diz o próprio tamanho e o próprio teto.
    expect(doKit!.mensagem).toContain("60 MB");
    expect(doKit!.mensagem).toContain("50 MB");
    expect(doSnapshot!.mensagem).toContain("30 MB");
    expect(doSnapshot!.mensagem).toContain("25 MB");
  });

  it("cada artefato tem mensagem própria — nenhuma serve para outro", () => {
    const doKit = excessoDeTeto(CHAVE_DE_KIT, 60 * 1024 * 1024)!.mensagem;
    const doSnapshot = excessoDeTeto(CHAVE_DE_SNAPSHOT, 30 * 1024 * 1024)!.mensagem;
    const daPeca = excessoDeTeto(CHAVE_DE_PECA, 2 * 1024 * 1024)!.mensagem;

    expect(new Set([doKit, doSnapshot, daPeca]).size).toBe(3);
    expect(doKit).toContain("O pacote do kit");
    expect(doSnapshot).toContain("O arquivo da exportação");
  });

  it("chave de prefixo desconhecido não tem teto a aplicar", () => {
    expect(excessoDeTeto("outra-coisa/enorme.bin", 500 * 1024 * 1024)).toBeNull();
  });
});
