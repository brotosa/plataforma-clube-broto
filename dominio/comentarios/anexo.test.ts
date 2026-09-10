import { describe, expect, it } from "vitest";
import { ErroDeEnvioDeArquivo } from "@/dominio/arquivos/arquivo-enviado";
import {
  FORMATOS_ACEITOS_ROTULO,
  TAMANHO_MAXIMO_EM_BYTES,
  TIPOS_ACEITOS,
  validarAnexoComentario,
} from "./anexo";

// ---------------------------------------------------------------------
// Fixtures — bytes construídos aqui, nunca arquivo real. (Regra inviolável.)
// ---------------------------------------------------------------------

function png(corpo = 32): Uint8Array {
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return new Uint8Array([...assinatura, ...new Array(corpo).fill(0x00)]);
}

function jpeg(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function webp(): Uint8Array {
  const riff = [0x52, 0x49, 0x46, 0x46];
  const tamanho = [0x00, 0x00, 0x00, 0x00];
  const webpTag = [0x57, 0x45, 0x42, 0x50];
  return new Uint8Array([...riff, ...tamanho, ...webpTag, 0x56, 0x50, 0x38, 0x20]);
}

function pdf(corpo = 32): Uint8Array {
  const assinatura = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  return new Uint8Array([...assinatura, ...new Array(corpo).fill(0x20)]);
}

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

describe("anexo do comentário — PDF ou print, guardado pela plataforma", () => {
  it("aceita os quatro formatos: PDF, PNG, JPG e WEBP", () => {
    expect(validarAnexoComentario(pdf(), "contrato.pdf").tipoMime).toBe("application/pdf");
    expect(validarAnexoComentario(png(), "print.png").tipoMime).toBe("image/png");
    expect(validarAnexoComentario(jpeg(), "foto.jpg").tipoMime).toBe("image/jpeg");
    expect(validarAnexoComentario(webp(), "foto.webp").tipoMime).toBe("image/webp");
  });

  it("apura o tipo pelo CONTEÚDO, não pela extensão — renomear não engana", () => {
    // Um PNG renomeado para .pdf: o conteúdo manda, e a incoerência é avisada.
    expect(() => validarAnexoComentario(png(), "disfarce.pdf")).toThrow(ErroDeEnvioDeArquivo);
  });

  it("recusa SVG nomeando o formato (RN60 — sem vetor no anexo)", () => {
    // SVG é reconhecido (está no universo de detecção) só para a recusa dizer
    // qual formato é — não para ser aceito.
    try {
      validarAnexoComentario(bytes(SVG), "print.svg");
      throw new Error("deveria ter recusado o SVG");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeEnvioDeArquivo);
      expect((erro as Error).message).toContain("SVG");
    }
    expect(TIPOS_ACEITOS).not.toContain("image/svg+xml");
  });

  it("recusa formato desconhecido (GIF, ZIP) nomeando a causa", () => {
    expect(() => validarAnexoComentario(bytes("GIF89a..."), "x.gif")).toThrow(ErroDeEnvioDeArquivo);
    expect(() => validarAnexoComentario(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "x.zip")).toThrow(
      ErroDeEnvioDeArquivo,
    );
  });

  it("recusa arquivo vazio", () => {
    expect(() => validarAnexoComentario(new Uint8Array([]), "vazio.pdf")).toThrow(
      ErroDeEnvioDeArquivo,
    );
  });

  it("recusa acima do teto, com o tamanho e o limite na mensagem (RN55)", () => {
    const grande = pdf(TAMANHO_MAXIMO_EM_BYTES + 1);
    try {
      validarAnexoComentario(grande, "grande.pdf");
      throw new Error("deveria ter recusado por tamanho");
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeEnvioDeArquivo);
      expect((erro as Error).message).toContain("limite");
    }
  });

  it("o rótulo dos formatos lista os quatro aceitos", () => {
    expect(FORMATOS_ACEITOS_ROTULO).toBe("PDF, PNG, JPG ou WEBP");
  });
});
