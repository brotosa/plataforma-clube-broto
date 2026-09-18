import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { ErroDeValidacao } from "./contexto";
import {
  acrescentarAoPainel,
  aplicarAtoDeEdicao,
  atualizarPainel,
  listarPaineisEditaveis,
  salvarPainel,
} from "./paineis";

/**
 * RN94 — as recusas da edição, contra o banco.
 *
 * **Nenhuma delas é demonstrável em teste de unidade**, porque as três que
 * importam dependem de estado gravado: quem é o autor, qual era a versão
 * quando a tela desenhou os botões, e o que a trilha registrou. As funções
 * puras de `edicao-painel.ts` sempre fizeram o que lhes mandaram.
 */

const temBanco = Boolean(process.env.DATABASE_URL);
const prisma = new PrismaClient();
const MARCA = "[IT-F35]";

const BLOCO = {
  titulo: `${MARCA} ofertas por situação`,
  definicao: {
    assunto: "ofertas",
    linhas: ["oferta-status"],
    colunas: [],
    valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
    filtros: [],
  },
  visualizacao: { tipo: "TABELA", ajustes: {} },
  largura: "METADE",
};

let autor = { id: "", papel: "ADMIN" as const };
let outro = { id: "", papel: "ADMIN" as const };

beforeAll(async () => {
  if (!temBanco) return;
  const gestor = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR", ativo: true } });
  const admin = await prisma.usuario.findFirstOrThrow({ where: { papel: "ADMIN", ativo: true } });
  autor = { id: gestor.id, papel: gestor.papel as "ADMIN" };
  outro = { id: admin.id, papel: admin.papel as "ADMIN" };
});

afterAll(async () => {
  if (temBanco) await limpar();
  await prisma.$disconnect();
});

async function limpar() {
  const ids = (
    await prisma.painel.findMany({ where: { nome: { startsWith: MARCA } }, select: { id: true } })
  ).map((painel) => painel.id);
  if (ids.length === 0) return;
  await prisma.execucaoRelatorio.updateMany({
    where: { painelId: { in: ids } },
    data: { painelId: null },
  });
  await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
  await prisma.painel.deleteMany({ where: { id: { in: ids } } });
}

async function painelNovo(sufixo: string, quantos = 1) {
  const { id } = await salvarPainel(autor, {
    nome: `${MARCA} ${sufixo}`,
    blocos: Array.from({ length: quantos }, (_, indice) => ({
      ...BLOCO,
      titulo: `${MARCA} bloco ${indice + 1}`,
    })),
  });
  return id;
}

async function versaoDe(id: string) {
  const painel = await prisma.painel.findUniqueOrThrow({ where: { id } });
  return painel.atualizadoEm.toISOString();
}

describe.skipIf(!temBanco)("RN94 — editar é do autor, e só dele", () => {
  it("outra conta não edita, mesmo sendo ADMIN", async () => {
    const id = await painelNovo("autoria");
    await expect(
      atualizarPainel(outro, id, { nome: `${MARCA} renomeado por outro` }),
    ).rejects.toBeInstanceOf(ErroDeValidacao);

    // E o nome não mudou — a recusa recusa, não recusa e grava.
    const depois = await prisma.painel.findUniqueOrThrow({ where: { id } });
    expect(depois.nome).toBe(`${MARCA} autoria`);
  });

  it("outra conta não acrescenta bloco", async () => {
    const id = await painelNovo("acrescimo-alheio");
    await expect(acrescentarAoPainel(outro, id, BLOCO)).rejects.toBeInstanceOf(ErroDeValidacao);
  });

  it("o autor edita, e a mudança vai para a trilha com anterior e novo", async () => {
    const id = await painelNovo("trilha");
    const antes = await prisma.auditoriaEvento.count({ where: { entidadeId: id } });

    await atualizarPainel(autor, id, { nome: `${MARCA} trilha renomeado` });

    const eventos = await prisma.auditoriaEvento.findMany({ where: { entidadeId: id } });
    expect(eventos.length).toBeGreaterThan(antes);

    /*
     * O evento da EDIÇÃO, e não o da criação.
     *
     * A criação também grava `campo: "nome"` — com `valorAnterior` nulo, que
     * é o que "não havia estado anterior" significa. Um `find` pelo campo
     * pega o primeiro e testa a criação achando que testa a edição; foi o que
     * a primeira versão deste teste fez, e ela falhou por isso.
     */
    const daEdicao = eventos.filter(
      (evento) => evento.campo === "nome" && evento.valorAnterior !== null,
    );
    expect(daEdicao).toHaveLength(1);
    expect(daEdicao[0]?.valorAnterior).toBe(`${MARCA} trilha`);
    expect(daEdicao[0]?.valorNovo).toBe(`${MARCA} trilha renomeado`);
  });
});

describe.skipIf(!temBanco)("RN94 — a versão, e por que ela não é zelo excessivo", () => {
  /**
   * Os atos são por ÍNDICE, e o índice foi escolhido contra o que a pessoa
   * viu. Com o painel aberto em duas abas, "descer o bloco 2" da aba velha
   * moveria outro bloco — **com sucesso, e sem nada denunciando**. É a
   * corrupção silenciosa que esta recusa transforma em "recarregue a tela".
   */
  it("recusa o ato com versão vencida, e o painel fica como estava", async () => {
    const id = await painelNovo("versao", 3);
    const versaoAntiga = await versaoDe(id);

    // Outra aba mexeu primeiro.
    await aplicarAtoDeEdicao(autor, id, { tipo: "MOVER", indice: 0, movimento: "DESCER" }, versaoAntiga);

    const depoisDaPrimeira = await prisma.painel.findUniqueOrThrow({ where: { id } });
    const ordem = (depoisDaPrimeira.blocos as Array<{ titulo: string }>).map((b) => b.titulo);

    await expect(
      aplicarAtoDeEdicao(autor, id, { tipo: "REMOVER", indice: 2 }, versaoAntiga),
    ).rejects.toThrow(/mudou desde/i);

    const depois = await prisma.painel.findUniqueOrThrow({ where: { id } });
    expect((depois.blocos as Array<{ titulo: string }>).map((b) => b.titulo)).toEqual(ordem);
  });

  it("com a versão corrente, o ato passa", async () => {
    const id = await painelNovo("versao-ok", 2);
    await aplicarAtoDeEdicao(autor, id, { tipo: "LARGURA", indice: 0 }, await versaoDe(id));
    const depois = await prisma.painel.findUniqueOrThrow({ where: { id } });
    expect((depois.blocos as Array<{ largura: string }>)[0]?.largura).toBe("INTEIRA");
  });
});

describe.skipIf(!temBanco)("RN94 — o teto e o painel vazio", () => {
  it("o teto de 12 vale ao ACRESCENTAR, não só ao criar", async () => {
    const id = await painelNovo("teto", 12);
    await expect(acrescentarAoPainel(autor, id, BLOCO)).rejects.toThrow(/12/);
  });

  /**
   * Ficha §8.2 — o painel pode ficar sem bloco.
   *
   * Recusar a remoção do último prenderia quem quer trocar todos: a saída
   * seria apagar o painel e refazê-lo, perdendo nome, visibilidade e filtro.
   */
  it("remover o último bloco é permitido, e o painel continua existindo", async () => {
    const id = await painelNovo("esvaziar");
    await aplicarAtoDeEdicao(autor, id, { tipo: "REMOVER", indice: 0 }, await versaoDe(id));
    const depois = await prisma.painel.findUniqueOrThrow({ where: { id } });
    expect(depois.blocos).toEqual([]);
  });
});

describe.skipIf(!temBanco)("RN94 — o destino oferecido é só o que a pessoa pode editar", () => {
  it("listarPaineisEditaveis devolve os do autor, e não os do time alheio", async () => {
    const meu = await painelNovo("destino");
    const { id: alheio } = await salvarPainel(outro, {
      nome: `${MARCA} do outro, do time`,
      blocos: [BLOCO],
      visibilidade: "TIME",
    });

    const lista = await listarPaineisEditaveis(autor);
    const ids = lista.map((painel) => painel.id);
    expect(ids).toContain(meu);
    // Visível na galeria (é do time), e mesmo assim NÃO oferecido como
    // destino: oferecer e depois recusar a gravação é pior que não oferecer.
    expect(ids).not.toContain(alheio);
  });
});
