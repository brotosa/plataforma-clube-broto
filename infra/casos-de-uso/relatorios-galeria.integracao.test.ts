import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { abrirRelatorio, apagarRelatorio, salvarRelatorio } from "./relatorios";

/**
 * RN80 — o desenho escolhido sobrevive ao salvamento.
 *
 * ## O defeito que este arquivo existe para impedir
 *
 * `validarEstruturaDefinicao` **reconstrói** o objeto da definição com as
 * chaves que o compilador conhece, e é isso que impede chave estranha de
 * chegar ao SQL. Quando a F27 acrescentou o bloco `visualizacao`, o bloco
 * passou pela tela, chegou ao caso de uso e foi descartado ali — em silêncio.
 *
 * O sintoma era desconcertante justamente por ser mudo: a pessoa escolhia
 * barras, salvava, reabria e via tabela. Nenhum erro, nenhum aviso, nenhuma
 * linha de log. O caminho de leitura estava certo desde o início; quem perdia
 * o dado era o de escrita, três funções antes.
 *
 * Os testes de unidade de `visualizacao.ts` seguiam verdes e seguiriam para
 * sempre: eles provam que `validarVisualizacao` valida, e ela validava. O que
 * faltava era **a ida e a volta pelo banco**, que é o que está aqui.
 */
const temBanco = Boolean(process.env.DATABASE_URL);

const MARCA = "[TESTE-RN80]";

const DEFINICAO_BASE = {
  assunto: "ofertas",
  linhas: ["aliado-nome"],
  colunas: [],
  valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
  filtros: [],
};

describe.skipIf(!temBanco)("RN80 — a visualização atravessa o salvamento", () => {
  const prisma = new PrismaClient();
  let gestor: { id: string; papel: "GESTOR" };

  async function limpar() {
    const salvos = await prisma.relatorioSalvo.findMany({
      where: { nome: { startsWith: MARCA } },
      select: { id: true },
    });
    const ids = salvos.map((linha) => linha.id);
    if (ids.length === 0) return;
    await prisma.execucaoRelatorio.deleteMany({ where: { relatorioId: { in: ids } } });
    await prisma.auditoriaEvento.deleteMany({ where: { entidadeId: { in: ids } } });
    await prisma.relatorioSalvo.deleteMany({ where: { id: { in: ids } } });
  }

  beforeEach(async () => {
    const usuario = await prisma.usuario.findFirstOrThrow({ where: { papel: "GESTOR" } });
    gestor = { id: usuario.id, papel: "GESTOR" };
    await limpar();
  });

  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it("guarda o tipo escolhido e o devolve ao reabrir", async () => {
    const { id } = await salvarRelatorio(gestor, {
      nome: `${MARCA} com barras`,
      definicao: {
        ...DEFINICAO_BASE,
        visualizacao: { tipo: "BARRAS", ajustes: { ordenar: "MENOR", limite: 5 } },
      },
      visibilidade: "PRIVADO",
    });

    const aberto = await abrirRelatorio(gestor, id);
    expect(aberto.visualizacao.tipo).toBe("BARRAS");
    expect(aberto.visualizacao.ajustes.ordenar).toBe("MENOR");
    expect(aberto.visualizacao.ajustes.limite).toBe(5);

    await apagarRelatorio(gestor, id);
  });

  it("o bloco guardado é recortado pelo TIPO, e não ecoado como veio", async () => {
    /*
     * Sem o recorte, um ajuste de outro tipo ficaria vivo no JSONB: invisível
     * na tela, pronto para confundir quem for depurar o documento guardado — e
     * pronto para reaparecer no dia em que o tipo voltasse a admiti-lo.
     */
    const { id } = await salvarRelatorio(gestor, {
      nome: `${MARCA} com ajuste alheio`,
      definicao: {
        ...DEFINICAO_BASE,
        visualizacao: {
          tipo: "ROSCA",
          ajustes: { limite: 4, orientacao: "VERTICAL", empilhamento: "EMPILHADO" },
        },
      },
      visibilidade: "PRIVADO",
    });

    const linha = await prisma.relatorioSalvo.findUniqueOrThrow({ where: { id } });
    const guardado = linha.definicao as { visualizacao?: { ajustes?: Record<string, unknown> } };
    expect(guardado.visualizacao?.ajustes).toEqual({ limite: 4 });

    await apagarRelatorio(gestor, id);
  });

  it("relatório salvo SEM o bloco abre em tabela — nada de migração de dados", async () => {
    // É o estado de todo relatório criado antes da Onda 17, e o que faz esta
    // onda não ter migration: a ausência já significa a coisa certa.
    const { id } = await salvarRelatorio(gestor, {
      nome: `${MARCA} sem bloco`,
      definicao: DEFINICAO_BASE,
      visibilidade: "PRIVADO",
    });

    const aberto = await abrirRelatorio(gestor, id);
    expect(aberto.visualizacao.tipo).toBe("TABELA");

    await apagarRelatorio(gestor, id);
  });

  it("tipo inventado na definição não derruba a abertura — vira tabela", async () => {
    // A entrada vem de JSONB, que é dado de fora: um tipo pode sair do
    // catálogo depois de alguém já ter salvo um relatório com ele.
    const { id } = await salvarRelatorio(gestor, {
      nome: `${MARCA} com tipo estranho`,
      definicao: { ...DEFINICAO_BASE, visualizacao: { tipo: "MAPA_DE_CALOR", ajustes: {} } },
      visibilidade: "PRIVADO",
    });

    const aberto = await abrirRelatorio(gestor, id);
    expect(aberto.visualizacao.tipo).toBe("TABELA");

    await apagarRelatorio(gestor, id);
  });
});
