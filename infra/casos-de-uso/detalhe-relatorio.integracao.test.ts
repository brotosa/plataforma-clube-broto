import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { ASSUNTOS } from "@/dominio/relatorios/catalogo";
import { ErroDeValidacao } from "./contexto";
import { detalheEstaDisponivel, executarDetalheDoRelatorio } from "./relatorios";

/**
 * RN93 — ver as linhas por trás.
 *
 * Roda contra a **base povoada**, porque o que a regra promete é sobre dado
 * real: a divergência entre linhas e registros só aparece quando existe uma
 * aliada com mais de uma categoria, e nenhuma fixture provaria isso.
 */
const temBanco = Boolean(process.env.DATABASE_URL);
const prisma = new PrismaClient();

async function ator(papel: "ADMIN" | "LEITURA" = "ADMIN") {
  const usuario = await prisma.usuario.findFirstOrThrow({ where: { papel, ativo: true } });
  return { id: usuario.id, papel: usuario.papel };
}

describe.skipIf(!temBanco)("Detalhe do relatório (RN93)", () => {
  it("devolve os registros por trás do recorte", async () => {
    const resultado = await executarDetalheDoRelatorio(await ator(), {
      assunto: "ofertas",
      linhas: ["oferta-status"],
      colunas: [],
      valores: [],
      filtros: [],
    });

    expect(resultado.tabela.linhas.length).toBeGreaterThan(0);
    // As colunas vêm do catálogo, na ordem dele, e a primeira identifica o
    // registro — é o que faz a linha ser reconhecível.
    expect(resultado.tabela.dimensoes[0]?.campo).toBe("oferta-titulo");
    expect(resultado.tabela.dimensoes.length).toBeLessThanOrEqual(8);
    // Sem junção que multiplique, linha e registro são a mesma coisa.
    expect(resultado.linhasRepetemRegistros).toBe(false);
    expect(resultado.linhasNoBanco).toBe(resultado.registros);
  });

  it("o filtro do recorte vale no detalhe — senão ele não seria o detalhe DAQUELE número", async () => {
    const semFiltro = await executarDetalheDoRelatorio(await ator(), {
      assunto: "ofertas",
      linhas: ["oferta-status"],
      colunas: [],
      valores: [],
      filtros: [],
    });
    const comFiltro = await executarDetalheDoRelatorio(await ator(), {
      assunto: "ofertas",
      linhas: ["oferta-status"],
      colunas: [],
      valores: [],
      filtros: [{ campo: "oferta-status", operador: "igual", valores: ["PUBLICADA"] }],
    });

    expect(comFiltro.linhasNoBanco).toBeLessThan(semFiltro.linhasNoBanco);
    expect(comFiltro.linhasNoBanco).toBeGreaterThan(0);
  });

  /**
   * O caso que dá nome à RN93(a), e ele não é hipotético.
   *
   * As junções que multiplicam só entram no `FROM` quando alguma coluna ou
   * algum FILTRO as exige — e filtrar por categoria é exatamente o que o
   * clique da RN91 faz num relatório agrupado por categoria. Uma aliada com
   * duas categorias sai em duas linhas, e o agregado dizia uma.
   */
  it("com junção que multiplica, linhas e registros DIVERGEM — e o resultado declara isso", async () => {
    const categorias = await prisma.$queryRawUnsafe<Array<{ c: string }>>(
      `SELECT ec.categoria c FROM empresas_categorias ec
       GROUP BY ec.categoria HAVING count(*) > 1 LIMIT 1`,
    ).catch(() => []);
    if (categorias.length === 0) return; // base sem categoria repetida; o teste não inventa uma

    const resultado = await executarDetalheDoRelatorio(await ator(), {
      assunto: "aliados",
      linhas: ["aliado-categoria"],
      colunas: [],
      valores: [],
      filtros: [],
    });
    // Sem filtro, nenhuma junção multiplicadora entra: as colunas do detalhe
    // são as primeiras do assunto, e nenhuma delas exige categoria ou solução.
    expect(resultado.linhasRepetemRegistros).toBe(false);

    const comCategoria = await executarDetalheDoRelatorio(await ator(), {
      assunto: "aliados",
      linhas: ["aliado-categoria"],
      colunas: [],
      valores: [],
      filtros: [{ campo: "aliado-categoria", operador: "preenchido", valores: [] }],
    });
    // Agora a junção entrou pelo filtro, e a aliada com duas categorias
    // aparece duas vezes.
    expect(comCategoria.linhasNoBanco).toBeGreaterThan(comCategoria.registros);
    expect(comCategoria.linhasRepetemRegistros).toBe(true);
  });

  it("o filtro obrigatório de período da Auditoria vale idêntico no detalhe", async () => {
    await expect(
      executarDetalheDoRelatorio(await ator(), {
        assunto: "auditoria",
        linhas: ["au-entidade"],
        colunas: [],
        valores: [],
        filtros: [],
      }),
    ).rejects.toThrow();
  });

  /**
   * O alcance por papel vale idêntico no detalhe (RN76).
   *
   * **A premissa da primeira versão deste teste estava errada, e vale
   * registrar:** eu havia usado Auditoria supondo que `LEITURA` não a
   * alcançasse. Medido, **todo papel alcança Auditoria** — dos nove assuntos,
   * só os dois de dado pessoal têm alcance restrito (`GESTOR`, `ADMIN` e o
   * acesso total). A negativa só é demonstrável por eles.
   *
   * E a ORDEM das duas recusas importa: o alcance é conferido **antes** da
   * disponibilidade do detalhe. Quem não alcança o assunto ouve que não o
   * alcança — e não que o detalhe dele "depende de decisão da
   * Superintendência", que informaria a existência e o estado de algo fora
   * do seu alcance.
   */
  it("o alcance por papel é o mesmo do agregado, e é conferido ANTES (RN76)", async () => {
    await expect(
      executarDetalheDoRelatorio(await ator("LEITURA"), {
        assunto: "assinantes",
        linhas: ["as-uf"],
        colunas: [],
        valores: [],
        filtros: [],
      }),
    ).rejects.toThrow(/não alcança|permiss/i);
  });

  it("grava evento PRÓPRIO na trilha — não é rodapé da execução que o originou", async () => {
    const quem = await ator();
    const antes = await prisma.execucaoRelatorio.count({ where: { autorId: quem.id } });
    await executarDetalheDoRelatorio(quem, {
      assunto: "ofertas",
      linhas: ["oferta-status"],
      colunas: [],
      valores: [],
      filtros: [],
    });
    expect(await prisma.execucaoRelatorio.count({ where: { autorId: quem.id } })).toBe(antes + 1);
  });
});

describe("RN93 — os dois assuntos de dado pessoal ficam FECHADOS", () => {
  /**
   * Fechado até haver resposta, e não aberto até haver objeção. Recuar depois
   * de liberar seria retirar algo já em uso; liberar depois de recusar não
   * custa nada a ninguém.
   */
  it("assinantes e telemetria-resgates recusam, com o motivo escrito", () => {
    const sensiveis = ASSUNTOS.filter((assunto) => assunto.contemDadoPessoal);
    expect(sensiveis.map((a) => a.slug).sort()).toEqual(["assinantes", "telemetria-resgates"]);
    for (const assunto of sensiveis) {
      const resposta = detalheEstaDisponivel(assunto);
      expect(resposta.pode, assunto.slug).toBe(false);
      expect(resposta.motivo).toContain("Superintendência");
    }
  });

  it("os outros sete abrem", () => {
    const abertos = ASSUNTOS.filter((assunto) => detalheEstaDisponivel(assunto).pode);
    expect(abertos).toHaveLength(7);
  });

  it("a recusa é DERIVADA de contemDadoPessoal, não de uma lista à mão", () => {
    // Assunto sensível novo entra fechado sem que ninguém precise lembrar de
    // acrescentá-lo a lugar nenhum.
    const inventado = { rotulo: "Assunto novo", contemDadoPessoal: true } as never;
    expect(detalheEstaDisponivel(inventado).pode).toBe(false);
  });
});

describe.skipIf(!temBanco)("RN93 — a recusa chega pelo caso de uso, não só pela consulta", () => {
  it("executar o detalhe de um assunto sensível é recusado com ErroDeValidacao", async () => {
    const quem = await prisma.usuario.findFirstOrThrow({
      where: { papel: "ADMINISTRADOR_PLATAFORMA" },
    }).catch(() => null);
    if (!quem) return; // sem conta de acesso total na base; a negativa já está coberta acima
    await expect(
      executarDetalheDoRelatorio(
        { id: quem.id, papel: quem.papel },
        {
          assunto: "assinantes",
          linhas: ["as-uf"],
          colunas: [],
          valores: [],
          filtros: [],
        },
      ),
    ).rejects.toBeInstanceOf(ErroDeValidacao);
  });
});
