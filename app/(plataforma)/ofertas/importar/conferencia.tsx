import { COLUNAS_OFERTA } from "@/dominio/importacao-catalogo/ofertas";
import type { ConferenciaOfertas } from "@/infra/casos-de-uso/importar-ofertas";
import { FormularioComEstado } from "../../aliados/formularios";
import { acaoCorrigirCelulaOferta, acaoEfetivarOfertas } from "./acoes";

export interface ListasDeOferta {
  naturezas: string[];
  tipos: string[];
  mecanicas: string[];
  modalidades: string[];
}

function SeloAcao({ acao }: { acao: "CRIAR" | "ENRIQUECER" | null }) {
  if (acao === "CRIAR") return <span className="pill pill-ok">criar</span>;
  if (acao === "ENRIQUECER") return <span className="pill pill-info">enriquecer</span>;
  return <span className="pill pill-erro">pendente</span>;
}

/** Opções de seleção para a coluna, quando ela é uma lista fechada. */
function opcoesDaColuna(coluna: string, listas: ListasDeOferta): string[] | null {
  if (coluna === COLUNAS_OFERTA.natureza) return listas.naturezas;
  if (coluna === COLUNAS_OFERTA.tipoBeneficio) return listas.tipos;
  if (coluna === COLUNAS_OFERTA.mecanica) return listas.mecanicas;
  if (coluna === COLUNAS_OFERTA.modalidade) return listas.modalidades;
  return null;
}

/** Conferência do importador de ofertas (correção leve). */
export function Conferencia({
  conferencia,
  listas,
}: {
  conferencia: ConferenciaOfertas;
  listas: ListasDeOferta;
}) {
  const { linhas, prontas, comPendencia, importacaoId } = conferencia;

  return (
    <div>
      <div className="cap" style={{ margin: "0 0 14px" }}>
        Arquivo <b>{conferencia.nomeArquivo}</b> · {linhas.length} linha(s) · {prontas} pronta(s)
        {comPendencia > 0 ? (
          <>
            {" · "}
            <span style={{ color: "var(--erro-texto-aaa)" }}>{comPendencia} com pendência</span>
          </>
        ) : null}
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label="Linhas da importação (tabela rolável)"
        style={{ overflowX: "auto" }}
      >
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }}>Linha</th>
              <th style={{ width: 90 }}>Ação</th>
              <th>{COLUNAS_OFERTA.titulo}</th>
              <th>{COLUNAS_OFERTA.natureza}</th>
              <th>{COLUNAS_OFERTA.tipoBeneficio}</th>
              <th>{COLUNAS_OFERTA.mecanica}</th>
              <th>{COLUNAS_OFERTA.vigenciaInicio}</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="num">{l.linha}</td>
                <td>
                  <SeloAcao acao={l.acao} />
                </td>
                <td>{l.valores[COLUNAS_OFERTA.titulo] ?? ""}</td>
                <td>{l.valores[COLUNAS_OFERTA.natureza] ?? ""}</td>
                <td>{l.valores[COLUNAS_OFERTA.tipoBeneficio] ?? ""}</td>
                <td>{l.valores[COLUNAS_OFERTA.mecanica] ?? ""}</td>
                <td>{l.valores[COLUNAS_OFERTA.vigenciaInicio] ?? ""}</td>
                <td>
                  {l.pendencias.length === 0 ? (
                    <span className="pill pill-ok">ok</span>
                  ) : (
                    <span className="pill pill-erro">{l.pendencias.length} pendência(s)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comPendencia > 0 ? (
        <div className="card" style={{ padding: "16px 18px", marginTop: 20 }}>
          <h2 className="h-el" style={{ margin: "0 0 4px", fontSize: 16 }}>
            Pendências a corrigir
          </h2>
          <p className="cap" style={{ margin: "0 0 14px" }}>
            Corrija cada campo aqui mesmo e o lote é revalidado. Enquanto houver pendência, nada é
            gravado.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {linhas.flatMap((l) =>
              l.pendencias.map((p, indice) => {
                const valorAtual = l.valores[p.coluna] ?? "";
                const opcoes = opcoesDaColuna(p.coluna, listas);
                return (
                  <form
                    key={`${l.id}-${indice}`}
                    action={acaoCorrigirCelulaOferta}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                      borderTop: "1px solid var(--borda)",
                      paddingTop: 12,
                    }}
                  >
                    <input type="hidden" name="stagingId" value={l.id} />
                    <input type="hidden" name="coluna" value={p.coluna} />
                    <input type="hidden" name="importacaoId" value={importacaoId} />
                    <span className="cap" style={{ minWidth: 64 }}>
                      Linha <b className="num">{l.linha}</b>
                    </span>
                    <span className="cap" style={{ flex: "1 1 260px", color: "var(--erro-texto-aaa)" }}>
                      <b>{p.coluna}:</b> {p.motivo}
                    </span>
                    {opcoes ? (
                      <select name="valor" className="input" defaultValue={valorAtual} style={{ width: 240 }}>
                        <option value="">— selecione —</option>
                        {opcoes.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        name="valor"
                        className="input"
                        defaultValue={valorAtual}
                        style={{ width: 240 }}
                        aria-label={`Novo valor para ${p.coluna}`}
                      />
                    )}
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Corrigir
                    </button>
                  </form>
                );
              }),
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: "16px 18px", marginTop: 20, maxWidth: 560 }}>
          <h2 className="h-el" style={{ margin: "0 0 4px", fontSize: 16 }}>
            Tudo pronto
          </h2>
          <p className="cap" style={{ margin: "0 0 14px" }}>
            Nenhuma pendência. Ao efetivar, as ofertas novas entram como <b>rascunho</b> e as
            existentes são atualizadas — tudo auditado. Publicar segue o fluxo normal.
          </p>
          <FormularioComEstado
            acao={acaoEfetivarOfertas}
            rotuloEnviar={`Efetivar (${prontas})`}
            confirmacao="Confirmar a criação/atualização das ofertas deste lote?"
          >
            <input type="hidden" name="importacaoId" value={importacaoId} />
          </FormularioComEstado>
        </div>
      )}
    </div>
  );
}
