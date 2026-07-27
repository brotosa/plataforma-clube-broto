import { redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { ROTULOS_META } from "@/dominio/campanhas/atribuicao";
import { portasDaAtivacao } from "@/dominio/campanhas/regras";
import { listarPatrocinadoresParaEtiqueta } from "@/infra/consultas/patrocinadores";
import { camposDoConstrutor } from "@/infra/consultas/assinantes";
import {
  conteudoDisponivel,
  formatosDePeca,
  segmentosDisponiveis,
} from "@/infra/consultas/campanhas";
import { dadosDaAtivacao, lerCampanha } from "@/infra/casos-de-uso/campanhas";
import { situacaoRn41 } from "@/infra/casos-de-uso/cestas";
import { ModelagemCampanha, type ItemConteudo } from "./modelagem";

/**
 * T23 — modelagem da campanha. Rascunho abre aqui; campanha já ativada
 * vai para o painel (a modelagem não reescreve o que foi entregue —
 * ajuste gera nova versão do kit, RN45).
 */

export const dynamic = "force-dynamic";

export default async function PaginaModelagem({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const { id } = await params;
  const campanha = await lerCampanha(id);
  if (campanha.estado !== "RASCUNHO") {
    redirect(`/campanhas/${id}/painel`);
  }

  const regrasPublico =
    campanha.origemPublico === "SEGMENTO_SALVO"
      ? ((campanha.segmento?.regras ?? []) as never[])
      : ((campanha.regrasPublico ?? []) as never[]);

  const [campos, segmentos, formatos, conteudo, ativacao, patrocinadores] = await Promise.all([
    camposDoConstrutor(),
    segmentosDisponiveis(),
    formatosDePeca(),
    conteudoDisponivel(regrasPublico),
    dadosDaAtivacao(id),
    // Onda 12 (RN64) — a etiqueta do patrocinador na modelagem.
    listarPatrocinadoresParaEtiqueta(),
  ]);

  const cestasVinculadas = new Set(campanha.cestas.map(({ cestaId }) => cestaId));
  const ofertasVinculadas = new Set(campanha.ofertasAvulsas.map(({ ofertaId }) => ofertaId));

  const cestas: ItemConteudo[] = conteudo.cestas.map((cesta) => {
    const situacao = situacaoRn41(cesta as never);
    return {
      id: cesta.id,
      nome: cesta.nome,
      detalhe: `${cesta.ofertas.length} oferta(s) · ${cesta.narrativa ?? "sem narrativa"}`,
      vinculado: cestasVinculadas.has(cesta.id),
      bloqueada: !situacao.liberada,
      motivoBloqueio: situacao.liberada
        ? null
        : situacao.bloqueiam.length > 0
          ? "oferta não publicada"
          : "cesta vazia",
      sugestao: conteudo.sugestoesDeCesta.get(cesta.id)?.motivo ?? null,
    };
  });

  const ofertas: ItemConteudo[] = conteudo.ofertas.map((oferta) => ({
    id: oferta.id,
    nome: oferta.titulo,
    detalhe: `${oferta.solucao.empresa.nomeFantasia} · ${oferta.solucao.nome}`,
    vinculado: ofertasVinculadas.has(oferta.id),
    sugestao: conteudo.sugestoesDeOferta.get(oferta.id)?.motivo ?? null,
  }));

  const portas = portasDaAtivacao(ativacao).map((porta) => ({
    chave: porta.chave,
    atendida: porta.atendida,
    texto: porta.texto,
  }));

  const resumoKit = [
    { item: "publico.csv", valor: `${ativacao.contagemPublico.toLocaleString("pt-BR")} linhas` },
    {
      item: "manifesto.json",
      valor: `${campanha.cestas.length} cesta(s) · ${campanha.ofertasAvulsas.length} oferta(s) avulsa(s)`,
    },
    { item: "pecas/", valor: `${campanha.pecas.length} peça(s)` },
    { item: "instrucoes.md", valor: campanha.instrucoes ? "preenchido" : "sem instruções" },
    { item: "formato de entrega", valor: "zip (a confirmar com a Minutrade)" },
  ];

  return (
    <ModelagemCampanha
      campanha={{
        id: campanha.id,
        nome: campanha.nome,
        objetivo: campanha.objetivo,
        origemPublico: campanha.origemPublico,
        segmentoId: campanha.segmentoId,
        regrasPublico: (campanha.regrasPublico ?? []) as never[],
        vigenciaInicio: campanha.vigenciaInicio?.toISOString().slice(0, 10) ?? null,
        vigenciaFim: campanha.vigenciaFim?.toISOString().slice(0, 10) ?? null,
        instrucoes: campanha.instrucoes,
        // Onda 12 (RN64)
        patrocinadorId: campanha.patrocinadorId,
        aprovacaoAprovador: campanha.aprovacaoAprovador,
        aprovacaoData: campanha.aprovacaoData?.toISOString().slice(0, 10) ?? null,
        temEvidencia: campanha.evidencia !== null,
      }}
      patrocinadores={patrocinadores}
      campos={[...campos.nucleo, ...campos.enriquecimento]}
      segmentos={segmentos.map((segmento) => ({ id: segmento.id, nome: segmento.nome }))}
      formatos={formatos.map((formato) => ({ slug: formato.slug, nome: formato.nome }))}
      cestas={cestas}
      ofertas={ofertas}
      pecas={campanha.pecas.map((peca) => ({
        id: peca.id,
        formatoSlug: peca.formato.slug,
        formatoNome: peca.formato.nome,
        titulo: peca.titulo,
        texto: peca.texto,
        temImagem: peca.imagemChave !== null,
      }))}
      metas={campanha.metas.map((meta) => ({
        id: meta.id,
        tipo: meta.tipo,
        rotulo: ROTULOS_META[meta.tipo],
        alvo: meta.alvo.toString(),
        nota:
          meta.tipo === "CONVERSAO_PCT"
            ? "exige o nível por público — aguarda telemetria por CPF (RN44)"
            : "medida no nível por oferta (RN43)",
      }))}
      portas={portas}
      resumoKit={resumoKit}
    />
  );
}
