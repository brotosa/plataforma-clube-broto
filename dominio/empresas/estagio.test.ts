import { describe, expect, it } from "vitest";
import {
  type DadosPromocao,
  pendenciasDePromocao,
  podeTransicionar,
  validarSuspensao,
} from "./estagio";

describe("máquina de estados da Empresa", () => {
  it("permite as transições documentadas", () => {
    expect(podeTransicionar("EM_NEGOCIACAO", "ALIADA_ATIVA")).toBe(true);
    expect(podeTransicionar("EM_NEGOCIACAO", "ENCERRADA")).toBe(true);
    expect(podeTransicionar("ALIADA_ATIVA", "SUSPENSA")).toBe(true);
    expect(podeTransicionar("ALIADA_ATIVA", "ENCERRADA")).toBe(true);
    expect(podeTransicionar("SUSPENSA", "ALIADA_ATIVA")).toBe(true);
    expect(podeTransicionar("SUSPENSA", "ENCERRADA")).toBe(true);
  });

  it("bloqueia transições inválidas", () => {
    expect(podeTransicionar("EM_NEGOCIACAO", "SUSPENSA")).toBe(false);
    expect(podeTransicionar("ALIADA_ATIVA", "EM_NEGOCIACAO")).toBe(false);
    expect(podeTransicionar("SUSPENSA", "EM_NEGOCIACAO")).toBe(false);
  });

  it("ENCERRADA é terminal", () => {
    expect(podeTransicionar("ENCERRADA", "ALIADA_ATIVA")).toBe(false);
    expect(podeTransicionar("ENCERRADA", "EM_NEGOCIACAO")).toBe(false);
    expect(podeTransicionar("ENCERRADA", "SUSPENSA")).toBe(false);
  });

  it("funil pré-aliança avança e retorna pelo pipeline (Onda 2)", () => {
    expect(podeTransicionar("MAPEADA", "EM_AVALIACAO")).toBe(true);
    expect(podeTransicionar("EM_AVALIACAO", "PRIORIZADA")).toBe(true);
    expect(podeTransicionar("EM_AVALIACAO", "MAPEADA")).toBe(true);
    expect(podeTransicionar("PRIORIZADA", "EM_NEGOCIACAO")).toBe(true);
    expect(podeTransicionar("PRIORIZADA", "EM_AVALIACAO")).toBe(true);
    expect(podeTransicionar("EM_NEGOCIACAO", "PRIORIZADA")).toBe(true);
  });

  it("funil não pula estágios", () => {
    expect(podeTransicionar("MAPEADA", "PRIORIZADA")).toBe(false);
    expect(podeTransicionar("MAPEADA", "EM_NEGOCIACAO")).toBe(false);
    expect(podeTransicionar("EM_AVALIACAO", "EM_NEGOCIACAO")).toBe(false);
    expect(podeTransicionar("MAPEADA", "ALIADA_ATIVA")).toBe(false);
  });

  it("EM_APROVACAO conversa só com o motor: aprova para ALIADA_ATIVA ou devolve", () => {
    expect(podeTransicionar("EM_NEGOCIACAO", "EM_APROVACAO")).toBe(true);
    expect(podeTransicionar("EM_APROVACAO", "ALIADA_ATIVA")).toBe(true);
    expect(podeTransicionar("EM_APROVACAO", "EM_NEGOCIACAO")).toBe(true);
    expect(podeTransicionar("EM_APROVACAO", "DESCARTADA")).toBe(false);
    expect(podeTransicionar("PRIORIZADA", "EM_APROVACAO")).toBe(false);
  });

  it("descarte sai de qualquer estágio do funil; reativação volta a MAPEADA (RN17)", () => {
    expect(podeTransicionar("MAPEADA", "DESCARTADA")).toBe(true);
    expect(podeTransicionar("EM_AVALIACAO", "DESCARTADA")).toBe(true);
    expect(podeTransicionar("PRIORIZADA", "DESCARTADA")).toBe(true);
    expect(podeTransicionar("EM_NEGOCIACAO", "DESCARTADA")).toBe(true);
    expect(podeTransicionar("DESCARTADA", "MAPEADA")).toBe(true);
    expect(podeTransicionar("DESCARTADA", "EM_AVALIACAO")).toBe(false);
    expect(podeTransicionar("ALIADA_ATIVA", "DESCARTADA")).toBe(false);
  });
});

function dadosCompletos(): DadosPromocao {
  return {
    razaoSocial: "Empresa Exemplo LTDA",
    nomeFantasia: "Exemplo",
    cnpj: "11.222.333/0001-81",
    enderecoMunicipio: "Curitiba",
    enderecoUf: "PR",
    quantidadeContatos: 1,
    contratoVigente: {
      temAnexo: true,
      comissaoPctDefinida: true,
      ambientesDefinidos: true,
    },
  };
}

describe("requisitos da promoção a Aliada ativa (M2)", () => {
  it("sem pendências quando identificação, contato e bloco comercial estão completos", () => {
    expect(pendenciasDePromocao(dadosCompletos())).toEqual([]);
  });

  it("aponta CNPJ ausente e CNPJ inválido como pendências distintas", () => {
    expect(pendenciasDePromocao({ ...dadosCompletos(), cnpj: null })).toContain(
      "CNPJ não preenchido",
    );
    expect(
      pendenciasDePromocao({ ...dadosCompletos(), cnpj: "11222333000199" }),
    ).toContain("CNPJ inválido (dígito verificador não confere)");
  });

  it("exige endereço da sede (mínimo contratual)", () => {
    expect(
      pendenciasDePromocao({ ...dadosCompletos(), enderecoMunicipio: null }),
    ).toContain("Endereço da sede incompleto (mínimo contratual)");
  });

  it("exige ao menos um contato", () => {
    expect(
      pendenciasDePromocao({ ...dadosCompletos(), quantidadeContatos: 0 }),
    ).toContain("Nenhum contato cadastrado (mínimo 1)");
  });

  it("exige contrato com anexo, comissão e ambientes", () => {
    expect(
      pendenciasDePromocao({ ...dadosCompletos(), contratoVigente: null }),
    ).toContain("Contrato vigente não cadastrado");
    const pendencias = pendenciasDePromocao({
      ...dadosCompletos(),
      contratoVigente: {
        temAnexo: false,
        comissaoPctDefinida: false,
        ambientesDefinidos: false,
      },
    });
    expect(pendencias).toContain("Contrato sem anexo (PDF)");
    expect(pendencias).toContain("Comissão % não definida no contrato");
    expect(pendencias).toContain("Ambientes de pagamento não definidos");
  });
});

describe("RN12 — suspensão com motivo tipificado", () => {
  it("aceita motivo tipificado sem descrição", () => {
    expect(
      validarSuspensao({ motivoSlug: "INADIMPLENCIA_COMISSAO", descricao: null }),
    ).toEqual([]);
    expect(
      validarSuspensao({ motivoSlug: "DECISAO_CURADORIA", descricao: null }),
    ).toEqual([]);
  });

  it("recusa suspensão sem motivo", () => {
    expect(validarSuspensao({ motivoSlug: null, descricao: "qualquer" })).toEqual([
      "Suspensão exige motivo tipificado (RN12)",
    ]);
  });

  it('exige descrição quando o motivo é "Outros"', () => {
    expect(validarSuspensao({ motivoSlug: "OUTROS", descricao: null })).toEqual([
      'O motivo "Outros" exige descrição (RN12)',
    ]);
    expect(validarSuspensao({ motivoSlug: "OUTROS", descricao: "  " })).toEqual([
      'O motivo "Outros" exige descrição (RN12)',
    ]);
    expect(
      validarSuspensao({ motivoSlug: "OUTROS", descricao: "Motivo detalhado" }),
    ).toEqual([]);
  });
});
