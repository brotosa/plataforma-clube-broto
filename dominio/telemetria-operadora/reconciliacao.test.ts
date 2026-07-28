import { describe, expect, it } from "vitest";

import { divergenciaDeContagem, reconciliarCatalogo } from "./reconciliacao";

/**
 * RN70 — relata, não corrige. Aqui se prova o RELATO; que o caminho de
 * importação não escreve no cadastro é assunto da cerca de arquitetura
 * (`infra/arquitetura/reconciliacao-nao-corrige.test.ts`) e do teste de
 * integração.
 */

describe("reconciliação de catálogo (RN70)", () => {
  it("relata oferta ativa aqui e ausente no arquivo da operadora", () => {
    const divergencias = reconciliarCatalogo({
      naPlataforma: [{ idExterno: "of-1", rotulo: "Curso de solos", ativo: true }],
      naOperadora: [],
      substantivo: "oferta",
    });
    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]).toMatchObject({
      tipo: "AUSENTE_NA_OPERADORA",
      identificador: "of-1",
    });
    expect(divergencias[0]!.descricao).toContain("Curso de solos");
  });

  it("relata item presente lá e desconhecido aqui", () => {
    const divergencias = reconciliarCatalogo({
      naPlataforma: [],
      naOperadora: [{ idExterno: "of-9", rotulo: "Oferta fantasma", ativo: true }],
      substantivo: "oferta",
    });
    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]!.tipo).toBe("AUSENTE_NA_PLATAFORMA");
  });

  it("relata atributo divergente quando existe nos dois lados", () => {
    const divergencias = reconciliarCatalogo({
      naPlataforma: [{ idExterno: "of-1", rotulo: "Curso", ativo: true }],
      naOperadora: [{ idExterno: "of-1", rotulo: "Curso", ativo: false }],
      substantivo: "oferta",
    });
    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]!.tipo).toBe("ATRIBUTO_DIVERGENTE");
    expect(divergencias[0]!.descricao).toContain("ativa na plataforma");
    expect(divergencias[0]!.descricao).toContain("inativa na operadora");
  });

  it("item inativo aqui e ausente lá NÃO é divergência", () => {
    // É o estado esperado. Relatá-lo afogaria a lista em ruído.
    const divergencias = reconciliarCatalogo({
      naPlataforma: [{ idExterno: "of-2", rotulo: "Encerrada", ativo: false }],
      naOperadora: [],
      substantivo: "oferta",
    });
    expect(divergencias).toEqual([]);
  });

  it("os dois lados iguais não geram divergência alguma", () => {
    const divergencias = reconciliarCatalogo({
      naPlataforma: [
        { idExterno: "of-1", rotulo: "A", ativo: true },
        { idExterno: "of-2", rotulo: "B", ativo: false },
      ],
      naOperadora: [
        { idExterno: "of-1", rotulo: "A", ativo: true },
        { idExterno: "of-2", rotulo: "B", ativo: false },
      ],
      substantivo: "oferta",
    });
    expect(divergencias).toEqual([]);
  });

  it("acumula os três tipos numa passada só", () => {
    const divergencias = reconciliarCatalogo({
      naPlataforma: [
        { idExterno: "a", rotulo: "A", ativo: true },
        { idExterno: "b", rotulo: "B", ativo: true },
      ],
      naOperadora: [
        { idExterno: "b", rotulo: "B", ativo: false },
        { idExterno: "c", rotulo: "C", ativo: true },
      ],
      substantivo: "oferta",
    });
    expect(divergencias.map((d) => d.tipo).sort()).toEqual([
      "ATRIBUTO_DIVERGENTE",
      "AUSENTE_NA_OPERADORA",
      "AUSENTE_NA_PLATAFORMA",
    ]);
  });

  it("a função é pura: não recebe nem devolve nada capaz de escrever", () => {
    const naPlataforma = [{ idExterno: "a", rotulo: "A", ativo: true }];
    const naOperadora = [{ idExterno: "a", rotulo: "A renomeada", ativo: true }];
    const antes = JSON.stringify({ naPlataforma, naOperadora });
    reconciliarCatalogo({ naPlataforma, naOperadora, substantivo: "oferta" });
    // Nem sequer os objetos de entrada são tocados.
    expect(JSON.stringify({ naPlataforma, naOperadora })).toBe(antes);
  });

  it("rótulo diferente com id igual não é corrigido em lugar nenhum", () => {
    // O nome mudou na operadora. A plataforma é a origem: o cadastro
    // permanece, e o máximo que acontece é ninguém ser avisado — porque
    // "só o nome" é exatamente o que a RN70 proíbe corrigir.
    const divergencias = reconciliarCatalogo({
      naPlataforma: [{ idExterno: "a", rotulo: "Nome certo", ativo: true }],
      naOperadora: [{ idExterno: "a", rotulo: "Nome velho", ativo: true }],
      substantivo: "oferta",
    });
    expect(divergencias).toEqual([]);
  });
});

describe("divergência de contagem (arquivo de sellers)", () => {
  it("relata quando as contagens diferem", () => {
    const divergencia = divergenciaDeContagem({
      identificador: "seller-1",
      rotulo: "Cyan Analytics",
      naPlataforma: 4,
      naOperadora: 6,
    });
    expect(divergencia?.tipo).toBe("ATRIBUTO_DIVERGENTE");
    expect(divergencia?.descricao).toContain("4 oferta(s) ativa(s) na plataforma");
    expect(divergencia?.descricao).toContain("6 no arquivo");
  });

  it("contagens iguais não geram nada", () => {
    expect(
      divergenciaDeContagem({
        identificador: "seller-1",
        rotulo: "Cyan",
        naPlataforma: 6,
        naOperadora: 6,
      }),
    ).toBeNull();
  });
});
