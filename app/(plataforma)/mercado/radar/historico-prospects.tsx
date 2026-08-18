import { prisma } from "@/infra/prisma/cliente";

/**
 * Item 1 (pós-homologação) — histórico das importações de prospects (T9), com
 * a quarentena visível.
 *
 * A quarentena da carga de prospects vinha sendo mostrada só no resumo do
 * assistente, no instante da importação. Quem voltava depois — inclusive pelo
 * cartão "Importações com linhas em quarentena" do Dashboard, que aponta para
 * cá quando a carga mais recente é de prospects — caía no assistente vazio e
 * não achava mais quais linhas foram recusadas. Aqui as últimas cargas ficam
 * listadas, e cada uma com quarentena abre o "linha: motivo" que já estava
 * gravado em `relatorioQuarentena` — nada de novo no banco, só passa a ser
 * consultável fora do assistente. É o equivalente do "Baixar erros" dos
 * assinantes, adaptado ao que a carga de prospects guarda.
 */

interface LinhaRecusada {
  linha: number;
  motivo: string;
}

/** Lê o relatório de quarentena com tolerância — é Json e pode vir malformado. */
function recusadasDoJson(json: unknown): LinhaRecusada[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const linha = item as Record<string, unknown>;
    if (typeof linha.linha === "number" && typeof linha.motivo === "string") {
      return [{ linha: linha.linha, motivo: linha.motivo }];
    }
    return [];
  });
}

function data(valor: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(valor);
}

export async function HistoricoDeProspects() {
  const importacoes = await prisma.importacao.findMany({
    where: { tipo: "CARGA_PROSPECTS" },
    orderBy: { criadoEm: "desc" },
    take: 10,
    include: { autor: { select: { nome: true } } },
  });

  if (importacoes.length === 0) return null;

  return (
    <div className="card" style={{ padding: "20px 22px", marginTop: 22 }} id="historico-prospects">
      <h2 className="h-el" style={{ marginBottom: 4 }}>
        Últimas importações de prospects
      </h2>
      <p className="cap" style={{ margin: "0 0 14px", maxWidth: "70ch" }}>
        Cargas de lista de aliados mapeados. As linhas em quarentena — recusadas com motivo — ficam
        aqui para consulta depois do assistente.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl tbl-resp">
          <thead>
            <tr>
              <th>Arquivo</th>
              <th>Data</th>
              <th>Autor</th>
              <th style={{ textAlign: "right" }}>Novas</th>
              <th style={{ textAlign: "right" }}>Quarentena</th>
            </tr>
          </thead>
          <tbody>
            {importacoes.map((importacao) => {
              const recusadas = recusadasDoJson(importacao.relatorioQuarentena);
              return (
                <tr key={importacao.id}>
                  <td data-label="Arquivo" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                    {importacao.nomeArquivo}
                  </td>
                  <td data-label="Data" className="cap num">
                    {data(importacao.criadoEm)}
                  </td>
                  <td data-label="Autor" className="cap">
                    {importacao.autor.nome}
                  </td>
                  <td data-label="Novas" className="num" style={{ textAlign: "right" }}>
                    {importacao.linhasOk}
                  </td>
                  <td data-label="Quarentena" style={{ textAlign: "right" }}>
                    {importacao.linhasErro > 0 ? (
                      recusadas.length > 0 ? (
                        <details>
                          <summary
                            style={{ cursor: "pointer", color: "var(--erro-texto-aaa)", fontWeight: 600 }}
                          >
                            {importacao.linhasErro} em quarentena
                          </summary>
                          <ul
                            className="cap"
                            style={{ margin: "8px 0 0", paddingLeft: 18, textAlign: "left" }}
                          >
                            {recusadas.map((linha) => (
                              <li key={`${linha.linha}-${linha.motivo}`}>
                                linha {linha.linha}: {linha.motivo}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="num" style={{ color: "var(--erro-texto-aaa)", fontWeight: 600 }}>
                          {importacao.linhasErro}
                        </span>
                      )
                    ) : (
                      <span className="cap">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
