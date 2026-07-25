import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/infra/prisma/cliente";
import { FormularioAliado } from "../formulario-aliado";
import { AvisoEdicaoDesktop } from "../../aviso-desktop";

export const metadata: Metadata = {
  title: "Novo aliado",
};

/** Cadastro de novo aliado — nasce em estágio Em negociação (pré-aliança). */
export default async function PaginaNovoAliado() {
  const [categorias, ufs] = await Promise.all([
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.uf.findMany({ where: { ativa: true }, orderBy: { sigla: "asc" } }),
  ]);

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 980 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aliados">Aliados</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Novo aliado</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Novo aliado</h1>
        <div className="cap" style={{ marginTop: 4 }}>
          A empresa nasce em estágio Em negociação; a promoção a Aliada ativa passa pelo
          motor de aprovação (RN06)
        </div>
      </div>
      <AvisoEdicaoDesktop />
      <FormularioAliado
        categorias={categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome }))}
        ufs={ufs.map((uf) => ({ sigla: uf.sigla }))}
      />
    </div>
  );
}
