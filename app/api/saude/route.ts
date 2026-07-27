import { responderVivo } from "@/infra/saude/verificacao";

/**
 * RN61 — nível **vivo**: pública, fora do grupo autenticado (o balanceador
 * não faz login), e não toca o banco.
 *
 * `force-dynamic` porque uma resposta constante seria pré-renderizada no
 * build e a rota passaria a atestar a saúde de um arquivo estático, não a
 * do processo — que é a única coisa que ela existe para dizer.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return responderVivo();
}
