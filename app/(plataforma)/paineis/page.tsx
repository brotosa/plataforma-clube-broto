import { auth } from "@/infra/auth";
import { redirect } from "next/navigation";

import { abrirPainel, listarPaineis } from "@/infra/casos-de-uso/paineis";
import { ROTULOS_DE_EIXO, type FiltroDoPainel } from "@/dominio/relatorios/eixos";
import { BlocoDoPainel, type BlocoSerializado } from "./bloco";

/**
 * T37 — Painel de relatórios (Onda 18, ficha §4).
 *
 * Uma rota só, em dois estados: sem `?painel=`, a galeria; com ele, o painel
 * aberto. **A troca é só de query string, então usa âncora nativa** —
 * convenção da casa, cobrada pela cerca `navegacao-por-query`.
 *
 * ## O que esta tela NÃO faz
 *
 * Não decide o que ninguém alcança e não executa nada. Ela pede ao caso de
 * uso o **estado** de cada bloco e desenha o que voltar; quem executa é o
 * próprio bloco, no cliente, um por vez — e é isso que faz oito blocos não
 * esperarem pelo mais lento.
 *
 * ## E ela não é o Dashboard
 *
 * A HOME (T26) é institucional, e cada indicador dela vem de ficha validada
 * (RN50). Este painel é de quem o montou e só recompõe relatórios que a
 * pessoa já podia executar.
 */

export const dynamic = "force-dynamic";

export default async function PaginaDePaineis({
  searchParams,
}: {
  searchParams: Promise<{ painel?: string }>;
}) {
  const sessao = await auth();
  if (!sessao?.user) redirect("/entrar");
  const ator = { id: sessao.user.id, papel: sessao.user.papel };
  const parametros = await searchParams;

  if (parametros.painel) {
    return <PainelAberto id={parametros.painel} ator={ator} />;
  }

  const paineis = await listarPaineis(ator);

  return (
    <div className="tela" style={{ padding: "22px 24px 40px", maxWidth: 1180 }}>
      <h1 className="h-page">Painéis</h1>
      <div className="cap" style={{ margin: "4px 0 18px" }}>
        Vários relatórios lado a lado. Cada bloco roda com a sua permissão — o painel não amplia o
        que você já vê na plataforma.
      </div>

      {paineis.length === 0 ? (
        <p className="rel-gaveta-vazia" style={{ marginTop: 18 }}>
          Nenhum painel ainda. No Gerador de relatórios, abra um relatório e use{" "}
          <strong>Pôr no painel</strong>.
        </p>
      ) : (
        <ul className="pn-galeria">
          {paineis.map((painel) => (
            <li key={painel.id}>
              {/* Âncora, e não <Link>: muda só a query string. */}
              <a className="pn-cartao" href={`/paineis?painel=${painel.id}`}>
                <strong>{painel.nome}</strong>
                <span>
                  {painel.quantosBlocos} bloco{painel.quantosBlocos === 1 ? "" : "s"} ·{" "}
                  {painel.visibilidade === "TIME" ? "Do time" : "Só eu"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function PainelAberto({
  id,
  ator,
}: {
  id: string;
  ator: { id: string; papel: Parameters<typeof abrirPainel>[0]["papel"] };
}) {
  const painel = await abrirPainel(ator, id);

  const blocos: BlocoSerializado[] = painel.blocos.map((bloco) => ({
    estado: bloco.estado,
    titulo: bloco.titulo,
    largura: bloco.largura,
    ...(bloco.estado === "SEM_ALCANCE" || bloco.estado === "FALHOU"
      ? { motivo: bloco.motivo }
      : {}),
    ...(bloco.estado === "AGUARDA_FINALIDADE" ? { assunto: bloco.assunto } : {}),
    ...(bloco.estado === "PRONTO" || bloco.estado === "AGUARDA_FINALIDADE"
      ? { visualizacao: "visualizacao" in bloco ? bloco.visualizacao : undefined }
      : {}),
    ...("resumo" in bloco ? { resumo: bloco.resumo } : {}),
    ...("naoAplicados" in bloco ? { naoAplicados: bloco.naoAplicados } : {}),
  }));

  return (
    <div className="tela" style={{ padding: "22px 24px 40px", maxWidth: 1180 }}>
      <h1 className="h-page">{painel.nome}</h1>
      <div className="cap" style={{ margin: "4px 0 18px" }}>
        {/* Âncora, e não <Link>: muda só a query string (cerca navegacao-por-query). */}
        <a href="/paineis">voltar aos painéis</a>
      </div>

      <FiltroDoPainelNaTela filtro={painel.filtro} />

      <div className="pn-grade">
        {blocos.map((bloco, indice) => (
          <BlocoDoPainel key={indice} painelId={painel.id} indice={indice} bloco={bloco} />
        ))}
      </div>
    </div>
  );
}

/**
 * O filtro vigente do painel (RN89).
 *
 * **Exibido, e não editável nesta fase.** O filtro é gravado com o painel, e
 * mexer nele aqui exigiria decidir se a mudança vale só para esta sessão ou
 * para todo mundo que abre — pergunta que a F31 não precisa responder para
 * entregar o que importa: que o filtro exista, se aplique e DIGA onde não se
 * aplicou.
 *
 * Sem filtro, nada é desenhado. Uma faixa dizendo "sem filtro" ocuparia
 * espaço para informar o estado normal.
 */
function FiltroDoPainelNaTela({ filtro }: { filtro: FiltroDoPainel | null }) {
  if (!filtro) return null;

  const partes: string[] = [];
  if (filtro.periodo) {
    const de = filtro.periodo.de ? `de ${filtro.periodo.de}` : "";
    const ate = filtro.periodo.ate ? `até ${filtro.periodo.ate}` : "";
    partes.push(`${ROTULOS_DE_EIXO.PERIODO}: ${[de, ate].filter(Boolean).join(" ")}`);
  }
  if (filtro.uf?.length) {
    partes.push(`${ROTULOS_DE_EIXO.UF}: ${filtro.uf.join(", ")}`);
  }
  if (partes.length === 0) return null;

  return (
    <p className="pn-filtro" role="note">
      <strong>Filtro do painel</strong> · {partes.join(" · ")}
    </p>
  );
}
