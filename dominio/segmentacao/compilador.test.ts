import { describe, expect, it } from "vitest";
import { ROTULOS_OPERADOR, type RegraSegmento } from "./catalogo";
import {
  compilarSegmento,
  ErroDeSegmentoInvalido,
  resumirRegras,
  validarEstruturaRegras,
} from "./compilador";

const contexto = {
  slugsEnriquecimentoAtivos: new Set(["cultura", "regiao-da-unidade-produtiva"]),
};

function compilar(regras: RegraSegmento[]) {
  return compilarSegmento(regras, contexto);
}

describe("RN33 — allowlist do catálogo (teste obrigatório do prompt)", () => {
  it("REJEITA campo fora do catálogo — nem núcleo, nem atributo ativo", () => {
    expect(() =>
      compilar([{ campo: "senha_hash", operador: "e", valor: "x" }]),
    ).toThrow(ErroDeSegmentoInvalido);
    expect(() =>
      compilar([{ campo: "senha_hash", operador: "e", valor: "x" }]),
    ).toThrow('não está no catálogo');
  });

  it("REJEITA tentativa de injeção pelo nome do campo", () => {
    expect(() =>
      compilar([
        { campo: 'uf" OR 1=1 --', operador: "e", valor: "MT" },
      ]),
    ).toThrow(ErroDeSegmentoInvalido);
  });

  it("REJEITA operador não permitido para o campo", () => {
    expect(() =>
      compilar([{ campo: "vencimento", operador: "e", valor: "30" }]),
    ).toThrow('não é permitido');
    expect(() =>
      compilar([{ campo: "uf", operador: "vence_em", valor: "30" }]),
    ).toThrow('não é permitido');
  });

  it("REJEITA valor fora da lista fechada do campo", () => {
    expect(() =>
      compilar([{ campo: "preferencia", operador: "e", valor: "soja" }]),
    ).toThrow('não é permitido');
    expect(() =>
      compilar([{ campo: "vencimento", operador: "vence_em", valor: "45" }]),
    ).toThrow('não é permitido');
  });
});

describe("RN33 — SQL parametrizado, jamais interpolado", () => {
  it("o valor do usuário vai para os parâmetros, nunca para o texto SQL", () => {
    const resultado = compilar([{ campo: "uf", operador: "e", valor: "MT" }]);
    if (resultado.status !== "OK") throw new Error("esperava OK");
    expect(resultado.sql).toBe("(a.uf = $1)");
    expect(resultado.sql).not.toContain("MT");
    expect(resultado.parametros).toEqual(["MT"]);
  });

  it("tentativa de injeção pelo VALOR fica confinada ao parâmetro de bind", () => {
    const malicioso = "'; DROP TABLE assinantes; --";
    const resultado = compilar([
      { campo: "municipio", operador: "e", valor: malicioso },
    ]);
    if (resultado.status !== "OK") throw new Error("esperava OK");
    expect(resultado.sql).toBe("(a.municipio = $1)");
    expect(resultado.sql).not.toContain("DROP");
    expect(resultado.parametros).toEqual([malicioso]);
  });

  it("atributo de enriquecimento compila EXISTS com slug e valor como binds", () => {
    const resultado = compilar([
      { campo: "cultura", operador: "e", valor: "soja" },
    ]);
    if (resultado.status !== "OK") throw new Error("esperava OK");
    expect(resultado.sql).toContain("EXISTS (SELECT 1 FROM atributos_enriquecimento");
    expect(resultado.sql).toContain("ca.slug = $1");
    expect(resultado.sql).toContain("ae.valor = $2");
    expect(resultado.sql).not.toContain("cultura");
    expect(resultado.sql).not.toContain("soja");
    expect(resultado.parametros).toEqual(["cultura", "soja"]);
  });

  it('"não é" em atributo exige ter o atributo e não ter o valor (multivalorado)', () => {
    const resultado = compilar([
      { campo: "cultura", operador: "nao_e", valor: "soja" },
    ]);
    if (resultado.status !== "OK") throw new Error("esperava OK");
    expect(resultado.sql).toMatch(/EXISTS .*AND NOT EXISTS/s);
    expect(resultado.parametros).toEqual(["cultura", "cultura", "soja"]);
  });

  it("vencimento compila a janela cumulativa da RN37 com N como bind", () => {
    const resultado = compilar([
      { campo: "vencimento", operador: "vence_em", valor: "60" },
    ]);
    if (resultado.status !== "OK") throw new Error("esperava OK");
    expect(resultado.sql).toContain("make_interval(days => $1)");
    expect(resultado.sql).toContain("s.vencimento >= CURRENT_DATE");
    expect(resultado.parametros).toEqual([60]);
  });
});

describe("combinadores — dobra à esquerda do protótipo v6.1", () => {
  it("r1 OU r2 E r3 vira ((r1 OR r2) AND r3), com numeração contínua", () => {
    const resultado = compilar([
      { campo: "uf", operador: "e", valor: "MT" },
      { campo: "uf", operador: "e", valor: "GO", combinadorAnterior: "OU" },
      { campo: "preferencia", operador: "e", valor: "agricultura", combinadorAnterior: "E" },
    ]);
    if (resultado.status !== "OK") throw new Error("esperava OK");
    expect(resultado.sql).toBe(
      '(((a.uf = $1) OR (a.uf = $2)) AND (a.preferencia = CAST($3 AS "PreferenciaAssinante")))',
    );
    expect(resultado.parametros).toEqual(["MT", "GO", "AGRICULTURA"]);
  });

  it("sem regra alguma, a carteira inteira: TRUE sem parâmetros", () => {
    expect(compilar([])).toEqual({ status: "OK", sql: "TRUE", parametros: [] });
  });
});

describe("RN36 — uso em 90 dias torna a contagem indisponível, nunca estimada", () => {
  it("regra de uso sozinha ou combinada resulta AGUARDANDO_TELEMETRIA", () => {
    const sozinha = compilar([
      { campo: "uso-90-dias", operador: "e", valor: "com" },
    ]);
    expect(sozinha.status).toBe("AGUARDANDO_TELEMETRIA");

    const combinada = compilar([
      { campo: "uf", operador: "e", valor: "MT" },
      { campo: "uso-90-dias", operador: "e", valor: "sem", combinadorAnterior: "E" },
    ]);
    expect(combinada.status).toBe("AGUARDANDO_TELEMETRIA");
    if (combinada.status === "AGUARDANDO_TELEMETRIA") {
      expect(combinada.motivo).toContain("não é estimada");
    }
  });
});

describe("validarEstruturaRegras — fronteira com o JSON externo", () => {
  it("aceita a estrutura declarativa e normaliza o combinador da primeira", () => {
    const regras = validarEstruturaRegras([
      { campo: "uf", operador: "e", valor: "MT", combinadorAnterior: "OU" },
      { campo: "cultura", operador: "nao_e", valor: "soja", combinadorAnterior: "OU" },
    ]);
    expect(regras[0].combinadorAnterior).toBeUndefined();
    expect(regras[1].combinadorAnterior).toBe("OU");
  });

  it("rejeita não-lista, regra sem campo/valor e operador desconhecido", () => {
    expect(() => validarEstruturaRegras({})).toThrow("lista");
    expect(() =>
      validarEstruturaRegras([{ operador: "e", valor: "x" }]),
    ).toThrow("campo ausente");
    expect(() =>
      validarEstruturaRegras([{ campo: "uf", operador: "like", valor: "x" }]),
    ).toThrow("operador desconhecido");
    expect(() =>
      validarEstruturaRegras([{ campo: "uf", operador: "e", valor: "" }]),
    ).toThrow("valor ausente");
  });

  it("rejeita combinador fora de E/OU a partir da segunda regra", () => {
    expect(() =>
      validarEstruturaRegras([
        { campo: "uf", operador: "e", valor: "MT" },
        { campo: "uf", operador: "e", valor: "GO", combinadorAnterior: "XOR" },
      ]),
    ).toThrow("E ou OU");
  });
});

describe("resumirRegras — vocabulário do protótipo", () => {
  it("monta o resumo com rótulos, vencimento e uso", () => {
    const resumo = resumirRegras(
      [
        { campo: "uf", operador: "e", valor: "MT" },
        { campo: "cultura", operador: "nao_e", valor: "soja", combinadorAnterior: "E" },
        { campo: "vencimento", operador: "vence_em", valor: "30", combinadorAnterior: "OU" },
        { campo: "uso-90-dias", operador: "e", valor: "sem", combinadorAnterior: "E" },
      ],
      (slug) => (slug === "cultura" ? "cultura" : slug.toUpperCase()),
    );
    expect(resumo).toBe(
      "UF é MT E cultura não é soja OU vence em 30 dias E sem uso em 90 dias",
    );
  });

  it("sem regras, o texto institucional da carteira inteira", () => {
    expect(resumirRegras([], () => "")).toBe(
      "Nenhum filtro aplicado — carteira inteira",
    );
  });

  it("rótulos de operador seguem o protótipo", () => {
    expect(ROTULOS_OPERADOR.e).toBe("é");
    expect(ROTULOS_OPERADOR.nao_e).toBe("não é");
    expect(ROTULOS_OPERADOR.vence_em).toBe("vence em");
  });
});
