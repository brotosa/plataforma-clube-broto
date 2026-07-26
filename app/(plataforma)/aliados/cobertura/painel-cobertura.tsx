import Link from "next/link";
import {
  CRITERIOS_SITUACAO,
  CRITERIO_DE_ORDENACAO,
  type Concentracao,
  type LinhaDePortfolio,
  type ResumoDoPortfolio,
  ROTULOS_SITUACAO,
  type SituacaoCobertura,
  type VisaoDaCobertura,
  exigeAcao,
} from "@/dominio/cobertura/cobertura";
import type { MatrizCategoriaCultura } from "@/infra/consultas/cobertura";
import type { VolumeExcluido } from "@/dominio/cobertura/cobertura";

/**
 * T29 — Cobertura do portfólio (ficha Onda 7 §2).
 *
 * A lente é de **profundidade**: o que a rede cobre, onde é frágil, onde não
 * existe. A T13 pergunta outra coisa (o que está no funil para preencher) e
 * as duas leem o mesmo serviço — RN51.
 *
 * O princípio que governa a tela inteira: categoria sem aliado **aparece**,
 * com marcação própria, porque a ausência é a informação (RN53). Nada aqui é
 * estimado; o que não tem base exibe o motivo.
 */

const FORMATO = new Intl.NumberFormat("pt-BR");

/** Pill de situação — mesmo vocabulário do domínio, sem tradução paralela. */
function PillSituacao({ situacao }: { situacao: SituacaoCobertura }) {
  if (situacao === "COBERTA") {
    return null;
  }
  const classe =
    situacao === "FRAGIL" ? "pill pill-warn" : situacao === "DESCOBERTA_NO_FUNIL" ? "pill pill-info" : "pill pill-erro";
  return (
    <span className={classe} title={CRITERIOS_SITUACAO[situacao]}>
      <i />
      {ROTULOS_SITUACAO[situacao]}
    </span>
  );
}

function Celula({
  rotulo,
  valor,
  nota,
  estado,
}: {
  rotulo: string;
  /** `null` = sem base de cálculo; exibe o motivo, nunca zero (RN53). */
  valor: string | null;
  nota: string;
  estado?: "alerta" | "calma";
}) {
  return (
    <div className={estado ? `kpi-cel ${estado}` : "kpi-cel"}>
      <span className="cap" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>
        {rotulo}
      </span>
      {valor === null ? (
        <span className="v indisp-v">sem base de cálculo neste recorte</span>
      ) : (
        <span className="v">{valor}</span>
      )}
      <span className="cap">{nota}</span>
    </div>
  );
}

export function PainelCobertura({
  linhas,
  resumo,
  concentracao,
  matriz,
  excluidos,
  visao,
  culturaId,
  culturaNome,
  ressalvaDoFunil,
}: {
  /** Já ordenadas pelo domínio — a tela não reordena. */
  linhas: ReadonlyArray<LinhaDePortfolio>;
  resumo: ResumoDoPortfolio;
  concentracao: Concentracao;
  matriz: MatrizCategoriaCultura;
  excluidos: VolumeExcluido;
  visao: VisaoDaCobertura;
  culturaId: string;
  culturaNome: string | null;
  /** Texto da ressalva quando o filtro de cultura não alcança o funil. */
  ressalvaDoFunil: string | null;
}) {
  const volumeDe = (linha: LinhaDePortfolio) =>
    visao === "ALIADOS" ? linha.aliadosAtivos : linha.solucoesPublicadas;
  const maiorVolume = linhas.reduce((maior, linha) => Math.max(maior, volumeDe(linha)), 0);
  const maiorSecundario = linhas.reduce(
    (maior, linha) => Math.max(maior, visao === "ALIADOS" ? linha.solucoesPublicadas : linha.aliadosAtivos),
    0,
  );

  const faltas = linhas.filter((linha) => exigeAcao(linha.situacao));
  const vazios = resumo.semCobertura + resumo.descobertasNoFunil;

  const maiorNaMatriz = matriz.linhas.reduce(
    (maior, linha) => Math.max(maior, ...linha.valores),
    0,
  );
  /** Cinco degraus de intensidade; sem base, todo mundo fica no degrau 0. */
  const degrau = (valor: number) => {
    if (valor === 0 || maiorNaMatriz === 0) {
      return 0;
    }
    return Math.min(4, Math.ceil((valor / maiorNaMatriz) * 4));
  };

  return (
    <>
      <div className="kpi-row">
        <Celula
          rotulo="Categorias cobertas"
          valor={
            resumo.categorias === 0 ? null : `${resumo.cobertas}/${resumo.categorias}`
          }
          nota={CRITERIOS_SITUACAO.COBERTA}
          estado="calma"
        />
        <Celula
          rotulo="Aliados ativos"
          valor={FORMATO.format(resumo.aliadosAtivos)}
          nota="no recorte, contados uma vez por categoria em que atuam"
        />
        <Celula
          rotulo="Soluções publicadas"
          valor={FORMATO.format(resumo.solucoesPublicadas)}
          nota="com ao menos uma oferta publicada — o que está na vitrine"
        />
        <Celula
          rotulo="Categorias sem cobertura"
          valor={FORMATO.format(vazios)}
          nota={
            vazios === 0
              ? "nenhuma categoria da vitrine está vazia"
              : `${resumo.semCobertura} sem ninguém e ${resumo.descobertasNoFunil} com empresa no funil`
          }
          estado={vazios > 0 ? "alerta" : undefined}
        />
      </div>

      <div
        className="cob-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,330px)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="card cov-card" style={{ padding: "20px 22px", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <h2 className="h-el">Distribuição por categoria</h2>
            <span className="cap">{CRITERIO_DE_ORDENACAO[visao]}</span>
          </div>

          {linhas.length === 0 ? (
            <div className="vazio" style={{ padding: "24px 8px" }}>
              <p className="cap" style={{ maxWidth: "44ch", margin: 0 }}>
                Nenhuma categoria ativa na taxonomia. A distribuição cruza as categorias da
                vitrine com o cadastro — sem taxonomia, não há o que distribuir.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {linhas.map((linha) => {
                const principal = volumeDe(linha);
                const secundario =
                  visao === "ALIADOS" ? linha.solucoesPublicadas : linha.aliadosAtivos;
                const larguraPrincipal = maiorVolume > 0 ? (principal / maiorVolume) * 100 : 0;
                const larguraSecundaria =
                  maiorSecundario > 0 ? (secundario / maiorSecundario) * 100 : 0;
                return (
                  <div
                    key={linha.categoriaId}
                    className={principal === 0 ? "cov-lin zero" : "cov-lin"}
                  >
                    <span className="cov-nome">{linha.categoriaNome}</span>
                    <span className="cov-bars">
                      <span className="cov-trk">
                        <span className="cov-fill" style={{ width: `${larguraPrincipal}%` }} />
                      </span>
                      <span className="cov-trk sec">
                        <span className="cov-fill sec" style={{ width: `${larguraSecundaria}%` }} />
                      </span>
                    </span>
                    <span className="cov-n">
                      {FORMATO.format(principal)}
                      <span className="s">
                        {FORMATO.format(secundario)}{" "}
                        {visao === "ALIADOS" ? "soluções" : "aliados"}
                      </span>
                    </span>
                    <span>
                      <PillSituacao situacao={linha.situacao} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="cov-leg">
            <span>
              <i />
              {visao === "ALIADOS" ? "aliados ativos" : "soluções publicadas"}
            </span>
            <span>
              <i className="sec" />
              {visao === "ALIADOS" ? "soluções publicadas" : "aliados ativos"}
            </span>
            <span>
              <i className="gap" />
              categoria sem cobertura
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Onde faltam
            </h2>
            <p className="cap" style={{ margin: "0 0 12px" }}>
              Vazios e fragilidades do recorte atual — cada um vira alvo de scout. Verificar o
              funil antes de prospectar evita esforço comercial duplicado (RN51).
            </p>

            {faltas.length === 0 ? (
              <div className="vazio" style={{ padding: "20px 8px" }}>
                <p className="cap" style={{ maxWidth: "34ch", margin: 0 }}>
                  Nenhum vazio neste recorte — todas as categorias têm ao menos dois aliados
                  ativos e solução publicada.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {faltas.map((linha) => (
                  <div key={linha.categoriaId} className="cont-it" style={{ alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ font: "var(--font-body-label-bold)" }}>{linha.categoriaNome}</div>
                      <div className="cap">
                        {ROTULOS_SITUACAO[linha.situacao]} — {CRITERIOS_SITUACAO[linha.situacao]}
                        {linha.empresasNoFunil > 0
                          ? ` · ${FORMATO.format(linha.empresasNoFunil)} no funil`
                          : ""}
                      </div>
                    </div>
                    {/* Mesma navegação da célula da T13: a T8 filtrada pela
                        categoria. Uma rota só para os dois caminhos (RN51). */}
                    <Link
                      href={`/mercado?categoria=${linha.categoriaId}`}
                      className="btn btn-ghost btn-sm"
                      style={{ flex: "none", textDecoration: "none" }}
                      aria-label={`Buscar no radar: abrir o funil filtrado em ${linha.categoriaNome}`}
                    >
                      Buscar no radar
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: "20px 22px" }}>
            <h2 className="h-el" style={{ marginBottom: 4 }}>
              Concentração
            </h2>
            <p className="cap" style={{ margin: "0 0 12px" }}>
              Quanto do portfólio está nas {concentracao.consideradas === 1 ? "maiores" : "três maiores"}{" "}
              categorias — leitura de risco de dependência.
            </p>
            {concentracao.percentual === null ? (
              <p className="indisp" style={{ margin: 0 }}>
                sem portfólio para concentrar neste recorte
              </p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="kpi-n num" style={{ fontSize: 30 }}>
                    {FORMATO.format(concentracao.percentual)}%
                  </span>
                  <span className="cap">
                    de {FORMATO.format(concentracao.total)}{" "}
                    {visao === "ALIADOS" ? "vínculos de aliado" : "soluções publicadas"}
                    {concentracao.consideradas < 3
                      ? ` · só ${concentracao.consideradas} categoria(s) com volume`
                      : ""}
                  </span>
                </div>
                <div className="compl" style={{ marginTop: 10, width: "100%" }}>
                  <span className="trk" style={{ flex: 1 }}>
                    <span className="fill" style={{ width: `${concentracao.percentual}%` }} />
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    marginTop: 12,
                    fontSize: 13,
                  }}
                >
                  {concentracao.maiores.map((maior) => (
                    <span key={maior.categoriaNome}>
                      {maior.posicao}º <b>{maior.categoriaNome}</b>{" "}
                      <span className="cap num">{FORMATO.format(maior.volume)}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{ padding: "20px 22px", marginTop: 16, overflowX: "auto" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <h2 className="h-el">Categoria × cultura</h2>
          <span className="cap">soluções declaradas por cultura no cadastro</span>
        </div>
        {/* As duas notas são OBRIGATÓRIAS pela ficha §2 — não são rodapé
            decorativo: sem (a), quem lê soma a linha e conclui errado; sem
            (b), atribui à matriz um recorte de região que ela não tem. */}
        <p className="cap" style={{ margin: "0 0 14px", maxWidth: "84ch" }}>
          Uma solução pode servir mais de uma cultura, então a linha soma mais que o total da
          categoria. A matriz independe do filtro de região — é característica declarada da
          solução, não da sede do aliado. Lista mantida no{" "}
          <Link href="/parametrizador/listas/culturas">Parametrizador › Culturas</Link>.
        </p>

        {matriz.culturas.length === 0 || matriz.linhas.length === 0 ? (
          <p className="indisp" style={{ margin: 0 }}>
            sem culturas ou categorias ativas na taxonomia para cruzar
          </p>
        ) : (
          <table className="tbl" style={{ minWidth: 560 }}>
            <caption className="sr-oculto">
              Soluções publicadas por categoria e cultura declarada. A linha soma mais que o
              total da categoria porque uma solução pode servir mais de uma cultura.
            </caption>
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                {matriz.culturas.map((cultura) => (
                  <th
                    key={cultura.id}
                    scope="col"
                    style={{
                      textAlign: "center",
                      color: cultura.id === culturaId ? "var(--azul-texto-aaa)" : undefined,
                    }}
                  >
                    {cultura.nome}
                  </th>
                ))}
                <th scope="col" style={{ textAlign: "right" }}>
                  Total da categoria
                </th>
              </tr>
            </thead>
            <tbody>
              {matriz.linhas.map((linha) => (
                <tr key={linha.categoriaId}>
                  <th
                    scope="row"
                    style={{
                      textAlign: "left",
                      textTransform: "none",
                      letterSpacing: "normal",
                      font: "var(--font-body-label-bold)",
                      color: "var(--preto)",
                    }}
                  >
                    {linha.categoriaNome}
                  </th>
                  {linha.valores.map((valor, indice) => {
                    const cultura = matriz.culturas[indice]!;
                    return (
                      <td key={cultura.id} style={{ textAlign: "center" }}>
                        <span
                          className={`mx-cel n${degrau(valor)}`}
                          style={
                            culturaId && cultura.id !== culturaId ? { opacity: 0.28 } : undefined
                          }
                          title={`${linha.categoriaNome} × ${cultura.nome}: ${FORMATO.format(valor)} solução(ões) publicada(s)`}
                        >
                          {valor === 0 ? "—" : FORMATO.format(valor)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="num" style={{ textAlign: "right" }}>
                    {FORMATO.format(linha.totalDaCategoria)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {matriz.solucoesSemCultura > 0 ? (
          <p className="cap" style={{ margin: "12px 0 0", maxWidth: "84ch" }}>
            <b>
              {FORMATO.format(matriz.solucoesSemCultura)} solução(ões) publicada(s) sem cultura
              declarada
            </b>{" "}
            não aparecem em coluna alguma da matriz — o volume fica declarado aqui em vez de
            sumir (RN53).
          </p>
        ) : null}
      </div>

      <p className="cap" style={{ margin: "14px 0 0", maxWidth: "88ch" }}>
        {ressalvaDoFunil ? `${ressalvaDoFunil}. ` : ""}
        {excluidos.aliadosSemCategoria > 0 ? (
          <>
            <b>
              {FORMATO.format(excluidos.aliadosSemCategoria)} aliado(s) ativo(s) sem
              categoria-alvo
            </b>{" "}
            ficam fora da distribuição: até a classificação ser feita, uma categoria vazia aqui
            pode significar portfólio não classificado, não portfólio ausente.{" "}
          </>
        ) : null}
        {excluidos.solucoesSemCategoria > 0 ? (
          <>
            {FORMATO.format(excluidos.solucoesSemCategoria)} solução(ões) publicada(s) sem
            categoria também ficam fora.{" "}
          </>
        ) : null}
        A carga inicial do portfólio de soluções ainda não entrou; o que se vê é o cadastrado
        até aqui.
        {culturaNome ? ` Recorte de cultura ativo: ${culturaNome}.` : ""}
      </p>
    </>
  );
}
