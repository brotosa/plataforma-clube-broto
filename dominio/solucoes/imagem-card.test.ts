import { describe, expect, it } from "vitest";
import { ErroDeImagem, validarImagem } from "@/dominio/imagens/imagem";
import {
  MAIOR_DIMENSAO_DE_USO as MARCA_MAIOR_DIMENSAO,
  PERFIL_MARCA,
  TAMANHO_MAXIMO_EM_BYTES as MARCA_TETO,
  TIPOS_ACEITOS as MARCA_TIPOS,
  validarMarca,
} from "@/dominio/marca/marca";
import {
  FORMATOS_ACEITOS_ROTULO,
  MAIOR_DIMENSAO_DE_USO,
  PERFIL_IMAGEM_CARD,
  TAMANHO_MAXIMO_EM_BYTES,
  TIPOS_ACEITOS,
  validarImagemDeCard,
} from "./imagem-card";

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

const SVG_LIMPO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';

describe("RN60 — a imagem do card é aceita nos três formatos rasterizados", () => {
  it.each([
    ["PNG", png(), "card.png"],
    ["JPG", jpeg(), "card.jpg"],
    ["JPEG (a outra extensão do mesmo tipo)", jpeg(), "card.jpeg"],
    ["WEBP", webp(), "card.webp"],
  ])("aceita %s", (_rotulo, conteudo, nome) => {
    const validada = validarImagemDeCard(conteudo, nome);
    expect(validada.bytes).toBe(conteudo.length);
    expect(TIPOS_ACEITOS).toContain(validada.tipoMime);
  });

  it("o rótulo de formatos não promete SVG", () => {
    expect(FORMATOS_ACEITOS_ROTULO).toBe("PNG, JPG ou WEBP");
  });
});

describe("RN60 — recusas, cada uma nomeando o motivo (RN55)", () => {
  it("recusa acima de 400 KB dizendo o tamanho, o limite e a dimensão útil", () => {
    const grande = png(TAMANHO_MAXIMO_EM_BYTES + 1);
    expect(() => validarImagemDeCard(grande, "card.png")).toThrow(ErroDeImagem);
    expect(() => validarImagemDeCard(grande, "card.png")).toThrow(
      /A imagem do card tem .* e o limite é 400 KB/,
    );
    expect(() => validarImagemDeCard(grande, "card.png")).toThrow(
      new RegExp(`${MAIOR_DIMENSAO_DE_USO} px`),
    );
  });

  it("aceita exatamente no teto — o limite é inclusivo", () => {
    const noLimite = png(TAMANHO_MAXIMO_EM_BYTES - 8);
    expect(noLimite.length).toBe(TAMANHO_MAXIMO_EM_BYTES);
    expect(() => validarImagemDeCard(noLimite, "card.png")).not.toThrow();
  });

  /**
   * O caso que separa esta entidade da marca. O SVG é **válido** e seria
   * aceito no logotipo; aqui ele é recusado, e a mensagem precisa dizer
   * isso — mandar a pessoa "conferir o arquivo" quando o arquivo está
   * certo é o conselho errado.
   */
  it("recusa SVG ainda que válido, nomeando o formato e os aceitos", () => {
    expect(() => validarImagemDeCard(bytes(SVG_LIMPO), "card.svg")).toThrow(ErroDeImagem);
    expect(() => validarImagemDeCard(bytes(SVG_LIMPO), "card.svg")).toThrow(
      /A imagem do card não aceita SVG — os formatos aceitos aqui são PNG, JPG ou WEBP/,
    );
  });

  it("recusa SVG mesmo com nome de arquivo disfarçado de PNG", () => {
    // A extensão nunca decide: o conteúdo é SVG e a recusa é a de formato.
    expect(() => validarImagemDeCard(bytes(SVG_LIMPO), "card.png")).toThrow(/não aceita SVG/);
  });

  it("recusa tipo real divergente da extensão, nomeando os dois", () => {
    expect(() => validarImagemDeCard(webp(), "card.png")).toThrow(
      /extensão .png.*conteúdo é image\/webp/s,
    );
  });

  it("recusa conteúdo que não é imagem conhecida", () => {
    expect(() => validarImagemDeCard(bytes("GIF89a...."), "card.gif")).toThrow(
      /não é PNG, JPG ou WEBP/,
    );
  });

  it("recusa arquivo vazio nomeando o campo", () => {
    expect(() => validarImagemDeCard(new Uint8Array(), "card.png")).toThrow(
      /Selecione a imagem do card da solução/,
    );
  });
});

/**
 * A cerca da F17: generalizar não podia mexer na marca.
 *
 * `dominio/marca/marca.test.ts` não foi tocado nesta fase e já prova o
 * comportamento por inteiro. Este bloco prova a outra metade — que a
 * **calibragem** dos dois perfis continua diferente onde tem de ser, e que
 * nenhum deles herdou o número do outro. É o defeito que uma generalização
 * apressada produz: um perfil só, com os valores do último que mexeu.
 */
describe("RN54 intacta — a generalização não mudou a marca", () => {
  it("os tetos são diferentes, e cada um é o seu", () => {
    expect(MARCA_TETO).toBe(200 * 1024);
    expect(TAMANHO_MAXIMO_EM_BYTES).toBe(400 * 1024);
    expect(PERFIL_MARCA.tamanhoMaximoEmBytes).toBe(MARCA_TETO);
    expect(PERFIL_IMAGEM_CARD.tamanhoMaximoEmBytes).toBe(TAMANHO_MAXIMO_EM_BYTES);
  });

  it("as dimensões de uso são diferentes, e cada uma é a sua", () => {
    expect(MARCA_MAIOR_DIMENSAO).toBe(320);
    expect(MAIOR_DIMENSAO_DE_USO).toBe(640);
  });

  it("SVG continua aceito na marca e continua fora do card", () => {
    expect(MARCA_TIPOS).toContain("image/svg+xml");
    expect(TIPOS_ACEITOS).not.toContain("image/svg+xml");
    // E na prática, não só na lista:
    expect(() => validarMarca(bytes(SVG_LIMPO), "marca.svg")).not.toThrow();
    expect(() => validarImagemDeCard(bytes(SVG_LIMPO), "card.svg")).toThrow();
  });

  it("um arquivo de 300 KB passa no card e é recusado na marca", () => {
    // O mesmo byte, dois vereditos: é o que prova que o teto é por perfil
    // e não uma constante global que a generalização unificou sem querer.
    const trezentosKb = png(300 * 1024 - 8);
    expect(() => validarImagemDeCard(trezentosKb, "card.png")).not.toThrow();
    expect(() => validarMarca(trezentosKb, "marca.png")).toThrow(/limite é 200 KB/);
  });

  it("as mensagens de tamanho nomeiam o sujeito certo em cada perfil", () => {
    const grande = png(500 * 1024);
    expect(() => validarMarca(grande, "marca.png")).toThrow(/^A marca tem/);
    expect(() => validarImagemDeCard(grande, "card.png")).toThrow(/^A imagem do card tem/);
  });
});

describe("o núcleo é um só — perfis não duplicam mecanismo", () => {
  it("os dois perfis passam pela mesma função de validação", () => {
    // Chamar o núcleo direto com cada perfil tem de dar exatamente o mesmo
    // resultado que a função de conveniência da entidade. Se um dia alguém
    // acrescentar uma regra "só na marca" fora do núcleo, isto quebra.
    expect(validarImagem(png(), "x.png", PERFIL_MARCA)).toEqual(validarMarca(png(), "x.png"));
    expect(validarImagem(png(), "x.png", PERFIL_IMAGEM_CARD)).toEqual(
      validarImagemDeCard(png(), "x.png"),
    );
  });

  it("a recusa de SVG é do perfil, não do núcleo", () => {
    // O núcleo reconhece SVG (é preciso, para nomear a recusa); quem decide
    // aceitar é o perfil.
    expect(() => validarImagem(bytes(SVG_LIMPO), "x.svg", PERFIL_MARCA)).not.toThrow();
    expect(() => validarImagem(bytes(SVG_LIMPO), "x.svg", PERFIL_IMAGEM_CARD)).toThrow(
      /não aceita SVG/,
    );
  });
});
