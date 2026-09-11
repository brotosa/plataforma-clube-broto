"use server";

import { auth, signOut, unstable_update } from "@/infra/auth";

/**
 * Heartbeat de atividade da sessão (PR B — tempo de sessão por inatividade).
 *
 * O contador do cliente (SentinelaDeSessao) dispara isto de tempos em tempos
 * ENQUANTO houver atividade real (mouse/teclado/rolagem). `unstable_update`
 * reexecuta o callback `jwt` do Auth.js com `trigger: "update"`, que reinicia
 * a marca `ultimaAtividade` do token para "agora" — mantendo viva a sessão de
 * quem está usando a plataforma sem navegar.
 *
 * É deliberadamente barato e sem efeito colateral: se a sessão já expirou
 * (inatividade estourada), o próprio `jwt` devolve nulo e o cookie é limpo —
 * o heartbeat não ressuscita sessão morta. Não navega para tela nova sozinho
 * chamando este endpoint, e não grava auditoria (atividade de uso não é ato
 * de negócio, no espírito da RN61 sobre a rota de saúde).
 */
export async function registrarAtividade(): Promise<{ ok: boolean }> {
  const sessao = await auth();
  if (!sessao?.user) {
    return { ok: false };
  }
  await unstable_update({});
  return { ok: true };
}

/**
 * Encerra a sessão por inatividade — chamada pelo contador quando ele zera.
 * Limpa o cookie e leva ao login com o aviso de expiração. O servidor já teria
 * recusado a próxima requisição de qualquer modo (o `jwt` devolve nulo); isto
 * apenas torna a saída limpa e explicada, em vez de um redirecionamento seco.
 */
export async function encerrarPorInatividade(): Promise<void> {
  await signOut({ redirectTo: "/entrar?expirada=1" });
}
