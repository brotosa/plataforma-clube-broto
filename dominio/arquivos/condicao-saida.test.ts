import { describe, expect, it } from "vitest";
import {
  LIMITE_MAIOR_KIT,
  LIMITE_TOTAL_ARMAZENADO,
  condicaoDeSaidaRn71,
} from "./artefato-derivado";
import { formatarTamanho } from "./arquivo-enviado";

describe("RN71 — condição objetiva de saída para o adapter de objeto", () => {
  it("dentro dos dois limites não satisfaz nada", () => {
    const c = condicaoDeSaidaRn71({
      totalBytes: 2 * 1024 * 1024 * 1024, // 2 GB
      maiorKitBytes: 30 * 1024 * 1024, // 30 MB
    });
    expect(c.satisfeita).toBe(false);
    expect(c.porTotal).toBe(false);
    expect(c.porKit).toBe(false);
  });

  it("o TOTAL acima de 5 GB satisfaz por total, sozinho", () => {
    const c = condicaoDeSaidaRn71({
      totalBytes: LIMITE_TOTAL_ARMAZENADO + 1,
      maiorKitBytes: 10 * 1024 * 1024,
    });
    expect(c).toEqual({ satisfeita: true, porTotal: true, porKit: false });
  });

  it("o MAIOR kit acima de 50 MB satisfaz por kit, sozinho", () => {
    const c = condicaoDeSaidaRn71({
      totalBytes: 100 * 1024 * 1024, // 100 MB
      maiorKitBytes: LIMITE_MAIOR_KIT + 1,
    });
    expect(c).toEqual({ satisfeita: true, porTotal: false, porKit: true });
  });

  it("exatamente no limite ainda NÃO satisfaz — é 'acima de', não 'a partir de'", () => {
    const c = condicaoDeSaidaRn71({
      totalBytes: LIMITE_TOTAL_ARMAZENADO,
      maiorKitBytes: LIMITE_MAIOR_KIT,
    });
    expect(c.satisfeita).toBe(false);
  });

  it("os limites são 5 GB e 50 MB, e o formatador os exibe como tal", () => {
    expect(LIMITE_TOTAL_ARMAZENADO).toBe(5 * 1024 * 1024 * 1024);
    expect(LIMITE_MAIOR_KIT).toBe(50 * 1024 * 1024);
    expect(formatarTamanho(LIMITE_TOTAL_ARMAZENADO)).toBe("5 GB");
    expect(formatarTamanho(LIMITE_MAIOR_KIT)).toBe("50 MB");
  });
});
