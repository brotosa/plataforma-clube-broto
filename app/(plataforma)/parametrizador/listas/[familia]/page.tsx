import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import {
  familiaDe,
  MENSAGEM_RN24_SEM_EXCLUSAO,
  textoDeUso,
} from "@/dominio/parametrizador/listas";
import { DIMENSOES_MEDICAO } from "@/dominio/avaliacao/dimensoes";
import { itensComUso, ultimoAjusteDoItem } from "@/infra/consultas/parametrizador";
import { AvisoDeLeitura, AvisoNeutro, EstadoVazio } from "../../componentes";
import { DetalheDoItem, FormularioNovoItem } from "../../formularios";

export const metadata: Metadata = {
  title: "Editor de listas de domínio",
};

/**
 * T16 — Editor de listas de domínio (protótipo v6.1): lista + detalhe com
 * busca, contagem de uso antes de inativar (RN24) e, para indicadores, os
 * campos de grupo, dimensão e peso. A seleção viaja na URL (?item=) para
 * que a tela seja compartilhável e o teclado navegue por links reais.
 */
export default async function PaginaEditorDeLista({
  params,
  searchParams,
}: {
  params: Promise<{ familia: string }>;
  searchParams: Promise<{ item?: string; busca?: string }>;
}) {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  if (!podeExecutar(papel, "VISUALIZAR_PARAMETROS")) {
    redirect("/");
  }
  const ehAdmin = podeExecutar(papel, "CONFIGURAR_PARAMETROS");

  const { familia: familiaId } = await params;
  const familia = familiaDe(familiaId);
  if (!familia) {
    notFound();
  }
  const { item: itemSelecionadoId, busca } = await searchParams;

  const itens = await itensComUso(familia.id);
  const termo = (busca ?? "").trim().toLowerCase();
  const filtrados = termo
    ? itens.filter((item) => item.nome.toLowerCase().includes(termo))
    : itens;
  const selecionado =
    itens.find((item) => item.id === itemSelecionadoId) ?? filtrados[0] ?? null;
  const ultimoAjuste = selecionado
    ? await ultimoAjusteDoItem(familia.id, selecionado.id)
    : "";

  const urlDoItem = (id: string) => {
    const parametros = new URLSearchParams();
    parametros.set("item", id);
    if (termo) parametros.set("busca", busca ?? "");
    return `/parametrizador/listas/${familia.id}?${parametros.toString()}`;
  };

  const contagem = termo
    ? `${filtrados.length} de ${itens.length} ${familia.unidade}`
    : `${itens.length} ${familia.unidade}`;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/parametrizador">Parametrizador</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>{familia.rotulo}</b>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="h-page">{familia.rotulo}</h1>
          <div className="cap" style={{ marginTop: 4 }}>
            {familia.descricao}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {ehAdmin && familia.permiteCriar ? (
          <FormularioNovoItem
            familia={familia.id}
            ehIndicador={Boolean(familia.afetaScore)}
            dimensoes={DIMENSOES_MEDICAO.map((dimensao) => dimensao.nome)}
          />
        ) : null}
      </div>

      {ehAdmin ? null : <AvisoDeLeitura contexto="lista" />}
      <AvisoNeutro icone="escudo">{MENSAGEM_RN24_SEM_EXCLUSAO}</AvisoNeutro>
      {familia.permiteCriar ? null : (
        <AvisoNeutro icone="escudo">
          Esta lista reproduz um fato público e fechado: não recebe itens novos. Renomear,
          inativar e reativar seguem disponíveis.
        </AvisoNeutro>
      )}

      {itens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum item nesta lista ainda"
          texto={familia.textoVazio ?? "A lista está vazia."}
        />
      ) : (
        <div
          className="g-resp"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,320px) minmax(0,1fr)",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div className="card" style={{ padding: 14 }}>
            <form method="get" role="search">
              <label
                className="cap"
                htmlFor="busca-item"
                style={{ position: "absolute", left: -9999 }}
              >
                Buscar item na lista
              </label>
              <input
                id="busca-item"
                className="input"
                type="search"
                name="busca"
                placeholder="Buscar item…"
                defaultValue={busca ?? ""}
              />
            </form>

            {filtrados.length === 0 ? (
              <div style={{ padding: "22px 10px", textAlign: "center" }}>
                <p className="cap" style={{ margin: 0 }}>
                  Nenhum item corresponde a “{busca}”.
                </p>
                <Link
                  href={`/parametrizador/listas/${familia.id}`}
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: 10, textDecoration: "none" }}
                >
                  Limpar busca
                </Link>
              </div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "12px 0 0",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  maxHeight: 460,
                  overflow: "auto",
                }}
              >
                {filtrados.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={urlDoItem(item.id)}
                      className={`pm-it${selecionado?.id === item.id ? " on" : ""}`}
                      style={{ textDecoration: "none" }}
                      aria-current={selecionado?.id === item.id ? "true" : undefined}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.nome}
                      </span>
                      {item.ativo ? null : (
                        <span className="pill pill-neutra" style={{ fontSize: 10 }}>
                          inativo
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div
              className="cap"
              style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--borda)" }}
            >
              {contagem}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {selecionado ? (
              <DetalheDoItem
                familia={familia.id}
                ehIndicador={Boolean(familia.afetaScore)}
                dimensoes={DIMENSOES_MEDICAO.map((dimensao) => dimensao.nome)}
                somenteLeitura={!ehAdmin}
                item={{
                  id: selecionado.id,
                  nome: selecionado.nome,
                  ativo: selecionado.ativo,
                  grupo: selecionado.grupo,
                  dimensao: selecionado.dimensao,
                  peso: selecionado.peso,
                  textoDeUso: textoDeUso(selecionado.usos),
                  ultimoAjuste,
                }}
              />
            ) : (
              <EstadoVazio
                titulo="Nenhum item selecionado"
                texto="Escolha um item na lista ao lado para ver e editar seus dados."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
