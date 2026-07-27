import { logger } from "@/infra/log/logger";
import { prisma } from "@/infra/prisma/cliente";

/**
 * RN61 — a rota de saúde, nos dois níveis que um orquestrador precisa.
 *
 * **Vivo × pronto não é preciosismo.** São decisões diferentes do lado de
 * quem chama: *vivo* responde "o processo está de pé" e, se falhar, o
 * orquestrador **reinicia**; *pronto* responde "alcanço o banco" e, se
 * falhar, ele **espera** — tirando a instância do balanceamento sem matá-la.
 * Um endereço só forçaria a escolha errada num dos dois casos: reiniciar
 * contêiner saudável enquanto o banco se recupera derruba a plataforma
 * inteira por um problema que não é dela.
 *
 * **A resposta muda de assunto quando perguntada.** Corpo de uma palavra,
 * sem versão de dependência, sem nome ou endereço de banco, sem contagem de
 * registro, sem detalhe de ambiente. Herda a disciplina da RN55: a causa da
 * indisponibilidade fica no log do servidor, onde só a TI alcança, e nunca
 * no corpo — que aqui é público por definição, porque balanceador não faz
 * login.
 *
 * **E não grava auditoria**, de propósito: isto é chamado de poucos em
 * poucos segundos, e a trilha da RN49 não se apaga. Poluí-la seria dano
 * permanente por um endereço que não é ato de negócio de ninguém.
 */

/** Os três estados possíveis — e o corpo da resposta é exatamente isto. */
export type EstadoDeSaude = "vivo" | "pronto" | "indisponivel";

/**
 * Consulta trivial que prova alcance ao banco.
 *
 * Injetável para que o teste cubra os dois desfechos sem PostgreSQL: o
 * primeiro job do CI roda a unidade **sem** banco de propósito, e uma sonda
 * que só existisse ligada ao Prisma deixaria o caso "banco indisponível"
 * sem cobertura justamente onde ele importa.
 */
export type SondaDeBanco = () => Promise<unknown>;

/**
 * Teto de espera da sonda.
 *
 * Banco que **não responde** é tão indisponível quanto banco que recusa
 * conexão, e a diferença entre os dois é só o tempo que se leva para
 * descobrir. Sem este teto, a rota penduraria junto com a conexão e o
 * orquestrador só decidiria no timeout dele — que costuma ser mais longo e
 * não distingue "demorou" de "caiu".
 */
export const LIMITE_DA_SONDA_MS = 2_000;

/**
 * `SELECT 1`: não lê tabela de negócio, não escreve, não depende de
 * migration aplicada. Prova o que precisa provar — a conexão está de pé — e
 * nada além disso.
 */
const sondaPadrao: SondaDeBanco = () => prisma.$queryRaw`SELECT 1`;

function resposta(estado: EstadoDeSaude, status: number): Response {
  return new Response(JSON.stringify({ estado }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Verificação de saúde respondida de cache é verificação de nada.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Nível **vivo**: o processo responde. Não toca o banco. */
export function responderVivo(): Response {
  return resposta("vivo", 200);
}

async function sondarComLimite(sonda: SondaDeBanco, limiteMs: number): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sonda(),
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(
          () => rejeitar(new Error(`sonda de prontidão excedeu ${limiteMs} ms`)),
          limiteMs,
        );
      }),
    ]);
  } finally {
    // Sem isto o temporizador segura o event loop depois de a rota já ter
    // respondido — e o contêiner demoraria a encerrar no SIGTERM.
    clearTimeout(temporizador);
  }
}

/**
 * Nível **pronto**: alcança o banco.
 *
 * 503 quando não alcança — é o código que diz "estou de pé, mas não me
 * mande tráfego agora", que é exatamente o estado. 500 diria falha da
 * aplicação e 404 diria que o endereço não existe; os dois mentiriam.
 */
export async function responderPronto(
  sonda: SondaDeBanco = sondaPadrao,
  limiteMs: number = LIMITE_DA_SONDA_MS,
): Promise<Response> {
  try {
    await sondarComLimite(sonda, limiteMs);
    return resposta("pronto", 200);
  } catch (erro) {
    // O detalhe COMPLETO fica aqui, onde só a TI alcança. A mensagem de
    // erro do driver carrega host, porta e nome do banco — nada disso pode
    // aparecer no corpo de um endereço público.
    logger.error(
      {
        erro: erro instanceof Error ? { nome: erro.name, mensagem: erro.message } : String(erro),
        contexto: "saude/pronto",
      },
      "sonda de prontidão não alcançou o banco",
    );
    return resposta("indisponivel", 503);
  }
}
