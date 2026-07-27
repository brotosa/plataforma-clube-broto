import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { rotularVigencia } from "@/dominio/patrocinio/saldo";
import {
  lerRegistroDeRelatorio,
  montarCorpoDoRelatorio,
} from "@/infra/casos-de-uso/relatorio-patrocinador";

/**
 * R1 — Relatório do Patrocinador (RN66).
 *
 * Documento imprimível no padrão da Ficha M1: capa, período, base,
 * campanhas e consumo com os mesmos selos da T33.
 *
 * **Agregado — nenhum dado pessoal identificável.** Não há nome, CPF,
 * e-mail nem telefone de assinante em lugar nenhum desta página, e a
 * garantia não é de revisão: o corpo vem de
 * `montarCorpoDoRelatorio`, que não consulta nada disso, e o teste da RN66
 * varre o HTML gerado atrás dos três. Listagem nominal tem outro caminho —
 * a exportação com finalidade da Onda 5, que já é auditada.
 *
 * O documento **não é guardado como arquivo**: é reproduzível a partir do
 * registro de geração. Guardar o PDF criaria uma segunda verdade que
 * envelheceria sozinha quando o cadastro mudasse.
 */

export const dynamic = "force-dynamic";

function formatarData(data: Date | null): string {
  return data ? data.toISOString().slice(0, 10).split("-").reverse().join("/") : "—";
}

function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function formatarMoeda(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  const numero = Number(valor);
  if (Number.isNaN(numero)) return "—";
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ROTULO_SELO = {
  VIVO: "vivo",
  AGUARDA_CHAVE: "aguarda chave",
  AGUARDA_FONTE: "aguarda fonte",
} as const;

export default async function PaginaDoRelatorio({
  params,
}: {
  params: Promise<{ id: string; relatorioId: string }>;
}) {
  const sessao = await auth();
  if (!sessao?.user) {
    redirect("/entrar");
  }
  const { id, relatorioId } = await params;
  const ator = { id: sessao.user.id, papel: sessao.user.papel };

  const registro = await lerRegistroDeRelatorio(ator, relatorioId);
  if (registro === null || registro.patrocinadorId !== id) {
    notFound();
  }

  const corpo = await montarCorpoDoRelatorio(
    id,
    {
      periodoInicio: registro.periodoInicio,
      periodoFim: registro.periodoFim,
      finalidade: registro.finalidade,
    },
    registro.autor.nome,
    registro.criadoEm,
  );

  /*
   * Sem classe nova: o prompt §5 admite um único seletor novo nesta onda
   * (`.pt-drop`), então o documento se compõe com o que já existe —
   * `tela`, `tbl`, `cap`, `num`, `aviso-inline` — e com estilo de escopo
   * local. A consequência assumida é que a barra de volta também sai na
   * impressão: escondê-la pediria uma regra `@media print` nova, e a
   * instrução de CSS é literal.
   */
  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 900 }}>
      <div style={{ marginBottom: 18 }}>
        <Link href={`/patrocinadores/${id}`} className="btn btn-ghost">
          ← Voltar à ficha do patrocinador
        </Link>
      </div>

      <header style={{ borderBottom: "2px solid var(--borda)", paddingBottom: 16, marginBottom: 22 }}>
        <div className="cap">Clube Broto · Relatório do Patrocinador</div>
        <h1 className="h-page" style={{ margin: "6px 0 4px" }}>
          {corpo.patrocinador.razaoSocial}
        </h1>
        <div className="cap num">
          {formatarCnpj(corpo.patrocinador.cnpj)}
          {corpo.patrocinador.segmento ? ` · ${corpo.patrocinador.segmento}` : ""}
        </div>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "150px 1fr",
            gap: "6px 14px",
            margin: "16px 0 0",
            fontSize: 13,
          }}
        >
          <dt className="cap">Período</dt>
          <dd style={{ margin: 0 }}>
            {formatarData(corpo.periodo.inicio)} a {formatarData(corpo.periodo.fim)}
          </dd>
          <dt className="cap">Finalidade</dt>
          <dd style={{ margin: 0 }}>{corpo.finalidade}</dd>
          <dt className="cap">Gerado em</dt>
          <dd style={{ margin: 0 }}>
            {formatarData(corpo.geradoEm)} por {corpo.geradoPor}
          </dd>
        </dl>
        <p className="cap" style={{ margin: "14px 0 0", maxWidth: "62ch" }}>
          Relatório agregado. Não contém dado pessoal identificável de assinante — a listagem
          nominal, quando necessária, sai pela exportação com finalidade declarada, que é auditada
          à parte.
        </p>
      </header>

      <section style={{ marginBottom: 26 }}>
        <h2 className="h-el">Contrato</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "8px 14px", fontSize: 14 }}>
          <dt className="cap">Vigência</dt>
          <dd style={{ margin: 0 }}>
            {corpo.contrato
              ? `${formatarData(corpo.contrato.vigenciaInicio)} a ${formatarData(corpo.contrato.vigenciaFim)}`
              : "—"}{" "}
            <span className="cap">({rotularVigencia(corpo.vigencia)})</span>
          </dd>
          <dt className="cap">Preço por assinatura/ano</dt>
          <dd style={{ margin: 0 }}>{formatarMoeda(corpo.contrato?.precoUnitario)}</dd>
          <dt className="cap">Valor total contratado</dt>
          <dd style={{ margin: 0 }}>{formatarMoeda(corpo.contrato?.valorTotalContratado)}</dd>
          <dt className="cap">Assinaturas adquiridas</dt>
          <dd style={{ margin: 0 }}>
            {corpo.contrato?.assinaturasAdquiridas?.toLocaleString("pt-BR") ?? "—"}
          </dd>
        </dl>
      </section>

      <section style={{ marginBottom: 26 }}>
        <h2 className="h-el">Base</h2>
        {corpo.saldo.estado === "APURADO" ? (
          <dl style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "8px 14px", fontSize: 14 }}>
            <dt className="cap">Vagas adquiridas</dt>
            <dd style={{ margin: 0 }} className="num">
              {corpo.saldo.adquiridas.toLocaleString("pt-BR")}
            </dd>
            <dt className="cap">Vagas ativadas</dt>
            <dd style={{ margin: 0 }} className="num">
              {corpo.saldo.ativadas.toLocaleString("pt-BR")}
            </dd>
            <dt className="cap">Saldo</dt>
            <dd style={{ margin: 0 }} className="num">
              {corpo.saldo.saldo.toLocaleString("pt-BR")}
              {corpo.saldo.excedido ? (
                <span className="cap"> · vínculos vigentes acima do contratado</span>
              ) : null}
            </dd>
            <dt className="cap">Vínculos encerrados no histórico</dt>
            <dd style={{ margin: 0 }} className="num">
              {corpo.base.vinculosEncerrados.toLocaleString("pt-BR")}
            </dd>
          </dl>
        ) : (
          <>
            <p className="aviso-inline" style={{ margin: "0 0 10px" }}>
              Saldo indisponível: {corpo.saldo.motivo}.
            </p>
            <dl style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "8px 14px", fontSize: 14 }}>
              <dt className="cap">Vagas ativadas</dt>
              <dd style={{ margin: 0 }} className="num">
                {corpo.saldo.ativadas.toLocaleString("pt-BR")}
              </dd>
            </dl>
          </>
        )}
      </section>

      <section style={{ marginBottom: 26 }}>
        <h2 className="h-el">Campanhas</h2>
        {corpo.campanhas.length === 0 ? (
          <p className="cap" style={{ margin: 0 }}>
            Nenhuma campanha etiquetada com este patrocinador no período.
          </p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Estado</th>
                <th>Aprovação externa</th>
              </tr>
            </thead>
            <tbody>
              {corpo.campanhas.map((campanha) => (
                <tr key={campanha.nome}>
                  <td>{campanha.nome}</td>
                  <td>{campanha.estado.toLowerCase()}</td>
                  <td>{campanha.aprovacaoRegistrada ? "registrada" : "pendente de registro"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="h-el">Consumo</h2>
        <p className="cap" style={{ margin: "0 0 12px", maxWidth: "62ch" }}>
          Cada bloco declara a origem do que exibe. Onde não há número, há o motivo — nenhum valor
          é estimado.
        </p>
        <table className="tbl">
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Origem</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {corpo.consumo.map((card) => (
              <tr key={card.chave}>
                <td>{card.titulo}</td>
                <td>{ROTULO_SELO[card.selo]}</td>
                <td>
                  {card.linhas.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {card.linhas.map((linha) => (
                        <li key={linha.rotulo}>
                          {linha.rotulo}: <span className="num">{linha.valor}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="cap">{card.motivo}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
