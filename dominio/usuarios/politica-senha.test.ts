import { describe, expect, it } from "vitest";
import {
  COMPRIMENTO_MIN_MINIMO,
  HISTORICO_MAXIMO,
  POLITICA_SENHA_PADRAO,
  type PoliticaDeSenha,
  descreverPolitica,
  validarPoliticaDeSenha,
  validarSenhaContraPolitica,
  senhaVenceu,
  VALIDADE_DIAS_MINIMO,
  VALIDADE_DIAS_MAXIMO,
} from "./politica-senha";

const COM_TUDO: PoliticaDeSenha = {
  comprimentoMin: 12,
  exigeMaiuscula: true,
  exigeMinuscula: true,
  exigeNumero: true,
  exigeSimbolo: true,
  historicoN: 5,
  validadeDias: 0,
};

describe("política de senha — validar os valores que o Admin salva", () => {
  it("aceita a política padrão", () => {
    expect(validarPoliticaDeSenha(POLITICA_SENHA_PADRAO)).toEqual([]);
  });

  it("recusa comprimento abaixo do mínimo de sanidade, nomeando a causa", () => {
    const erros = validarPoliticaDeSenha({ ...POLITICA_SENHA_PADRAO, comprimentoMin: 4 });
    expect(erros.some((e) => e.includes(String(COMPRIMENTO_MIN_MINIMO)))).toBe(true);
  });

  it("recusa histórico negativo e acima do teto", () => {
    expect(validarPoliticaDeSenha({ ...POLITICA_SENHA_PADRAO, historicoN: -1 })).not.toEqual([]);
    expect(
      validarPoliticaDeSenha({ ...POLITICA_SENHA_PADRAO, historicoN: HISTORICO_MAXIMO + 1 }),
    ).not.toEqual([]);
  });
});

describe("política de senha — validar uma senha contra a política", () => {
  it("o padrão só exige comprimento (preserva o comportamento anterior)", () => {
    expect(validarSenhaContraPolitica("umasenhaqualquer", POLITICA_SENHA_PADRAO)).toEqual([]);
    expect(validarSenhaContraPolitica("curta", POLITICA_SENHA_PADRAO)).toEqual([
      "A senha precisa de ao menos 10 caracteres.",
    ]);
  });

  it("cobra cada classe exigida, nomeando o que faltou", () => {
    const erros = validarSenhaContraPolitica("abcdefghijkl", COM_TUDO); // só minúsculas
    expect(erros).toContain("A senha precisa de ao menos uma letra maiúscula.");
    expect(erros).toContain("A senha precisa de ao menos um número.");
    expect(erros).toContain("A senha precisa de ao menos um símbolo (ex.: ! @ # $ %).");
    expect(erros).not.toContain("A senha precisa de ao menos uma letra minúscula.");
  });

  it("aceita uma senha que cumpre todas as classes", () => {
    expect(validarSenhaContraPolitica("Senha-Forte#2026", COM_TUDO)).toEqual([]);
  });

  it("reconhece acento como letra (maiúscula/minúscula unicode)", () => {
    expect(
      validarSenhaContraPolitica("ÁÉÍ", { ...COM_TUDO, comprimentoMin: 3, exigeMinuscula: false, exigeNumero: false, exigeSimbolo: false }),
    ).toEqual([]);
  });
});

describe("descreverPolitica", () => {
  it("descreve comprimento, classes e histórico numa frase", () => {
    expect(descreverPolitica(COM_TUDO)).toBe(
      "Ao menos 12 caracteres, incluindo uma maiúscula, uma minúscula, um número e um símbolo. Não pode repetir as últimas 5 senhas.",
    );
  });

  it("omite as classes e o histórico quando não exigidos", () => {
    expect(
      descreverPolitica({ ...POLITICA_SENHA_PADRAO, historicoN: 0 }),
    ).toBe("Ao menos 10 caracteres.");
  });
});

describe("validade periódica da senha (configurável e desligável)", () => {
  const AGORA = new Date("2026-09-14T12:00:00Z");
  const DIA = 24 * 60 * 60_000;
  const com = (validadeDias: number) => ({ ...POLITICA_SENHA_PADRAO, validadeDias });

  it("0 desliga — senha de anos atrás não vence", () => {
    expect(validarPoliticaDeSenha(com(0))).toEqual([]);
    expect(senhaVenceu(new Date(AGORA.getTime() - 900 * DIA), AGORA, com(0))).toBe(false);
  });

  it("vence passado o prazo, e não antes", () => {
    const politica = com(90);
    expect(senhaVenceu(new Date(AGORA.getTime() - 89 * DIA), AGORA, politica)).toBe(false);
    expect(senhaVenceu(new Date(AGORA.getTime() - 90 * DIA), AGORA, politica)).toBe(false);
    expect(senhaVenceu(new Date(AGORA.getTime() - 91 * DIA), AGORA, politica)).toBe(true);
  });

  it("quem nunca trocou (marca nula) NÃO vence — não expulsa a base no deploy", () => {
    expect(senhaVenceu(null, AGORA, com(30))).toBe(false);
    expect(senhaVenceu(undefined, AGORA, com(30))).toBe(false);
  });

  it("recusa validade fora da faixa, aceitando só 0 abaixo do mínimo", () => {
    expect(validarPoliticaDeSenha(com(VALIDADE_DIAS_MINIMO))).toEqual([]);
    expect(validarPoliticaDeSenha(com(VALIDADE_DIAS_MAXIMO))).toEqual([]);
    expect(validarPoliticaDeSenha(com(VALIDADE_DIAS_MINIMO - 1))).toHaveLength(1);
    expect(validarPoliticaDeSenha(com(VALIDADE_DIAS_MAXIMO + 1))).toHaveLength(1);
    expect(validarPoliticaDeSenha(com(-1))).toHaveLength(1);
  });
});
