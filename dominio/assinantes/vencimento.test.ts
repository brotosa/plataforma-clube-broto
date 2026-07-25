import { describe, expect, it } from "vitest";
import { diasAteVencimento, janelaVencimento, venceEm } from "./vencimento";

const hoje = new Date("2026-07-25T12:00:00Z");
const emDias = (dias: number) =>
  new Date(Date.UTC(2026, 6, 25 + dias, 3, 0, 0));

describe("RN37 — janelas de vencimento (visibilidade e filtro; nenhuma ação)", () => {
  it("conta dias de calendário ignorando horas", () => {
    expect(diasAteVencimento(emDias(0), hoje)).toBe(0);
    expect(diasAteVencimento(emDias(30), hoje)).toBe(30);
    expect(diasAteVencimento(emDias(-1), hoje)).toBe(-1);
  });

  it("classifica na janela mais apertada (T19)", () => {
    expect(janelaVencimento(emDias(0), hoje)).toBe(30);
    expect(janelaVencimento(emDias(30), hoje)).toBe(30);
    expect(janelaVencimento(emDias(31), hoje)).toBe(60);
    expect(janelaVencimento(emDias(60), hoje)).toBe(60);
    expect(janelaVencimento(emDias(61), hoje)).toBe(90);
    expect(janelaVencimento(emDias(90), hoje)).toBe(90);
  });

  it("vencido ou além de 90 dias fica fora das janelas (null)", () => {
    expect(janelaVencimento(emDias(-1), hoje)).toBeNull();
    expect(janelaVencimento(emDias(91), hoje)).toBeNull();
  });

  it("filtro cumulativo: vence em 90 inclui quem vence em 30; vencido não conta", () => {
    expect(venceEm(emDias(10), hoje, 30)).toBe(true);
    expect(venceEm(emDias(10), hoje, 90)).toBe(true);
    expect(venceEm(emDias(45), hoje, 30)).toBe(false);
    expect(venceEm(emDias(45), hoje, 60)).toBe(true);
    expect(venceEm(emDias(-1), hoje, 30)).toBe(false);
  });
});
