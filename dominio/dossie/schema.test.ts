import { describe, expect, it } from "vitest";
import {
  extrairJson,
  PERGUNTAS_ESPERADAS_NO_ROTEIRO,
  SECOES_DOSSIE,
  SEM_INFORMACAO_PUBLICA,
  validarConteudoDossie,
} from "./schema";

/** Conteúdo mínimo válido nas dez etapas do template. */
function conteudoValido() {
  return {
    resumo_executivo: "Empresa de conectividade rural com atuação no Brasil.",
    perfil: [
      {
        indicador: "Ano de fundação",
        valor: "2011",
        fonte: "https://exemplo.com/sobre",
        confianca: "Alto",
      },
      {
        indicador: "Receita",
        valor: SEM_INFORMACAO_PUBLICA,
        fonte: SEM_INFORMACAO_PUBLICA,
        confianca: "Baixo",
      },
    ],
    produtos: [
      {
        nome: "Plano rural",
        descricao: "Conectividade via satélite.",
        problema: "Falta de internet no campo.",
        publico: "Produtores rurais",
        preco: SEM_INFORMACAO_PUBLICA,
        cobranca: "Assinatura mensal",
        integracoes: SEM_INFORMACAO_PUBLICA,
        tecnologias: "Satélite geoestacionário",
        diferenciais: "Cobertura nacional",
        fontes: ["https://exemplo.com/planos"],
      },
    ],
    impacto_produtor: [
      {
        indicador: "Redução de custo",
        valor: SEM_INFORMACAO_PUBLICA,
        estudo_de_caso: SEM_INFORMACAO_PUBLICA,
        fonte: SEM_INFORMACAO_PUBLICA,
      },
    ],
    mercado: {
      clientes: ["Cooperativas"],
      parceiros: ["Revendas regionais"],
      observacoes: "Distribuição por revendas.",
      fontes: ["https://exemplo.com/parceiros"],
    },
    concorrencia: [
      {
        empresa: "Concorrente A",
        comparacao: "Preço mais baixo e menor cobertura.",
        fontes: ["https://exemplo.com/imprensa"],
      },
    ],
    swot: {
      forcas: ["Cobertura nacional"],
      fraquezas: ["Preço acima da média"],
      oportunidades: ["Expansão no agro"],
      ameacas: ["Entrada de constelações LEO"],
    },
    gaps: [
      {
        informacao: "Número de clientes ativos",
        importancia: "Alta",
        pergunta_sugerida: "Quantos clientes ativos vocês têm hoje?",
      },
    ],
    roteiro_reuniao: Array.from(
      { length: PERGUNTAS_ESPERADAS_NO_ROTEIRO },
      (_valor, indice) => `Pergunta ${indice + 1}`,
    ),
    fechamento: "As seções são consistentes entre si.",
    fontes_consultadas: ["https://exemplo.com/sobre", "https://exemplo.com/planos"],
  };
}

describe("SECOES_DOSSIE — as dez etapas do template, na ordem", () => {
  it("tem exatamente dez etapas numeradas de 1 a 10", () => {
    expect(SECOES_DOSSIE).toHaveLength(10);
    expect(SECOES_DOSSIE.map((secao) => secao.numero)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("não repete chave de seção", () => {
    const chaves = new Set(SECOES_DOSSIE.map((secao) => secao.chave));
    expect(chaves.size).toBe(SECOES_DOSSIE.length);
  });
});

describe("validarConteudoDossie — caminho feliz", () => {
  it("aceita o conteúdo completo das dez etapas", () => {
    const resultado = validarConteudoDossie(conteudoValido());
    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      expect(resultado.conteudo.perfil).toHaveLength(2);
      expect(resultado.avisos).toEqual([]);
    }
  });

  it("aceita a string de ausência de dado onde o template a exige", () => {
    const conteudo = conteudoValido();
    conteudo.mercado.observacoes = SEM_INFORMACAO_PUBLICA;
    const resultado = validarConteudoDossie(conteudo);
    expect(resultado.valido).toBe(true);
  });

  it("descarta campos fora do schema em vez de gravá-los", () => {
    const resultado = validarConteudoDossie({
      ...conteudoValido(),
      campo_inventado: "não deveria ser persistido",
    });
    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      expect(resultado.conteudo).not.toHaveProperty("campo_inventado");
    }
  });

  it("aceita texto com cerca de código em volta do JSON", () => {
    const texto = "Segue o dossiê:\n```json\n" + JSON.stringify(conteudoValido()) + "\n```\n";
    const resultado = validarConteudoDossie(texto);
    expect(resultado.valido).toBe(true);
  });
});

describe("validarConteudoDossie — recusas", () => {
  it("recusa objeto sem uma das dez etapas, apontando o campo", () => {
    const conteudo = conteudoValido() as Record<string, unknown>;
    delete conteudo.swot;
    const resultado = validarConteudoDossie(conteudo);
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erros.join(" ")).toContain("swot");
    }
  });

  it("recusa grau de confiança fora de Alto/Médio/Baixo", () => {
    const conteudo = conteudoValido();
    conteudo.perfil[0]!.confianca = "Altíssimo";
    const resultado = validarConteudoDossie(conteudo);
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erros.join(" ")).toContain("perfil[0].confianca");
    }
  });

  it("recusa importância de gap fora de Alta/Média/Baixa", () => {
    const conteudo = conteudoValido();
    conteudo.gaps[0]!.importancia = "Urgente";
    const resultado = validarConteudoDossie(conteudo);
    expect(resultado.valido).toBe(false);
  });

  it("recusa campo obrigatório em branco (ausência tem string própria)", () => {
    const conteudo = conteudoValido();
    conteudo.fechamento = "   ";
    const resultado = validarConteudoDossie(conteudo);
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erros.join(" ")).toContain("fechamento");
    }
  });

  it("recusa texto sem nenhum JSON com mensagem que orienta o analista", () => {
    const resultado = validarConteudoDossie("o modelo respondeu em prosa");
    expect(resultado.valido).toBe(false);
    if (!resultado.valido) {
      expect(resultado.erros[0]).toContain("prompt-dossie-due-diligence.md");
    }
  });

  it("recusa JSON que não é objeto", () => {
    expect(validarConteudoDossie("[1, 2, 3]").valido).toBe(false);
    expect(validarConteudoDossie(null).valido).toBe(false);
  });
});

describe("validarConteudoDossie — avisos que não bloqueiam (decisão é humana)", () => {
  it("avisa quando o roteiro não traz as 15 perguntas do template", () => {
    const conteudo = conteudoValido();
    conteudo.roteiro_reuniao = ["Pergunta 1", "Pergunta 2"];
    const resultado = validarConteudoDossie(conteudo);
    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      expect(resultado.avisos.join(" ")).toContain("15");
    }
  });

  it("avisa quando nenhuma fonte foi listada e quando um produto vem sem fonte", () => {
    const conteudo = conteudoValido();
    conteudo.fontes_consultadas = [];
    conteudo.produtos[0]!.fontes = [];
    const resultado = validarConteudoDossie(conteudo);
    expect(resultado.valido).toBe(true);
    if (resultado.valido) {
      expect(resultado.avisos).toHaveLength(2);
      expect(resultado.avisos.join(" ")).toContain("fonte");
    }
  });
});

describe("extrairJson", () => {
  it("acha o objeto no meio de texto com prosa antes e depois", () => {
    expect(extrairJson('Claro!\n{"a": 1}\nAbraços.')).toEqual({ a: 1 });
  });

  it("respeita chaves dentro de string", () => {
    expect(extrairJson('{"a": "} não fecha aqui", "b": 2}')).toEqual({
      a: "} não fecha aqui",
      b: 2,
    });
  });

  it("devolve null para texto sem objeto e para JSON quebrado", () => {
    expect(extrairJson("sem json")).toBeNull();
    expect(extrairJson("")).toBeNull();
    expect(extrairJson('{"a": }')).toBeNull();
  });
});
