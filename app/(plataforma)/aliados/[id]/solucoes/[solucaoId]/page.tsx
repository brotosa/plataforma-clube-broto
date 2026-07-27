import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { FormularioComEstado } from "../../../formularios";
import { FormularioSolucao } from "../formulario-solucao";
import { acaoMudarStatusSolucao } from "../acoes";
import { CartaoImagemSolucao } from "../cartao-imagem-solucao";

export const metadata: Metadata = {
  title: "Solução",
};

const ROTULO_STATUS_OFERTA: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
  EXPIRADA: "Expirada",
};

/** T3 — edição da solução + ofertas da solução. */
export default async function PaginaSolucao({
  params,
}: {
  params: Promise<{ id: string; solucaoId: string }>;
}) {
  const { id, solucaoId } = await params;
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeEditar = podeExecutar(papel, "CRIAR_EDITAR");

  const [solucao, categorias, culturas, ufs] = await Promise.all([
    prisma.solucao.findUnique({
      where: { id: solucaoId },
      include: {
        // `marca` só pela existência (RN09): o binário fica fora da consulta.
        empresa: { include: { marca: { select: { empresaId: true } } } },
        // Metadados da imagem, nunca o binário: ele só sai do banco pela
        // rota que o serve (RN60).
        imagemCard: { select: { hash: true, nomeArquivo: true, bytes: true } },
        culturas: { select: { culturaId: true } },
        ufs: { select: { ufId: true } },
        ofertas: { orderBy: { criadoEm: "asc" }, include: { tipoBeneficio: true, mecanica: true } },
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
        <b style={{ color: "var(--preto)" }}>{solucao.nome}</b>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 className="h-page" style={{ fontSize: 24, lineHeight: "30px" }}>
            {solucao.nome}
          </h1>
          <div style={{ marginTop: 6 }}>
            {solucao.status === "ATIVA" ? (
              <span className="pill pill-ok"><i aria-hidden="true" />Ativa</span>
            ) : (
              <span className="pill pill-neutra"><i aria-hidden="true" />Inativa — ofertas pausadas (RN04)</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeEditar ? (
          <FormularioComEstado
            acao={acaoMudarStatusSolucao}
            rotuloEnviar={solucao.status === "ATIVA" ? "Inativar solução" : "Reativar solução"}
            classeBotao="btn btn-ghost"
            confirmacao={
              solucao.status === "ATIVA"
                ? "Inativar a solução pausa as ofertas publicadas em cascata (RN04). Confirmar?"
                : undefined
            }
          >
            <input type="hidden" name="empresaId" value={id} />
            <input type="hidden" name="solucaoId" value={solucao.id} />
            <input type="hidden" name="novoStatus" value={solucao.status === "ATIVA" ? "INATIVA" : "ATIVA"} />
          </FormularioComEstado>
        ) : null}
        {podeEditar && solucao.status === "ATIVA" ? (
          <Link
            href={`/aliados/${id}/solucoes/${solucao.id}/ofertas/nova`}
            className="btn btn-azul"
            style={{ textDecoration: "none" }}
          >
            + Nova oferta
          </Link>
        ) : null}
      </div>

      <div className="card" style={{ overflowX: "auto", marginBottom: 22 }}>
        <table className="tbl tbl-resp">
          <thead>
            <tr>
              <th>Oferta</th>
              <th>Natureza</th>
              <th>Tipo de benefício</th>
              <th>Mecânica</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {solucao.ofertas.length === 0 ? (
              <tr>
                <td colSpan={5} className="cap" style={{ textAlign: "center", padding: "22px 14px" }}>
                  Nenhuma oferta nesta solução ainda.
                </td>
              </tr>
            ) : (
              solucao.ofertas.map((oferta) => (
                <tr key={oferta.id} className="click">
                  <td>
                    <Link href={`/ofertas/${oferta.id}`} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
                      {oferta.titulo}
                    </Link>
                  </td>
                  <td data-label="Natureza" className="cap">
                    {oferta.natureza === "RECOMPENSA"
                      ? "Recompensa"
                      : oferta.natureza === "BENEFICIO"
                        ? "Benefício"
                        : "Cupom de desconto"}
                  </td>
                  <td data-label="Tipo" className="cap">{oferta.tipoBeneficio.nome}</td>
                  <td data-label="Mecânica" className="cap">{oferta.mecanica.nome}</td>
                  <td data-label="Status">
                    <span className={oferta.status === "PUBLICADA" ? "pill pill-ok" : "pill pill-neutra"}>
                      <i aria-hidden="true" />
                      {ROTULO_STATUS_OFERTA[oferta.status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {podeEditar ? (
        <>
          <h2 className="h-el" style={{ marginBottom: 14 }}>
            Editar solução
          </h2>
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
        </>
      ) : null}
    </div>
  );
}
