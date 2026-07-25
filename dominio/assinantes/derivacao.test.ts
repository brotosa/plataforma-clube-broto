import { describe, expect, it } from "vitest";
import {
  derivarDoEndereco,
  derivarLocalizacao,
  derivarUfPorCep,
} from "./derivacao";

describe("RN32 — UF pela faixa de CEP", () => {
  it("resolve UFs por faixas, inclusive as intercaladas (DF/GO, AM/RR)", () => {
    expect(derivarUfPorCep("01310-100")).toBe("SP");
    expect(derivarUfPorCep("78890000")).toBe("MT");
    expect(derivarUfPorCep("72800-000")).toBe("GO");
    expect(derivarUfPorCep("73000-000")).toBe("DF");
    expect(derivarUfPorCep("69300-000")).toBe("RR");
    expect(derivarUfPorCep("69400-000")).toBe("AM");
    expect(derivarUfPorCep("76800-000")).toBe("RO");
  });

  it("devolve null para CEP inválido, vazio ou fora das faixas alocadas", () => {
    expect(derivarUfPorCep("00100-000")).toBeNull();
    expect(derivarUfPorCep("1234")).toBeNull();
    expect(derivarUfPorCep(null)).toBeNull();
  });
});

describe("RN32 — heurística documentada sobre o endereço bruto", () => {
  it("extrai município/UF do padrão do arquivo do comprador", () => {
    expect(
      derivarDoEndereco("Rua das Palmeiras, 480 — Jardim Sumaré, Ribeirão Preto/SP"),
    ).toEqual({ uf: "SP", municipio: "Ribeirão Preto" });
    expect(
      derivarDoEndereco("Estrada do Sol, km 12 — Zona Rural, Sorriso/MT"),
    ).toEqual({ uf: "MT", municipio: "Sorriso" });
  });

  it("aceita vírgula ou travessão como separador da UF e ignora CEP ao final", () => {
    expect(derivarDoEndereco("Av. Leste, 1120 — Centro, Uberaba, MG")).toEqual({
      uf: "MG",
      municipio: "Uberaba",
    });
    expect(
      derivarDoEndereco("Alameda das Acácias, 305 — Centro, Rio Verde/GO 75901-000"),
    ).toEqual({ uf: "GO", municipio: "Rio Verde" });
  });

  it("não deriva quando o sufixo não é uma UF válida — estado honesto", () => {
    expect(derivarDoEndereco("Fazenda Santa Fé, gleba B/ZZ")).toEqual({
      uf: null,
      municipio: null,
    });
    expect(derivarDoEndereco("Endereço sem estrutura reconhecível")).toEqual({
      uf: null,
      municipio: null,
    });
    expect(derivarDoEndereco(null)).toEqual({ uf: null, municipio: null });
  });
});

describe("RN32 — derivação completa (CEP primeiro, endereço como fallback)", () => {
  it("prefere a UF do CEP quando presente e válida", () => {
    // CEP de MT com endereço apontando SP: a UF do CEP prevalece;
    // o município segue vindo do endereço (CEP não deriva município).
    expect(
      derivarLocalizacao({
        cep: "78890-000",
        enderecoBruto: "Rua Um, 1 — Centro, Campinas/SP",
      }),
    ).toEqual({ uf: "MT", municipio: "Campinas" });
  });

  it("cai para a heurística do endereço sem CEP", () => {
    expect(
      derivarLocalizacao({ cep: null, enderecoBruto: "Sítio Boa Vista, Uberaba/MG" }),
    ).toEqual({ uf: "MG", municipio: "Uberaba" });
  });

  it("sem CEP e sem padrão no endereço, nada é derivado — nunca um chute", () => {
    expect(derivarLocalizacao({ cep: "999", enderecoBruto: "s/n" })).toEqual({
      uf: null,
      municipio: null,
    });
  });
});
