import { describe, expect, it } from "vitest";
import { CAMPOS_NUCLEO, ROTULOS_CAMPO_NUCLEO } from "./importacao";
import { validarCpf } from "./cpf";
import {
  CABECALHO_MODELO_ASSINANTES,
  gerarModeloAssinantesCsv,
} from "./modelo-importacao";

/**
 * Modelo de referência da importação de Assinantes (item D da Onda 12).
 * O cabeçalho tem de espelhar os campos do núcleo — inclusive as colunas
 * da Onda 12 (Perfil de assinatura e Patrocinador) — e a linha de exemplo
 * tem de ser SINTÉTICA e válida (regra de PF do CLAUDE.md).
 */
describe("modelo de importação de assinantes", () => {
  it("o cabeçalho traz todos os campos do núcleo, na ordem canônica", () => {
    expect(CABECALHO_MODELO_ASSINANTES).toEqual(
      CAMPOS_NUCLEO.map((campo) => ROTULOS_CAMPO_NUCLEO[campo]),
    );
    // As colunas da Onda 12 têm de estar presentes — é o que o item D
    // existe para mostrar ao operador.
    expect(CABECALHO_MODELO_ASSINANTES).toContain("Perfil de assinatura");
    expect(CABECALHO_MODELO_ASSINANTES).toContain("Patrocinador");
  });

  it("gera um CSV com o cabeçalho e uma linha de exemplo separados por ;", () => {
    const csv = gerarModeloAssinantesCsv();
    const linhas = csv.trimEnd().split("\r\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toBe(CABECALHO_MODELO_ASSINANTES.join(";"));
    expect(linhas[1]!.split(";")).toHaveLength(CABECALHO_MODELO_ASSINANTES.length);
  });

  it("o CPF de exemplo é sintético mas estruturalmente válido", () => {
    const csv = gerarModeloAssinantesCsv();
    const exemplo = csv.trimEnd().split("\r\n")[1]!.split(";");
    const cpf = exemplo[0]!;
    expect(validarCpf(cpf)).toBe(true);
    // O nome deixa claro que é exemplo — nunca se confunde com dado real.
    expect(csv).toContain("SINTÉTICO");
  });
});
