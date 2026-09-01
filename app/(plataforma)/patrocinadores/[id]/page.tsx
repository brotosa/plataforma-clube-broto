import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/infra/auth";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { formatarCnpj } from "@/dominio/empresas/cnpj";
import { rotularVigencia } from "@/dominio/patrocinio/saldo";
import { listarCarteira } from "@/infra/consultas/assinantes";
import {
  cardsDeConsumo,
  lerPatrocinador,
  listarCampanhasDoPatrocinador,
  listarGeracoesDeRelatorio,
  vinculosVigentesPorAssinante,
  type CardDeConsumo,
} from "@/infra/consultas/patrocinadores";
import { prisma } from "@/infra/prisma/cliente";
import { CelulaDeVagas } from "../page";
import { EditarPatrocinador } from "../formulario-patrocinador";
import { CartaoDeMinuta } from "./cartao-minuta";
import { FormularioDoContrato, GerarRelatorio, StatusDoPatrocinador } from "./formularios-contrato";
import { EncerrarVinculo, VincularAssinante } from "./formularios-vinculo";

/**
 * T33 — Ficha do patrocinador.
 *
 * Quatro abas: Contrato (campos + dropzone da minuta), Base (a tabela de
 * assinantes reusada, pré-filtrada pelo vínculo e com CPF mascarado por
 * padrão), Consumo (os seis cards da RN65 com selo e motivo) e Campanhas.
 *
 * A navegação entre abas é por âncora nativa, não `<Link>`: altera apenas
 * a query string, e a convenção do CLAUDE.md vale aqui como nas telas em
 * que o defeito foi medido. Esta tela está na cerca de
 * `infra/arquitetura/navegacao-por-query.test.ts`.
 *
 * **Contrato visual:** montada a partir da ficha §5, com os componentes
 * existentes (`tab-it`, `tbl`, `pill`, `kpi-row`/`kpi-cel`,
 * `aviso-inline`) e o único bloco novo previsto, `.pt-drop`. O protótipo
 * v11.2 não está no repositório; a conferência é trabalho pendente.
 */

export const dynamic = "force-dynamic";

const ABAS = [
  { id: "contrato", rotulo: "Contrato" },
  { id: "base", rotulo: "Base" },
  { id: "consumo", rotulo: "Consumo" },
  { id: "campanhas", rotulo: "Campanhas" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function formatarData(data: Date | null): string | null {
  return data ? data.toISOString().slice(0, 10).split("-").reverse().join("/") : null;
}

function formatarMoeda(valor: string | null): string | null {
  if (valor === null) return null;
  const numero = Number(valor);
  if (Number.isNaN(numero)) return null;
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Campo sem valor = traço COM motivo (prompt §6). O motivo padrão nomeia a
 * pendência real da fase: os valores do contrato Yamer são
 * `[A CONFIRMAR — Marco]` e entram pela tela quando chegarem.
 */
function Valor({ texto, motivo }: { texto: string | null; motivo: string }) {
  if (texto !== null) return <span>{texto}</span>;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span aria-hidden="true">—</span>
      <span className="cap">{motivo}</span>
    </span>
  );
}

function SeloDoCard({ card }: { card: CardDeConsumo }) {
  const classe =
    card.selo === "VIVO"
      ? "pill pill-ok"
      : card.selo === "AGUARDA_CHAVE"
        ? "pill pill-warn"
        : "pill pill-pendente";
  const rotulo =
    card.selo === "VIVO"
      ? "vivo"
      : card.selo === "AGUARDA_CHAVE"
        ? "aguarda chave"
        : "aguarda fonte";
  return (
    <span className={classe}>
      <i />
      {rotulo}
    </span>
  );
}

export default async function PaginaDoPatrocinador({
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
  const abaBruta = typeof parametros.aba === "string" ? parametros.aba : "contrato";
  const aba: AbaId = (ABAS.find((candidata) => candidata.id === abaBruta)?.id ??
    "contrato") as AbaId;

  const patrocinador = await lerPatrocinador(id);
  if (patrocinador === null) {
    notFound();
  }

  const ator = { id: sessao.user.id, papel: sessao.user.papel };
  const podeGerir = podeExecutar(ator.papel, "GERIR_PATROCINADORES");
  const podeGerarRelatorio = podeExecutar(ator.papel, "GERAR_RELATORIO_PATROCINADOR");

  const [responsaveis, campanhas, consumo, geracoes] = await Promise.all([
    prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: [{ nome: "asc" }],
    }),
    aba === "campanhas" ? listarCampanhasDoPatrocinador(id) : Promise.resolve([]),
    aba === "consumo" ? cardsDeConsumo(id) : Promise.resolve([]),
    listarGeracoesDeRelatorio(id),
  ]);

  /**
   * Aba Base: a tabela de assinantes REUSADA, com o recorte do
   * patrocinador.
   *
   * `dadosPlenos: false` é fixo, e não uma opção que esta tela decidiu não
   * oferecer: a exibição plena de CPF, e-mail e telefone continua sendo o
   * caminho auditado da Onda 5 (RN30), na carteira, com permissão própria
   * e evento gravado antes de qualquer dado sair. Abrir um segundo portão
   * aqui — mesmo com a mesma permissão — criaria uma via de acesso a dado
   * pessoal que a trilha da T18 não enxerga.
   */
  const [base, vinculosVigentes] =
    aba === "base"
      ? await Promise.all([
          listarCarteira(
            { regras: [], pagina: Number(parametros.pagina ?? 1) || 1, patrocinadorId: id },
            { dadosPlenos: false },
          ),
          podeGerir ? vinculosVigentesPorAssinante(id) : Promise.resolve(new Map<string, string>()),
        ])
      : [null, new Map<string, string>()];

  const contrato = patrocinador.contrato;
  const motivoDoContrato = "aguarda o dado do contrato";

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="cap">
            <Link href="/patrocinadores">Patrocinadores</Link>
          </div>
          <h1 className="h-page">{patrocinador.razaoSocial}</h1>
          <div className="cap num" style={{ marginTop: 4 }}>
            {formatarCnpj(patrocinador.cnpj)}
            {patrocinador.segmento ? ` · ${patrocinador.segmento}` : ""}
            {patrocinador.responsavelComercial
              ? ` · responsável: ${patrocinador.responsavelComercial}`
              : " · sem responsável comercial designado"}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {podeGerarRelatorio ? <GerarRelatorio patrocinadorId={id} /> : null}
      </div>

      <div
        className="kpi-row"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0 6px" }}
      >
        <div className="kpi-cel" style={{ minWidth: 220 }}>
          <span className="cap">Vagas</span>
          <CelulaDeVagas saldo={patrocinador.saldo} />
        </div>
        <div className="kpi-cel" style={{ minWidth: 180 }}>
          <span className="cap">Vigência</span>
          <div>
            <span
              className={
                patrocinador.vigencia.estado === "VENCIDA"
                  ? "pill pill-erro"
                  : patrocinador.vigencia.estado === "VENCENDO"
                    ? "pill pill-warn"
                    : patrocinador.vigencia.estado === "NAO_DECLARADA"
                      ? "pill pill-pendente"
                      : "pill pill-ok"
              }
            >
              <i />
              {rotularVigencia(patrocinador.vigencia)}
            </span>
          </div>
        </div>
        <div className="kpi-cel" style={{ minWidth: 180 }}>
          <span className="cap">Vínculos encerrados</span>
          <div className="num">{patrocinador.vinculosEncerrados}</div>
        </div>
        <div className="kpi-cel" style={{ minWidth: 180 }}>
          <span className="cap">Status</span>
          <div>
            {podeGerir ? (
              <StatusDoPatrocinador patrocinadorId={id} status={patrocinador.status} />
            ) : (
              <span
                className={patrocinador.status === "ATIVO" ? "pill pill-ok" : "pill pill-neutra"}
              >
                <i />
                {patrocinador.status === "ATIVO" ? "ativo" : "encerrado"}
              </span>
            )}
          </div>
        </div>
      </div>

      <nav
        style={{
          borderBottom: "1px solid var(--borda)",
          display: "flex",
          margin: "14px 0 22px",
          overflowX: "auto",
        }}
        aria-label="Seções da ficha do patrocinador"
      >
        {ABAS.map((candidata) => (
          <a
            key={candidata.id}
            href={`/patrocinadores/${id}?aba=${candidata.id}`}
            className={candidata.id === aba ? "tab-it on" : "tab-it"}
            aria-current={candidata.id === aba ? "page" : undefined}
            style={{ textDecoration: "none" }}
          >
            {candidata.rotulo}
          </a>
        ))}
      </nav>

      {aba === "contrato" ? (
        <div
          className="g-resp"
          style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 18, alignItems: "start" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el" style={{ marginBottom: 14 }}>
                Contrato
              </h2>
              <div
                className="g-resp"
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 1fr",
                  gap: "12px 16px",
                  fontSize: 14,
                }}
              >
                <span className="cap">Data de assinatura</span>
                <Valor texto={formatarData(contrato?.dataAssinatura ?? null)} motivo={motivoDoContrato} />
                <span className="cap">Vigência</span>
                <Valor
                  texto={
                    contrato?.vigenciaInicio
                      ? `${formatarData(contrato.vigenciaInicio)} → ${formatarData(contrato.vigenciaFim) ?? "sem fim declarado"}`
                      : null
                  }
                  motivo={motivoDoContrato}
                />
                <span className="cap">Preço por assinatura/ano</span>
                <Valor texto={formatarMoeda(contrato?.precoUnitario ?? null)} motivo={motivoDoContrato} />
                <span className="cap">Valor total contratado</span>
                <Valor
                  texto={formatarMoeda(contrato?.valorTotalContratado ?? null)}
                  motivo={motivoDoContrato}
                />
                <span className="cap">Assinaturas adquiridas</span>
                <Valor
                  texto={
                    contrato?.assinaturasAdquiridas === null ||
                    contrato?.assinaturasAdquiridas === undefined
                      ? null
                      : contrato.assinaturasAdquiridas.toLocaleString("pt-BR")
                  }
                  motivo="aguarda o número contratado — sem ele não há saldo"
                />
              </div>
              {podeGerir ? (
                <div style={{ marginTop: 18, borderTop: "1px solid var(--borda)", paddingTop: 16 }}>
                  <FormularioDoContrato
                    patrocinadorId={id}
                    valores={{
                      dataAssinatura: contrato?.dataAssinatura ?? null,
                      vigenciaInicio: contrato?.vigenciaInicio ?? null,
                      vigenciaFim: contrato?.vigenciaFim ?? null,
                      precoUnitario: contrato?.precoUnitario ?? null,
                      valorTotalContratado: contrato?.valorTotalContratado ?? null,
                      assinaturasAdquiridas: contrato?.assinaturasAdquiridas ?? null,
                    }}
                  />
                </div>
              ) : null}
            </div>

            {podeGerir ? (
              <EditarPatrocinador
                patrocinadorId={id}
                valores={{
                  razaoSocial: patrocinador.razaoSocial,
                  cnpj: patrocinador.cnpj,
                  segmento: patrocinador.segmento,
                }}
                responsaveis={responsaveis}
              />
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <CartaoDeMinuta
              patrocinadorId={id}
              minuta={contrato?.minuta ?? null}
              temContrato={contrato !== null}
              podeGerir={podeGerir}
            />
            {geracoes.length > 0 ? (
              <div className="card" style={{ padding: "20px 22px" }}>
                <h2 className="h-el" style={{ marginBottom: 10 }}>
                  Relatórios gerados
                </h2>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
                  {geracoes.map((geracao) => (
                    <li key={geracao.id} style={{ fontSize: 13 }}>
                      <Link href={`/patrocinadores/${id}/relatorio/${geracao.id}`}>
                        {formatarData(geracao.periodoInicio)} → {formatarData(geracao.periodoFim)}
                      </Link>
                      <div className="cap">
                        {geracao.finalidade} · {geracao.autor.nome}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {aba === "base" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {podeGerir ? (
            <div>
              <VincularAssinante patrocinadorId={id} />
            </div>
          ) : null}
          <div className="card" style={{ overflowX: "auto" }}>
            {base === null || base.linhas.length === 0 ? (
              <div className="vazio">
                <h2 className="h-el">Nenhum assinante vinculado</h2>
                <p className="cap" style={{ maxWidth: "50ch", margin: 0 }}>
                  As vagas do contrato são ocupadas por vínculo. Enquanto não houver vínculo, a base
                  do patrocinador está vazia — e o saldo é o contrato inteiro.
                  {podeGerir
                    ? " Use “Vincular assinante” acima para ocupar uma vaga pelo CPF."
                    : ""}
                </p>
              </div>
            ) : (
              <>
                <p className="cap" style={{ padding: "12px 16px 0", margin: 0 }}>
                  {base.total?.toLocaleString("pt-BR")} assinante(s) com vínculo vigente. CPF, e-mail
                  e telefone aparecem mascarados: a exibição plena é o caminho auditado da carteira
                  (T18), não desta tela.
                </p>
                <table className="tbl tbl-resp">
                  <caption className="sr-oculto">
                    Assinantes vinculados ao patrocinador, com dados pessoais mascarados
                  </caption>
                  <thead>
                    <tr>
                      <th>Assinante</th>
                      <th>CPF</th>
                      <th>UF</th>
                      <th>Município</th>
                      <th>Perfil</th>
                      {podeGerir ? <th>Vínculo</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {base.linhas.map((linha) => {
                      const vinculoId = vinculosVigentes.get(linha.id);
                      return (
                        <tr key={linha.id}>
                          <td data-label="Assinante">{linha.nome}</td>
                          <td data-label="CPF" className="num">
                            {linha.cpf}
                          </td>
                          <td data-label="UF">{linha.uf ?? "—"}</td>
                          <td data-label="Município">{linha.municipio ?? "—"}</td>
                          <td data-label="Perfil">
                            {linha.perfilAssinatura ? (
                              linha.perfilAssinatura
                            ) : (
                              <span className="cap">aguarda a fonte</span>
                            )}
                          </td>
                          {podeGerir ? (
                            <td data-label="Vínculo">
                              {vinculoId ? (
                                <EncerrarVinculo patrocinadorId={id} vinculoId={vinculoId} />
                              ) : (
                                <span className="cap">—</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      ) : null}

      {aba === "consumo" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {consumo.map((card) => (
            <div key={card.chave} className="card" style={{ padding: "18px 20px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <h2 className="h-el" style={{ margin: 0 }}>
                  {card.titulo}
                </h2>
                <SeloDoCard card={card} />
              </div>
              {card.linhas.length > 0 ? (
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px" }}>
                  {card.linhas.map((linha) => (
                    <div key={linha.rotulo} style={{ display: "contents" }}>
                      <dt className="cap">{linha.rotulo}</dt>
                      <dd className="num" style={{ margin: 0, textAlign: "right" }}>
                        {linha.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="aviso-inline" style={{ margin: 0 }}>
                  {card.motivo}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {aba === "campanhas" ? (
        <div className="card" style={{ overflowX: "auto" }}>
          {campanhas.length === 0 ? (
            <div className="vazio">
              <h2 className="h-el">Nenhuma campanha deste patrocinador</h2>
              <p className="cap" style={{ maxWidth: "52ch", margin: 0 }}>
                Uma campanha sob medida é um recorte de público mais a etiqueta do patrocinador. A
                aprovação pode ocorrer fora da plataforma — o que se registra aqui é quem aprovou,
                quando e a evidência.
              </p>
              <Link className="btn btn-azul" href={`/campanhas?patrocinador=${id}`}>
                Nova campanha para este patrocinador
              </Link>
            </div>
          ) : (
            <>
              <table className="tbl tbl-resp">
                <caption className="sr-oculto">
                  Campanhas do patrocinador com estado e registro de aprovação externa
                </caption>
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Estado</th>
                    <th>Aprovação externa</th>
                  </tr>
                </thead>
                <tbody>
                  {campanhas.map((campanha) => (
                    <tr key={campanha.id}>
                      <td data-label="Campanha">
                        <Link href={`/campanhas/${campanha.id}`}>{campanha.nome}</Link>
                      </td>
                      <td data-label="Estado">
                        <span className="pill pill-neutra">
                          <i />
                          {campanha.estado.toLowerCase()}
                        </span>
                      </td>
                      <td data-label="Aprovação externa">
                        {campanha.aprovacao === null ? (
                          <span className="pill pill-pendente">
                            <i />
                            pendente de registro
                          </span>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span>{campanha.aprovacao.aprovador}</span>
                            <span className="cap">
                              {formatarData(campanha.aprovacao.data) ?? "sem data"}
                              {campanha.aprovacao.temEvidencia
                                ? " · com evidência anexada"
                                : " · sem evidência anexada"}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: "14px 16px" }}>
                <Link className="btn btn-azul" href={`/campanhas?patrocinador=${id}`}>
                  Nova campanha para este patrocinador
                </Link>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
