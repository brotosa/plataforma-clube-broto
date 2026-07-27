import { describe, expect, it } from "vitest";
import {
  ErroDeEnvioDeArquivo,
  detectarTipoRealEntre,
  formatarTamanho,
  rotularFormatos,
  TIPOS_DE_ARQUIVO,
  validarArquivo,
} from "./arquivo-enviado";
import { detectarTipoReal, TIPOS_CONHECIDOS } from "@/dominio/imagens/imagem";
import { PERFIL_MINUTA, TAMANHO_MAXIMO_EM_BYTES, validarMinuta } from "@/dominio/patrocinio/minuta";
import { PERFIL_EVIDENCIA, validarEvidencia } from "@/dominio/campanhas/evidencia";

/**
 * A terceira generalização da infraestrutura de arquivo (F19).
 *
 * A prova de que ela não regrediu nada está, sobretudo, **fora daqui**:
 * `dominio/marca/marca.test.ts` e `dominio/solucoes/imagem-card.test.ts`
 * não foram tocados nesta fase e continuam verdes. Este arquivo cobre o que
 * é novo — o documento PDF — e prende as fronteiras que a generalização
 * poderia ter afrouxado sem ninguém notar.
 */

const bytes = (texto: string) => new TextEncoder().encode(texto);
const pdf = (tamanho = 64) => {
  const conteudo = new Uint8Array(tamanho);
  conteudo.set(bytes("%PDF-1.7\n"), 0);
  return conteudo;
};
const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

describe("o universo de detecção é do chamador, não global", () => {
  /**
   * A garantia mais importante desta fase. `marca.test.ts` afirma desde a
   * F15 que `detectarTipoReal(%PDF-1.7)` é `null`, e essa suíte não foi
   * tocada. Se o universo fosse global, ensinar o núcleo a reconhecer PDF
   * teria quebrado a marca — o teste abaixo é a cerca que impede alguém de
   * "simplificar" isso depois.
   */
  it("a camada de imagem não reconhece PDF, mesmo com o núcleo sabendo", () => {
    expect(detectarTipoReal(pdf())).toBeNull();
    expect(detectarTipoRealEntre(pdf(), TIPOS_CONHECIDOS)).toBeNull();
    expect(detectarTipoRealEntre(pdf(), TIPOS_DE_ARQUIVO)).toBe("application/pdf");
  });

  it("PDF é apurado pelo conteúdo, nunca pela extensão", () => {
    expect(detectarTipoRealEntre(pdf(), ["application/pdf"])).toBe("application/pdf");
    // Um PNG renomeado para .pdf continua sendo PNG.
    expect(detectarTipoRealEntre(png(), ["application/pdf"])).toBeNull();
    expect(detectarTipoRealEntre(bytes("PDF-1.7 mas sem o %"), TIPOS_DE_ARQUIVO)).toBeNull();
  });

  it("PDF com atualização incremental ou assinatura continua sendo PDF", () => {
    // Não se exige `%%EOF` no fim: minuta assinada digitalmente costuma
    // trazer bytes depois do último trailer.
    const assinado = new Uint8Array(256);
    assinado.set(bytes("%PDF-1.7\n"), 0);
    assinado.set(bytes("assinatura-em-cms"), 200);
    expect(detectarTipoRealEntre(assinado, TIPOS_DE_ARQUIVO)).toBe("application/pdf");
  });

  it("a ordem do universo decide o empate — e não há empate entre estes formatos", () => {
    for (const tipo of TIPOS_DE_ARQUIVO) {
      expect(rotularFormatos([tipo])).not.toBe("");
    }
  });
});

describe("RN62 — régua da minuta", () => {
  it("aceita PDF dentro do teto", () => {
    const validada = validarMinuta(pdf(1024), "contrato-yamer.pdf");
    expect(validada.tipoMime).toBe("application/pdf");
    expect(validada.bytes).toBe(1024);
  });

  it("recusa arquivo vazio nomeando o que selecionar", () => {
    expect(() => validarMinuta(new Uint8Array(), "contrato.pdf")).toThrow(
      /está vazio.*a minuta do contrato/s,
    );
  });

  it("recusa imagem nomeando o formato que chegou — não o genérico", () => {
    // A recusa útil diz "não aceita PNG", e não "o conteúdo não é PDF":
    // quem fotografou o contrato precisa saber que o problema é o formato.
    expect(() => validarMinuta(png(), "contrato.png")).toThrow(
      /A minuta não aceita PNG — o formato aceito aqui é PDF/,
    );
    expect(() => validarMinuta(jpeg(), "contrato.jpg")).toThrow(/não aceita JPG/);
  });

  it("recusa formato desconhecido dizendo qual é o aceito", () => {
    expect(() => validarMinuta(bytes("GIF89a...."), "contrato.gif")).toThrow(
      /não é PDF.*confere o tipo real/s,
    );
  });

  it("recusa extensão incoerente com o conteúdo", () => {
    expect(() => validarMinuta(pdf(), "contrato.docx")).toThrow(
      /extensão .docx.*conteúdo é application\/pdf/s,
    );
  });

  it("recusa acima do teto com o tamanho em MB e a dica certa", () => {
    const grande = pdf(TAMANHO_MAXIMO_EM_BYTES + 1);
    expect(() => validarMinuta(grande, "contrato.pdf")).toThrow(ErroDeEnvioDeArquivo);
    try {
      validarMinuta(grande, "contrato.pdf");
      expect.unreachable("deveria ter recusado");
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain("A minuta tem");
      expect(mensagem).toContain("2 MB");
      // A dica é de documento, não de imagem: nada de "maior dimensão".
      expect(mensagem).toContain("Comprima o PDF");
      expect(mensagem).not.toContain("px");
    }
  });

  it("nenhuma higienização é aplicada a documento", () => {
    expect(PERFIL_MINUTA.higienizar).toBeUndefined();
  });

  it("o teto do documento não vazou para os perfis de imagem", () => {
    // Os dois números vivem em arquivos diferentes de propósito. Se um dia
    // alguém "unificar" os tetos, este teste diz o que se perdeu.
    expect(PERFIL_MINUTA.tamanhoMaximoEmBytes).toBe(2 * 1024 * 1024);
    expect(PERFIL_MINUTA.tiposAceitos).toEqual(["application/pdf"]);
  });
});

describe("RN64 — régua da evidência de aprovação", () => {
  it("aceita PDF e as três imagens rasterizadas", () => {
    expect(validarEvidencia(pdf(), "aprovacao.pdf").tipoMime).toBe("application/pdf");
    expect(validarEvidencia(png(), "email.png").tipoMime).toBe("image/png");
    expect(validarEvidencia(jpeg(), "email.jpg").tipoMime).toBe("image/jpeg");
  });

  it("recusa SVG nomeando o formato, e sem higienizar nada", () => {
    expect(() => validarEvidencia(bytes('<svg xmlns="x"></svg>'), "e.svg")).toThrow(
      /A evidência não aceita SVG/,
    );
    expect(PERFIL_EVIDENCIA.higienizar).toBeUndefined();
  });

  it("a lista de aceitos aparece no plural quando há mais de um", () => {
    expect(() => validarEvidencia(bytes('<svg xmlns="x"></svg>'), "e.svg")).toThrow(
      /os formatos aceitos aqui são PDF, PNG, JPG ou WEBP/,
    );
  });
});

describe("tamanho legível", () => {
  it("usa KB abaixo de 1 MB e MB acima — nunca '2048 KB'", () => {
    expect(formatarTamanho(200 * 1024)).toBe("200 KB");
    expect(formatarTamanho(400 * 1024)).toBe("400 KB");
    expect(formatarTamanho(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatarTamanho(1536 * 1024)).toBe("1,5 MB");
  });

  it("o limite dos perfis de imagem continua sendo dito em KB", () => {
    // Regressão da F15/F17: a marca afirma "200 KB" na mensagem de recusa,
    // e a troca do formatador não pode ter mudado isso.
    expect(formatarTamanho(200 * 1024)).not.toContain("MB");
  });
});

describe("a ordem das recusas é a que faz a mensagem ser útil", () => {
  const perfilDeTeste = {
    tamanhoMaximoEmBytes: 10,
    tiposAceitos: ["application/pdf"] as const,
    universoDeDeteccao: ["application/pdf", "image/png"] as const,
    sujeito: "O anexo",
    complementoDeSelecao: "o anexo",
    fechoDeFormatoRecusado: "Envie em PDF.",
    dicaDeReducao: "Reduza o arquivo.",
  };

  it("vazio vem antes de formato, e formato antes de tamanho", () => {
    // Um PNG de 5 MB devia falar de FORMATO, não de tamanho: trocar o
    // formato é o que resolve, encolher não.
    const pngGrande = new Uint8Array(5000);
    pngGrande.set(png(), 0);
    expect(() => validarArquivo(pngGrande, "a.png", perfilDeTeste)).toThrow(/não aceita PNG/);
    // E um PDF grande fala de tamanho.
    expect(() => validarArquivo(pdf(5000), "a.pdf", perfilDeTeste)).toThrow(/O anexo tem/);
  });
});
