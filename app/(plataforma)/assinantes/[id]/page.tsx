import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { decidirExibicaoPlena } from "@/infra/casos-de-uso/assinantes-segmentos";
import { perfilAssinante } from "@/infra/consultas/assinantes";
import { usoPorAssinante } from "@/infra/consultas/telemetria-operadora";

/**
 * T19 — Perfil do assinante: núcleo com os dois estados de máscara
 * (RN30, decidido no servidor e auditado), assinatura com origem
 * sinalizada como pendente, uso "aguardando telemetria por assinante"
 * (RN36) e enriquecimento com proveniência (RN35).
 */

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.charAt(0) ?? "") + (partes[1]?.charAt(0) ?? "")).toUpperCase();
}

function dataCurta(data: Date | null): string {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(data);
}

export default async function PaginaPerfilAssinante({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const { id } = await params;
  const parametros = await searchParams;
  const ator = { id: sessao.user.id, papel: sessao.user.papel };
  const podePlenos = podeExecutar(ator.papel, "VISUALIZAR_DADOS_PESSOAIS_PLENOS");
  const { dadosPlenos } = await decidirExibicaoPlena(ator, {
    exibirPlenos: parametros.plenos === "1",
    contexto: "perfil",
    assinanteId: id,
  });

  const perfil = await perfilAssinante(id, { dadosPlenos });
  if (!perfil) {
    notFound();
  }

  // RN36 — recência, frequência e valor a partir da telemetria nominal da
  // operadora que casou por CPF. `null` quando não há evento (RN53).
  const uso = await usoPorAssinante(id);
  const moedaBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const rotuloPreferencia =
    perfil.preferencia === "AMBOS"
      ? "agricultura · pecuária"
      : perfil.preferencia === "PECUARIA"
        ? "pecuária"
        : perfil.preferencia === "AGRICULTURA"
          ? "agricultura"
          : "—";

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1080 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/assinantes">Assinantes</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>{perfil.nome}</b>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <span className="logo-ini" style={{ width: 52, height: 52, fontSize: 17 }}>
          {iniciaisDe(perfil.nome)}
        </span>
        <div>
          <h1 className="h-page">{perfil.nome}</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {perfil.statusBase === "ATIVO" ? (
              perfil.assinatura?.status ? (
                <span className="pill pill-ok">
                  <i />
                  Assinatura {perfil.assinatura.status}
                </span>
              ) : (
                <span className="pill pill-neutra">assinatura — origem pendente</span>
              )
            ) : (
              <span className="pill pill-warn">
                <i />
                fora da base
              </span>
            )}
            <span className="pill pill-neutra">{rotuloPreferencia}</span>
            {perfil.marcaSintetico ? <span className="selo">registro ilustrativo</span> : null}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podePlenos ? (
          <Link
            className="btn btn-ghost"
            href={dadosPlenos ? `/assinantes/${perfil.id}` : `/assinantes/${perfil.id}?plenos=1`}
          >
            {dadosPlenos ? "Mascarar dados" : "Exibir dados plenos"}
          </Link>
        ) : null}
      </div>

      {dadosPlenos ? (
        <div
          className="aviso-inline"
          style={{ background: "var(--alerta-claro)", borderColor: "var(--alerta)" }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ flex: "none" }}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          </svg>
          <span>
            Exibição plena de dados pessoais — este acesso gerou evento de auditoria com
            seu usuário, data e finalidade da consulta (RN30).
          </span>
        </div>
      ) : (
        <div className="aviso-inline">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ flex: "none" }}
          >
            <rect x="4" y="11" width="16" height="10" rx="1" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span>
            CPF e contato mascarados. A exibição plena depende da permissão “visualizar
            dados pessoais plenos”.
          </span>
        </div>
      )}

      <div
        className="g-resp"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)",
          gap: 18,
          alignItems: "start",
          marginTop: 18,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 14 }}>
              Núcleo cadastral{" "}
              <span className="cap" style={{ fontWeight: 400 }}>
                · importado do arquivo do comprador
              </span>
            </h2>
            <div
              className="g-resp"
              style={{
                display: "grid",
                gridTemplateColumns: "170px 1fr",
                gap: "12px 16px",
                fontSize: 14,
              }}
            >
              <span className="cap">Nome</span>
              <span>{perfil.nome}</span>
              <span className="cap">CPF</span>
              <span className="num">
                {perfil.cpf}{" "}
                {dadosPlenos && perfil.marcaSintetico ? (
                  <span className="selo">registro sintético — não é dado real</span>
                ) : null}
              </span>
              <span className="cap">E-mail</span>
              <span className="num">{perfil.email ?? "—"}</span>
              <span className="cap">Telefone</span>
              <span className="num">{perfil.telefone ?? "—"}</span>
              <span className="cap">Endereço</span>
              <span>{perfil.enderecoBruto ?? "—"}</span>
              <span className="cap">UF · município</span>
              <span>
                {perfil.uf || perfil.municipio
                  ? `${perfil.uf ?? "—"} · ${perfil.municipio ?? "—"}`
                  : "não derivado"}{" "}
                <span className="cap">derivados do endereço na importação (RN32)</span>
              </span>
              <span className="cap">Preferência</span>
              <span>{rotuloPreferencia}</span>
            </div>
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Uso{" "}
              <span className="cap" style={{ fontWeight: 400 }}>
                · telemetria Minutrade
              </span>
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              Recência, frequência e valor de uso por assinante alimentam perfil e
              segmentação (RN36).
            </p>
            {uso === null ? (
              <div className="vazio" style={{ padding: "22px 10px" }}>
                <span className="selo">aguardando telemetria por assinante</span>
                <p className="cap" style={{ maxWidth: "56ch", margin: "10px 0 0" }}>
                  Nenhum evento da operadora casou com este assinante ainda. A junção é
                  por CPF: assim que um relatório &ldquo;Resgate e Compras&rdquo; trouxer
                  o CPF desta pessoa, os números aparecem aqui — nenhum é estimado.
                </p>
              </div>
            ) : (
              <div
                className="g-resp"
                style={{
                  display: "grid",
                  gridTemplateColumns: "170px 1fr",
                  gap: "12px 16px",
                  fontSize: 14,
                }}
              >
                <span className="cap">Recência</span>
                <span>
                  último evento em {dataCurta(uso.dataUltimoEvento)}
                  <span className="cap"> · desde {dataCurta(uso.dataPrimeiroEvento)}</span>
                </span>
                <span className="cap">Frequência</span>
                <span>
                  {uso.totalEventos} evento(s) · {uso.resgates} resgate(s) ·{" "}
                  {uso.compras} compra(s)
                  {uso.naoClassificados > 0 ? (
                    <span className="cap"> · {uso.naoClassificados} não classificado(s)</span>
                  ) : null}
                </span>
                <span className="cap">Valor</span>
                <span>
                  {uso.valorTotal === null ? (
                    <span className="cap">não informado na fonte</span>
                  ) : (
                    <>
                      {moedaBRL.format(uso.valorTotal.toNumber())}
                      <span className="cap"> · em {uso.eventosComValor} evento(s) com valor</span>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Enriquecimento
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              Atributos derivados — inclusive as unidades produtivas e a cultura de cada
              UP — nunca sobrescrevem o núcleo; cada um carrega proveniência (RN35).
            </p>
            {perfil.atributos.length === 0 ? (
              <p className="cap" style={{ margin: 0 }}>
                Nenhum atributo de enriquecimento ainda — eles entram por importação
                própria, casando por CPF.
              </p>
            ) : (
              perfil.atributos.map((atributo, indice) => (
                <div className="pm-ro" style={{ padding: "12px 0" }} key={indice}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "var(--font-body-label-bold)" }}>
                      {atributo.nome}: {atributo.valor}
                    </div>
                    <div className="cap" style={{ marginTop: 3 }}>
                      {atributo.fonte} · {dataCurta(atributo.dataReferencia)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Assinatura
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              Plano e vencimento <span className="selo">origem do dado em definição</span>
            </p>
            {perfil.assinatura ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  fontSize: 14,
                }}
              >
                <span className="cap">Plano</span>
                <span>
                  {perfil.assinatura.plano === "MENSAL"
                    ? "Mensal"
                    : perfil.assinatura.plano === "ANUAL"
                      ? "Anual"
                      : "—"}
                </span>
                <span className="cap">Status</span>
                <span>
                  {perfil.assinatura.status ? (
                    <span className="pill pill-ok">
                      <i />
                      {perfil.assinatura.status}
                    </span>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="cap">Vencimento</span>
                <span className="num">{dataCurta(perfil.assinatura.vencimento)}</span>
                <span className="cap">Janela</span>
                <span>
                  {perfil.assinatura.janela ? (
                    <span className="pill pill-warn">
                      <i />
                      vence em {perfil.assinatura.janela} dias
                    </span>
                  ) : (
                    <span className="cap">fora das janelas 30/60/90</span>
                  )}
                </span>
              </div>
            ) : (
              <p className="cap" style={{ margin: 0 }}>
                Sem dado de assinatura — a origem (arquivo do comprador × extrato
                Minutrade) está em definição; nada é preenchido por suposição.
              </p>
            )}
            <p className="cap" style={{ margin: "14px 0 0" }}>
              Vencimento é visibilidade e filtro — nenhuma cobrança ou disparo na v1
              (RN37).
            </p>
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 10 }}>
              Segmentos que incluem este assinante
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {perfil.segmentos.length === 0 ? (
                <span className="cap">Nenhum segmento salvo o inclui hoje.</span>
              ) : (
                perfil.segmentos.map((nome) => (
                  <Link key={nome} href="/assinantes/segmentos">
                    {nome}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
