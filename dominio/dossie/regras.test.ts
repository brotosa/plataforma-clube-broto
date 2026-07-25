import { describe, expect, it } from "vitest";
import {
  ESTAGIOS_COM_DOSSIE,
  marcarComoRevisado,
  MARCA_REQUER_REVISAO,
  podeMarcarComoRevisado,
  podeTentarNovamente,
  podeTerDossieNoEstagio,
  validarPedidoDeGeracao,
} from "./regras";

describe("RN19 — o dossiê nasce requerendo revisão", () => {
  it("a tarja institucional é a do protótipo e da ficha", () => {
    expect(MARCA_REQUER_REVISAO).toBe("Gerado automaticamente — requer revisão");
  });

  it("dossiê pronto e não revisado aceita a marca", () => {
    expect(podeMarcarComoRevisado({ status: "PRONTO", revisado: false })).toEqual([]);
  });

  it("dossiê ainda gerando não aceita a marca", () => {
    const erros = podeMarcarComoRevisado({ status: "GERANDO", revisado: false });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("pronto");
  });

  it("dossiê que falhou não aceita a marca", () => {
    expect(podeMarcarComoRevisado({ status: "FALHA", revisado: false })).toHaveLength(1);
  });

  it("dossiê já revisado não é revisado de novo", () => {
    const erros = podeMarcarComoRevisado({ status: "PRONTO", revisado: true });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("já foi marcado");
  });

  it("a marca sempre carrega autor e data — não existe revisão anônima", () => {
    const quando = new Date("2026-07-25T12:00:00.000Z");
    expect(marcarComoRevisado("usuario-1", quando)).toEqual({
      revisado: true,
      revisorId: "usuario-1",
      revisadoEm: quando,
    });
  });
});

describe("Estágios com dossiê", () => {
  it("cobre os pré-aliança a partir de Mapeada e a aliada ativa", () => {
    expect([...ESTAGIOS_COM_DOSSIE]).toEqual([
      "MAPEADA",
      "EM_AVALIACAO",
      "PRIORIZADA",
      "EM_NEGOCIACAO",
      "ALIADA_ATIVA",
    ]);
  });

  it("não abre dossiê para caso parado no motor de aprovação nem para descartada", () => {
    expect(podeTerDossieNoEstagio("EM_APROVACAO")).toBe(false);
    expect(podeTerDossieNoEstagio("DESCARTADA")).toBe(false);
    expect(podeTerDossieNoEstagio("SUSPENSA")).toBe(false);
  });
});

describe("validarPedidoDeGeracao — sempre sob demanda, uma por vez", () => {
  it("libera pedido em estágio válido sem geração em andamento", () => {
    expect(
      validarPedidoDeGeracao({ estagio: "EM_AVALIACAO", temGeracaoEmAndamento: false }),
    ).toEqual([]);
  });

  it("recusa pedido em estágio sem dossiê", () => {
    const erros = validarPedidoDeGeracao({
      estagio: "EM_APROVACAO",
      temGeracaoEmAndamento: false,
    });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("estágio");
  });

  it("recusa segundo pedido enquanto o primeiro gera", () => {
    const erros = validarPedidoDeGeracao({
      estagio: "MAPEADA",
      temGeracaoEmAndamento: true,
    });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("em andamento");
  });

  it("acumula os dois motivos quando ambos se aplicam", () => {
    expect(
      validarPedidoDeGeracao({ estagio: "ENCERRADA", temGeracaoEmAndamento: true }),
    ).toHaveLength(2);
  });
});

describe("podeTentarNovamente", () => {
  it("só se aplica a geração que falhou", () => {
    expect(podeTentarNovamente("FALHA")).toBe(true);
    expect(podeTentarNovamente("GERANDO")).toBe(false);
    expect(podeTentarNovamente("PRONTO")).toBe(false);
  });
});
