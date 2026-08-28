import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { FormularioSolucao } from "../../formulario-solucao";
import { CartaoImagemSolucao } from "../../cartao-imagem-solucao";
import { AvisoEdicaoDesktop } from "../../../../../aviso-desktop";

export const metadata: Metadata = {
  title: "Editar solução",
};

/**
 * T3 — edição da solução em rota própria.
 *
 * Mesma decisão do aliado (`/aliados/[id]/editar`) e da oferta
 * (`/ofertas/[id]/editar`): a tela de detalhe é somente leitura e a edição
 * vive numa rota separada. Assim "Salvar alterações" leva de volta à ficha
 * (a ação redireciona para o detalhe), em vez de deixar um formulário
 * aberto para sempre na própria ficha — que era o defeito relatado.
 */
export default async function PaginaEditarSolucao({
  params,
}: {
  params: Promise<{ id: string; solucaoId: string }>;
}) {
  const { id, solucaoId } = await params;
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  if (!podeExecutar(papel, "CRIAR_EDITAR")) {
    // Sem permissão de edição, não há o que fazer aqui: volta à ficha.
    redirect(`/aliados/${id}/solucoes/${solucaoId}`);
  }

  const [solucao, categorias, culturas, ufs] = await Promise.all([
    prisma.solucao.findUnique({
      where: { id: solucaoId },
      include: {
        empresa: { include: { marca: { select: { empresaId: true } } } },
        imagemCard: { select: { hash: true, nomeArquivo: true, bytes: true } },
        culturas: { select: { culturaId: true } },
        ufs: { select: { ufId: true } },
      },
    }),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.cultura.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.uf.findMany({ where: { ativa: true }, orderBy: { sigla: "asc" } }),
  ]);
  if (!solucao || solucao.empresaId !== id) {
    notFound();
  }

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aliados">Aliados</Link> /{" "}
        <Link href={`/aliados/${id}?aba=solucoes`}>{solucao.empresa.nomeFantasia}</Link> /{" "}
        <Link href={`/aliados/${id}/solucoes/${solucao.id}`}>{solucao.nome}</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Editar</b>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page" style={{ fontSize: 24, lineHeight: "30px" }}>
          Editar solução
        </h1>
        <div className="cap" style={{ marginTop: 4 }}>
          Todas as alterações ficam na trilha de auditoria (valor anterior/novo/autor)
        </div>
      </div>
      <AvisoEdicaoDesktop />

      <FormularioSolucao
        empresaId={id}
        aliado={{
          nomeFantasia: solucao.empresa.nomeFantasia,
          temMarca: solucao.empresa.marca !== null,
          logoUrl: solucao.empresa.logoUrl,
        }}
        categorias={categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome }))}
        culturas={culturas.map((cultura) => ({ id: cultura.id, nome: cultura.nome }))}
        ufs={ufs.map((uf) => ({ id: uf.id, sigla: uf.sigla }))}
        temImagem={solucao.imagemCard !== null}
        hashDaImagem={solucao.imagemCard?.hash ?? null}
        valores={{
          solucaoId: solucao.id,
          nome: solucao.nome,
          descricaoCurta: solucao.descricaoCurta,
          descricaoCompleta: solucao.descricaoCompleta,
          categoriaId: solucao.categoriaId,
          imagemCardUrl: solucao.imagemCardUrl,
          linkExterno: solucao.linkExterno,
          coberturaNacional: solucao.coberturaNacional,
          perfilCliente: solucao.perfilCliente,
          tecnologias: solucao.tecnologias,
          culturaIds: solucao.culturas.map((vinculo) => vinculo.culturaId),
          ufIds: solucao.ufs.map((vinculo) => vinculo.ufId),
        }}
      />

      <div style={{ marginTop: 18 }}>
        <CartaoImagemSolucao
          empresaId={id}
          solucaoId={solucao.id}
          nomeDaSolucao={solucao.nome}
          imagem={solucao.imagemCard}
        />
      </div>
    </div>
  );
}
