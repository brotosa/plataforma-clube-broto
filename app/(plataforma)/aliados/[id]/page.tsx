import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { formatarCnpj } from "@/dominio/empresas/cnpj";
import { buscarAliado, trilhaDeAuditoria } from "@/infra/consultas/aliados";
import { avaliarPromocao } from "@/infra/casos-de-uso/empresas";
import { lerValor } from "@/infra/configuracao/servico-configuracao";
import { BarraCompletude, PendenteObrigatorio, PillEstagio, iniciaisDoNome } from "../componentes";
import { AvisoEdicaoDesktop } from "../../aviso-desktop";
import { AcoesDeEstagio, AcoesContrato, FormularioContato, FormularioContrato } from "./paineis";
import { AbaDossie, AbaScouting } from "./abas-scout";
import { FormularioM1 } from "./formulario-m1";
import { acaoRemoverContato } from "../acoes";

export const metadata: Metadata = {
  title: "Ficha do aliado",
};

const ABAS = [
  { id: "visao", rotulo: "Visão geral" },
  { id: "solucoes", rotulo: "Soluções" },
  { id: "ofertas", rotulo: "Ofertas" },
  { id: "comercial", rotulo: "Comercial" },
  { id: "scouting", rotulo: "Scouting" },
  { id: "dossie", rotulo: "Dossiê" },
  { id: "m1", rotulo: "Ficha M1" },
  { id: "contatos", rotulo: "Contatos" },
  { id: "integracao", rotulo: "Integração" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

function formatarData(data: Date | null): string {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(data);
}

/** Data em `yyyy-mm-dd` para preencher `input[type="date"]` (UTC, como é gravada). */
function paraInputData(data: Date | null): string {
  return data ? data.toISOString().slice(0, 10) : "";
}

const ROTULO_PAPEL_CONTATO: Record<string, string> = {
  COMERCIAL: "Comercial",
  TECNICO: "Técnico",
  FINANCEIRO: "Financeiro",
};

const ROTULO_AMBIENTES: Record<string, string> = {
  DENTRO_PLATAFORMA: "Dentro da Plataforma",
  FORA_PLATAFORMA: "Fora da Plataforma",
  AMBOS: "Ambos",
};

const ROTULO_STATUS_OFERTA: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
  EXPIRADA: "Expirada",
};

/** T2 — Ficha do aliado (ficha §5). */
export default async function PaginaFichaAliado({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba: abaParametro } = await searchParams;
  const aba: AbaId = ABAS.some((candidata) => candidata.id === abaParametro)
    ? (abaParametro as AbaId)
    : "visao";

  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeEditar = podeExecutar(papel, "CRIAR_EDITAR");

  const resultado = await buscarAliado(id);
  if (!resultado) {
    notFound();
  }
  const { empresa, contratoVigente, completude } = resultado;

  const [{ pendencias }, motivosSuspensao, solicitacaoPendente, trilha, comissaoPadrao] =
    await Promise.all([
      empresa.estagio === "EM_NEGOCIACAO"
        ? avaliarPromocao(id)
        : Promise.resolve({ pendencias: [] as string[] }),
      prisma.motivoSuspensao.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
      prisma.aprovacaoSolicitacao.findFirst({
        where: { tipoEntidade: "PROMOCAO_ALIADA_ATIVA", entidadeId: id, estado: "SOLICITADA" },
      }),
      aba === "integracao" ? trilhaDeAuditoria("empresa", id) : Promise.resolve([]),
      // Comissão-padrão do contrato-modelo (Parametrizador, F10): 5%
      // confirmados em 24/07 — pré-preenche o contrato novo, editável.
      lerValor("COMISSAO_PADRAO_PCT"),
    ]);

  const ofertasDoAliado = empresa.solucoes.flatMap((solucao) =>
    solucao.ofertas.map((oferta) => ({ ...oferta, solucaoNome: solucao.nome })),
  );

  // Aba Ficha M1 (F9): a régua da negociação lê o cadastro-mestre + o que
  // só existe no M1 (declarações e ofertas pretendidas).
  const dadosDaAbaM1 =
    aba === "m1"
      ? await (async () => {
          const [ofertasPretendidas, tiposBeneficio, mecanicas, declaracoes] = await Promise.all([
            prisma.ofertaPretendida.findMany({
              where: { empresaId: id },
              orderBy: { criadoEm: "asc" },
            }),
            prisma.tipoBeneficio.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
            prisma.mecanica.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
            prisma.indicadorDeclarado.count({ where: { empresaId: id } }),
          ]);
          return { ofertasPretendidas, tiposBeneficio, mecanicas, declaracoes };
        })()
      : null;

  const endereco = [
    empresa.enderecoLogradouro,
    empresa.enderecoNumero,
    empresa.enderecoBairro,
    empresa.enderecoMunicipio,
    empresa.enderecoUf,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1240 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/aliados">Aliados</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>{empresa.nomeFantasia}</b>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
        <div
          style={{
            width: 132,
            height: 76,
            borderRadius: "var(--r-md)",
            overflow: "hidden",
            border: "1px solid var(--borda)",
            flex: "none",
            position: "relative",
            background: "var(--branco)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {empresa.marca ? (
            /* F15 (RN54) — a marca vem da rota da plataforma, versionada
               pelo hash. O antigo `logoUrl` apontava para um bucket que
               nunca existiu, então nenhuma ficha chegou a exibir imagem
               por ali. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/aliados/${empresa.id}/marca?v=${empresa.marca.hash.slice(0, 12)}`}
              alt={`Marca de ${empresa.nomeFantasia}`}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                padding: 6,
              }}
            />
          ) : (
            <span className="logo-ini" style={{ width: 44, height: 44, fontSize: 15 }}>
              {iniciaisDoNome(empresa.nomeFantasia)}
            </span>
          )}
        </div>
        <div>
          <h1 className="h-page" style={{ fontSize: 24, lineHeight: "30px" }}>
            {empresa.nomeFantasia}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {empresa.categorias.length === 0 ? (
              <span className="pill pill-warn">
                <i aria-hidden="true" />
                categoria obrigatória · não preenchida
              </span>
            ) : (
              empresa.categorias.map((vinculo) => (
                <span key={vinculo.categoriaId} className="tag-cat">
                  {vinculo.categoria.nome}
                </span>
              ))
            )}
            <PillEstagio estagio={empresa.estagio} />
            {empresa.estagio === "SUSPENSA" && empresa.motivoSuspensao ? (
              <span className="pill pill-neutra">
                <i aria-hidden="true" />
                {empresa.motivoSuspensao.nome}
                {empresa.motivoSuspensaoDescricao ? ` — ${empresa.motivoSuspensaoDescricao}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: "right" }}>
          <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
            Score de scouting
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <span className="kpi-n" style={{ fontSize: 22, color: "var(--paragrafo-aaa)" }}>
              {empresa.scoreScouting ?? "—"}
            </span>
            <span className="selo">Onda 2</span>
          </div>
          <div className="cap">somente leitura</div>
        </div>
        {podeEditar ? (
          <Link href={`/aliados/${empresa.id}/editar`} className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Editar cadastro
          </Link>
        ) : null}
      </div>

      <nav
        style={{
          borderBottom: "1px solid var(--borda)",
          display: "flex",
          margin: "14px 0 22px",
          overflowX: "auto",
        }}
        aria-label="Seções da ficha do aliado"
      >
        {ABAS.map((candidata) => (
          <Link
            key={candidata.id}
            href={`/aliados/${empresa.id}?aba=${candidata.id}`}
            className={candidata.id === aba ? "tab-it on" : "tab-it"}
            aria-current={candidata.id === aba ? "page" : undefined}
            style={{ textDecoration: "none" }}
          >
            {candidata.rotulo}
          </Link>
        ))}
      </nav>
      <AvisoEdicaoDesktop />

      {aba === "visao" ? (
        <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el" style={{ marginBottom: 14 }}>
                Dados cadastrais
              </h2>
              <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: "12px 16px", fontSize: 14 }}>
                <span className="cap">Nome de exibição</span>
                <span style={{ fontWeight: 600 }}>{empresa.nomeFantasia}</span>
                <span className="cap">Razão social</span>
                {empresa.razaoSocial ? <span>{empresa.razaoSocial}</span> : <span><PendenteObrigatorio /></span>}
                <span className="cap">CNPJ</span>
                {empresa.cnpj ? <span className="num">{formatarCnpj(empresa.cnpj)}</span> : <span><PendenteObrigatorio /></span>}
                <span className="cap">Endereço da sede</span>
                {endereco ? <span>{endereco}</span> : <span><PendenteObrigatorio /></span>}
                <span className="cap">Descrição institucional</span>
                {empresa.descricaoInstitucional ? (
                  <span>{empresa.descricaoInstitucional}</span>
                ) : (
                  <span><span className="selo">pendente — pode vir do dump do catálogo</span></span>
                )}
                <span className="cap">Site</span>
                {empresa.site ? (
                  <span>
                    <a href={empresa.site} target="_blank" rel="noreferrer">
                      {empresa.site}
                    </a>
                  </span>
                ) : (
                  <span className="cap">—</span>
                )}
                <span className="cap">Data de entrada</span>
                <span className="num">{formatarData(empresa.dataEntrada)}</span>
              </div>
            </div>

            <AcoesDeEstagio
              empresaId={empresa.id}
              estagio={empresa.estagio}
              pendenciasPromocao={pendencias}
              temSolicitacaoPendente={Boolean(solicitacaoPendente)}
              motivosSuspensao={motivosSuspensao.map((motivo) => ({
                id: motivo.id,
                slug: motivo.slug,
                nome: motivo.nome,
              }))}
              podeEditar={podeEditar}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="kpi">
              <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
                Completude cadastral
              </div>
              <div style={{ marginTop: 10 }}>
                <BarraCompletude percentual={completude} />
              </div>
              <p className="cap" style={{ margin: "10px 0 0" }}>
                Campos exigidos pela promoção (M2) e pela régua do card (RN09).
              </p>
            </div>
            <div className="kpi">
              <div className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
                Rede
              </div>
              <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                <div>
                  <div className="kpi-n num" style={{ fontSize: 24 }}>{empresa.solucoes.length}</div>
                  <div className="cap">soluções</div>
                </div>
                <div>
                  <div className="kpi-n num" style={{ fontSize: 24 }}>
                    {ofertasDoAliado.filter((oferta) => oferta.status === "PUBLICADA").length}
                  </div>
                  <div className="cap">ofertas publicadas</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {aba === "solucoes" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 className="h-el">Soluções do aliado</h2>
            <div style={{ flex: 1 }} />
            {podeEditar ? (
              empresa.estagio === "ALIADA_ATIVA" ? (
                <Link href={`/aliados/${empresa.id}/solucoes/nova`} className="btn btn-azul" style={{ textDecoration: "none" }}>
                  + Nova solução
                </Link>
              ) : (
                <button type="button" className="btn btn-azul" disabled title="Soluções só para aliados em estágio Aliada ativa (RN01)">
                  + Nova solução
                </button>
              )
            ) : null}
          </div>
          {empresa.solucoes.length === 0 ? (
            <div className="card">
              <div className="vazio">
                <h2 className="h-el">Nenhuma solução cadastrada</h2>
                <p className="cap" style={{ margin: 0 }}>
                  {empresa.estagio === "ALIADA_ATIVA"
                    ? "Cadastre a primeira solução para começar a criar ofertas."
                    : "Soluções só podem ser criadas quando o aliado estiver em estágio Aliada ativa (RN01)."}
                </p>
              </div>
            </div>
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="tbl tbl-resp">
                <thead>
                  <tr>
                    <th>Solução</th>
                    <th>Categoria</th>
                    <th>Culturas</th>
                    <th>Cobertura</th>
                    <th style={{ textAlign: "right" }}>Ofertas</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {empresa.solucoes.map((solucao) => (
                    <tr key={solucao.id} className="click">
                      <td>
                        <Link
                          href={`/aliados/${empresa.id}/solucoes/${solucao.id}`}
                          style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
                        >
                          {solucao.nome}
                        </Link>
                      </td>
                      <td data-label="Categoria">
                        {solucao.categoria ? (
                          <span className="tag-cat">{solucao.categoria.nome}</span>
                        ) : (
                          <PendenteObrigatorio />
                        )}
                      </td>
                      <td data-label="Culturas" className="cap">
                        {solucao.culturas.length > 0
                          ? solucao.culturas.map((vinculo) => vinculo.cultura.nome).join(", ")
                          : "—"}
                      </td>
                      <td data-label="Cobertura" className="cap">
                        {solucao.coberturaNacional
                          ? "Nacional"
                          : solucao.ufs.length > 0
                            ? solucao.ufs.map((vinculo) => vinculo.uf.sigla).join(", ")
                            : "—"}
                      </td>
                      <td data-label="Ofertas" className="num" style={{ textAlign: "right" }}>
                        {solucao.ofertas.length}
                      </td>
                      <td data-label="Status">
                        {solucao.status === "ATIVA" ? (
                          <span className="pill pill-ok"><i aria-hidden="true" />Ativa</span>
                        ) : (
                          <span className="pill pill-neutra"><i aria-hidden="true" />Inativa</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {aba === "ofertas" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <h2 className="h-el">Ofertas do aliado</h2>
            <div style={{ flex: 1 }} />
          </div>
          {ofertasDoAliado.length === 0 ? (
            <div className="card">
              <div className="vazio">
                <h2 className="h-el">Nenhuma oferta cadastrada</h2>
                <p className="cap" style={{ margin: 0 }}>
                  Ofertas nascem dentro de uma solução — abra a solução e crie a oferta lá.
                </p>
              </div>
            </div>
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="tbl tbl-resp">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Solução</th>
                    <th>Natureza</th>
                    <th>Vigência</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ofertasDoAliado.map((oferta) => (
                    <tr key={oferta.id} className="click">
                      <td>
                        <Link
                          href={`/ofertas/${oferta.id}`}
                          style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
                        >
                          {oferta.titulo}
                        </Link>
                        {oferta.pendenteRepublicacao ? (
                          <span className="pill pill-warn" style={{ marginLeft: 8 }}>
                            <i aria-hidden="true" />
                            pendente de republicação
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Solução" className="cap">{oferta.solucaoNome}</td>
                      <td data-label="Natureza" className="cap">
                        {oferta.natureza === "RECOMPENSA"
                          ? "Recompensa"
                          : oferta.natureza === "BENEFICIO"
                            ? "Benefício"
                            : "Cupom de desconto"}
                      </td>
                      <td data-label="Vigência" className="num cap">
                        {formatarData(oferta.vigenciaInicio)} –{" "}
                        {oferta.vigenciaFim ? formatarData(oferta.vigenciaFim) : "indeterminado"}
                      </td>
                      <td data-label="Status">
                        <span className={oferta.status === "PUBLICADA" ? "pill pill-ok" : "pill pill-neutra"}>
                          <i aria-hidden="true" />
                          {ROTULO_STATUS_OFERTA[oferta.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {aba === "comercial" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 14 }}>
              Contrato vigente
            </h2>
            {contratoVigente ? (
              <>
                <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "12px 16px", fontSize: 14 }}>
                  <span className="cap">Status</span>
                  <span>
                    <span className="pill pill-ok"><i aria-hidden="true" />Vigente</span>
                    {contratoVigente.emJanelaNaoRenovacao ? (
                      <span className="pill pill-warn" style={{ marginLeft: 8 }}>
                        <i aria-hidden="true" />
                        janela de não-renovação (≤30 dias do aniversário)
                      </span>
                    ) : null}
                  </span>
                  <span className="cap">Anexo (PDF)</span>
                  {contratoVigente.anexoS3Key ? (
                    <span className="mono">{contratoVigente.anexoS3Key}</span>
                  ) : (
                    <span><PendenteObrigatorio /></span>
                  )}
                  <span className="cap">Data de assinatura</span>
                  <span className="num">{formatarData(contratoVigente.dataAssinatura)}</span>
                  <span className="cap">Vigência (data-base)</span>
                  <span className="num">
                    {formatarData(contratoVigente.vigenciaBase)}{" "}
                    <span className="cap">· 12 meses com renovação automática</span>
                  </span>
                  <span className="cap">Comissão (%)</span>
                  {contratoVigente.comissaoPct !== null ? (
                    <span className="num">{String(contratoVigente.comissaoPct)}%</span>
                  ) : (
                    <span><PendenteObrigatorio /></span>
                  )}
                  <span className="cap">Ambientes de pagamento</span>
                  <span>{ROTULO_AMBIENTES[contratoVigente.ambientesPagamento]}</span>
                  <span className="cap">Dados bancários</span>
                  <span><span className="selo">A CONFIRMAR — onde residem (Broto ou Operadora)</span></span>
                </div>
                {podeEditar ? (
                  <div style={{ borderTop: "1px solid var(--borda)", marginTop: 16, paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                    <details>
                      <summary className="btn btn-ghost btn-sm" style={{ display: "inline-block", cursor: "pointer" }}>
                        Editar contrato
                      </summary>
                      <p className="cap" style={{ margin: "12px 0 10px" }}>
                        Corrige o contrato vigente sem denunciá-lo — inclusive para preencher o
                        anexo obrigatório. A alteração fica registrada na auditoria.
                      </p>
                      <FormularioContrato
                        empresaId={empresa.id}
                        comissaoPadrao={comissaoPadrao}
                        contrato={{
                          id: contratoVigente.id,
                          vigenciaBase: paraInputData(contratoVigente.vigenciaBase),
                          dataAssinatura: paraInputData(contratoVigente.dataAssinatura),
                          comissaoPct:
                            contratoVigente.comissaoPct !== null
                              ? String(contratoVigente.comissaoPct)
                              : "",
                          ambientesPagamento: contratoVigente.ambientesPagamento,
                          anexoS3Key: contratoVigente.anexoS3Key ?? "",
                          hashVerificacao: contratoVigente.hashVerificacao ?? "",
                        }}
                      />
                    </details>
                    <AcoesContrato empresaId={empresa.id} contratoId={contratoVigente.id} />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p className="cap" style={{ margin: "0 0 14px" }}>
                  Nenhum contrato vigente — obrigatório para promover a Aliada ativa e para
                  publicar ofertas (RN02).
                </p>
                {podeEditar ? (
                  <FormularioContrato empresaId={empresa.id} comissaoPadrao={comissaoPadrao} />
                ) : null}
              </>
            )}
          </div>

          {empresa.contratos.length > (contratoVigente ? 1 : 0) ? (
            <div className="card" style={{ padding: "20px 22px" }}>
              <h2 className="h-el" style={{ marginBottom: 14 }}>
                Histórico de contratos
              </h2>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Vigência (base)</th>
                    <th>Status</th>
                    <th>Comissão</th>
                    <th>Ambientes</th>
                  </tr>
                </thead>
                <tbody>
                  {empresa.contratos
                    .filter((contrato) => contrato.id !== contratoVigente?.id)
                    .map((contrato) => (
                      <tr key={contrato.id}>
                        <td className="num">{formatarData(contrato.vigenciaBase)}</td>
                        <td>
                          <span className="pill pill-neutra">
                            <i aria-hidden="true" />
                            {contrato.status === "DENUNCIADO" ? "Denunciado" : "Encerrado"}
                          </span>
                        </td>
                        <td className="num">
                          {contrato.comissaoPct !== null ? `${String(contrato.comissaoPct)}%` : "—"}
                        </td>
                        <td className="cap">{ROTULO_AMBIENTES[contrato.ambientesPagamento]}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {aba === "scouting" ? <AbaScouting empresaId={empresa.id} /> : null}

      {aba === "dossie" ? <AbaDossie empresaId={empresa.id} /> : null}

      {aba === "m1" && dadosDaAbaM1 ? (
        podeEditar ? (
          <FormularioM1
            empresa={{
              id: empresa.id,
              razaoSocial: empresa.razaoSocial,
              nomeFantasia: empresa.nomeFantasia,
              site: empresa.site,
              descricaoInstitucional: empresa.descricaoInstitucional,
              diferenciais: empresa.diferenciais,
              modeloNegocio: empresa.modeloNegocio,
              publicoPorte: empresa.publicoPorte,
              publicoNatureza: empresa.publicoNatureza,
            }}
            dadosDaRegua={{
              nomeFantasia: empresa.nomeFantasia,
              razaoSocial: empresa.razaoSocial,
              site: empresa.site,
              descricaoInstitucional: empresa.descricaoInstitucional,
              diferenciais: empresa.diferenciais,
              categorias: empresa.categorias.length,
              modeloNegocio: empresa.modeloNegocio,
              publicoPorte: empresa.publicoPorte,
              publicoNatureza: empresa.publicoNatureza,
              contatos: empresa.contatos.length,
              temIndicadoresDeclarados: dadosDaAbaM1.declaracoes > 0,
              comissaoDefinida: contratoVigente?.comissaoPct !== null &&
                contratoVigente?.comissaoPct !== undefined,
              ambientesDefinidos: Boolean(contratoVigente),
              ofertasPretendidas: dadosDaAbaM1.ofertasPretendidas.length,
            }}
            ofertasPretendidas={dadosDaAbaM1.ofertasPretendidas.map((pretendida) => ({
              id: pretendida.id,
              natureza: pretendida.natureza,
              titulo: pretendida.titulo,
              precoDe: pretendida.precoDe === null ? null : Number(pretendida.precoDe),
              precoPor: pretendida.precoPor === null ? null : Number(pretendida.precoPor),
              instrucoesResgate: pretendida.instrucoesResgate,
              status: pretendida.status,
            }))}
            tiposBeneficio={dadosDaAbaM1.tiposBeneficio.map((tipo) => ({
              id: tipo.id,
              nome: tipo.nome,
            }))}
            mecanicas={dadosDaAbaM1.mecanicas.map((mecanica) => ({
              id: mecanica.id,
              nome: mecanica.nome,
            }))}
          />
        ) : (
          <div className="card">
            <div className="vazio">
              <h2 className="h-el">Ficha Cadastral · M1 — somente leitura</h2>
              <p className="cap" style={{ maxWidth: "52ch", margin: 0 }}>
                O preenchimento da ficha de pré-onboarding é feito pelos papéis com permissão
                de edição. Os dados já informados aparecem nas abas Visão geral, Scouting e
                Comercial.
              </p>
            </div>
          </div>
        )
      ) : null}

      {aba === "contatos" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 14 }}>
              Contatos com papel tipado
            </h2>
            {empresa.contatos.length === 0 ? (
              <p className="cap" style={{ margin: "0 0 14px" }}>
                Nenhum contato — mínimo de 1 para promover; o financeiro recebe o ciclo de
                conciliação de comissão.
              </p>
            ) : (
              <table className="tbl" style={{ marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th>Papel</th>
                    <th>Nome</th>
                    <th>Cargo</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    {podeEditar ? <th style={{ width: 90 }}><span className="sr-oculto">Ações</span></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {empresa.contatos.map((contato) => (
                    <tr key={contato.id}>
                      <td>
                        <span className="pill pill-info">
                          <i aria-hidden="true" />
                          {ROTULO_PAPEL_CONTATO[contato.papel]}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{contato.nome}</td>
                      <td className="cap">{contato.cargo ?? "—"}</td>
                      <td className="cap">{contato.email}</td>
                      <td className="cap num">{contato.telefone ?? "—"}</td>
                      {podeEditar ? (
                        <td>
                          <form action={acaoRemoverContato}>
                            <input type="hidden" name="empresaId" value={empresa.id} />
                            <input type="hidden" name="contatoId" value={contato.id} />
                            <button type="submit" className="btn btn-ghost btn-sm">
                              Remover
                            </button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {podeEditar ? <FormularioContato empresaId={empresa.id} /> : null}
          </div>
        </div>
      ) : null}

      {aba === "integracao" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 980 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 14 }}>
              Integração Minutrade
            </h2>
            <div className="g-resp" style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "12px 16px", fontSize: 14 }}>
              <span className="cap">Id externo (Minutrade)</span>
              {empresa.idExternoMinutrade ? (
                <span className="mono">{empresa.idExternoMinutrade}</span>
              ) : (
                <span><span className="selo">preenchido na primeira publicação ou na carga inicial</span></span>
              )}
              <span className="cap">Publicações</span>
              <span><span className="selo">export batch chega na F4 (ExportAdapter)</span></span>
            </div>
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Histórico de alterações (auditoria)
            </h2>
            <p className="cap" style={{ margin: "0 0 14px" }}>
              Toda mutação registra valor anterior, valor novo, autor e data — nada é
              excluído após a primeira publicação (RN05).
            </p>
            {trilha.length === 0 ? (
              <p className="cap" style={{ margin: 0 }}>Nenhum evento registrado.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Campo</th>
                      <th>Valor anterior</th>
                      <th>Valor novo</th>
                      <th>Autor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trilha.map((evento) => (
                      <tr key={evento.id}>
                        <td className="num cap">
                          {new Intl.DateTimeFormat("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(evento.criadoEm)}
                        </td>
                        <td className="mono">{evento.campo}</td>
                        <td className="cap">{evento.valorAnterior ?? "—"}</td>
                        <td style={{ fontWeight: 600 }}>{evento.valorNovo ?? "—"}</td>
                        <td className="cap">{evento.autor.nome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
