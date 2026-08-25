import { describe, expect, it } from "vitest";
import {
  CABECALHO_MODELO_TELEMETRIA,
  ErroDeLayoutTelemetria,
  analisarCsv,
  gerarModeloTelemetriaCsv,
  lerCsvTelemetria,
  validarLinhaTelemetria,
} from "./telemetria";

/**
 * Dados abaixo são SINTÉTICOS (test-only): CPFs fictícios que reprovam o
 * dígito verificador, nunca de pessoas reais.
 */
const CABECALHO =
  "data_hora_evento;cpf_assinante;id_seller;id_oferta;id_voucher;tipo_evento;valor_transacao;canal";

describe("analisarCsv", () => {
  it("respeita aspas, separador interno e escapes", () => {
    const matriz = analisarCsv('a;"b;c";"d""e"\r\nx;y;z');
    expect(matriz).toEqual([
      ["a", "b;c", 'd"e'],
      ["x", "y", "z"],
    ]);
  });

  it("ignora linhas totalmente vazias", () => {
    expect(analisarCsv("a;b\n\n;\nc;d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("lerCsvTelemetria — leitura tolerante", () => {
  it("lê o layout-alvo e mapeia o tipo de evento", () => {
    const csv = [
      CABECALHO,
      "2026-07-20T10:00:00;000.000.000-00;SELLER-1;OF-1;V-1;emissao_voucher;;app",
      "2026-07-20 11:30:00;111.111.111-11;SELLER-1;OF-1;V-2;compra_confirmada;149.90;web",
    ].join("\n");
    const linhas = lerCsvTelemetria(csv);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.tipo).toBe("EMISSAO_VOUCHER");
    expect(linhas[0]?.idVoucher).toBe("V-1");
    expect(linhas[0]?.valor).toBeNull();
    expect(linhas[1]?.tipo).toBe("COMPRA_CONFIRMADA");
    expect(linhas[1]?.valor).toBe(149.9);
    expect(linhas[1]?.dataEvento).toBeInstanceOf(Date);
  });

  it("é tolerante à ordem das colunas e a colunas extras", () => {
    const csv = [
      "id_voucher;tipo_evento;data_hora_evento;coluna_extra",
      "V-9;resgate_voucher;2026-07-21T09:00:00;lixo",
    ].join("\n");
    const linhas = lerCsvTelemetria(csv);
    expect(linhas[0]?.idVoucher).toBe("V-9");
    expect(linhas[0]?.tipo).toBe("RESGATE_VOUCHER");
    expect(linhas[0]?.dadosOriginais.coluna_extra).toBe("lixo");
  });

  it("preserva a linha original para rastreabilidade", () => {
    const csv = [CABECALHO, "2026-07-20T10:00:00;000.000.000-00;S;O;V;emissao_voucher;;app"].join("\n");
    const linha = lerCsvTelemetria(csv)[0];
    expect(linha?.dadosOriginais.id_voucher).toBe("V");
    expect(linha?.dadosOriginais.canal).toBe("app");
  });

  it("layout sem coluna essencial é erro claro, não dado errado", () => {
    const csv = "cpf;valor\n000.000.000-00;10";
    expect(() => lerCsvTelemetria(csv)).toThrow(ErroDeLayoutTelemetria);
  });

  it("arquivo vazio é erro de layout", () => {
    expect(() => lerCsvTelemetria("")).toThrow(ErroDeLayoutTelemetria);
  });
});

describe("validarLinhaTelemetria — quarentena com motivo", () => {
  const base = [CABECALHO];

  function primeiraLinha(linhaCsv: string) {
    return lerCsvTelemetria([...base, linhaCsv].join("\n"))[0]!;
  }

  it("linha bem formada não gera motivo", () => {
    const linha = primeiraLinha("2026-07-20T10:00:00;000.000.000-00;S;O;V-1;emissao_voucher;;app");
    expect(validarLinhaTelemetria(linha)).toEqual([]);
  });

  it("tipo de evento fora do cardápio vai para quarentena (nunca adivinhado)", () => {
    const linha = primeiraLinha("2026-07-20T10:00:00;000.000.000-00;S;O;V-1;reembolso;;app");
    const motivos = validarLinhaTelemetria(linha);
    expect(motivos.some((m) => m.includes("Tipo de evento desconhecido"))).toBe(true);
    expect(motivos.some((m) => m.includes("[A CONFIRMAR]"))).toBe(true);
  });

  it("voucher ausente vai para quarentena", () => {
    const linha = primeiraLinha("2026-07-20T10:00:00;000.000.000-00;S;O;;emissao_voucher;;app");
    expect(validarLinhaTelemetria(linha)).toContain("Id do voucher ausente.");
  });

  it("data inválida vai para quarentena", () => {
    const linha = primeiraLinha("data-quebrada;000.000.000-00;S;O;V-1;emissao_voucher;;app");
    expect(validarLinhaTelemetria(linha)).toContain("Data/hora do evento inválida ou ausente.");
  });

  it("compra confirmada sem valor vai para quarentena", () => {
    const linha = primeiraLinha("2026-07-20T10:00:00;000.000.000-00;S;O;V-1;compra_confirmada;;web");
    expect(validarLinhaTelemetria(linha)).toContain("Compra confirmada sem valor de transação.");
  });
});

describe("gerarModeloTelemetriaCsv — modelo para download", () => {
  const modelo = gerarModeloTelemetriaCsv();

  it("o cabeçalho do modelo é exatamente o que o leitor casa (fonte única)", () => {
    // A cerca do requisito: o modelo baixado não pode ter uma coluna que a
    // importação depois recuse. Casa o cabeçalho gerado com o leitor.
    const [cabecalho] = analisarCsv(modelo);
    expect(cabecalho).toEqual([...CABECALHO_MODELO_TELEMETRIA]);
  });

  it("o próprio modelo, reimportado como está, passa sem nenhuma quarentena", () => {
    // Baixar → enviar sem editar tem de funcionar: é o caminho que evita
    // erro. Cada linha de exemplo cobre um dos três eventos reconhecidos.
    const linhas = lerCsvTelemetria(modelo);
    expect(linhas).toHaveLength(3);
    for (const linha of linhas) {
      expect(validarLinhaTelemetria(linha), `linha ${linha.linha}`).toEqual([]);
    }
    expect(linhas.map((l) => l.tipo)).toEqual([
      "EMISSAO_VOUCHER",
      "RESGATE_VOUCHER",
      "COMPRA_CONFIRMADA",
    ]);
  });

  it("o CPF de exemplo é sintético (dígitos repetidos), nunca de pessoa real", () => {
    expect(modelo).toContain("111.111.111-11");
  });
});
