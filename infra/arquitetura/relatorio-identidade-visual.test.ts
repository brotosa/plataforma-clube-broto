import { describe, expect, it } from "vitest";

import { ASSUNTOS } from "@/dominio/relatorios/catalogo";
import {
  SLUGS_COM_IDENTIDADE,
  identidadeDoAssunto,
  relatoriosProntos,
} from "@/app/(plataforma)/relatorios/identidade";

/**
 * A identidade visual acompanha o catálogo — ou o build avisa.
 *
 * Mora em `infra/arquitetura/` e não ao lado do módulo que testa porque a
 * suíte só varre `dominio/` e `infra/` (`vitest.config.ts`). Um teste dentro
 * de `app/` não seria recusado: ele simplesmente **nunca rodaria**, verde por
 * nunca ter sido executado — que é a pior forma de um teste falhar.
 *
 * O padrão genérico existe para a tela nunca cair (ver o cabeçalho do módulo),
 * e é justamente por isso que ele precisa de um teste: assunto esquecido aqui
 * **não quebra nada**. Ele aparece em azul, com o ícone de barrinhas, e
 * ninguém nota até alguém abrir a tela e achar estranho — que é tarde, e é
 * exatamente o modo de falha que a T36 já teve uma vez, com as sete classes
 * de CSS que não existiam.
 */
describe("identidade visual dos assuntos", () => {
  it("todo assunto do catálogo tem cor, ícone e etiqueta próprios", () => {
    const semIdentidade = ASSUNTOS.map((assunto) => assunto.slug).filter(
      (slug) => !SLUGS_COM_IDENTIDADE.includes(slug),
    );
    expect(
      semIdentidade,
      "assunto sem entrada em app/(plataforma)/relatorios/identidade.ts. Ele não quebra a " +
        "tela — sai no azul genérico, e é por isso que só este teste o pega. Escolha uma cor " +
        "escura o bastante para receber texto e branco por cima (ver o cabeçalho do módulo).",
    ).toEqual([]);
  });

  it("nenhuma identidade sobra de um assunto que saiu do catálogo", () => {
    const doCatalogo = new Set(ASSUNTOS.map((assunto) => assunto.slug));
    expect(SLUGS_COM_IDENTIDADE.filter((slug) => !doCatalogo.has(slug))).toEqual([]);
  });

  it("slug desconhecido recebe o padrão, e não um vazio", () => {
    // O contraponto do primeiro teste: a tela de quem tem direito a ver um
    // assunto novo precisa abrir mesmo mal vestida (RN76).
    const generico = identidadeDoAssunto("assunto-que-nao-existe");
    expect(generico.cor).toMatch(/^#[0-9A-F]{6}$/i);
    expect(generico.icone.length).toBeGreaterThan(0);
    expect(generico.curto.length).toBeGreaterThan(0);
  });

  it("as cores são escuras — elas recebem texto e branco por cima", () => {
    /*
     * Luminância relativa (WCAG). O limite de 0,175 não é um número mágico:
     * é onde o contraste com o branco passa de 7:1, que é o piso AAA para
     * texto normal. O ícone acende em branco sobre esta cor no hover, e a
     * etiqueta do relatório pronto é escrita NELA sobre fundo claro — os dois
     * papéis exigem a mesma severidade.
     */
    const luminancia = (hex: string) => {
      const canais = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * canais[0]! + 0.7152 * canais[1]! + 0.0722 * canais[2]!;
    };

    const claras = SLUGS_COM_IDENTIDADE.map((slug) => ({
      slug,
      cor: identidadeDoAssunto(slug).cor,
    }))
      .map((item) => ({ ...item, contraste: 1.05 / (luminancia(item.cor) + 0.05) }))
      .filter((item) => item.contraste < 7)
      .map((item) => `${item.slug} (${item.cor}: ${item.contraste.toFixed(2)}:1)`);

    expect(claras, "cor clara demais para receber branco em AAA").toEqual([]);
  });

  it("os relatórios prontos são os modelos do catálogo, na ordem dele", () => {
    const prontos = relatoriosProntos(ASSUNTOS);
    expect(prontos.length).toBe(ASSUNTOS.reduce((total, a) => total + a.modelos.length, 0));
    expect(prontos[0]!.assuntoSlug).toBe(ASSUNTOS[0]!.slug);
    expect(prontos[0]!.nome).toBe(ASSUNTOS[0]!.modelos[0]!.nome);
    // Cada pronto carrega a identidade do assunto de origem, e não a do
    // primeiro da lista — o erro de fechamento clássico num `flatMap`.
    const ultimo = prontos[prontos.length - 1]!;
    expect(ultimo.identidade.cor).toBe(
      identidadeDoAssunto(ASSUNTOS[ASSUNTOS.length - 1]!.slug).cor,
    );
    expect(ultimo.identidade.cor).not.toBe(identidadeDoAssunto(ASSUNTOS[0]!.slug).cor);
  });

  it("só os assuntos recebidos entram — o alcance do papel é respeitado (RN76)", () => {
    const so = relatoriosProntos([ASSUNTOS[0]!]);
    expect(new Set(so.map((pronto) => pronto.assuntoSlug))).toEqual(new Set([ASSUNTOS[0]!.slug]));
  });
});
