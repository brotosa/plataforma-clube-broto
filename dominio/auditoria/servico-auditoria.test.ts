import { describe, expect, it } from "vitest";
import {
  type EventoAuditoria,
  type GravadorAuditoria,
  calcularEventos,
  registrarMutacao,
  serializarValor,
} from "./servico-auditoria";

function criarGravadorEmMemoria(): GravadorAuditoria & {
  gravados: EventoAuditoria[];
} {
  const gravados: EventoAuditoria[] = [];
  return {
    gravados,
    async gravar(eventos) {
      gravados.push(...eventos);
    },
  };
}

describe("serializarValor", () => {
  it("preserva null e undefined como null (campo ausente/limpo)", () => {
    expect(serializarValor(null)).toBeNull();
    expect(serializarValor(undefined)).toBeNull();
  });

  it("serializa primitivos como texto", () => {
    expect(serializarValor("Agromove")).toBe("Agromove");
    expect(serializarValor(5)).toBe("5");
    expect(serializarValor(true)).toBe("true");
  });

  it("serializa datas em ISO 8601", () => {
    expect(serializarValor(new Date("2026-07-24T12:00:00.000Z"))).toBe(
      "2026-07-24T12:00:00.000Z",
    );
  });

  it("serializa objetos com toString próprio (ex.: Decimal) pelo toString", () => {
    const decimalFalso = {
      toString: () => "5.00",
    };
    expect(serializarValor(decimalFalso)).toBe("5.00");
  });

  it("serializa objetos simples como JSON", () => {
    expect(serializarValor(["GRAOS", "CAFE"])).toBe('["GRAOS","CAFE"]');
  });
});

describe("calcularEventos", () => {
  it("na criação (anterior = null) gera um evento por campo preenchido, com valor anterior null", () => {
    const eventos = calcularEventos({
      entidade: "empresa",
      entidadeId: "emp-1",
      autorId: "usr-1",
      anterior: null,
      novo: { nomeFantasia: "Empresa Exemplo", estagio: "EM_NEGOCIACAO" },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos).toContainEqual({
      entidade: "empresa",
      entidadeId: "emp-1",
      campo: "nomeFantasia",
      valorAnterior: null,
      valorNovo: "Empresa Exemplo",
      autorId: "usr-1",
    });
  });

  it("na edição gera evento apenas para campos alterados, com anterior e novo", () => {
    const eventos = calcularEventos({
      entidade: "empresa",
      entidadeId: "emp-1",
      autorId: "usr-2",
      anterior: { estagio: "EM_NEGOCIACAO", site: "https://exemplo.com.br" },
      novo: { estagio: "ALIADA_ATIVA", site: "https://exemplo.com.br" },
    });
    expect(eventos).toEqual([
      {
        entidade: "empresa",
        entidadeId: "emp-1",
        campo: "estagio",
        valorAnterior: "EM_NEGOCIACAO",
        valorNovo: "ALIADA_ATIVA",
        autorId: "usr-2",
      },
    ]);
  });

  it("registra limpeza de campo (novo = null) preservando o valor anterior", () => {
    const eventos = calcularEventos({
      entidade: "oferta",
      entidadeId: "ofe-1",
      autorId: "usr-1",
      anterior: { vigenciaFim: new Date("2026-12-31T00:00:00.000Z") },
      novo: { vigenciaFim: null },
    });
    expect(eventos).toEqual([
      {
        entidade: "oferta",
        entidadeId: "ofe-1",
        campo: "vigenciaFim",
        valorAnterior: "2026-12-31T00:00:00.000Z",
        valorNovo: null,
        autorId: "usr-1",
      },
    ]);
  });

  it("não gera eventos quando nada mudou", () => {
    const estado = { titulo: "Oferta", status: "RASCUNHO" };
    const eventos = calcularEventos({
      entidade: "oferta",
      entidadeId: "ofe-1",
      autorId: "usr-1",
      anterior: estado,
      novo: { ...estado },
    });
    expect(eventos).toHaveLength(0);
  });

  it("ignora campos de infraestrutura (criadoEm/atualizadoEm) e ignorados extras", () => {
    const eventos = calcularEventos({
      entidade: "empresa",
      entidadeId: "emp-1",
      autorId: "usr-1",
      anterior: {
        atualizadoEm: new Date("2026-01-01T00:00:00Z"),
        senhaHash: "a",
      },
      novo: {
        atualizadoEm: new Date("2026-07-24T00:00:00Z"),
        senhaHash: "b",
      },
      camposIgnorados: ["senhaHash"],
    });
    expect(eventos).toHaveLength(0);
  });
});

describe("registrarMutacao", () => {
  it("persiste os eventos calculados pelo gravador e os retorna", async () => {
    const gravador = criarGravadorEmMemoria();
    const eventos = await registrarMutacao(gravador, {
      entidade: "solucao",
      entidadeId: "sol-1",
      autorId: "usr-1",
      anterior: { status: "ATIVA" },
      novo: { status: "INATIVA" },
    });
    expect(eventos).toHaveLength(1);
    expect(gravador.gravados).toEqual(eventos);
  });

  it("não chama o gravador quando não há diferença", async () => {
    const gravador = criarGravadorEmMemoria();
    const eventos = await registrarMutacao(gravador, {
      entidade: "solucao",
      entidadeId: "sol-1",
      autorId: "usr-1",
      anterior: { status: "ATIVA" },
      novo: { status: "ATIVA" },
    });
    expect(eventos).toHaveLength(0);
    expect(gravador.gravados).toHaveLength(0);
  });

  it("recusa mutação sem autor (auditoria exige autoria)", async () => {
    const gravador = criarGravadorEmMemoria();
    await expect(
      registrarMutacao(gravador, {
        entidade: "solucao",
        entidadeId: "sol-1",
        autorId: "",
        anterior: null,
        novo: { nome: "x" },
      }),
    ).rejects.toThrow(/exige autor/);
    expect(gravador.gravados).toHaveLength(0);
  });
});
