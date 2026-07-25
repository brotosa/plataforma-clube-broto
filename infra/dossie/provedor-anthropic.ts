import Anthropic from "@anthropic-ai/sdk";
import { apurarCusto, estimarCustoMaximo, formatarBrl, type TarifaDossie } from "@/dominio/dossie/custo";
import { validarConteudoDossie } from "@/dominio/dossie/schema";
import { prepararPrompt } from "./template";
import {
  type DossieProvider,
  ErroDeProvedor,
  type PedidoDeDossie,
  type ResultadoDaGeracao,
  type UsoDaExecucao,
} from "./provedor";

/**
 * Provedor automático do dossiê: API da Anthropic com busca na web
 * habilitada, prompt montado a partir do **template versionado** do
 * repositório e resposta validada contra o schema do próprio template.
 *
 * Três decisões que valem registro:
 *
 * 1. **O schema não é repetido aqui.** O template já manda "retorne
 *    somente o JSON" e leva o schema no prompt; a aplicação valida o que
 *    voltou (dominio/dossie/schema.ts). Declarar o mesmo schema outra vez
 *    como parâmetro da API criaria uma segunda fonte da verdade que
 *    silenciosamente divergiria do arquivo versionado.
 * 2. **Streaming.** A resposta é longa (dez etapas, 15 perguntas de
 *    roteiro) e a busca na web alonga a execução; sem streaming o pedido
 *    esbarraria no tempo limite de HTTP.
 * 3. **O teto unitário vale durante a execução.** A busca na web faz o
 *    contexto crescer a cada rodada, então o custo é reapurado a cada
 *    volta e a geração é interrompida ao ultrapassar o teto — com o gasto
 *    realizado registrado, nunca escondido.
 */

/** Modelo com busca na web (ficha §6). */
export const MODELO_DO_DOSSIE = "claude-opus-5";

/**
 * Espaço de resposta: as dez etapas com fontes por afirmação e o roteiro
 * de 15 perguntas passam folgadamente de dez mil tokens; o limite é o
 * corte de segurança, e o custo real é governado pelos tetos em reais.
 */
export const TOKENS_MAXIMOS_DA_RESPOSTA = 32_000;

/**
 * Rodadas de continuação: a busca na web pausa o turno (`pause_turn`)
 * quando atinge o limite interno de iterações do servidor, e a execução
 * continua de onde parou. O corte evita laço infinito.
 */
const MAXIMO_DE_CONTINUACOES = 8;

/** Dez minutos por requisição: pesquisa pública é demorada por natureza. */
const TEMPO_LIMITE_MS = 10 * 60 * 1000;

export interface OpcoesDoProvedorAnthropic {
  chaveApi: string;
  tarifa: TarifaDossie;
  cliente?: Anthropic;
}

function somarUso(acumulado: UsoDaExecucao, mensagem: Anthropic.Message): UsoDaExecucao {
  const uso = mensagem.usage;
  const entrada =
    (uso?.input_tokens ?? 0) +
    (uso?.cache_creation_input_tokens ?? 0) +
    (uso?.cache_read_input_tokens ?? 0);
  const buscas = mensagem.content.filter(
    (bloco) => bloco.type === "web_search_tool_result",
  ).length;
  return {
    tokensEntrada: acumulado.tokensEntrada + entrada,
    tokensSaida: acumulado.tokensSaida + (uso?.output_tokens ?? 0),
    buscasWeb: (acumulado.buscasWeb ?? 0) + buscas,
  };
}

function textoDaResposta(mensagem: Anthropic.Message): string {
  return mensagem.content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();
}

export class AnthropicDossieProvider implements DossieProvider {
  readonly nome = "anthropic";
  readonly automatico = true;

  private readonly cliente: Anthropic;
  private readonly tarifa: TarifaDossie;

  constructor(opcoes: OpcoesDoProvedorAnthropic) {
    this.tarifa = opcoes.tarifa;
    this.cliente =
      opcoes.cliente ??
      new Anthropic({
        apiKey: opcoes.chaveApi,
        timeout: TEMPO_LIMITE_MS,
        maxRetries: 1,
      });
  }

  /**
   * Pior caso desta execução, apurado ANTES de gastar: o prompt inteiro na
   * entrada (contado pela própria API) e o limite de saída inteiro
   * consumido. É o número comparado aos tetos pelo caso de uso.
   */
  async estimarCustoMaximo(pedido: PedidoDeDossie): Promise<number> {
    const prompt = prepararPrompt({
      nome_empresa: pedido.nomeEmpresa,
      site: pedido.site,
      contexto_adicional: pedido.contextoAdicional,
    });

    let tokensEntrada: number;
    try {
      const contagem = await this.cliente.messages.countTokens({
        model: MODELO_DO_DOSSIE,
        system: prompt.sistema,
        messages: [{ role: "user", content: prompt.usuario }],
        tools: [{ type: "web_search_20260209", name: "web_search" }],
      });
      tokensEntrada = contagem.input_tokens;
    } catch (erro) {
      throw new ErroDeProvedor(
        "FALHA_API",
        "Não foi possível conferir o custo desta geração antes de executá-la — nada foi gasto. Tente novamente em instantes.",
        { detalhes: [String(erro)] },
      );
    }

    return estimarCustoMaximo(
      { tokensEntradaEstimados: tokensEntrada, tokensSaidaMaximos: TOKENS_MAXIMOS_DA_RESPOSTA },
      this.tarifa,
    );
  }

  async gerar(pedido: PedidoDeDossie): Promise<ResultadoDaGeracao> {
    const prompt = prepararPrompt({
      nome_empresa: pedido.nomeEmpresa,
      site: pedido.site,
      contexto_adicional: pedido.contextoAdicional,
    });

    const mensagens: Anthropic.MessageParam[] = [{ role: "user", content: prompt.usuario }];
    let uso: UsoDaExecucao = { tokensEntrada: 0, tokensSaida: 0, buscasWeb: 0 };

    for (let rodada = 0; rodada < MAXIMO_DE_CONTINUACOES; rodada += 1) {
      let mensagem: Anthropic.Message;
      try {
        const fluxo = this.cliente.messages.stream({
          model: MODELO_DO_DOSSIE,
          max_tokens: TOKENS_MAXIMOS_DA_RESPOSTA,
          system: prompt.sistema,
          messages: mensagens,
          tools: [{ type: "web_search_20260209", name: "web_search" }],
        });
        mensagem = await fluxo.finalMessage();
      } catch (erro) {
        throw new ErroDeProvedor(
          "FALHA_API",
          "A consulta às fontes públicas falhou. O dossiê pode ser gerado de novo ou inserido manualmente.",
          { uso, detalhes: [String(erro)] },
        );
      }

      uso = somarUso(uso, mensagem);

      // Recusa do modelo: não é erro de infraestrutura e não se resolve
      // repetindo o mesmo pedido — o analista decide o que fazer.
      if (mensagem.stop_reason === "refusal") {
        throw new ErroDeProvedor(
          "RECUSA",
          "O modelo recusou este pedido de pesquisa. Reveja o contexto informado ou insira o dossiê manualmente.",
          { uso },
        );
      }

      // O teto vale durante a execução: a busca na web faz o contexto (e o
      // custo) crescer a cada rodada.
      const custoAteAqui = apurarCusto(uso, this.tarifa);
      const tetoUnitario = pedido.custoMaximoBrl ?? null;
      if (tetoUnitario !== null && custoAteAqui > tetoUnitario) {
        throw new ErroDeProvedor(
          "TETO_UNITARIO",
          `Geração interrompida ao atingir o custo máximo por dossiê (${formatarBrl(tetoUnitario)}, DOSSIE_CUSTO_MAX_UNITARIO_BRL). ` +
            `O consumo desta tentativa (${formatarBrl(custoAteAqui)}) está registrado.`,
          { uso },
        );
      }

      if (mensagem.stop_reason === "pause_turn") {
        // A busca na web atingiu o limite de iterações do servidor: devolve
        // o turno e continua de onde parou.
        mensagens.push({ role: "assistant", content: mensagem.content });
        continue;
      }

      if (mensagem.stop_reason === "max_tokens") {
        throw new ErroDeProvedor(
          "RESPOSTA_INVALIDA",
          "A resposta do modelo foi cortada no limite de tamanho e o dossiê ficou incompleto. Tente novamente.",
          { uso },
        );
      }

      const texto = textoDaResposta(mensagem);
      const validacao = validarConteudoDossie(texto);
      if (!validacao.valido) {
        throw new ErroDeProvedor(
          "RESPOSTA_INVALIDA",
          "A resposta não veio no schema do template do dossiê e por isso não foi gravada.",
          { uso, detalhes: validacao.erros },
        );
      }

      return {
        conteudo: validacao.conteudo,
        avisos: validacao.avisos,
        uso,
        modelo: mensagem.model ?? MODELO_DO_DOSSIE,
      };
    }

    throw new ErroDeProvedor(
      "FALHA_API",
      `A pesquisa não concluiu em ${MAXIMO_DE_CONTINUACOES} rodadas de busca. Tente novamente ou insira o dossiê manualmente.`,
      { uso },
    );
  }
}
