import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/infra/log/logger";
import {
  SALTOS_MAXIMO,
  VARIAVEL_DE_SALTOS,
  extrairOrigem,
  lerSaltosConfiaveis,
  reiniciarAvisosDeOrigem,
} from "./origem-requisicao";

/**
 * A leitura de origem por saltos confiáveis (Onda 21, F32).
 *
 * O caso que dá nome à fase é o **1 salto**: com o balanceador na frente, o
 * cliente pode prefixar `x-forwarded-for` com o que quiser, e a leitura da
 * direita para a esquerda tem de ignorar tudo isso.
 *
 * Os três números são exercitados porque o parâmetro existe justamente para
 * variar: 0 é o comportamento anterior a esta fase, 1 é a topologia de hoje
 * (ALB sozinho, confirmado em 18/09), 2 é o dia em que entrar uma CDN.
 */

// pino escreveria em stdout a cada aviso; o teste confere a CHAMADA, não o
// texto impresso.
const aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

beforeEach(() => {
  reiniciarAvisosDeOrigem();
  aviso.mockClear();
});

afterAll(() => {
  aviso.mockRestore();
});

describe("lerSaltosConfiaveis", () => {
  it("sem a variável, é zero — o comportamento anterior à fase", () => {
    expect(lerSaltosConfiaveis(undefined)).toBe(0);
    expect(lerSaltosConfiaveis("")).toBe(0);
    expect(lerSaltosConfiaveis("   ")).toBe(0);
  });

  it("lê o inteiro declarado", () => {
    expect(lerSaltosConfiaveis("1")).toBe(1);
    expect(lerSaltosConfiaveis(" 2 ")).toBe(2);
    expect(lerSaltosConfiaveis("0")).toBe(0);
  });

  it("valor ilegível cai para zero e NOMEIA a variável, sem imprimir o valor (RN55)", () => {
    for (const ruim of ["abc", "-1", "1.5", String(SALTOS_MAXIMO + 1)]) {
      aviso.mockClear();
      expect(lerSaltosConfiaveis(ruim)).toBe(0);
      expect(aviso).toHaveBeenCalledTimes(1);
      const [contexto] = aviso.mock.calls[0] as [Record<string, unknown>, string];
      expect(contexto.variavel).toBe(VARIAVEL_DE_SALTOS);
      // O valor ilegível não entra no log em hipótese alguma.
      expect(JSON.stringify(aviso.mock.calls[0])).not.toContain(ruim);
    }
  });

  it("lê de process.env quando nada é passado", () => {
    const anterior = process.env[VARIAVEL_DE_SALTOS];
    try {
      process.env[VARIAVEL_DE_SALTOS] = "2";
      expect(lerSaltosConfiaveis()).toBe(2);
    } finally {
      if (anterior === undefined) delete process.env[VARIAVEL_DE_SALTOS];
      else process.env[VARIAVEL_DE_SALTOS] = anterior;
    }
  });
});

describe("extrairOrigem — 0 saltos (sem borda declarada)", () => {
  it("lê o primeiro elemento, que é o comportamento de antes da F32", () => {
    expect(extrairOrigem("1.2.3.4, 10.0.0.1", null, 0)).toBe("1.2.3.4");
  });

  it("cai para x-real-ip quando não há cabeçalho de encaminhamento", () => {
    expect(extrairOrigem(null, "9.9.9.9", 0)).toBe("9.9.9.9");
  });

  it("avisa UMA vez por processo que está lendo origem sem borda declarada", () => {
    extrairOrigem("1.2.3.4, 10.0.0.1", null, 0);
    extrairOrigem("5.6.7.8, 10.0.0.1", null, 0);
    extrairOrigem("7.7.7.7", null, 0);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("não avisa quando não há cadeia nenhuma (desenvolvimento local)", () => {
    expect(extrairOrigem(null, "127.0.0.1", 0)).toBe("127.0.0.1");
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("extrairOrigem — 1 salto (a topologia de hoje: ALB sozinho)", () => {
  it("lê o ÚLTIMO elemento, que é o que o balanceador acrescentou", () => {
    expect(extrairOrigem("200.1.2.3", null, 1)).toBe("200.1.2.3");
  });

  /**
   * O defeito que a fase inteira existe para fechar.
   *
   * Antes, `x-forwarded-for: 1.2.3.4` bastava para a aplicação acreditar que a
   * origem era `1.2.3.4` — e trocar de valor a cada tentativa evadia o
   * bloqueio por origem com uma linha de `curl`.
   */
  it("IGNORA o que o cliente prefixou", () => {
    expect(extrairOrigem("1.2.3.4, 200.1.2.3", null, 1)).toBe("200.1.2.3");
    expect(extrairOrigem("1.2.3.4, 5.6.7.8, 9.9.9.9, 200.1.2.3", null, 1)).toBe("200.1.2.3");
  });

  it("com 1 salto o x-real-ip não vale mais — o balanceador não o escreve", () => {
    expect(extrairOrigem(null, "1.2.3.4", 1)).toBeNull();
  });

  it("lista vazia ou só com separadores é ausência, não o valor do cliente", () => {
    expect(extrairOrigem("", "1.2.3.4", 1)).toBeNull();
    expect(extrairOrigem(" , , ", null, 1)).toBeNull();
  });

  it("descarta elementos vazios antes de contar da direita", () => {
    expect(extrairOrigem(",,,1.2.3.4, 200.1.2.3", null, 1)).toBe("200.1.2.3");
  });
});

describe("extrairOrigem — 2 saltos (o dia em que entrar uma CDN)", () => {
  it("lê o penúltimo: a CDN acrescentou o cliente, o balanceador acrescentou a CDN", () => {
    expect(extrairOrigem("1.2.3.4, 200.1.2.3, 70.70.70.70", null, 2)).toBe("200.1.2.3");
  });

  it("lista do tamanho exato dos saltos ainda vale — nada forjado sobreviveu", () => {
    expect(extrairOrigem("200.1.2.3, 70.70.70.70", null, 2)).toBe("200.1.2.3");
  });

  /**
   * Cadeia mais curta que a topologia: alguém falando por fora da borda, ou
   * borda que não acrescentou. Cair para o primeiro elemento aqui seria ler o
   * valor forjado exatamente no caso suspeito.
   */
  it("cadeia mais curta que a topologia é NULA, nunca o primeiro elemento", () => {
    expect(extrairOrigem("1.2.3.4", null, 2)).toBeNull();
    expect(aviso).toHaveBeenCalledTimes(1);
    const [contexto] = aviso.mock.calls[0] as [Record<string, unknown>, string];
    expect(contexto).toEqual({ recebidos: 1, esperados: 2 });
  });

  it("o aviso de cadeia curta não carrega o conteúdo do cabeçalho", () => {
    extrairOrigem("texto-que-o-cliente-escreveu", null, 2);
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("texto-que-o-cliente-escreveu");
  });
});

describe("extrairOrigem — normalização (preservada da versão anterior)", () => {
  it("recusa o que não é alfabeto de endereço, em vez de gravar", () => {
    expect(extrairOrigem("unknown", null, 1)).toBeNull();
    expect(extrairOrigem("1.2.3.4 <script>", null, 1)).toBeNull();
    expect(extrairOrigem("nao-e-endereco", null, 0)).toBeNull();
  });

  it("recusa valor longo demais para ser endereço", () => {
    expect(extrairOrigem("1".repeat(46), null, 1)).toBeNull();
  });

  it("aceita IPv6", () => {
    expect(extrairOrigem("2804:14d:1::1", null, 1)).toBe("2804:14d:1::1");
    expect(extrairOrigem("2804:14d:1::1%1", null, 1)).toBe("2804:14d:1::1%1");
  });

  /**
   * Limitação **anterior** a esta fase, registrada porque surpreende: o
   * alfabeto admite `%`, mas não as letras de um nome de interface, então
   * `fe80::1%eth0` é recusado. Não é defeito em uso — endereço de enlace
   * local não chega por balanceador —, e alargar o alfabeto é decisão de
   * outra fase, não efeito colateral desta.
   */
  it("recusa zona NOMEADA de IPv6 — comportamento preservado, não introduzido aqui", () => {
    expect(extrairOrigem("fe80::1%eth0", null, 1)).toBeNull();
  });
});
