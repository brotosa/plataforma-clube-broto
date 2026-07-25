import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { lerConfiguracaoDossie } from "./configuracao";
import { ErroDeProvedor } from "./provedor";
import { AnthropicDossieProvider, TOKENS_MAXIMOS_DA_RESPOSTA } from "./provedor-anthropic";
import { ManualDossieProvider } from "./provedor-manual";
import { provedorAutomatico } from "./provedores";
import { prepararPrompt, versaoDoTemplate } from "./template";

/**
 * Os testes do provedor automático usam um cliente dublado: nenhuma
 * chamada de rede, nenhuma chave — o comportamento verificado é o nosso
 * (continuação de turno, recusa, teto durante a execução, validação da
 * resposta), não o da API.
 */

const TARIFA = { entradaBrlPorMilhao: 30, saidaBrlPorMilhao: 150 };

function conteudoValido() {
  return {
    resumo_executivo: "Resumo.",
    perfil: [{ indicador: "Fundação", valor: "2011", fonte: "site", confianca: "Alto" }],
    produtos: [
      {
        nome: "Plano",
        descricao: "d",
        problema: "p",
        publico: "pu",
        preco: "pr",
        cobranca: "c",
        integracoes: "i",
        tecnologias: "t",
        diferenciais: "di",
        fontes: ["https://exemplo.com"],
      },
    ],
    impacto_produtor: [{ indicador: "ROI", valor: "v", estudo_de_caso: "e", fonte: "f" }],
    mercado: { clientes: ["c"], parceiros: ["p"], observacoes: "o", fontes: ["f"] },
    concorrencia: [{ empresa: "A", comparacao: "c", fontes: ["f"] }],
    swot: { forcas: ["f"], fraquezas: ["fr"], oportunidades: ["o"], ameacas: ["a"] },
    gaps: [{ informacao: "i", importancia: "Alta", pergunta_sugerida: "q" }],
    roteiro_reuniao: Array.from({ length: 15 }, (_v, i) => `P${i + 1}`),
    fechamento: "Consistente.",
    fontes_consultadas: ["https://exemplo.com"],
  };
}

interface RespostaDublada {
  texto?: string;
  stop_reason: Anthropic.Message["stop_reason"];
  entrada?: number;
  saida?: number;
  buscas?: number;
}

/** Cliente mínimo com a superfície que o provedor usa. */
function clienteDublado(
  respostas: RespostaDublada[],
  opcoes: { tokensContados?: number; erroNaContagem?: boolean } = {},
) {
  const chamadas: Anthropic.MessageCreateParams[] = [];
  let indice = 0;
  const cliente = {
    messages: {
      countTokens: async () => {
        if (opcoes.erroNaContagem) {
          throw new Error("rede indisponível");
        }
        return { input_tokens: opcoes.tokensContados ?? 5_000 };
      },
      stream: (parametros: Anthropic.MessageCreateParams) => {
        chamadas.push(parametros);
        const resposta = respostas[Math.min(indice, respostas.length - 1)]!;
        indice += 1;
        const conteudo: Anthropic.ContentBlock[] = [];
        for (let i = 0; i < (resposta.buscas ?? 0); i += 1) {
          conteudo.push({ type: "web_search_tool_result" } as Anthropic.ContentBlock);
        }
        if (resposta.texto !== undefined) {
          conteudo.push({ type: "text", text: resposta.texto } as Anthropic.ContentBlock);
        }
        return {
          finalMessage: async (): Promise<Anthropic.Message> =>
            ({
              content: conteudo,
              model: "claude-opus-5",
              stop_reason: resposta.stop_reason,
              usage: {
                input_tokens: resposta.entrada ?? 1_000,
                output_tokens: resposta.saida ?? 1_000,
              },
            }) as Anthropic.Message,
        };
      },
    },
  };
  return { cliente: cliente as unknown as Anthropic, chamadas };
}

function provedor(dublado: ReturnType<typeof clienteDublado>) {
  return new AnthropicDossieProvider({
    chaveApi: "chave-de-teste-do-dublê",
    tarifa: TARIFA,
    cliente: dublado.cliente,
  });
}

describe("AnthropicDossieProvider — caminho feliz", () => {
  it("monta o prompt a partir do template versionado e valida a resposta", async () => {
    const dublado = clienteDublado([
      { texto: JSON.stringify(conteudoValido()), stop_reason: "end_turn", buscas: 3 },
    ]);
    const resultado = await provedor(dublado).gerar({ nomeEmpresa: "Viasat Brasil" });

    expect(resultado.conteudo.resumo_executivo).toBe("Resumo.");
    expect(resultado.modelo).toBe("claude-opus-5");
    expect(resultado.uso.buscasWeb).toBe(3);

    const chamada = dublado.chamadas[0]!;
    expect(chamada.system).toContain("Analista Sênior");
    expect(String(chamada.messages[0]!.content)).toContain("Viasat Brasil");
    expect(chamada.tools?.[0]).toMatchObject({ name: "web_search" });
    expect(chamada.max_tokens).toBe(TOKENS_MAXIMOS_DA_RESPOSTA);
  });

  it("continua o turno pausado pela busca na web e soma o consumo das rodadas", async () => {
    const dublado = clienteDublado([
      { stop_reason: "pause_turn", entrada: 2_000, saida: 500, buscas: 2 },
      {
        texto: JSON.stringify(conteudoValido()),
        stop_reason: "end_turn",
        entrada: 4_000,
        saida: 1_500,
        buscas: 1,
      },
    ]);
    const resultado = await provedor(dublado).gerar({ nomeEmpresa: "Empresa X" });

    expect(dublado.chamadas).toHaveLength(2);
    expect(dublado.chamadas[1]!.messages).toHaveLength(2);
    expect(resultado.uso).toEqual({ tokensEntrada: 6_000, tokensSaida: 2_000, buscasWeb: 3 });
  });

  it("aceita a resposta embrulhada em cerca de código", async () => {
    const dublado = clienteDublado([
      {
        texto: "```json\n" + JSON.stringify(conteudoValido()) + "\n```",
        stop_reason: "end_turn",
      },
    ]);
    await expect(provedor(dublado).gerar({ nomeEmpresa: "Empresa X" })).resolves.toBeTruthy();
  });
});

describe("AnthropicDossieProvider — falhas", () => {
  it("trata recusa do modelo como falha própria, com o consumo registrado", async () => {
    const dublado = clienteDublado([
      { stop_reason: "refusal", entrada: 800, saida: 10 },
    ]);
    await expect(provedor(dublado).gerar({ nomeEmpresa: "Empresa X" })).rejects.toMatchObject({
      codigo: "RECUSA",
      uso: { tokensEntrada: 800, tokensSaida: 10 },
    });
  });

  it("recusa resposta fora do schema sem gravar nada, listando os campos", async () => {
    const dublado = clienteDublado([
      { texto: '{"resumo_executivo": "só isso"}', stop_reason: "end_turn" },
    ]);
    const erro = await provedor(dublado)
      .gerar({ nomeEmpresa: "Empresa X" })
      .catch((e: unknown) => e as ErroDeProvedor);
    expect(erro).toBeInstanceOf(ErroDeProvedor);
    expect((erro as ErroDeProvedor).codigo).toBe("RESPOSTA_INVALIDA");
    expect((erro as ErroDeProvedor).detalhes.join(" ")).toContain("perfil");
  });

  it("avisa quando a resposta foi cortada no limite de tamanho", async () => {
    const dublado = clienteDublado([{ texto: "{", stop_reason: "max_tokens" }]);
    await expect(provedor(dublado).gerar({ nomeEmpresa: "Empresa X" })).rejects.toMatchObject({
      codigo: "RESPOSTA_INVALIDA",
    });
  });

  it("interrompe a execução ao ultrapassar o teto unitário e registra o gasto", async () => {
    // Cada rodada custa 30 mil de entrada (0,90) + 10 mil de saída (1,50) = 2,40.
    const dublado = clienteDublado([
      { stop_reason: "pause_turn", entrada: 30_000, saida: 10_000 },
    ]);
    const erro = await provedor(dublado)
      .gerar({ nomeEmpresa: "Empresa X", custoMaximoBrl: 2 })
      .catch((e: unknown) => e as ErroDeProvedor);

    expect((erro as ErroDeProvedor).codigo).toBe("TETO_UNITARIO");
    expect((erro as ErroDeProvedor).message).toContain("DOSSIE_CUSTO_MAX_UNITARIO_BRL");
    expect((erro as ErroDeProvedor).uso).toEqual({
      tokensEntrada: 30_000,
      tokensSaida: 10_000,
      buscasWeb: 0,
    });
    // Interrompeu antes de pedir a rodada seguinte.
    expect(dublado.chamadas).toHaveLength(1);
  });

  it("desiste depois do limite de rodadas de continuação", async () => {
    const dublado = clienteDublado([{ stop_reason: "pause_turn", entrada: 10, saida: 10 }]);
    await expect(provedor(dublado).gerar({ nomeEmpresa: "Empresa X" })).rejects.toMatchObject({
      codigo: "FALHA_API",
    });
  });

  it("converte falha de rede em erro de provedor com mensagem institucional", async () => {
    const cliente = {
      messages: {
        countTokens: async () => ({ input_tokens: 1 }),
        stream: () => ({
          finalMessage: async () => {
            throw new Error("ECONNRESET");
          },
        }),
      },
    } as unknown as Anthropic;
    const alvo = new AnthropicDossieProvider({ chaveApi: "x", tarifa: TARIFA, cliente });
    await expect(alvo.gerar({ nomeEmpresa: "Empresa X" })).rejects.toMatchObject({
      codigo: "FALHA_API",
    });
  });
});

describe("AnthropicDossieProvider — estimativa antes de gastar", () => {
  it("usa a contagem de tokens da API e o limite de saída inteiro", async () => {
    const dublado = clienteDublado([], { tokensContados: 10_000 });
    const estimado = await provedor(dublado).estimarCustoMaximo({ nomeEmpresa: "Empresa X" });
    // 0,01 × 30 = 0,30 + 0,032 × 150 = 4,80
    expect(estimado).toBe(5.1);
  });

  it("falha em vez de gastar quando não consegue estimar", async () => {
    const dublado = clienteDublado([], { erroNaContagem: true });
    await expect(
      provedor(dublado).estimarCustoMaximo({ nomeEmpresa: "Empresa X" }),
    ).rejects.toMatchObject({ codigo: "FALHA_API" });
  });
});

describe("ManualDossieProvider", () => {
  const manual = new ManualDossieProvider();

  it("aceita o JSON colado e não consome orçamento", async () => {
    const resultado = await manual.gerar({
      nomeEmpresa: "Empresa X",
      conteudoColado: JSON.stringify(conteudoValido()),
    });
    expect(resultado.uso).toEqual({ tokensEntrada: 0, tokensSaida: 0, buscasWeb: null });
    expect(resultado.modelo).toBeNull();
    expect(await manual.estimarCustoMaximo()).toBe(0);
  });

  it("cobra o conteúdo quando o analista salva vazio", async () => {
    await expect(
      manual.gerar({ nomeEmpresa: "Empresa X", conteudoColado: "   " }),
    ).rejects.toMatchObject({ codigo: "CONTEUDO_AUSENTE" });
  });

  it("recusa conteúdo fora do schema com a lista de campos", async () => {
    const erro = await manual
      .gerar({ nomeEmpresa: "Empresa X", conteudoColado: '{"resumo_executivo": "x"}' })
      .catch((e: unknown) => e as ErroDeProvedor);
    expect((erro as ErroDeProvedor).codigo).toBe("RESPOSTA_INVALIDA");
    expect((erro as ErroDeProvedor).detalhes.length).toBeGreaterThan(0);
  });
});

describe("Configuração por ambiente — sem fallback embutido", () => {
  const completo = {
    ANTHROPIC_API_KEY: "chave",
    DOSSIE_TETO_MENSAL_BRL: "1500",
    DOSSIE_CUSTO_MAX_UNITARIO_BRL: "12.5",
    DOSSIE_CUSTO_ENTRADA_BRL_MTOK: "30",
    DOSSIE_CUSTO_SAIDA_BRL_MTOK: "150",
  };

  it("com tudo configurado, o provedor automático existe com os tetos lidos", () => {
    const estado = provedorAutomatico(completo);
    expect(estado.disponivel).toBe(true);
    if (estado.disponivel) {
      expect(estado.provedor.nome).toBe("anthropic");
      expect(estado.tetos).toEqual({ mensalBrl: 1500, unitarioBrl: 12.5 });
    }
  });

  it("sem chave, fica indisponível e diz o que falta", () => {
    const estado = provedorAutomatico({ ...completo, ANTHROPIC_API_KEY: "" });
    expect(estado.disponivel).toBe(false);
    if (!estado.disponivel) {
      expect(estado.faltando).toEqual(["ANTHROPIC_API_KEY"]);
      expect(estado.mensagem).toContain("inserido manualmente");
    }
  });

  it("sem tarifa não há como apurar custo — indisponível também", () => {
    const estado = provedorAutomatico({ ...completo, DOSSIE_CUSTO_SAIDA_BRL_MTOK: undefined });
    expect(estado.disponivel).toBe(false);
    if (!estado.disponivel) {
      expect(estado.faltando).toContain("DOSSIE_CUSTO_SAIDA_BRL_MTOK");
    }
  });

  it("valor inválido conta como ausente (zero, negativo ou texto)", () => {
    for (const invalido of ["0", "-3", "grátis", ""]) {
      const estado = lerConfiguracaoDossie({
        ...completo,
        DOSSIE_TETO_MENSAL_BRL: invalido,
      });
      expect(estado.disponivel).toBe(false);
    }
  });

  it("ambiente vazio lista as cinco variáveis, sem nenhum default", () => {
    const estado = lerConfiguracaoDossie({});
    expect(estado.disponivel).toBe(false);
    if (!estado.disponivel) {
      expect(estado.faltando).toHaveLength(5);
    }
  });
});

describe("Template versionado do repositório", () => {
  it("o arquivo real monta prompt de sistema, prompt de usuário e schema", () => {
    const prompt = prepararPrompt({ nome_empresa: "Viasat Brasil", site: "https://viasat.com.br" });
    expect(prompt.sistema).toContain("due diligence pública");
    expect(prompt.usuario).toContain("Viasat Brasil");
    expect(prompt.usuario).toContain("(site: https://viasat.com.br)");
    expect(prompt.usuario).toContain("Roteiro para reunião");
    expect(prompt.usuario).toContain('"fontes_consultadas"');
  });

  it("a versão registrada acompanha a versão declarada no arquivo", () => {
    expect(versaoDoTemplate()).toMatch(/^v1@[0-9a-f]{12}$/);
  });
});
