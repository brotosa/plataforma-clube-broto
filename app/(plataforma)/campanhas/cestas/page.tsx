import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { listarCestas, situacaoRn41 } from "@/infra/casos-de-uso/cestas";
import { conteudoDisponivel, segmentosDisponiveis } from "@/infra/consultas/campanhas";
import { EditorDeCestas, type CestaExibida, type OfertaDisponivel } from "./editor-cestas";

/**
 * T24 — Cestas: lista com a etiqueta da RN41 visível, edição com
 * pré-visualização dos cards da vitrine e sugestões assistivas (RN42)
 * para o perfil-alvo.
 */

export const dynamic = "force-dynamic";

export default async function PaginaCestas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const parametros = await searchParams;
  const selecionadaId = typeof parametros.cesta === "string" ? parametros.cesta : null;

  const [cestas, segmentos] = await Promise.all([listarCestas(), segmentosDisponiveis()]);
  const selecionada = cestas.find((cesta) => cesta.id === selecionadaId) ?? cestas[0] ?? null;

  const regrasDoPerfil = selecionada
    ? selecionada.origemPerfil === "SEGMENTO_SALVO"
      ? ((selecionada.segmento?.regras ?? []) as never[])
      : ((selecionada.regrasPerfil ?? []) as never[])
    : [];
  const conteudo = await conteudoDisponivel(regrasDoPerfil);

  const exibidas: CestaExibida[] = cestas.map((cesta) => {
    const situacao = situacaoRn41(cesta);
    return {
      id: cesta.id,
      nome: cesta.nome,
      narrativa: cesta.narrativa,
      origemPerfil: cesta.origemPerfil,
      segmentoId: cesta.segmentoId,
      liberada: situacao.liberada,
      bloqueiam: situacao.bloqueiam.map((oferta) => oferta.titulo),
      emCampanhaAtiva: cesta.campanhas.some(({ campanha }) => campanha.estado === "ATIVA"),
      ofertas: cesta.ofertas.map(({ oferta }) => ({
        id: oferta.id,
        titulo: oferta.titulo,
        aliado: oferta.solucao.empresa.nomeFantasia,
        categoria: oferta.solucao.categoria?.nome ?? null,
        natureza: oferta.natureza,
        status: oferta.status,
        precoDe: oferta.precoDe ? Number(oferta.precoDe) : null,
        precoPor: oferta.precoPor ? Number(oferta.precoPor) : null,
      })),
    };
  });

  const disponiveis: OfertaDisponivel[] = conteudo.ofertas.map((oferta) => ({
    id: oferta.id,
    titulo: oferta.titulo,
    aliado: oferta.solucao.empresa.nomeFantasia,
    sugestao: conteudo.sugestoesDeOferta.get(oferta.id)?.motivo ?? null,
  }));

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/campanhas">Campanhas</Link> / <b style={{ color: "var(--preto)" }}>Cestas</b>
      </div>
      <EditorDeCestas
        cestas={exibidas}
        selecionadaId={selecionada?.id ?? null}
        segmentos={segmentos.map((segmento) => ({ id: segmento.id, nome: segmento.nome }))}
        ofertasDisponiveis={disponiveis}
        podeGerir={podeExecutar(sessao.user.papel, "GERIR_CESTAS")}
      />
    </div>
  );
}
