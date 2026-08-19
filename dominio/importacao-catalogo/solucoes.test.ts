import { describe, expect, it } from "vitest";
import {
  COBERTURA_NACIONAL,
  COLUNAS_SOLUCAO,
  chaveSolucao,
  linhaPronta,
  validarLinhaSolucao,
  validarLoteSolucoes,
  type ContextoValidacaoSolucao,
  type LinhaSolucaoCrua,
} from "./solucoes";

const CNPJ_ATIVO = "11.444.777/0001-61"; // → 11444777000161
const CNPJ_INATIVO = "11.222.333/0001-81";
const CNPJ_NAO_CADASTRADO = "04.252.011/0001-10";
const CNPJ_INVALIDO = "12.345.678/0001-00";

function ctxBase(): ContextoValidacaoSolucao {
  return {
    categorias: [{ id: "cat-agro", nome: "Agricultura" }],
    culturas: [
      { id: "cul-soja", nome: "Soja" },
      { id: "cul-milho", nome: "Milho" },
    ],
    ufs: [
      { id: "uf-sp", sigla: "SP", nome: "São Paulo" },
      { id: "uf-pr", sigla: "PR", nome: "Paraná" },
    ],
    aliadoPorCnpj: new Map([
      ["11444777000161", { id: "emp-ativa", ativo: true }],
      ["11222333000181", { id: "emp-inativa", ativo: false }],
    ]),
    solucaoPorChave: new Map([[chaveSolucao("11444777000161", "Alerta climático"), "sol-existe"]]),
  };
}

function linha(valores: Partial<Record<string, string>>, n = 2): LinhaSolucaoCrua {
  const base: Record<string, string> = {
    [COLUNAS_SOLUCAO.cnpj]: CNPJ_ATIVO,
    [COLUNAS_SOLUCAO.nome]: "Solução Nova",
    [COLUNAS_SOLUCAO.categoria]: "Agricultura",
    [COLUNAS_SOLUCAO.culturas]: "Soja; Milho",
    [COLUNAS_SOLUCAO.cobertura]: "SP; PR",
  };
  return { linha: n, valores: { ...base, ...valores } as Record<string, string> };
}

describe("validarLinhaSolucao — caminhos felizes", () => {
  it("linha completa e válida resolve CRIAR sem pendências, com campos mapeados", () => {
    const r = validarLinhaSolucao(linha({}), ctxBase());
    expect(r.pendencias).toEqual([]);
    expect(r.acao).toBe("CRIAR");
    expect(r.empresaId).toBe("emp-ativa");
    expect(r.campos.categoriaId).toBe("cat-agro");
    expect(r.campos.culturaIds).toEqual(["cul-soja", "cul-milho"]);
    expect(r.campos.ufIds).toEqual(["uf-sp", "uf-pr"]);
    expect(r.campos.coberturaNacional).toBe(false);
  });

  it('cobertura "Nacional" marca coberturaNacional e não gera UF', () => {
    const r = validarLinhaSolucao(linha({ [COLUNAS_SOLUCAO.cobertura]: COBERTURA_NACIONAL }), ctxBase());
    expect(r.pendencias).toEqual([]);
    expect(r.campos.coberturaNacional).toBe(true);
    expect(r.campos.ufIds).toEqual([]);
  });

  it("solução já existente (CNPJ + nome) resolve ENRIQUECER apontando o id", () => {
    const r = validarLinhaSolucao(linha({ [COLUNAS_SOLUCAO.nome]: "Alerta climático" }), ctxBase());
    expect(r.acao).toBe("ENRIQUECER");
    expect(r.solucaoId).toBe("sol-existe");
    expect(r.pendencias).toEqual([]);
  });

  it("cobertura e descrição vazias não bloqueiam (régua incompleta, não erro)", () => {
    const r = validarLinhaSolucao(
      linha({ [COLUNAS_SOLUCAO.cobertura]: "", [COLUNAS_SOLUCAO.culturas]: "" }),
      ctxBase(),
    );
    expect(linhaPronta(r)).toBe(true);
    expect(r.campos.coberturaNacional).toBe(false);
    expect(r.campos.culturaIds).toEqual([]);
  });
});

describe("validarLinhaSolucao — pendências nomeadas", () => {
  function colunasComPendencia(valores: Partial<Record<string, string>>) {
    return validarLinhaSolucao(linha(valores), ctxBase()).pendencias.map((p) => p.coluna);
  }

  it("CNPJ ausente", () => {
    expect(colunasComPendencia({ [COLUNAS_SOLUCAO.cnpj]: "" })).toContain(COLUNAS_SOLUCAO.cnpj);
  });

  it("CNPJ inválido (dígito verificador)", () => {
    const r = validarLinhaSolucao(linha({ [COLUNAS_SOLUCAO.cnpj]: CNPJ_INVALIDO }), ctxBase());
    expect(r.pendencias.some((p) => /inválido/i.test(p.motivo))).toBe(true);
  });

  it("aliado não cadastrado", () => {
    const r = validarLinhaSolucao(linha({ [COLUNAS_SOLUCAO.cnpj]: CNPJ_NAO_CADASTRADO }), ctxBase());
    expect(r.empresaId).toBeNull();
    expect(r.pendencias.some((p) => /não cadastrado/i.test(p.motivo))).toBe(true);
  });

  it("aliado não ativo cita a RN01", () => {
    const r = validarLinhaSolucao(linha({ [COLUNAS_SOLUCAO.cnpj]: CNPJ_INATIVO }), ctxBase());
    expect(r.empresaId).toBeNull();
    expect(r.pendencias.some((p) => /RN01/.test(p.motivo))).toBe(true);
  });

  it("nome ausente", () => {
    expect(colunasComPendencia({ [COLUNAS_SOLUCAO.nome]: "  " })).toContain(COLUNAS_SOLUCAO.nome);
  });

  it("categoria fora da lista", () => {
    expect(colunasComPendencia({ [COLUNAS_SOLUCAO.categoria]: "Inexistente" })).toContain(
      COLUNAS_SOLUCAO.categoria,
    );
  });

  it("cultura fora da lista", () => {
    const r = validarLinhaSolucao(linha({ [COLUNAS_SOLUCAO.culturas]: "Soja; Cacau" }), ctxBase());
    expect(r.pendencias.some((p) => p.coluna === COLUNAS_SOLUCAO.culturas && /Cacau/.test(p.motivo))).toBe(
      true,
    );
    // A cultura válida ainda é mapeada.
    expect(r.campos.culturaIds).toEqual(["cul-soja"]);
  });

  it("UF desconhecida na cobertura", () => {
    expect(colunasComPendencia({ [COLUNAS_SOLUCAO.cobertura]: "SP; ZZ" })).toContain(
      COLUNAS_SOLUCAO.cobertura,
    );
  });
});

describe("validarLoteSolucoes — disciplina do conjunto", () => {
  it("marca como pendência solução repetida (mesmo CNPJ + nome em duas linhas)", () => {
    const resultados = validarLoteSolucoes(
      [
        linha({ [COLUNAS_SOLUCAO.nome]: "Repetida" }, 2),
        linha({ [COLUNAS_SOLUCAO.nome]: "Repetida" }, 3),
      ],
      ctxBase(),
    );
    expect(resultados.every((r) => r.pendencias.some((p) => /repetida/i.test(p.motivo)))).toBe(true);
  });

  it("linhas de soluções diferentes não colidem", () => {
    const resultados = validarLoteSolucoes(
      [
        linha({ [COLUNAS_SOLUCAO.nome]: "Uma" }, 2),
        linha({ [COLUNAS_SOLUCAO.nome]: "Outra" }, 3),
      ],
      ctxBase(),
    );
    expect(resultados.every(linhaPronta)).toBe(true);
  });
});
