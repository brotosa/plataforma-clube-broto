import { describe, expect, it } from "vitest";
import {
  calcularForaDaBase,
  confirmacaoFotoCompletaValida,
  interpretarEstadoDoUsuario,
  interpretarPerfilAssinatura,
  interpretarPreferencia,
  type LinhaNucleo,
  montarResumoNucleo,
  normalizarLinhaNucleo,
  planejarUpsert,
  sugerirMapeamento,
  validarLinhaNucleo,
} from "./importacao";

function linha(parcial: Partial<LinhaNucleo>): LinhaNucleo {
  return {
    linha: 2,
    cpf: "111.444.777-35",
    nome: "Nome Sintético da Silva",
    endereco: null,
    cep: null,
    email: null,
    telefone: null,
    preferencia: null,
    perfilAssinatura: null,
    patrocinador: null,
    ...parcial,
  };
}

describe("mapeador de colunas — sugestão automática (dicionário [A CONFIRMAR])", () => {
  it("sugere destinos por variações reais de cabeçalho", () => {
    expect(
      sugerirMapeamento([
        "cpf_cliente",
        "nome_completo",
        "Endereço residencial",
        "E-MAIL",
        "telefone celular",
        "Preferência",
        "CEP",
      ]),
    ).toEqual({
      cpf_cliente: "cpf",
      nome_completo: "nome",
      "Endereço residencial": "endereco",
      "E-MAIL": "email",
      "telefone celular": "telefone",
      Preferência: "preferencia",
      CEP: "cep",
    });
  });

  it("coluna sem correspondência fica null e não é importada em silêncio", () => {
    expect(sugerirMapeamento(["score_interno"])).toEqual({ score_interno: null });
  });

  it("duas colunas para o mesmo campo: só a primeira recebe a sugestão", () => {
    const sugestao = sugerirMapeamento(["cpf", "cpf_conjuge"]);
    expect(sugestao.cpf).toBe("cpf");
    expect(sugestao.cpf_conjuge).toBeNull();
  });
});

describe("RN31 — validação linha a linha (quarentena com motivo)", () => {
  it("linha completa e válida não gera motivo", () => {
    expect(validarLinhaNucleo(linha({ preferencia: "agricultura" }))).toEqual([]);
  });

  it("CPF inválido vai para quarentena com o motivo da RN30", () => {
    const motivos = validarLinhaNucleo(linha({ cpf: "111.444.777-99" }));
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain("dígito verificador");
  });

  it("CPF e nome ausentes acumulam motivos distintos", () => {
    const motivos = validarLinhaNucleo(linha({ cpf: " ", nome: "" }));
    expect(motivos).toEqual(["CPF ausente.", "Nome ausente."]);
  });

  it("preferência não reconhecida é quarentena, nunca descarte silencioso", () => {
    const motivos = validarLinhaNucleo(linha({ preferencia: "hortifrúti" }));
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain("hortifrúti");
  });

  it("e-mail/telefone fora de formato NÃO derrubam a linha (métrica §8 cuida)", () => {
    expect(
      validarLinhaNucleo(linha({ email: "sem-arroba", telefone: "x" })),
    ).toEqual([]);
  });
});

describe("interpretarPreferencia", () => {
  it("aceita os três valores da ficha, com acento e caixa variados", () => {
    expect(interpretarPreferencia("Agricultura")).toBe("AGRICULTURA");
    expect(interpretarPreferencia("PECUÁRIA")).toBe("PECUARIA");
    expect(interpretarPreferencia("pecuaria")).toBe("PECUARIA");
    expect(interpretarPreferencia("ambos")).toBe("AMBOS");
  });

  it("vazio vira null; desconhecido vira null (quem valida decide o motivo)", () => {
    expect(interpretarPreferencia("  ")).toBeNull();
    expect(interpretarPreferencia("soja")).toBeNull();
  });
});

describe("RN29 — plano de upsert idempotente por CPF", () => {
  it("classifica novos × atualizados contra a base atual", () => {
    const plano = planejarUpsert(
      [
        { linha: linha({ linha: 2 }), cpfHash: "hash-a" },
        { linha: linha({ linha: 3 }), cpfHash: "hash-b" },
      ],
      new Set(["hash-b", "hash-c"]),
    );
    expect(plano.novos).toBe(1);
    expect(plano.atualizados).toBe(1);
    expect(plano.repetidosNoArquivo).toBe(0);
  });

  it("CPF repetido no arquivo conta uma vez e a última linha vence (idempotência)", () => {
    const primeira = linha({ linha: 2, nome: "Primeira Ocorrência" });
    const ultima = linha({ linha: 9, nome: "Última Ocorrência" });
    const plano = planejarUpsert(
      [
        { linha: primeira, cpfHash: "hash-a" },
        { linha: ultima, cpfHash: "hash-a" },
      ],
      new Set(),
    );
    expect(plano.novos).toBe(1);
    expect(plano.repetidosNoArquivo).toBe(1);
    expect(plano.porHash.get("hash-a")?.nome).toBe("Última Ocorrência");
  });
});

describe("RN29 — foto completa em duas etapas", () => {
  it("calcula quem sairia: ativos na base ausentes do arquivo", () => {
    expect(
      calcularForaDaBase(["h1", "h2", "h3"], new Set(["h2"])),
    ).toEqual(["h1", "h3"]);
  });

  it("arquivo parcial enviado como foto completa expõe o tamanho do estrago no resumo", () => {
    // Cenário do desastre: base com 5 ativos, arquivo com 1 só.
    const foraDaBase = calcularForaDaBase(
      ["h1", "h2", "h3", "h4", "h5"],
      new Set(["h3"]),
    );
    const resumo = montarResumoNucleo({
      linhasLidas: 1,
      plano: planejarUpsert(
        [{ linha: linha({}), cpfHash: "h3" }],
        new Set(["h1", "h2", "h3", "h4", "h5"]),
      ),
      quarentena: [],
      foraDaBase,
    });
    expect(resumo.foraDaBase).toBe(4);
    expect(resumo.atualizados).toBe(1);
  });

  it("política incremental não calcula fora da base (null, não zero)", () => {
    const resumo = montarResumoNucleo({
      linhasLidas: 3,
      plano: planejarUpsert([], new Set()),
      quarentena: [{ linha: 2, motivos: ["CPF ausente."] }],
      foraDaBase: null,
    });
    expect(resumo.foraDaBase).toBeNull();
    expect(resumo.quarentena).toBe(1);
  });

  it("confirmação exige o texto exato FOTO COMPLETA (caixa e bordas tolerantes)", () => {
    expect(confirmacaoFotoCompletaValida("FOTO COMPLETA")).toBe(true);
    expect(confirmacaoFotoCompletaValida("  foto completa  ")).toBe(true);
    expect(confirmacaoFotoCompletaValida("FOTO")).toBe(false);
    expect(confirmacaoFotoCompletaValida("CONFIRMO")).toBe(false);
    expect(confirmacaoFotoCompletaValida("")).toBe(false);
    expect(confirmacaoFotoCompletaValida(null)).toBe(false);
  });
});

describe("normalizarLinhaNucleo", () => {
  it("normaliza CPF para dígitos, apara textos e interpreta a preferência", () => {
    expect(
      normalizarLinhaNucleo(
        linha({
          cpf: "111.444.777-35",
          nome: "  Nome Sintético  ",
          endereco: " Sítio A, Uberaba/MG ",
          email: "",
          preferencia: "Pecuária",
        }),
      ),
    ).toEqual({
      cpf: "11144477735",
      nome: "Nome Sintético",
      enderecoBruto: "Sítio A, Uberaba/MG",
      cep: null,
      email: null,
      telefone: null,
      preferencia: "PECUARIA",
      // Onda 12 (RN63): sem as colunas novas no arquivo, os três nascem
      // nulos — que é o estado honesto, e não um perfil suposto.
      perfilAssinatura: null,
      estadoUsuario: null,
      patrocinador: null,
    });
  });

  describe("RN63 — de-para do perfil de assinatura", () => {
    it('"Assinatura Paga" vira autoassinatura', () => {
      expect(interpretarPerfilAssinatura("Assinatura Paga", null)).toBe("AUTOASSINATURA");
    });

    it('"Assinatura Patrocinada" vira patrocinada — e Broto vira promocional', () => {
      expect(interpretarPerfilAssinatura("Assinatura Patrocinada", "Yamer")).toBe("PATROCINADA");
      expect(interpretarPerfilAssinatura("Assinatura Patrocinada", "Broto")).toBe(
        "PROMOCIONAL_BROTO",
      );
      // O valor da coluna nativa vem como vier: caixa não decide nada.
      expect(interpretarPerfilAssinatura("assinatura patrocinada", " broto ")).toBe(
        "PROMOCIONAL_BROTO",
      );
    });

    it("estado do usuário NÃO vira perfil — a fonte não tem essa categoria", () => {
      expect(interpretarPerfilAssinatura("Usuário Cadastrado", null)).toBeNull();
      expect(interpretarPerfilAssinatura("Usuário Freemium", null)).toBeNull();
    });

    it("valor desconhecido devolve null, nunca um palpite", () => {
      expect(interpretarPerfilAssinatura("Plano Ouro", null)).toBeNull();
      expect(interpretarPerfilAssinatura("", null)).toBeNull();
      expect(interpretarPerfilAssinatura(null, "Yamer")).toBeNull();
    });

    it("o estado do usuário sai da mesma coluna, e é outra leitura", () => {
      expect(interpretarEstadoDoUsuario("Usuário Cadastrado")).toBe("CADASTRADO");
      expect(interpretarEstadoDoUsuario("Usuário Freemium")).toBe("FREEMIUM");
      expect(interpretarEstadoDoUsuario("Assinatura Paga")).toBe("ASSINANTE");
      expect(interpretarEstadoDoUsuario("Assinatura Patrocinada")).toBe("ASSINANTE");
      expect(interpretarEstadoDoUsuario("Plano Ouro")).toBeNull();
    });
  });

  describe("RN63 — o mapeador reconhece as duas colunas novas", () => {
    it('a coluna nativa "Patrocinador" tem destino próprio', () => {
      const sugestao = sugerirMapeamento(["CPF", "Nome", "Patrocinador", "Tipo Assinatura"]);
      expect(sugestao["Patrocinador"]).toBe("patrocinador");
      expect(sugestao["Tipo Assinatura"]).toBe("perfilAssinatura");
    });

    it("coluna sem correspondência continua sem sugestão", () => {
      expect(sugerirMapeamento(["Coluna Estranha"])["Coluna Estranha"]).toBeNull();
    });
  });
});
