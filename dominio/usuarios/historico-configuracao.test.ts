import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAMPOS_DE_CONFIGURACAO,
  type EventoDeConfiguracao,
  descreverUltimaAlteracao,
  formatarValorDeConfiguracao,
} from "./historico-configuracao";

function evento(parcial: Partial<EventoDeConfiguracao>): EventoDeConfiguracao {
  return {
    campo: "tempoSessaoMin",
    valorAnterior: "30",
    valorNovo: "15",
    autorNome: "Ana Souza",
    criadoEm: new Date("2026-09-12T14:30:00Z"),
    ...parcial,
  };
}

describe("valor de configuração na linguagem da tela", () => {
  /*
   * A regra que a T35 já segue na faixa de panorama: proteção desligada
   * aparece como a PALAVRA, nunca como `0`. Seria absurdo a faixa dizer
   * "Desligado" no alto da tela e a legenda dizer "0" logo abaixo, falando do
   * mesmo número.
   */
  it("zero vira Desligado nos campos em que zero desliga", () => {
    expect(formatarValorDeConfiguracao("sessaoTetoMin", "0")).toBe("Desligado");
    expect(formatarValorDeConfiguracao("senhaValidadeDias", "0")).toBe("Desligado");
    expect(formatarValorDeConfiguracao("origemMaxTentativas", "0")).toBe("Desligado");
    expect(formatarValorDeConfiguracao("credencialProvisoriaHoras", "0")).toBe("Desligado");
  });

  it("zero NÃO vira Desligado onde zero não é desligamento", () => {
    // Comprimento mínimo zero não é "sem política": é um comprimento, e a
    // validação nem o aceita. Escrever "Desligado" inventaria um estado.
    expect(formatarValorDeConfiguracao("senhaComprimentoMin", "0")).toBe("0");
  });

  it("minutos sobem de unidade só quando a conversão é exata", () => {
    expect(formatarValorDeConfiguracao("tempoSessaoMin", "30")).toBe("30 min");
    expect(formatarValorDeConfiguracao("tempoSessaoMin", "120")).toBe("2 h");
    expect(formatarValorDeConfiguracao("sessaoTetoMin", "1440")).toBe("1 dia");
    expect(formatarValorDeConfiguracao("sessaoTetoMin", "10080")).toBe("7 dias");
    // 90 não é hora exata: mantém minutos em vez de mentir por arredondamento.
    expect(formatarValorDeConfiguracao("tempoSessaoMin", "90")).toBe("90 min");
  });

  it("horas e dias saem na unidade do campo", () => {
    expect(formatarValorDeConfiguracao("credencialProvisoriaHoras", "24")).toBe("1 dia");
    expect(formatarValorDeConfiguracao("senhaValidadeDias", "30")).toBe("30 dias");
    expect(formatarValorDeConfiguracao("senhaValidadeDias", "1")).toBe("1 dia");
  });

  it("booleano vira sim e não, nunca true e false", () => {
    expect(formatarValorDeConfiguracao("senhaExigeNumero", "true")).toBe("sim");
    expect(formatarValorDeConfiguracao("senhaExigeNumero", "false")).toBe("não");
  });

  /*
   * `null` é o que a trilha grava quando o campo não existia no retrato
   * anterior — o que acontece na PRIMEIRA gravação de cada política. Escrever
   * "0" ali afirmaria que a proteção estava desligada antes, quando a verdade
   * é que ela nunca tinha sido tocada.
   */
  it("ausência sai como traço, e não como zero", () => {
    expect(formatarValorDeConfiguracao("tempoSessaoMin", null)).toBe("—");
    expect(formatarValorDeConfiguracao("tempoSessaoMin", "")).toBe("—");
  });
});

describe("a legenda de última alteração", () => {
  it("sem evento, diz que nada mudou desde a implantação", () => {
    // Não é "sem histórico": a ausência de alteração é informação, e boa.
    expect(descreverUltimaAlteracao([])).toBe("sem alteração desde a implantação");
  });

  it("descreve campo, de → para, autor e data", () => {
    const texto = descreverUltimaAlteracao([evento({})]);
    expect(texto).toContain("Inatividade");
    expect(texto).toContain("30 min → 15 min");
    expect(texto).toContain("Ana Souza");
    expect(texto).toContain("12/09/2026");
  });

  /*
   * Uma gravação do formulário mexe em vários campos e produz um evento por
   * campo, todos no MESMO instante. Anunciar só um daria a entender que foi a
   * única mudança — e quem lesse concluiria que o resto está como sempre
   * esteve.
   */
  it("gravação que mexeu em vários campos declara quantos foram", () => {
    const instante = new Date("2026-09-12T14:30:00Z");
    const texto = descreverUltimaAlteracao([
      evento({ campo: "tempoSessaoMin", criadoEm: instante }),
      evento({ campo: "sessaoTetoMin", criadoEm: instante }),
      evento({ campo: "senhaValidadeDias", criadoEm: instante }),
    ]);
    expect(texto).toContain("e mais 2 campos");
  });

  it("dois campos no mesmo instante falam no singular", () => {
    const instante = new Date("2026-09-12T14:30:00Z");
    const texto = descreverUltimaAlteracao([
      evento({ campo: "tempoSessaoMin", criadoEm: instante }),
      evento({ campo: "sessaoTetoMin", criadoEm: instante }),
    ]);
    expect(texto).toContain("e mais 1 campo");
    expect(texto).not.toContain("campos");
  });

  it("alteração isolada não ganha complemento nenhum", () => {
    const texto = descreverUltimaAlteracao([
      evento({ criadoEm: new Date("2026-09-12T14:30:00Z") }),
      // Evento anterior, de outro momento: não conta para o "e mais N".
      evento({ campo: "sessaoTetoMin", criadoEm: new Date("2026-08-01T10:00:00Z") }),
    ]);
    expect(texto).not.toContain("e mais");
  });

  it("campo fora do mapa não quebra a legenda — usa a chave crua", () => {
    // A trilha é histórica e pode carregar o nome de um campo já removido.
    const texto = descreverUltimaAlteracao([evento({ campo: "campoAntigoRemovido" })]);
    expect(texto).toContain("campoAntigoRemovido");
  });
});

/**
 * CERCA — o mapa de campos tem de acompanhar o que o caso de uso audita.
 *
 * Campo renomeado lá e esquecido aqui **não quebra nada**: ele simplesmente
 * some do histórico, em silêncio, e a tela passa a dizer "sem alteração desde
 * a implantação" sobre uma alteração que houve. É o pior tipo de defeito desta
 * tela — ela existe para responder "isto mudou?", e responderia errado com
 * toda a confiança.
 *
 * A conferência é sobre o FONTE do caso de uso, e não sobre um segundo mapa
 * escrito à mão: duas listas mantidas em paralelo divergem na primeira
 * distração, que é exatamente o que se quer impedir.
 */
describe("o mapa de campos cobre tudo o que a F23 audita", () => {
  const fonte = readFileSync(
    join(process.cwd(), "infra", "casos-de-uso", "configuracoes.ts"),
    "utf8",
  );

  /**
   * Os campos gravados pelas funções `paraAuditavel*`.
   *
   * A leitura é do OBJETO DE RETORNO, delimitado por chaves equilibradas, e
   * não de linhas com indentação esperada. A primeira versão casava
   * `^\s{4}(\w+):` e ficou cega para `paraAuditavelSessao`, que escreve o mapa
   * inteiro numa linha só — dois campos sumiram da conferência sem que ela
   * reclamasse. Quem pegou foi a asserção de "a cerca não está cega", que
   * nomeia um campo esperado justamente porque contar quantos achou não
   * distingue "achou tudo" de "achou quase tudo".
   */
  const auditados = (() => {
    const nomes = new Set<string>();
    for (const bloco of fonte.matchAll(/function paraAuditavel\w*\([\s\S]*?\n\}/g)) {
      const corpo = bloco[0];
      const inicio = corpo.indexOf("return {");
      if (inicio === -1) continue;

      let profundidade = 0;
      let fim = corpo.length;
      for (let i = inicio + "return ".length; i < corpo.length; i += 1) {
        if (corpo[i] === "{") profundidade += 1;
        else if (corpo[i] === "}") {
          profundidade -= 1;
          if (profundidade === 0) {
            fim = i;
            break;
          }
        }
      }

      const objeto = corpo.slice(inicio + "return {".length, fim);
      for (const achado of objeto.matchAll(/(\w+)\s*:/g)) {
        nomes.add(achado[1]!);
      }
    }
    return nomes;
  })();

  it("a leitura do fonte encontrou os campos — a cerca não está cega", () => {
    expect(auditados.size).toBeGreaterThan(10);
    expect(auditados.has("tempoSessaoMin")).toBe(true);
  });

  it("todo campo auditado tem rótulo e grupo", () => {
    const semMapa = [...auditados].filter((campo) => !CAMPOS_DE_CONFIGURACAO[campo]);
    expect(
      semMapa,
      "campo auditado sem entrada em CAMPOS_DE_CONFIGURACAO: ele sumiria do histórico da T35 " +
        "sem erro nenhum, e a tela diria 'sem alteração' sobre uma alteração que houve.",
    ).toEqual([]);
  });

  it("nenhuma entrada do mapa sobrou de um campo que já não se audita", () => {
    const orfaos = Object.keys(CAMPOS_DE_CONFIGURACAO).filter(
      (campo) => !auditados.has(campo),
    );
    expect(
      orfaos,
      "entrada em CAMPOS_DE_CONFIGURACAO sem campo auditado correspondente — " +
        "renomeado ou removido no caso de uso.",
    ).toEqual([]);
  });

  it("todo grupo declarado tem ao menos um campo", () => {
    const grupos = new Set(Object.values(CAMPOS_DE_CONFIGURACAO).map((c) => c.grupo));
    expect([...grupos].sort()).toEqual(["LOGIN", "ORIGEM", "SENHA", "SESSAO"]);
  });
});
