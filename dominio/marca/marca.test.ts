import { describe, expect, it } from "vitest";
import {
  ErroDeMarca,
  MAIOR_DIMENSAO_DE_USO,
  TAMANHO_MAXIMO_EM_BYTES,
  detectarTipoReal,
  higienizarSvg,
  validarMarca,
} from "./marca";

// ---------------------------------------------------------------------
// Fixtures — bytes construídos aqui, nunca arquivo real de aliado.
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

function bytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

function texto(conteudo: Uint8Array): string {
  return new TextDecoder().decode(conteudo);
}

const SVG_LIMPO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

describe("RN54 — tipo real apurado pelo conteúdo, nunca pela extensão", () => {
  it("reconhece os quatro formatos aceitos", () => {
    expect(detectarTipoReal(png())).toBe("image/png");
    expect(detectarTipoReal(jpeg())).toBe("image/jpeg");
    expect(detectarTipoReal(webp())).toBe("image/webp");
    expect(detectarTipoReal(bytes(SVG_LIMPO))).toBe("image/svg+xml");
  });

  it("aceita SVG com declaração XML, doctype e comentário antes da raiz", () => {
    const comPrologo =
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- exportado pela ferramenta -->\n' + SVG_LIMPO;
    expect(detectarTipoReal(bytes(comPrologo))).toBe("image/svg+xml");
  });

  it("aceita SVG com BOM e com prefixo de namespace na raiz", () => {
    expect(detectarTipoReal(bytes("﻿" + SVG_LIMPO))).toBe("image/svg+xml");
    expect(detectarTipoReal(bytes('<svg:svg xmlns:svg="http://www.w3.org/2000/svg"></svg:svg>'))).toBe(
      "image/svg+xml",
    );
  });

  it("recusa formato não aceito (GIF, PDF, ZIP, executável)", () => {
    expect(detectarTipoReal(bytes("GIF89a"))).toBeNull();
    expect(detectarTipoReal(bytes("%PDF-1.7"))).toBeNull();
    expect(detectarTipoReal(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
    expect(detectarTipoReal(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it("recusa HTML que só contém um <svg> no meio — a raiz é que decide", () => {
    const html = '<html><body><svg xmlns="http://www.w3.org/2000/svg"></svg></body></html>';
    expect(detectarTipoReal(bytes(html))).toBeNull();
  });

  it("recusa RIFF que não é WEBP (WAV tem a mesma abertura)", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(detectarTipoReal(wav)).toBeNull();
  });

  it("o que manda é o conteúdo: PNG renomeado para .svg continua sendo PNG", () => {
    expect(detectarTipoReal(png())).toBe("image/png");
  });
});

describe("RN54 — higienização do SVG", () => {
  it("remove <script> e o que ele carrega", () => {
    const sujo = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="4"/></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toContain("script");
    expect(limpo).not.toContain("alert");
    expect(limpo).toContain("<circle");
  });

  it("remove <script> com prefixo de namespace e com atributos", () => {
    const sujo = `<svg xmlns="http://www.w3.org/2000/svg"><svg:script type="text/ecmascript">alert(1)</svg:script><rect/></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toContain("alert");
    expect(limpo).toContain("<rect");
  });

  it("remove manipuladores de evento nas três formas de aspas", () => {
    const sujo =
      `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">` +
      `<circle onclick='alert(2)' r="4"/><rect onmouseover=alert(3) /></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toMatch(/onload|onclick|onmouseover/i);
    expect(limpo).not.toContain("alert");
  });

  it("remove <foreignObject>, que embute documento estranho", () => {
    const sujo =
      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml">` +
      `<iframe src="https://exemplo.invalido"></iframe></body></foreignObject><path d="M0 0"/></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toMatch(/foreignObject|iframe/i);
    expect(limpo).toContain("<path");
  });

  it("remove referência externa em href e xlink:href, preservando âncora interna", () => {
    const sujo =
      `<svg xmlns="http://www.w3.org/2000/svg"><use href="#simbolo"/>` +
      `<image xlink:href="https://exemplo.invalido/pixel.png"/>` +
      `<use href="//exemplo.invalido/x.svg#a"/></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).toContain('href="#simbolo"');
    expect(limpo).not.toContain("exemplo.invalido");
  });

  it("preserva imagem embutida em data:, que não faz requisição", () => {
    const embutida =
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>';
    expect(higienizarSvg(embutida)).toContain("data:image/png;base64");
  });

  it("remove esquema javascript: mesmo disfarçado com espaço ou controle", () => {
    const sujo = `<svg xmlns="http://www.w3.org/2000/svg"><a href="jav\tascript:alert(1)"><rect/></a></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toMatch(/ascript:/);
    expect(limpo).toContain("<rect");
  });

  it("remove @import e url() externo do CSS embutido, mantendo url(#gradiente)", () => {
    const sujo =
      `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://exemplo.invalido/f.css");` +
      `.a{fill:url(#gradiente);background:url(https://exemplo.invalido/i.png)}</style><rect class="a"/></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toContain("@import");
    expect(limpo).not.toContain("exemplo.invalido");
    expect(limpo).toContain("url(#gradiente)");
  });

  it("remove <set>/<animate>, que trocam atributo em tempo de execução", () => {
    const sujo =
      `<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="javascript:alert(1)"/>` +
      `<rect/></a></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toMatch(/<set|javascript:/i);
    expect(limpo).toContain("<rect");
  });

  it("comentário não serve de esconderijo para script", () => {
    const sujo = `<svg xmlns="http://www.w3.org/2000/svg"><!-- <script>alert(1)</script> --><rect/></svg>`;
    const limpo = higienizarSvg(sujo);
    expect(limpo).not.toContain("alert");
  });

  it("recusa com motivo quando o <script> sem fechamento leva o resto do arquivo", () => {
    // Tag aberta e nunca fechada: o navegador executaria tudo o que vem
    // depois. Truncar e gravar um desenho pela metade seria pior — recusa.
    const sujo = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)`;
    expect(() => higienizarSvg(sujo)).toThrow(ErroDeMarca);
    expect(() => higienizarSvg(sujo)).toThrow(/não pôde ser higienizado/);
  });

  it("SVG já limpo atravessa sem perder o desenho", () => {
    const limpo = higienizarSvg(SVG_LIMPO);
    expect(limpo).toContain("<circle");
    expect(limpo).toContain('viewBox="0 0 10 10"');
  });
});

describe("RN54 — régua completa do envio", () => {
  it("aceita PNG dentro do limite e devolve o tipo real", () => {
    const resultado = validarMarca(png(), "marca.png");
    expect(resultado.tipoMime).toBe("image/png");
    expect(resultado.bytes).toBe(png().length);
  });

  it("recusa arquivo acima de 200 KB, nomeando o tamanho e o limite", () => {
    const grande = png(TAMANHO_MAXIMO_EM_BYTES + 1);
    expect(() => validarMarca(grande, "marca.png")).toThrow(ErroDeMarca);
    try {
      validarMarca(grande, "marca.png");
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain("200 KB");
      expect(mensagem).toContain(String(MAIOR_DIMENSAO_DE_USO));
    }
  });

  it("aceita exatamente no limite — o teto é inclusivo", () => {
    const noLimite = png(TAMANHO_MAXIMO_EM_BYTES - 8);
    expect(validarMarca(noLimite, "marca.png").bytes).toBe(TAMANHO_MAXIMO_EM_BYTES);
  });

  it("recusa arquivo vazio", () => {
    expect(() => validarMarca(new Uint8Array(), "marca.png")).toThrow(/está vazio/);
  });

  it("recusa formato não aceito dizendo que o tipo real é conferido", () => {
    expect(() => validarMarca(bytes("GIF89a...."), "marca.gif")).toThrow(
      /não é PNG, JPG, WEBP ou SVG/,
    );
  });

  it("recusa tipo real divergente da extensão, nomeando os dois", () => {
    // O vetor clássico: um WEBP (ou pior) chamado "logo.png".
    expect(() => validarMarca(webp(), "logo.png")).toThrow(/extensão .png.*conteúdo é image\/webp/s);
  });

  it("aceita .jpeg e .jpg para o mesmo conteúdo JPEG", () => {
    expect(validarMarca(jpeg(), "marca.jpg").tipoMime).toBe("image/jpeg");
    expect(validarMarca(jpeg(), "marca.jpeg").tipoMime).toBe("image/jpeg");
  });

  it("grava o SVG HIGIENIZADO, não o que chegou", () => {
    const sujo = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`;
    const resultado = validarMarca(bytes(sujo), "marca.svg");
    expect(texto(resultado.conteudo)).not.toContain("alert");
    expect(resultado.bytes).toBe(resultado.conteudo.length);
    expect(resultado.bytes).toBeLessThan(sujo.length);
  });

  it("SVG com script é recusado quando a higienização não salva o arquivo", () => {
    expect(() => validarMarca(bytes("<svg><script>alert(1)"), "marca.svg")).toThrow(ErroDeMarca);
  });

  it("o teto vale sobre o conteúdo já higienizado", () => {
    // Um SVG cujo peso está quase todo dentro de um <script> gigante cabe
    // depois de limpo — e é o arquivo limpo que ocupa o banco.
    const recheio = "a".repeat(TAMANHO_MAXIMO_EM_BYTES);
    const sujo = `<svg xmlns="http://www.w3.org/2000/svg"><script>${recheio}</script><rect/></svg>`;
    const resultado = validarMarca(bytes(sujo), "marca.svg");
    expect(resultado.bytes).toBeLessThan(TAMANHO_MAXIMO_EM_BYTES);
  });
});
