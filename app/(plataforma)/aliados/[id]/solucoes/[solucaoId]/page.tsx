import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { calcularCompletudeCard } from "@/dominio/ofertas/regras";
import { FormularioComEstado } from "../../../formularios";
import { acaoMudarStatusSolucao } from "../acoes";

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

/**
 * Rótulos de natureza na visão do produto (renome de 24/08): Benefício e
 * Cupom ganharam a origem do checkout no nome. A mesma tabela vive na T5
 * (`ofertas/page.tsx` e `ofertas/[id]/page.tsx`) — aqui ela é repetida por
 * ser um mapa curto e estável, não fonte de regra.
 */
const ROTULO_NATUREZA: Record<string, string> = {
  RECOMPENSA: "Recompensa",
  BENEFICIO: "Benefício (Checkout Broto)",
  CUPOM_DESCONTO: "Desconto (Checkout Externo)",
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

  // Leitura da ficha (somente leitura): mapeia os vínculos para nomes.
  const nomeCategoria = categorias.find((c) => c.id === solucao.categoriaId)?.nome ?? null;
  const idsCulturas = new Set(solucao.culturas.map((v) => v.culturaId));
  const nomesCulturas = culturas.filter((c) => idsCulturas.has(c.id)).map((c) => c.nome);
  const idsUfs = new Set(solucao.ufs.map((v) => v.ufId));
  const siglasUfs = ufs.filter((u) => idsUfs.has(u.id)).map((u) => u.sigla);
  const ROTULO_PORTE: Record<string, string> = { PEQUENO: "Pequeno", MEDIO: "Médio", GRANDE: "Grande" };
  const rotulosPerfil = solucao.perfilCliente.map((p) => ROTULO_PORTE[p] ?? p);
  const completude = calcularCompletudeCard({
    aliado: {
      nomeFantasia: solucao.empresa.nomeFantasia,
      temMarca: solucao.empresa.marca !== null,
      logoUrl: solucao.empresa.logoUrl,
    },
    solucao: {
      nome: solucao.nome,
      descricaoCurta: solucao.descricaoCurta ?? "",
      temCategoria: Boolean(solucao.categoriaId),
      quantidadeCulturas: nomesCulturas.length,
      coberturaNacional: solucao.coberturaNacional,
      quantidadeUfs: siglasUfs.length,
      temImagem: solucao.imagemCard !== null,
      imagemCardUrl: solucao.imagemCardUrl,
    },
  });

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
                    {ROTULO_NATUREZA[oferta.natureza] ?? oferta.natureza}
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

      {/* Ficha da solução — SOMENTE LEITURA. A edição vive em rota própria
          (`/editar`), como no aliado e na oferta: assim "Salvar alterações"
          leva de volta a esta ficha em vez de deixar um formulário aberto
          para sempre aqui (defeito relatado em 28/08). */}
      <div className="card" style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <h2 className="h-el" style={{ margin: 0 }}>
            Dados da solução
          </h2>
          <span className="cap">· régua de completude do card (RN09): {completude.percentual}%</span>
          <div style={{ flex: 1 }} />
          {podeEditar ? (
            <Link
              href={`/aliados/${id}/solucoes/${solucao.id}/editar`}
              className="btn btn-azul"
              style={{ textDecoration: "none" }}
            >
              Editar solução
            </Link>
          ) : null}
        </div>
        <div
          className="g-resp"
          style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "12px 16px", fontSize: 14 }}
        >
          <span className="cap">Categoria</span>
          <span>{nomeCategoria ?? "—"}</span>
          <span className="cap">Descrição curta</span>
          <span>{solucao.descricaoCurta || "—"}</span>
          <span className="cap">Descrição completa</span>
          <span style={{ whiteSpace: "pre-wrap" }}>{solucao.descricaoCompleta || "—"}</span>
          <span className="cap">Link externo</span>
          <span>
            {solucao.linkExterno ? (
              <a href={solucao.linkExterno} target="_blank" rel="noreferrer">
                {solucao.linkExterno}
              </a>
            ) : (
              "—"
            )}
          </span>
          <span className="cap">Cobertura</span>
          <span>
            {solucao.coberturaNacional
              ? "Nacional"
              : siglasUfs.length > 0
                ? siglasUfs.join(", ")
                : "—"}
          </span>
          <span className="cap">Culturas atendidas</span>
          <span>{nomesCulturas.length > 0 ? nomesCulturas.join(", ") : "—"}</span>
          <span className="cap">Perfil de cliente-alvo</span>
          <span>{rotulosPerfil.length > 0 ? rotulosPerfil.join(", ") : "—"}</span>
          <span className="cap">Tecnologia/diferenciais</span>
          <span>{solucao.tecnologias.length > 0 ? solucao.tecnologias.join(", ") : "—"}</span>
          <span className="cap">Imagem do card</span>
          <span>{solucao.imagemCard !== null ? "Definida" : "Pendente (opcional — RN09)"}</span>
        </div>
      </div>
    </div>
  );
}
