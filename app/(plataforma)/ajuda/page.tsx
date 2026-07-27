import type { Metadata } from "next";
import Script from "next/script";
import { montarGuiaHtml, SCRIPT_DO_SUMARIO } from "@/conteudo/guia-plataforma/montar";
import { resolverOrigem, secaoParaOrigem } from "@/dominio/ajuda/mapa-contextual";

/**
 * T31 — Ajuda contextual (Onda 9, RN58 e RN59).
 *
 * Rota dentro do shell, e não modal: o guia tem doze seções e leitura
 * longa, então precisa de rolagem, âncora por seção, endereço
 * compartilhável, botão voltar do navegador e impressão. Modal prende o
 * leitor no topo, perde histórico e não sobrevive a Ctrl+P (ficha §1.1,
 * decisão fechada).
 *
 * **Não exige permissão** (RN58): a rota está no grupo `(plataforma)`, que
 * pede sessão como toda tela do produto, mas não consulta papel algum. E
 * não lê dado da operação: nenhuma consulta ao banco acontece aqui — o
 * conteúdo vem do repositório, e é conteúdo editorial.
 */

export const metadata: Metadata = {
  title: "Ajuda",
  description: "Guia da Plataforma — o que ela é, o vocabulário, os princípios e as jornadas de uso.",
};

/** Um só parâmetro nos interessa; o resto da query é ignorado. */
function primeiroValor(bruto: string | string[] | undefined): string | null {
  if (typeof bruto === "string") {
    return bruto;
  }
  return Array.isArray(bruto) ? (bruto[0] ?? null) : null;
}

export default async function PaginaDeAjuda({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const declarada = primeiroValor(parametros.de);

  /**
   * A origem chega pela URL e passa pela allowlist do `MAPA_AJUDA` antes
   * de virar destino. `null` aqui é resposta legítima e frequente — quem
   * digitou `/ajuda` ou salvou o endereço nos favoritos não tem origem, e
   * a RN59 é explícita: sem origem conhecida, sem barra. Nada a inventar.
   */
  const origem = resolverOrigem(declarada);
  const secaoAtiva = secaoParaOrigem(declarada);

  return (
    <>
      {origem ? (
        <div className="gd-volta">
          {/*
            Âncora, não `<Link>`: a volta é troca de rota carregando query
            (`?aba=metas` sobrevive à ida e à volta), e a convenção do
            repositório manda âncora sempre que a query participa da
            navegação. Aqui ela ainda tem uma segunda vantagem — devolve o
            documento inteiro, e o leitor volta à tela de origem sem
            resíduo de rolagem do guia.
          */}
          <a className="btn btn-ghost btn-sm" href={origem.destino}>
            ← Voltar para {origem.rotulo}
          </a>
          <span className="cap">Ajuda · guia da plataforma</span>
        </div>
      ) : null}

      {/*
        Um único bloco de HTML: o guia é montado por `montarGuiaHtml`, a
        mesma função que gera o documento autônomo. Fatiar isto em
        componentes React criaria uma segunda montagem para manter em dia —
        e é justamente o que a ficha §1.6 chama de defeito.
      */}
      <div className="gd" dangerouslySetInnerHTML={{ __html: montarGuiaHtml({ secaoAtiva }) }} />

      <Script id="guia-sumario" strategy="afterInteractive">
        {SCRIPT_DO_SUMARIO}
      </Script>
    </>
  );
}
