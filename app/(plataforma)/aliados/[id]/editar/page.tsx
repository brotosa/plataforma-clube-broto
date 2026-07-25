import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infra/prisma/cliente";
import { formatarCnpj } from "@/dominio/empresas/cnpj";
import { FormularioAliado } from "../../formulario-aliado";

export const metadata: Metadata = {
  title: "Editar aliado",
};

export default async function PaginaEditarAliado({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [empresa, categorias, ufs] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id },
      include: { categorias: { select: { categoriaId: true } } },
    }),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.uf.findMany({ where: { ativa: true }, orderBy: { sigla: "asc" } }),
  ]);
  if (!empresa) {
    notFound();
  }

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 980 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aliados">Aliados</Link> /{" "}
        <Link href={`/aliados/${empresa.id}`}>{empresa.nomeFantasia}</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Editar</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Editar cadastro</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          Todas as alterações ficam na trilha de auditoria (valor anterior/novo/autor)
        </div>
      </div>
      <FormularioAliado
        categorias={categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome }))}
        ufs={ufs.map((uf) => ({ sigla: uf.sigla }))}
        valores={{
          empresaId: empresa.id,
          nomeFantasia: empresa.nomeFantasia,
          razaoSocial: empresa.razaoSocial,
          cnpj: empresa.cnpj ? formatarCnpj(empresa.cnpj) : null,
          enderecoCep: empresa.enderecoCep,
          enderecoLogradouro: empresa.enderecoLogradouro,
          enderecoNumero: empresa.enderecoNumero,
          enderecoComplemento: empresa.enderecoComplemento,
          enderecoBairro: empresa.enderecoBairro,
          enderecoMunicipio: empresa.enderecoMunicipio,
          enderecoUf: empresa.enderecoUf,
          logoUrl: empresa.logoUrl,
          descricaoInstitucional: empresa.descricaoInstitucional,
          site: empresa.site,
          categoriaIds: empresa.categorias.map((vinculo) => vinculo.categoriaId),
        }}
      />
    </div>
  );
}
