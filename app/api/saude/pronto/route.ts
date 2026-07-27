import { responderPronto } from "@/infra/saude/verificacao";

/**
 * RN61 — nível **pronto**: pública, e alcança o banco com uma consulta
 * trivial. 503 quando não alcança.
 *
 * `force-dynamic` é obrigatório aqui, não conveniência: sem ele o Next
 * tentaria pré-renderizar a rota **durante o build**, quando não há banco
 * algum — e o `docker build` quebraria por causa da rota que existe para
 * dizer se o banco está de pé.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return responderPronto();
}
