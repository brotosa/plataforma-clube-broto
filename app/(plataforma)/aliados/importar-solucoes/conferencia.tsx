import { COLUNAS_SOLUCAO } from "@/dominio/importacao-catalogo/solucoes";
import type { ConferenciaSolucoes } from "@/infra/casos-de-uso/importar-solucoes";
import { FormularioComEstado } from "../formularios";
import { acaoCorrigirCelula, acaoEfetivar } from "./acoes";

/** Badge de ação por linha. */
function SeloAcao({ acao }: { acao: "CRIAR" | "ENRIQUECER" | null }) {
  if (acao === "CRIAR") return <span className="pill pill-ok">criar</span>;
  if (acao === "ENRIQUECER") return <span className="pill pill-info">enriquecer</span>;
  return <span className="pill pill-erro">pendente</span>;
}

/**
 * Tela de conferência do importador de soluções (correção leve).
 *
 * A tabela mostra o que será criado/enriquecido; a seção "Pendências"
 * reúne as células sinalizadas com um campo de correção ao lado (menu para
 * Categoria, texto para o resto). "Efetivar" só aparece quando não há
 * pendência — a mesma trava existe no servidor (recusa o arquivo inteiro).
 */
export function Conferencia({
  conferencia,
  categorias,
}: {
  conferencia: ConferenciaSolucoes;
  categorias: string[];
}) {
  const { linhas, prontas, comPendencia, importacaoId } = conferencia;

  return (
    <div>
      <div className="cap" style={{ margin: "0 0 14px" }}>
        Arquivo <b>{conferencia.nomeArquivo}</b> · {linhas.length} linha(s) ·{" "}
        <span style={{ color: "var(--verde-texto-aaa, var(--preto))" }}>{prontas} pronta(s)</span>
        {comPendencia > 0 ? (
          <>
            {" · "}
            <span style={{ color: "var(--erro-texto-aaa)" }}>{comPendencia} com pendência</span>
          </>
        ) : null}
      </div>

      <div tabIndex={0} role="group" aria-label="Linhas da importação (tabela rolável)" style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }}>Linha</th>
              <th style={{ width: 90 }}>Ação</th>
              <th>{COLUNAS_SOLUCAO.cnpj}</th>
              <th>{COLUNAS_SOLUCAO.nome}</th>
              <th>{COLUNAS_SOLUCAO.categoria}</th>
              <th>{COLUNAS_SOLUCAO.culturas}</th>
              <th>{COLUNAS_SOLUCAO.cobertura}</th>
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
                <td>{l.valores[COLUNAS_SOLUCAO.cnpj] ?? ""}</td>
                <td>{l.valores[COLUNAS_SOLUCAO.nome] ?? ""}</td>
                <td>{l.valores[COLUNAS_SOLUCAO.categoria] ?? ""}</td>
                <td>{l.valores[COLUNAS_SOLUCAO.culturas] ?? ""}</td>
                <td>{l.valores[COLUNAS_SOLUCAO.cobertura] ?? ""}</td>
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
            Corrija cada campo aqui mesmo e o lote é revalidado. Enquanto houver pendência, o
            arquivo inteiro fica retido (nada é gravado).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {linhas.flatMap((l) =>
              l.pendencias.map((p, indice) => {
                const valorAtual = l.valores[p.coluna] ?? "";
                const ehCategoria = p.coluna === COLUNAS_SOLUCAO.categoria;
                return (
                  <form
                    key={`${l.id}-${indice}`}
                    action={acaoCorrigirCelula}
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
                    {ehCategoria ? (
                      <select name="valor" className="input" defaultValue={valorAtual} style={{ width: 240 }}>
                        <option value="">— selecione —</option>
                        {categorias.map((c) => (
                          <option key={c} value={c}>
                            {c}
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
        <div className="card" style={{ padding: "16px 18px", marginTop: 20, maxWidth: 520 }}>
          <h2 className="h-el" style={{ margin: "0 0 4px", fontSize: 16 }}>
            Tudo pronto
          </h2>
          <p className="cap" style={{ margin: "0 0 14px" }}>
            Nenhuma pendência. Ao efetivar, as soluções novas são criadas e as existentes são
            enriquecidas — tudo auditado (RN01 preservada).
          </p>
          <FormularioComEstado
            acao={acaoEfetivar}
            rotuloEnviar={`Efetivar (${prontas})`}
            confirmacao="Confirmar a criação/atualização das soluções deste lote?"
          >
            <input type="hidden" name="importacaoId" value={importacaoId} />
          </FormularioComEstado>
        </div>
      )}
    </div>
  );
}
