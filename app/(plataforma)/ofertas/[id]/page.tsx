import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { avaliarPublicacao } from "@/infra/casos-de-uso/ofertas";
import { agregadoDaOferta } from "@/infra/consultas/telemetria";
import { FormularioComEstado } from "@/app/(plataforma)/aliados/formularios";
import { acaoEncerrarOferta, acaoPausarOferta, acaoPublicarOferta } from "../acoes";

export const metadata: Metadata = {
  title: "Oferta",
};

const ROTULO_NATUREZA: Record<string, string> = {
  RECOMPENSA: "Recompensa",
  BENEFICIO: "Benefício (Checkout Broto)",
  CUPOM_DESCONTO: "Desconto (Checkout Externo)",
};

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
  EXPIRADA: "Expirada",
};

function formatarData(data: Date | null): string {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(data);
}

function formatarMoeda(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(valor),
  );
}

/** T5 — detalhe da oferta com porta de publicação e telemetria (RN07). */
export default async function PaginaOferta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeEditar = podeExecutar(papel, "CRIAR_EDITAR");
  const podePublicar = podeExecutar(papel, "PUBLICAR_PAUSAR_ENCERRAR_OFERTA");

  const existe = await prisma.oferta.findUnique({ where: { id }, select: { id: true } });
  if (!existe) {
    notFound();
  }
  const [{ oferta, completude, impedimentos }, solicitacaoPendente, agregadoResultado] =
    await Promise.all([
      avaliarPublicacao(id),
      prisma.aprovacaoSolicitacao.findFirst({
        where: { tipoEntidade: "PUBLICACAO_OFERTA", entidadeId: id, estado: "SOLICITADA" },
      }),
      agregadoDaOferta(id),
    ]);
  const empresa = oferta.solucao.empresa;
  const agregado = agregadoResultado ?? {
    emitidos: 0,
    resgatados: 0,
    comprasConfirmadas: 0,
    receitaConfirmada: 0,
    foraDaPlataforma: false,
    historicoResgates: null,
    historicoCompras: null,
  };
  const temHistorico =
    agregado.historicoResgates !== null || agregado.historicoCompras !== null;

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1100 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/ofertas">Ofertas</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>{oferta.titulo}</b>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 className="h-page" style={{ fontSize: 24, lineHeight: "30px" }}>
            {oferta.titulo}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <span className={oferta.status === "PUBLICADA" ? "pill pill-ok" : "pill pill-neutra"}>
              <i aria-hidden="true" />
              {ROTULO_STATUS[oferta.status]}
            </span>
            <span className="pill pill-info">
              <i aria-hidden="true" />
              {ROTULO_NATUREZA[oferta.natureza]}
            </span>
            {oferta.pendenteRepublicacao ? (
              <span className="pill pill-warn">
                <i aria-hidden="true" />
                pendente de republicação (RN10)
              </span>
            ) : null}
            {solicitacaoPendente ? (
              <span className="pill pill-info">
                <i aria-hidden="true" />
                publicação aguardando aprovação
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeEditar ? (
          <Link href={`/ofertas/${oferta.id}/editar`} className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Editar oferta
          </Link>
        ) : null}
      </div>

      <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 14 }}>
              Dados da oferta
            </h2>
            <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "12px 16px", fontSize: 14 }}>
              <span className="cap">Aliado</span>
              <span>
                <Link href={`/aliados/${empresa.id}`}>{empresa.nomeFantasia}</Link>
              </span>
              <span className="cap">Solução</span>
              <span>
                <Link href={`/aliados/${empresa.id}/solucoes/${oferta.solucao.id}`}>
                  {oferta.solucao.nome}
                </Link>
              </span>
              <span className="cap">Tipo de benefício</span>
              <span>{oferta.tipoBeneficio.nome}</span>
              {oferta.percentualDesconto !== null ? (
                <>
                  <span className="cap">Desconto</span>
                  <span className="num">{oferta.percentualDesconto}% de desconto</span>
                </>
              ) : (
                <>
                  <span className="cap">Preço de / por</span>
                  <span className="num">
                    {formatarMoeda(oferta.precoDe)} / {formatarMoeda(oferta.precoPor)}
                  </span>
                </>
              )}
              {oferta.natureza === "CUPOM_DESCONTO" ? (
                <>
                  <span className="cap">Código/regras do cupom</span>
                  <span>{oferta.cupomCodigoRegras ?? "—"}</span>
                </>
              ) : null}
              {oferta.natureza === "BENEFICIO" ? (
                <>
                  <span className="cap">Modalidade de pagamento</span>
                  <span>
                    {oferta.modalidadePagamento === "RECORRENTE"
                      ? "Recorrente (prestação continuada)"
                      : oferta.modalidadePagamento === "UNICA"
                        ? "Única"
                        : "—"}
                  </span>
                </>
              ) : null}
              <span className="cap">Mecânica de resgate</span>
              <span>{oferta.mecanica.nome}</span>
              {oferta.urlResgateExterno ? (
                <>
                  <span className="cap">URL de resgate externo</span>
                  <span className="mono">{oferta.urlResgateExterno}</span>
                </>
              ) : null}
              {oferta.instrucoesResgate ? (
                <>
                  <span className="cap">Instruções pós-voucher</span>
                  <span>{oferta.instrucoesResgate}</span>
                </>
              ) : null}
              <span className="cap">Vigência</span>
              <span className="num">
                {formatarData(oferta.vigenciaInicio)} –{" "}
                {oferta.vigenciaFim ? formatarData(oferta.vigenciaFim) : "prazo indeterminado"}
              </span>
              <span className="cap">Limite de resgates</span>
              <span className="num">
                {oferta.limiteResgates ?? "—"}{" "}
                <span className="selo">interno — [A CONFIRMAR] suporte Minutrade</span>
              </span>
              <span className="cap">Id externo (Minutrade)</span>
              <span>
                {oferta.idExternoMinutrade ? (
                  <span className="mono">{oferta.idExternoMinutrade}</span>
                ) : (
                  <span className="cap">— (informe em Editar para vincular a telemetria)</span>
                )}
              </span>
            </div>
          </div>

          {podePublicar ? (
            <div className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el" style={{ marginBottom: 14 }}>
                Publicação
              </h2>
              {impedimentos.length > 0 ? (
                <div style={{ marginBottom: 14 }}>
                  <p className="cap" style={{ margin: "0 0 6px", fontWeight: 700 }}>
                    Impedimentos para publicar:
                  </p>
                  <ul className="cap" style={{ margin: 0, paddingLeft: 18 }}>
                    {impedimentos.map((impedimento) => (
                      <li key={impedimento}>{impedimento}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(oferta.status === "RASCUNHO" || oferta.status === "PAUSADA") &&
                !solicitacaoPendente ? (
                  <FormularioComEstado acao={acaoPublicarOferta} rotuloEnviar="Publicar oferta">
                    <input type="hidden" name="ofertaId" value={oferta.id} />
                  </FormularioComEstado>
                ) : null}
                {oferta.status === "PUBLICADA" ? (
                  <FormularioComEstado
                    acao={acaoPausarOferta}
                    rotuloEnviar="Pausar oferta"
                    classeBotao="btn btn-ghost"
                  >
                    <input type="hidden" name="ofertaId" value={oferta.id} />
                  </FormularioComEstado>
                ) : null}
                {oferta.status !== "ENCERRADA" ? (
                  <FormularioComEstado
                    acao={acaoEncerrarOferta}
                    rotuloEnviar="Encerrar oferta"
                    classeBotao="btn btn-ghost"
                    confirmacao="Encerrar a oferta é definitivo (RN05: nada é excluído — o histórico permanece). Confirmar?"
                  >
                    <input type="hidden" name="ofertaId" value={oferta.id} />
                  </FormularioComEstado>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="kpi">
            <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
              Régua de completude do card (RN09)
            </div>
            <div style={{ marginTop: 10 }}>
              <span className={completude.percentual < 50 ? "compl baixa" : "compl"}>
                <span className="trk">
                  <span className="fill" style={{ width: `${completude.percentual}%`, display: "block" }} />
                </span>
                <span className="pct num">{completude.percentual}%</span>
              </span>
            </div>
            <ul className="cap" style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {completude.itens.map((item) => (
                <li key={item.rotulo} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: item.ok ? "var(--verde)" : "var(--cinza)",
                      flex: "none",
                    }}
                  />
                  {item.rotulo}
                  {item.opcional ? <span className="cap"> (opcional)</span> : null}
                </li>
              ))}
            </ul>
            {completude.completa && completude.percentual < 100 ? (
              <p className="cap" style={{ margin: "10px 0 0", color: "var(--verde)" }}>
                Pronta para publicar — falta apenas o item opcional (imagem do card), que
                não é obrigatório.
              </p>
            ) : null}
          </div>

          <div className="kpi">
            <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
              Telemetria por oferta (somente leitura — RN07)
            </div>
            <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
              <div>
                <div className="kpi-n num" style={{ fontSize: 22 }}>{agregado.emitidos}</div>
                <div className="cap">emitidos</div>
              </div>
              <div>
                <div className="kpi-n num" style={{ fontSize: 22 }}>{agregado.resgatados}</div>
                <div className="cap">
                  {agregado.foraDaPlataforma ? "resgatados (conciliação)" : "resgatados"}
                </div>
              </div>
              <div>
                <div className="kpi-n num" style={{ fontSize: 22 }}>{agregado.comprasConfirmadas}</div>
                <div className="cap">compras</div>
              </div>
            </div>
            {agregado.comprasConfirmadas > 0 ? (
              <p className="cap" style={{ margin: "10px 0 0" }}>
                Receita confirmada: <b className="num">{formatarMoeda(agregado.receitaConfirmada)}</b>
              </p>
            ) : null}
            {agregado.foraDaPlataforma && agregado.resgatados > 0 ? (
              <p className="cap" style={{ margin: "8px 0 0" }}>
                Fora da Plataforma: resgates aguardam conciliação mensal, distintos de compra
                confirmada (ficha §6).
              </p>
            ) : null}
            {temHistorico ? (
              <p className="cap" style={{ margin: "8px 0 0" }}>
                Acumulado histórico da carga: {agregado.historicoResgates ?? 0} resgates ·{" "}
                {agregado.historicoCompras ?? 0} compras{" "}
                <span className="selo">rótulo A CONFIRMAR</span>
              </p>
            ) : null}
            {agregado.emitidos === 0 &&
            agregado.resgatados === 0 &&
            agregado.comprasConfirmadas === 0 &&
            !temHistorico ? (
              <p className="cap" style={{ margin: "10px 0 0" }}>
                Sem eventos importados para esta oferta ainda — nada é estimado (RN07).
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
