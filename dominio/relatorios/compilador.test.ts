import { describe, expect, it } from "vitest";
import {
  DestinacaoOferta,
  EstadoCampanha,
  EstadoUsuarioAssinante,
  EstagioEmpresa,
  NaturezaOferta,
  OrigemEmpresa,
  OrigemPublicoCampanha,
  PerfilAssinatura,
  PlanoAssinatura,
  PreferenciaAssinante,
  RecomendacaoAvaliacao,
  StatusAvaliacao,
  StatusBaseAssinante,
  StatusDossie,
  StatusOferta,
  StatusPatrocinador,
  TipoMetaCampanha,
} from "@prisma/client";

import type { Papel } from "@prisma/client";

import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { ASSUNTOS, assuntoPorSlug, campoPorSlug } from "./catalogo";
import {
  ErroDeRelatorioInvalido,
  TETO_LINHAS_MAXIMO,
  TETO_LINHAS_PADRAO,
  compilarRelatorio,
  resumirDefinicao,
  validarEstruturaDefinicao,
} from "./compilador";

/**
 * RN75 — o contrato do compilador, provado nos dois sentidos.
 *
 * O grupo que mais importa é o primeiro: **o SQL não carrega entrada de
 * gente**. Ele não testa que uma tentativa de injeção conhecida falha — isso
 * só provaria que aquela tentativa falha. Testa a propriedade que torna
 * qualquer tentativa inócua: o texto da consulta não contém nada que a
 * pessoa escreveu, em nenhum caminho.
 */

const definicaoBase = {
  assunto: "ofertas",
  linhas: ["aliado-nome"],
  colunas: [],
  valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
  filtros: [],
};

describe("RN75 — o texto do SQL nunca carrega entrada do usuário", () => {
  it("valor de filtro vai como parâmetro, e não aparece no texto", () => {
    const malicioso = "'; DROP TABLE ofertas; --";
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        ...definicaoBase,
        filtros: [{ campo: "aliado-nome", operador: "contem", valores: [malicioso] }],
      }),
    );

    expect(compilado.sql).not.toContain(malicioso);
    expect(compilado.sql).not.toContain("DROP");
    expect(compilado.parametros).toContain(`%${malicioso}%`);
    expect(compilado.sql).toContain("ILIKE $1");
  });

  /*
   * A varredura sobre TODOS os operadores existe porque o risco não está no
   * caminho que alguém lembrou de testar — está no ramo novo que uma fase
   * futura acrescentar ao `switch`. Operador novo sem entrada aqui reprova,
   * e é essa a intenção.
   */
  it("nenhum operador escapa: o valor some do texto em todos eles", () => {
    const assunto = assuntoPorSlug("ofertas")!;
    const marca = "MARCA_UNICA_DE_TESTE";
    const casos: Array<{ campo: string; operador: string; valores: string[] }> = [
      { campo: "aliado-nome", operador: "igual", valores: [marca] },
      { campo: "aliado-nome", operador: "diferente", valores: [marca] },
      { campo: "aliado-nome", operador: "contem", valores: [marca] },
      { campo: "oferta-preco-por", operador: "maior_ou_igual", valores: ["10"] },
      { campo: "oferta-preco-por", operador: "menor_ou_igual", valores: ["20"] },
      { campo: "oferta-preco-por", operador: "entre", valores: ["10", "20"] },
      { campo: "oferta-vigencia-fim", operador: "vazio", valores: [] },
      { campo: "oferta-vigencia-fim", operador: "preenchido", valores: [] },
      { campo: "oferta-vigencia-fim", operador: "nos_proximos_dias", valores: ["30"] },
    ];

    // A lista acima precisa cobrir o catálogo inteiro, senão ela envelhece
    // em silêncio junto com o `switch` que pretende vigiar.
    const operadoresCobertos = new Set(casos.map((caso) => caso.operador));
    const operadoresDoCatalogo = new Set(
      assunto.campos.flatMap((campo) => [...campo.operadores]),
    );
    expect([...operadoresDoCatalogo].filter((op) => !operadoresCobertos.has(op))).toEqual([]);

    casos.forEach((caso) => {
      const compilado = compilarRelatorio(
        validarEstruturaDefinicao({ ...definicaoBase, filtros: [caso] }),
      );
      caso.valores.forEach((valor) => {
        expect(compilado.sql, `operador ${caso.operador}`).not.toContain(valor);
      });
      expect(compilado.sql).not.toContain(marca);
    });
  });

  it("campo fora do catálogo é recusado, não ignorado", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({ ...definicaoBase, linhas: ["senha_hash"] }),
      ),
    ).toThrow(ErroDeRelatorioInvalido);

    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          ...definicaoBase,
          filtros: [{ campo: "e.cnpj) OR 1=1 --", operador: "igual", valores: ["x"] }],
        }),
      ),
    ).toThrow(/não está no catálogo/);
  });

  it("assunto inexistente é recusado", () => {
    expect(() =>
      compilarRelatorio(validarEstruturaDefinicao({ ...definicaoBase, assunto: "usuarios" })),
    ).toThrow(/não existe/);
  });

  it("operador que o campo não permite é recusado", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          ...definicaoBase,
          // "contém" sobre lista fechada: o catálogo não permite.
          filtros: [{ campo: "oferta-status", operador: "contem", valores: ["PUB"] }],
        }),
      ),
    ).toThrow(/não vale para o campo/);
  });

  it("valor fora da lista fechada é recusado", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          ...definicaoBase,
          filtros: [{ campo: "oferta-status", operador: "igual", valores: ["INVENTADO"] }],
        }),
      ),
    ).toThrow(/não é uma opção/);
  });

  it("operador com número errado de valores é recusado", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          ...definicaoBase,
          filtros: [{ campo: "oferta-preco-por", operador: "entre", valores: ["10"] }],
        }),
      ),
    ).toThrow(/espera 2 valor/);
  });
});

describe("RN77 — campo sem fonte aparece, mas não é usado", () => {
  it("o campo indisponível está no catálogo", () => {
    const assunto = assuntoPorSlug("ofertas")!;
    const resgates = assunto.campos.find((campo) => campo.slug === "oferta-resgates");
    expect(resgates?.indisponivel).toBeTruthy();
  });

  it("usá-lo recusa com o motivo do catálogo, e não com erro genérico", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          ...definicaoBase,
          valores: [{ campo: "oferta-resgates", agregacao: "SOMA" }],
        }),
      ),
    ).toThrow(/divergem/);
  });
});

describe("junção que multiplica não produz número inflado", () => {
  it("QUANTOS conta a identidade do assunto, não as linhas repetidas", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "aliados",
        linhas: ["aliado-categoria"],
        colunas: [],
        valores: [{ campo: "aliado-nome", agregacao: "QUANTOS" }],
        filtros: [],
      }),
    );
    expect(compilado.sql).toContain("count(DISTINCT e.id)");
    expect(compilado.sql).not.toContain("count(e.nome_fantasia)");
  });

  it("soma e média são recusadas quando há junção que repete a linha", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          assunto: "aliados",
          linhas: ["aliado-categoria"],
          colunas: [],
          valores: [{ campo: "aliado-score", agregacao: "MEDIA" }],
          filtros: [],
        }),
      ),
    ).toThrow(/ficariam infladas/);
  });

  it("sem junção que repete, a média passa", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "aliados",
        linhas: ["aliado-uf"],
        colunas: [],
        valores: [{ campo: "aliado-score", agregacao: "MEDIA" }],
        filtros: [],
      }),
    );
    expect(compilado.sql).toContain("avg(e.score_scouting)");
  });

  it("menor e maior passam mesmo com repetição — são imunes a ela", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "aliados",
        linhas: ["aliado-categoria"],
        colunas: [],
        valores: [{ campo: "aliado-score", agregacao: "MAXIMO" }],
        filtros: [],
      }),
    );
    expect(compilado.sql).toContain("max(e.score_scouting)");
  });
});

describe("junções entram só quando precisam, e na ordem das dependências", () => {
  it("relatório que só usa a raiz não junta nada", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "ofertas",
        linhas: ["oferta-status"],
        colunas: [],
        valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
        filtros: [],
      }),
    );
    expect(compilado.sql).toContain("FROM ofertas o");
    expect(compilado.sql).not.toContain("JOIN");
  });

  it("a junção de que outra depende entra antes dela", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "ofertas",
        linhas: ["aliado-nome"],
        colunas: [],
        valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
        filtros: [],
      }),
    );
    const posicaoSolucao = compilado.sql.indexOf("JOIN solucoes s");
    const posicaoEmpresa = compilado.sql.indexOf("JOIN empresas e");
    expect(posicaoSolucao).toBeGreaterThan(-1);
    expect(posicaoEmpresa).toBeGreaterThan(posicaoSolucao);
  });

  it("filtro sozinho já traz a junção de que precisa", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "ofertas",
        linhas: ["oferta-status"],
        colunas: [],
        valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
        filtros: [{ campo: "aliado-uf", operador: "igual", valores: ["MT"] }],
      }),
    );
    expect(compilado.sql).toContain("JOIN empresas e");
  });
});

describe("RN79 — teto de linhas", () => {
  it("pede uma linha a mais que o teto, para saber que cortou", () => {
    const compilado = compilarRelatorio(validarEstruturaDefinicao(definicaoBase));
    expect(compilado.limite).toBe(TETO_LINHAS_PADRAO + 1);
    expect(compilado.parametros[compilado.parametros.length - 1]).toBe(
      TETO_LINHAS_PADRAO + 1,
    );
    expect(compilado.sql).toMatch(/LIMIT \$\d+$/);
  });

  it("teto absurdo é limitado pelo máximo, e nunca vai ao texto", () => {
    const compilado = compilarRelatorio(validarEstruturaDefinicao(definicaoBase), {
      teto: 99_000_000,
    });
    expect(compilado.limite).toBe(TETO_LINHAS_MAXIMO + 1);
  });

  it("teto negativo vira o mínimo de uma linha", () => {
    const compilado = compilarRelatorio(validarEstruturaDefinicao(definicaoBase), {
      teto: -5,
    });
    expect(compilado.limite).toBe(2);
  });
});

describe("estrutura da definição", () => {
  it("definição que não é objeto é recusada", () => {
    expect(() => validarEstruturaDefinicao("ofertas")).toThrow(ErroDeRelatorioInvalido);
    expect(() => validarEstruturaDefinicao([])).toThrow(ErroDeRelatorioInvalido);
    expect(() => validarEstruturaDefinicao(null)).toThrow(ErroDeRelatorioInvalido);
  });

  it("o mesmo campo em Linhas e em Colunas é recusado", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          ...definicaoBase,
          linhas: ["aliado-nome"],
          colunas: ["aliado-nome"],
        }),
      ),
    ).toThrow(/ao mesmo tempo/);
  });

  it("definição vazia é recusada com instrução, não com erro técnico", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          assunto: "ofertas",
          linhas: [],
          colunas: [],
          valores: [],
          filtros: [],
        }),
      ),
    ).toThrow(/Arraste ao menos um campo/);
  });

  it("só dimensões: a medida implícita é quantos registros", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "ofertas",
        linhas: ["oferta-status"],
        colunas: [],
        valores: [],
        filtros: [],
      }),
    );
    expect(compilado.sql).toContain("count(DISTINCT o.id)");
    expect(compilado.projecao.filter((coluna) => coluna.papel === "VALOR")).toHaveLength(1);
  });

  it("ordenação que aponta para fora do resultado é recusada", () => {
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          ...definicaoBase,
          ordenacao: { chave: "v9; DROP TABLE ofertas", direcao: "DESC" },
        }),
      ),
    ).toThrow(/não está no resultado/);
  });

  it("sem ordenação escolhida, ordena pela primeira medida, maior primeiro", () => {
    const compilado = compilarRelatorio(validarEstruturaDefinicao(definicaoBase));
    expect(compilado.sql).toContain("ORDER BY v0 DESC NULLS LAST");
  });
});

describe("catálogo — coerência que o compilador pressupõe", () => {
  it("todo campo usável declara ao menos um operador e uma agregação", () => {
    ASSUNTOS.forEach((assunto) => {
      assunto.campos
        .filter((campo) => !campo.indisponivel)
        .forEach((campo) => {
          expect(campo.operadores.length, `${assunto.slug}/${campo.slug}`).toBeGreaterThan(0);
          expect(campo.agregacoes.length, `${assunto.slug}/${campo.slug}`).toBeGreaterThan(0);
        });
    });
  });

  it("toda junção citada por um campo existe no assunto", () => {
    ASSUNTOS.forEach((assunto) => {
      assunto.campos.forEach((campo) => {
        (campo.requer ?? []).forEach((chave) => {
          expect(assunto.juncoes[chave], `${assunto.slug}/${campo.slug} → ${chave}`).toBeTruthy();
        });
      });
    });
  });

  /*
   * Modelo da plataforma que não compila é pior que modelo ausente: ele
   * aparece na galeria, alguém clica, e a tela devolve erro numa coisa que
   * a própria casa escreveu.
   */
  it("todo modelo da plataforma compila", () => {
    ASSUNTOS.forEach((assunto) => {
      assunto.modelos.forEach((modelo) => {
        expect(
          () =>
            compilarRelatorio(
              validarEstruturaDefinicao({ assunto: assunto.slug, ...modelo.definicao }),
            ),
          `${assunto.slug}/${modelo.slug}`,
        ).not.toThrow();
      });
    });
  });

  it("slug de campo não se repete dentro do assunto", () => {
    ASSUNTOS.forEach((assunto) => {
      const slugs = assunto.campos.map((campo) => campo.slug);
      expect(new Set(slugs).size, assunto.slug).toBe(slugs.length);
    });
  });
});

/*
 * Este grupo existe por causa de um defeito real, e o registro importa mais
 * que o teste. A primeira versão do catálogo escreveu as listas de valores
 * fechados DE MEMÓRIA e errou três: inventou os estágios `RADAR` e
 * `QUALIFICADA`, esqueceu a natureza `BENEFICIO` — que é a da maior parte
 * das ofertas reais — e criou um status `EM_APROVACAO` que não existe.
 *
 * Os 30 testes acima passaram assim mesmo, e passariam para sempre: o
 * compilador valida o valor contra a lista que ele próprio recebeu, então
 * uma lista errada é internamente coerente. Quem pegou foi rodar a consulta
 * contra a base povoada e ver voltar `BENEFICIO` de uma coluna cuja lista
 * dizia outra coisa.
 *
 * A comparação abaixo é com o enum do Prisma em tempo de EXECUÇÃO, e não
 * com o tipo: tipo não existe depois da compilação, e era justamente de
 * execução que o defeito vinha.
 */
describe("os valores fechados são os do banco, não os que alguém lembrou", () => {
  const enumsPorCampo: ReadonlyArray<{
    assunto: string;
    campo: string;
    valores: Readonly<Record<string, string>>;
  }> = [
    { assunto: "ofertas", campo: "oferta-status", valores: StatusOferta },
    { assunto: "ofertas", campo: "oferta-natureza", valores: NaturezaOferta },
    { assunto: "ofertas", campo: "oferta-destinacao", valores: DestinacaoOferta },
    { assunto: "aliados", campo: "aliado-estagio", valores: EstagioEmpresa },
    { assunto: "aliados", campo: "aliado-origem", valores: OrigemEmpresa },
    // F25
    { assunto: "funil", campo: "empresa-estagio", valores: EstagioEmpresa },
    { assunto: "funil", campo: "empresa-origem", valores: OrigemEmpresa },
    { assunto: "funil", campo: "avaliacao-recomendacao", valores: RecomendacaoAvaliacao },
    { assunto: "funil", campo: "avaliacao-situacao", valores: StatusAvaliacao },
    { assunto: "funil", campo: "dossie-situacao", valores: StatusDossie },
    { assunto: "campanhas", campo: "campanha-estado", valores: EstadoCampanha },
    { assunto: "campanhas", campo: "campanha-origem-publico", valores: OrigemPublicoCampanha },
    { assunto: "campanhas", campo: "meta-tipo", valores: TipoMetaCampanha },
    { assunto: "patrocinadores", campo: "patrocinador-status", valores: StatusPatrocinador },
    // F26
    { assunto: "telemetria-catalogo", campo: "tc-natureza", valores: NaturezaOferta },
    { assunto: "telemetria-resgates", campo: "tr-perfil", valores: PerfilAssinatura },
    { assunto: "assinantes", campo: "as-situacao", valores: StatusBaseAssinante },
    { assunto: "assinantes", campo: "as-preferencia", valores: PreferenciaAssinante },
    { assunto: "assinantes", campo: "as-perfil", valores: PerfilAssinatura },
    { assunto: "assinantes", campo: "as-estado-usuario", valores: EstadoUsuarioAssinante },
    { assunto: "assinantes", campo: "as-plano", valores: PlanoAssinatura },
  ];

  it.each(enumsPorCampo)("$campo casa com o enum do Prisma", ({ assunto, campo, valores }) => {
    const definicao = campoPorSlug(assuntoPorSlug(assunto)!, campo)!;
    expect(definicao.valores, `${campo} sem lista de valores`).toBeTruthy();
    expect([...definicao.valores!].map((opcao) => opcao.valor).sort()).toEqual(
      Object.values(valores).sort(),
    );
  });

  /*
   * O contrapeso: campo de lista fechada que NÃO esteja coberto acima
   * escaparia da conferência sem que nada avisasse. Os booleanos ficam de
   * fora por não virem de enum — a lista deles é "Sim/Não" e não pode
   * divergir de coisa alguma.
   */
  it("todo campo de lista fechada está coberto por esta conferência", () => {
    const cobertos = new Set(enumsPorCampo.map((item) => `${item.assunto}/${item.campo}`));
    const descobertos = ASSUNTOS.flatMap((assunto) =>
      assunto.campos
        .filter((campo) => campo.valores && campo.tipo !== "BOOLEANO")
        .map((campo) => `${assunto.slug}/${campo.slug}`)
        .filter((chave) => !cobertos.has(chave)),
    );
    expect(descobertos).toEqual([]);
  });
});

describe("resumo legível", () => {
  it("descreve assunto, agrupamento e quantidade de filtros", () => {
    const resumo = resumirDefinicao(
      validarEstruturaDefinicao({
        ...definicaoBase,
        filtros: [{ campo: "oferta-status", operador: "igual", valores: ["PUBLICADA"] }],
      }),
    );
    expect(resumo).toContain("Ofertas do Clube");
    expect(resumo).toContain("por Aliado");
    expect(resumo).toContain("1 filtro");
  });
});

/*
 * ---------------------------------------------------------------------
 * F25 — os três assuntos novos
 * ---------------------------------------------------------------------
 */

describe("filtro de campo booleano — o defeito que a F24 não exercitou", () => {
  /*
   * A F24 entregou três campos de sim/não e NENHUM caminho que os filtrasse:
   * eles serviam para agrupar, e agrupar não passa pelo compilador de filtro.
   * O resultado é que `pendente_republicacao = $1` ia para o banco com o
   * parâmetro em texto, e o Postgres recusava a CONSULTA INTEIRA com
   * "operator does not exist: boolean = text". Não era número errado — era a
   * tela não funcionar.
   *
   * Apareceu ao rodar contra a base o modelo da F25 que filtra "aprovação
   * externa registrada = não". Os 30 testes de unidade da F24 continuavam
   * verdes, e continuariam para sempre.
   */
  it("o marcador leva o molde do tipo, e o valor continua sendo parâmetro", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        assunto: "campanhas",
        linhas: ["campanha-nome"],
        colunas: [],
        valores: [],
        filtros: [
          { campo: "campanha-aprovacao-registrada", operador: "igual", valores: ["false"] },
        ],
      }),
    );
    expect(compilado.sql).toContain("::boolean");
    // O molde é do compilador; o valor segue no bind, como manda a RN75.
    expect(compilado.sql).not.toContain("false");
    expect(compilado.parametros).toContain("false");
  });

  it("campo que não é booleano não ganha molde nenhum", () => {
    const compilado = compilarRelatorio(
      validarEstruturaDefinicao({
        ...definicaoBase,
        filtros: [{ campo: "oferta-status", operador: "igual", valores: ["PUBLICADA"] }],
      }),
    );
    expect(compilado.sql).not.toContain("::boolean");
  });
});

describe("RN43 — o tipo de meta nunca aparece sem o nível de atribuição", () => {
  /*
   * A garantia não é estética. Num construtor livre, "Resgates" e
   * "Conversão %" caem na mesma coluna e alguém soma os alvos — misturando
   * contagem de voucher com percentual. O nível colado ao rótulo não impede a
   * soma; faz a mistura ficar visível na própria célula.
   */
  const campo = campoPorSlug(assuntoPorSlug("campanhas")!, "meta-tipo")!;

  it("cada opção traz o nível que a medição exige", () => {
    const porValor = new Map(campo.valores!.map((opcao) => [opcao.valor, opcao.rotulo]));
    expect(porValor.get("RESGATES")).toContain("por oferta");
    expect(porValor.get("CONVERSAO_PCT")).toContain("por público");
  });

  it("nenhuma opção fica sem nível", () => {
    const semNivel = campo.valores!.filter((opcao) => !opcao.rotulo.includes("·"));
    expect(semNivel, "meta sem nível de atribuição no rótulo").toEqual([]);
  });
});

describe("RN62/RN44 — o que os assuntos novos se recusam a calcular", () => {
  /*
   * Os dois campos abaixo existem no catálogo para serem VISTOS (RN77): quem
   * procura saldo e realizado precisa saber por que não estão lá, senão abre
   * chamado — ou, pior, monta uma aproximação por fora.
   */
  it.each([
    { assunto: "patrocinadores", campo: "patrocinador-saldo", motivo: /RN62/ },
    { assunto: "campanhas", campo: "campanha-realizado", motivo: /RN43/ },
  ])("$campo está declarado indisponível, com o motivo escrito", ({ assunto, campo, motivo }) => {
    const definicao = campoPorSlug(assuntoPorSlug(assunto)!, campo)!;
    expect(definicao.indisponivel).toMatch(motivo);
    expect(() =>
      compilarRelatorio(
        validarEstruturaDefinicao({
          assunto,
          linhas: [],
          colunas: [],
          valores: [{ campo, agregacao: "SOMA" }],
          filtros: [],
        }),
      ),
    ).toThrow(ErroDeRelatorioInvalido);
  });

  it("nenhum campo do catálogo refaz a subtração do saldo", () => {
    /*
     * A cerca `saldo-derivado` varre `app/`, `infra/` e `dominio/` procurando
     * a subtração. Esta asserção é a mesma pergunta feita de dentro: o
     * catálogo é o lugar onde a tentação é maior, porque bastaria uma
     * expressão a mais num campo para o número aparecer — e ele apareceria
     * como zero justamente quando as adquiridas não estivessem confirmadas.
     */
    const suspeitos = ASSUNTOS.flatMap((assunto) =>
      assunto.campos
        .filter((campo) => /adquiridas\s*-/i.test(campo.sql))
        .map((campo) => `${assunto.slug}/${campo.slug}`),
    );
    expect(suspeitos).toEqual([]);
  });
});

describe("RN76 — cada assunto declara a ação que a plataforma já usa", () => {
  /*
   * O Gerador entrega o que a pessoa já alcança, nunca mais e nunca menos. A
   * conferência é contra a matriz de permissões de verdade: `Acao` que não
   * exista lá não compilaria, mas uma ação EXISTENTE e errada — pedir
   * `MODELAR_CAMPANHA` para ler campanhas, por exemplo — compila e esconde o
   * assunto de quem tem direito a ele.
   */
  it.each([
    { slug: "ofertas", permissao: "VISUALIZAR" },
    { slug: "aliados", permissao: "VISUALIZAR" },
    { slug: "funil", permissao: "VISUALIZAR_FUNIL" },
    { slug: "campanhas", permissao: "VISUALIZAR" },
    { slug: "patrocinadores", permissao: "VISUALIZAR_PATROCINADORES" },
    // F26 — os três sensíveis. Os dois de dado pessoal ficam com a ação que
    // a Onda 5 já usa para PF pleno: Gestor e Administrador, por decisão da
    // TI em 17/09. O contador de catálogo não tem dado de pessoa e fica
    // aberto; a Auditoria segue a leitura de todos que a RN48 determina.
    { slug: "telemetria-catalogo", permissao: "VISUALIZAR" },
    { slug: "telemetria-resgates", permissao: "VISUALIZAR_DADOS_PESSOAIS_PLENOS" },
    { slug: "assinantes", permissao: "VISUALIZAR_DADOS_PESSOAIS_PLENOS" },
    { slug: "auditoria", permissao: "VISUALIZAR_AUDITORIA" },
  ])("$slug exige $permissao", ({ slug, permissao }) => {
    expect(assuntoPorSlug(slug)!.permissao).toBe(permissao);
  });

  it("a lista acima cobre todos os assuntos do catálogo", () => {
    // Sem isto, um assunto novo entraria sem que ninguém conferisse a ação
    // dele — e a conferência que conta é justamente a do assunto novo.
    expect(ASSUNTOS.length).toBe(9);
  });
});

/**
 * RN76 — a NEGATIVA, finalmente com prova.
 *
 * A F24 declarou esta garantia no arquivo de e2e e não conseguiu exercitá-la:
 * os dois assuntos dela exigiam `VISUALIZAR`, que todo papel tem. A F25
 * repetiu a promessa e também não cumpriu — conferindo a matriz, descobri que
 * `VISUALIZAR_FUNIL` e `VISUALIZAR_PATROCINADORES` estão concedidas aos sete
 * papéis nomeados, e o oitavo tem acesso total: na prática, todo mundo.
 *
 * Com a F26 isso muda pela primeira vez. Assinantes e Telemetria · extrato
 * exigem `VISUALIZAR_DADOS_PESSOAIS_PLENOS`, que é de Gestor e Administrador
 * — então `assuntosVisiveis` passa a devolver listas DIFERENTES para contas
 * diferentes, que é o que a regra sempre quis dizer.
 *
 * O teste é de domínio e de fato: ele lê a matriz de permissões real, não uma
 * cópia. Se alguém abrir `VISUALIZAR_DADOS_PESSOAIS_PLENOS` para mais papéis,
 * é uma decisão de governança legítima — e este teste avisa que ela também
 * abriu os dois assuntos do Gerador, que é justamente o efeito colateral que
 * ninguém lembra de checar.
 */
describe("RN76 — assunto fora do alcance não aparece", () => {
  const alcanca = (papel: Papel, slug: string) =>
    podeExecutar(papel, assuntoPorSlug(slug)!.permissao);

  it("Leitura não alcança os assuntos de dado pessoal, e alcança os demais", () => {
    expect(alcanca("LEITURA", "assinantes")).toBe(false);
    expect(alcanca("LEITURA", "telemetria-resgates")).toBe(false);
    // O contraponto que impede o teste de passar por engano: se ele
    // reprovasse tudo para Leitura, a asserção acima seria vácua.
    expect(alcanca("LEITURA", "ofertas")).toBe(true);
    expect(alcanca("LEITURA", "auditoria")).toBe(true);
    expect(alcanca("LEITURA", "telemetria-catalogo")).toBe(true);
  });

  it("Gestor e Administrador alcançam; os papéis do funil, não", () => {
    for (const papel of ["GESTOR", "ADMIN", "ADMINISTRADOR_PLATAFORMA"] as Papel[]) {
      expect(alcanca(papel, "assinantes"), papel).toBe(true);
    }
    for (const papel of ["ANALISTA_SCOUT", "COMERCIAL", "APROVADOR"] as Papel[]) {
      expect(alcanca(papel, "assinantes"), papel).toBe(false);
    }
  });

  it("a lista visível é MENOR para quem alcança menos", () => {
    /*
     * A asserção que vale por todas: duas contas abrindo a mesma tela veem
     * catálogos de tamanhos diferentes. Enquanto isto for falso, a RN76 é
     * uma promessa sem consequência observável.
     */
    const visiveis = (papel: Papel) =>
      ASSUNTOS.filter((assunto) => podeExecutar(papel, assunto.permissao)).length;
    expect(visiveis("LEITURA")).toBeLessThan(visiveis("GESTOR"));
    expect(visiveis("GESTOR")).toBe(ASSUNTOS.length);
  });
});
