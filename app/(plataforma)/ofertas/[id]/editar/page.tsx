import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infra/prisma/cliente";
import type { MecanicaSlug } from "@/dominio/ofertas/regras";
import { FormularioOferta } from "../../formulario-oferta";
import { AvisoEdicaoDesktop } from "../../../aviso-desktop";

export const metadata: Metadata = {
  title: "Editar oferta",
};

function paraCampoData(data: Date | null): string {
  if (!data) return "";
  return data.toISOString().slice(0, 10);
}

export default async function PaginaEditarOferta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [oferta, tiposBeneficio, mecanicas, campanhas, cestas] = await Promise.all([
    prisma.oferta.findUnique({
      where: { id },
      include: {
        solucao: {
          include: {
            empresa: { include: { contratos: { where: { status: "VIGENTE" } } } },
            categoria: true,
            // Só a existência: o binário sai do banco pela rota (RN60).
            imagemCard: { select: { solucaoId: true } },
          },
        },
      },
    }),
    prisma.tipoBeneficio.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.mecanica.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    // Onda 4: destinos possíveis do vínculo (campanha em rascunho ou ativa;
    // encerrada não recebe oferta nova).
    prisma.campanha.findMany({
      where: { estado: { in: ["RASCUNHO", "ATIVA"] } },
      orderBy: { nome: "asc" },
    }),
    prisma.cesta.findMany({ orderBy: { nome: "asc" } }),
  ]);
  if (!oferta) {
    notFound();
  }
  const contratoVigente = oferta.solucao.empresa.contratos[0] ?? null;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/ofertas">Ofertas</Link> /{" "}
        <Link href={`/ofertas/${oferta.id}`}>{oferta.titulo}</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Editar</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Editar oferta</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          Alterar campos publicáveis de oferta publicada liga a flag de republicação (RN10)
        </div>
      </div>
      <AvisoEdicaoDesktop />
      <FormularioOferta
        solucaoId={oferta.solucaoId}
        contexto={{
          aliadoNome: oferta.solucao.empresa.nomeFantasia,
          solucaoNome: oferta.solucao.nome,
          categoriaNome: oferta.solucao.categoria?.nome ?? null,
          ambientes: contratoVigente?.ambientesPagamento ?? null,
          solucaoComImagem: oferta.solucao.imagemCard !== null ? oferta.solucao.id : null,
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
        valores={{
          ofertaId: oferta.id,
          titulo: oferta.titulo,
          natureza: oferta.natureza,
          tipoBeneficioId: oferta.tipoBeneficioId,
          precoDe: oferta.precoDe === null ? "" : String(oferta.precoDe),
          precoPor: oferta.precoPor === null ? "" : String(oferta.precoPor),
          percentualDesconto:
            oferta.percentualDesconto === null ? "" : String(oferta.percentualDesconto),
          cupomCodigoRegras: oferta.cupomCodigoRegras,
          modalidadePagamento: oferta.modalidadePagamento,
          mecanicaId: oferta.mecanicaId,
          urlResgateExterno: oferta.urlResgateExterno,
          instrucoesResgate: oferta.instrucoesResgate,
          vigenciaInicio: paraCampoData(oferta.vigenciaInicio),
          vigenciaFim: paraCampoData(oferta.vigenciaFim),
          limiteResgates: oferta.limiteResgates,
          destinacao: oferta.destinacao,
          destinacaoCampanhaId: oferta.destinacaoCampanhaId,
          destinacaoCestaId: oferta.destinacaoCestaId,
        }}
        campanhas={campanhas.map((campanha) => ({
          id: campanha.id,
          nome: campanha.nome,
          vigencia: campanha.vigenciaInicio
            ? `${paraCampoData(campanha.vigenciaInicio)} a ${paraCampoData(campanha.vigenciaFim) || "sem fim"}`
            : null,
        }))}
        cestas={cestas.map((cesta) => ({ id: cesta.id, nome: cesta.nome }))}
      />
    </div>
  );
}
