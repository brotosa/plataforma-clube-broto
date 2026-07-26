import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/infra/prisma/cliente";
import { FormularioSolucao } from "../formulario-solucao";
import { AvisoEdicaoDesktop } from "../../../../aviso-desktop";

export const metadata: Metadata = {
  title: "Nova solução",
};

/** T3 — cadastro de solução (com preview do card e régua RN09). */
export default async function PaginaNovaSolucao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [empresa, categorias, culturas, ufs] = await Promise.all([
    prisma.empresa.findUnique({
      where: { id },
      // `marca` só pela existência (RN09): o binário fica fora da consulta.
      include: { marca: { select: { empresaId: true } } },
    }),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.cultura.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.uf.findMany({ where: { ativa: true }, orderBy: { sigla: "asc" } }),
  ]);
  if (!empresa) {
    notFound();
  }

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aliados">Aliados</Link> /{" "}
        <Link href={`/aliados/${empresa.id}?aba=solucoes`}>{empresa.nomeFantasia}</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Nova solução</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Nova solução</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          O card da vitrine nasce aqui — a régua ao lado mostra o que falta para publicar (RN09)
        </div>
      </div>
      <AvisoEdicaoDesktop />
      <FormularioSolucao
        empresaId={empresa.id}
        aliado={{
          nomeFantasia: empresa.nomeFantasia,
          temMarca: empresa.marca !== null,
          logoUrl: empresa.logoUrl,
        }}
        categorias={categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome }))}
        culturas={culturas.map((cultura) => ({ id: cultura.id, nome: cultura.nome }))}
        ufs={ufs.map((uf) => ({ id: uf.id, sigla: uf.sigla }))}
      />
    </div>
  );
}
