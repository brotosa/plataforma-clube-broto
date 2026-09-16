import { describe, expect, it } from "vitest";
import {
  FOLGA_ENTRE_MARCAS_MS,
  JANELA_ONLINE_MIN,
  classificarPresenca,
  descreverUltimoAcesso,
  deveRegistrarAcesso,
  rotuloDePresenca,
} from "./presenca";

const AGORA = new Date("2026-09-17T12:00:00Z");
const atras = (ms: number) => new Date(AGORA.getTime() - ms);
const min = (n: number) => n * 60_000;
const hora = (n: number) => n * 60 * 60_000;
const dia = (n: number) => n * 24 * 60 * 60_000;

describe("classificarPresenca", () => {
  it("atividade dentro da janela é on-line", () => {
    expect(classificarPresenca(AGORA, AGORA)).toBe("ONLINE");
    expect(classificarPresenca(atras(min(1)), AGORA)).toBe("ONLINE");
    expect(classificarPresenca(atras(min(JANELA_ONLINE_MIN)), AGORA)).toBe("ONLINE");
  });

  it("um minuto além da janela já é offline", () => {
    expect(classificarPresenca(atras(min(JANELA_ONLINE_MIN + 1)), AGORA)).toBe("OFFLINE");
    expect(classificarPresenca(atras(dia(3)), AGORA)).toBe("OFFLINE");
  });

  /*
   * NUNCA é estado de primeira classe, não um offline muito antigo. Para quem
   * administra, a conta criada e jamais usada é uma pergunta em aberto — a
   * credencial chegou a quem devia? —, e escondê-la dentro de "offline"
   * apagaria justamente o caso que pede ação.
   */
  it("sem marca nenhuma é NUNCA, e não offline", () => {
    expect(classificarPresenca(null, AGORA)).toBe("NUNCA");
    expect(classificarPresenca(undefined, AGORA)).toBe("NUNCA");
    expect(classificarPresenca(new Date("bagunça"), AGORA)).toBe("NUNCA");
  });

  /*
   * O relógio do banco pode estar à frente do relógio que faz a conta, e a
   * marca pode ter sido gravada na própria requisição que está desenhando a
   * tela. Nos dois casos o decorrido fica negativo — e negativo é presença
   * recentíssima, jamais ausência.
   */
  it("marca no futuro conta como on-line, nunca como ausente", () => {
    expect(classificarPresenca(new Date(AGORA.getTime() + min(2)), AGORA)).toBe("ONLINE");
  });
});

describe("descreverUltimoAcesso", () => {
  it("declara a ausência em palavras, sem número", () => {
    expect(descreverUltimoAcesso(null, AGORA)).toBe("nunca acessou");
  });

  it("sobe de unidade sem inventar precisão", () => {
    expect(descreverUltimoAcesso(atras(30_000), AGORA)).toBe("agora");
    expect(descreverUltimoAcesso(atras(min(12)), AGORA)).toBe("há 12 min");
    expect(descreverUltimoAcesso(atras(hora(1)), AGORA)).toBe("há 1 h");
    // 90 minutos é "1 h", e não "1,5 h": arredonda para baixo e não promete
    // precisão que a tela não tem.
    expect(descreverUltimoAcesso(atras(min(90)), AGORA)).toBe("há 1 h");
    expect(descreverUltimoAcesso(atras(hora(5)), AGORA)).toBe("há 5 h");
    expect(descreverUltimoAcesso(atras(dia(1)), AGORA)).toBe("ontem");
    expect(descreverUltimoAcesso(atras(dia(4)), AGORA)).toBe("há 4 dias");
    expect(descreverUltimoAcesso(atras(dia(60)), AGORA)).toBe("há 2 meses");
  });

  it("singulares não saem no plural", () => {
    expect(descreverUltimoAcesso(atras(dia(35)), AGORA)).toBe("há 1 mês");
  });
});

describe("rotuloDePresenca", () => {
  it("cada estado tem uma palavra própria", () => {
    expect(rotuloDePresenca("ONLINE")).toBe("On-line");
    expect(rotuloDePresenca("OFFLINE")).toBe("Offline");
    expect(rotuloDePresenca("NUNCA")).toBe("Nunca acessou");
  });
});

/**
 * A folga é o que separa um indicador barato de uma escrita por clique: a
 * marca vive no caminho de autenticação, que roda a cada requisição
 * autenticada. Sem ela, abrir cinco telas seriam cinco `UPDATE`.
 */
describe("deveRegistrarAcesso", () => {
  it("conta sem marca sempre grava — é o primeiro acesso dela", () => {
    expect(deveRegistrarAcesso(null, AGORA)).toBe(true);
  });

  it("dentro da folga não regrava", () => {
    expect(deveRegistrarAcesso(atras(FOLGA_ENTRE_MARCAS_MS - 1), AGORA)).toBe(false);
    expect(deveRegistrarAcesso(AGORA, AGORA)).toBe(false);
  });

  it("completada a folga, regrava", () => {
    expect(deveRegistrarAcesso(atras(FOLGA_ENTRE_MARCAS_MS), AGORA)).toBe(true);
    expect(deveRegistrarAcesso(atras(hora(2)), AGORA)).toBe(true);
  });

  /*
   * A folga precisa ser bem menor que a janela de on-line: se fosse maior,
   * uma conta ativa poderia aparecer offline entre duas gravações — o
   * indicador mentiria por causa da própria economia que o barateia.
   */
  it("a folga cabe com sobra dentro da janela de on-line", () => {
    expect(FOLGA_ENTRE_MARCAS_MS).toBeLessThan(JANELA_ONLINE_MIN * 60_000);
  });
});
