import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infra/prisma/cliente";
import type { MecanicaSlug } from "@/dominio/ofertas/regras";
import { FormularioOferta } from "@/app/(plataforma)/ofertas/formulario-oferta";
import { AvisoEdicaoDesktop } from "@/app/(plataforma)/aviso-desktop";

export const metadata: Metadata = {
  title: "Nova oferta",
};

/** T5 — cadastro de oferta dentro da solução. */
export default async function PaginaNovaOferta({
  params,
}: {
  params: Promise<{ id: string; solucaoId: string }>;
}) {
  const { id, solucaoId } = await params;
  const [solucao, tiposBeneficio, mecanicas, campanhas, cestas] = await Promise.all([
    prisma.solucao.findUnique({
      where: { id: solucaoId },
      include: {
        empresa: { include: { contratos: { where: { status: "VIGENTE" } } } },
        categoria: true,
      },
    }),
    prisma.tipoBeneficio.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.mecanica.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    // Onda 4: destinos do vínculo da oferta (ficha §3).
    prisma.campanha.findMany({
      where: { estado: { in: ["RASCUNHO", "ATIVA"] } },
      orderBy: { nome: "asc" },
    }),
    prisma.cesta.findMany({ orderBy: { nome: "asc" } }),
  ]);
  if (!solucao || solucao.empresaId !== id) {
    notFound();
  }
  const contratoVigente = solucao.empresa.contratos[0] ?? null;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aliados">Aliados</Link> /{" "}
        <Link href={`/aliados/${id}?aba=solucoes`}>{solucao.empresa.nomeFantasia}</Link> /{" "}
        <Link href={`/aliados/${id}/solucoes/${solucao.id}`}>{solucao.nome}</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Nova oferta</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Nova oferta</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          A oferta nasce como rascunho; a publicação verifica RN02, RN09 e RN11
        </div>
      </div>
      <AvisoEdicaoDesktop />
      <FormularioOferta
        solucaoId={solucao.id}
        contexto={{
          aliadoNome: solucao.empresa.nomeFantasia,
          solucaoNome: solucao.nome,
          categoriaNome: solucao.categoria?.nome ?? null,
          ambientes: contratoVigente?.ambientesPagamento ?? null,
        }}
        tiposBeneficio={tiposBeneficio.map((tipo) => ({
          id: tipo.id,
          slug: tipo.slug,
          nome: tipo.nome,
        }))}
        mecanicas={mecanicas.map((mecanica) => ({
          id: mecanica.id,
          slug: mecanica.slug as MecanicaSlug,
          nome: mecanica.nome,
        }))}
        campanhas={campanhas.map((campanha) => ({
          id: campanha.id,
          nome: campanha.nome,
          vigencia: campanha.vigenciaInicio
            ? `${campanha.vigenciaInicio.toISOString().slice(0, 10)} a ${campanha.vigenciaFim?.toISOString().slice(0, 10) ?? "sem fim"}`
            : null,
        }))}
        cestas={cestas.map((cesta) => ({ id: cesta.id, nome: cesta.nome }))}
      />
    </div>
  );
}
