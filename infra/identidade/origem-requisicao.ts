import { headers } from "next/headers";

/**
 * Endereço de origem da requisição, para o bloqueio por origem.
 *
 * Atrás de balanceador o endereço real vem em `x-forwarded-for`, cujo PRIMEIRO
 * elemento é o cliente e os demais são os saltos. Lemos só o primeiro.
 *
 * **Cabeçalho é entrada não confiável**: qualquer cliente pode enviar
 * `x-forwarded-for` forjado, e quem estiver diretamente exposto veria o valor
 * inventado. Aqui isso é aceitável porque o efeito é apenas *bloquear a si
 * mesmo* — forjar a origem não dá acesso a nada; no máximo evade o próprio
 * bloqueio, que é exatamente a limitação declarada desta regra (ver
 * `politica-origem`: defesa contra volume pertence à borda). O valor é
 * normalizado e limitado em tamanho para não virar chave arbitrária no banco.
 *
 * Devolve `null` quando não há como saber — e sem origem conhecida a regra
 * simplesmente não se aplica, em vez de bloquear no escuro.
 */
export async function obterOrigemDaRequisicao(): Promise<string | null> {
  try {
    const cabecalhos = await headers();
    const encaminhado = cabecalhos.get("x-forwarded-for");
    const bruto = encaminhado ? encaminhado.split(",")[0] : cabecalhos.get("x-real-ip");
    const limpo = (bruto ?? "").trim();
    if (!limpo) return null;
    // Endereço IPv4/IPv6 cabe folgado em 45 caracteres; mais que isso é lixo.
    if (limpo.length > 45) return null;
    // Só o alfabeto de endereço (dígitos, letras de IPv6, ponto, dois-pontos,
    // e o sufixo de zona). Recusa qualquer outra coisa em vez de gravar.
    if (!/^[0-9a-fA-F.:%]+$/.test(limpo)) return null;
    return limpo;
  } catch {
    // Fora de escopo de requisição (não deveria acontecer no caminho de
    // login). Sem origem, a regra não se aplica.
    return null;
  }
}
