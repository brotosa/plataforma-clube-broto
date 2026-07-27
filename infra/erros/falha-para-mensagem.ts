import { ErroDeAutorizacao } from "@/dominio/autorizacao/permissoes";
import { ErroDeEnvioDeArquivo } from "@/dominio/arquivos/arquivo-enviado";
import { ErroDeArquivo, ErroDeConfiguracao } from "@/dominio/erros/falhas";
import { ErroDeLayoutTelemetria } from "@/dominio/integracao/telemetria";
import { ErroDeSegmentoInvalido } from "@/dominio/segmentacao/compilador";
import { ErroDeTemplate } from "@/dominio/dossie/template";
import { ErroDeValidacao } from "@/infra/casos-de-uso/contexto";
import { ErroDeLeitura } from "@/infra/carga-prospects/leitor-listas";
import { ErroDeProvedor } from "@/infra/dossie/provedor";
import { logger } from "@/infra/log/logger";

/**
 * RN55 — a falha que chega à tela nomeia a causa.
 *
 * Um só lugar decide isto para TODAS as server actions da plataforma.
 * Antes, cada arquivo de ações reconhecia validação e permissão e jogava o
 * resto num "Não foi possível concluir a ação. Tente novamente." — que
 * perdia o texto do domínio e, pior, dava conselho errado: quando a causa
 * é configuração ausente, tentar de novo nunca resolve.
 *
 * **A distinção é por classe, jamais por texto.** Erro de classe conhecida
 * propaga a própria mensagem; qualquer outra exceção vira genérica e o
 * detalhe fica só no log do servidor. Isso não é preciosismo: mensagem de
 * `PrismaClientKnownRequestError` carrega nome de tabela e trecho de SQL,
 * e `Error` de biblioteca carrega caminho de arquivo. Nenhum dos dois é
 * instância das classes abaixo, então nenhum dos dois chega à interface.
 */

/** As classes cuja mensagem é escrita para ser lida por quem usa a tela. */
const FALHAS_CONHECIDAS = [
  ErroDeValidacao,
  ErroDeAutorizacao,
  ErroDeConfiguracao,
  ErroDeArquivo,
  ErroDeLayoutTelemetria,
  ErroDeLeitura,
  // Recusa de arquivo ENVIADO pela tela — marca do aliado (RN54), imagem
  // do card (RN60), minuta do contrato e evidência de aprovação (RN62,
  // RN64). Uma classe só para as quatro: `ErroDeMarca` e `ErroDeImagem`
  // são aliases dela, decisão da F17 que a F19 manteve ao generalizar.
  // Listá-la pelo nome do núcleo evita que a entrada pareça específica da
  // marca quando já não é há duas fases.
  ErroDeEnvioDeArquivo,
  ErroDeSegmentoInvalido,
  ErroDeTemplate,
  ErroDeProvedor,
] as const;

/** Erro conhecido cuja mensagem pode ser exibida como está. */
export function ehFalhaConhecida(erro: unknown): erro is Error {
  return FALHAS_CONHECIDAS.some((classe) => erro instanceof classe);
}

export interface OpcoesDeFalha {
  /**
   * O que não foi possível fazer, em infinitivo e minúsculas — compõe a
   * mensagem genérica ("Não foi possível {operacao}."). Ex.: "concluir a
   * ação", "gerar o pacote", "importar o arquivo".
   */
  operacao: string;
  /** Texto de negação de permissão desta tela, com a referência da ficha. */
  semPermissao: string;
  /** Identificação da ação no log do servidor. */
  contexto: string;
}

/**
 * Mensagem genérica da RN55 — **sem "tente novamente"**.
 *
 * Repetir a ação é conselho útil só quando a causa é transitória, e aqui a
 * causa é justamente desconhecida. O que serve a quem está na tela é saber
 * que o detalhe existe, onde ele está e o que informar ao acionar a TI.
 */
export function mensagemGenerica(operacao: string): string {
  return `Não foi possível ${operacao}. O detalhe da falha ficou registrado no log do servidor — acione a TI informando o horário e a tela.`;
}

/**
 * Converte qualquer exceção nas mensagens que a interface exibe.
 *
 * Nunca devolve: rastro de pilha, caminho de arquivo, SQL, identificador
 * interno ou valor de variável de ambiente. Nomear a variável ausente é
 * permitido e desejável (`ErroDeConfiguracao` só recebe o nome dela).
 */
export function mensagensDeFalha(erro: unknown, opcoes: OpcoesDeFalha): string[] {
  if (erro instanceof ErroDeValidacao) {
    return [...erro.erros];
  }
  if (erro instanceof ErroDeSegmentoInvalido) {
    return [...erro.erros];
  }
  if (erro instanceof ErroDeAutorizacao) {
    // A única classe conhecida cuja mensagem NÃO sobe: ela cita papel e
    // ação internos ("Papel LEITURA não tem permissão para a ação
    // CRIAR_EDITAR"). Cada tela escreve a sua, com a referência da ficha.
    return [opcoes.semPermissao];
  }
  if (ehFalhaConhecida(erro)) {
    return [erro.message];
  }
  // Inesperado: o detalhe COMPLETO fica aqui, onde só a TI alcança.
  logger.error(
    {
      erro: erro instanceof Error ? { nome: erro.name, mensagem: erro.message } : String(erro),
      pilha: erro instanceof Error ? erro.stack : undefined,
      contexto: opcoes.contexto,
    },
    "falha inesperada em server action",
  );
  return [mensagemGenerica(opcoes.operacao)];
}
