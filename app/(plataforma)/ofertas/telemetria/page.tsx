import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/infra/auth";
import { prisma } from "@/infra/prisma/cliente";
import { podeExecutar } from "@/dominio/autorizacao/permissoes";
import { FormularioComEstado } from "../../aliados/formularios";
import { acaoImportarTelemetria } from "./acoes";

export const metadata: Metadata = {
  title: "Importar telemetria",
};

function dataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

interface LinhaQuarentena {
  linha: number;
  motivos: string[];
}

function comoQuarentena(valor: unknown): LinhaQuarentena[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter(
    (item): item is LinhaQuarentena =>
      typeof item === "object" && item !== null && "linha" in item && "motivos" in item,
  );
}

/**
 * Importação de telemetria (Minutrade → Broto), ficha §6 — F4. Upload do CSV
 * do layout-alvo, validação linha a linha com quarentena por motivo,
 * idempotência (UNIQUE idVoucher+tipo) e relatório pós-carga. Telemetria é
 * fato imutável (RN07): reimportar não duplica nem edita.
 */
export default async function PaginaTelemetria() {
  const sessao = await auth();
  const papel = sessao?.user?.papel ?? "LEITURA";
  const podeImportar = podeExecutar(papel, "IMPORTAR_TELEMETRIA");

  const importacoes = await prisma.importacao.findMany({
    where: { tipo: "TELEMETRIA" },
    orderBy: { criadoEm: "desc" },
    take: 10,
    include: { autor: { select: { nome: true } } },
  });

  return (
    <div className="tela" style={{ padding: "26px 32px 40px", maxWidth: 1080 }}>
      <div className="cap" style={{ marginBottom: 14 }}>
        <Link href="/ofertas">Ofertas</Link> /{" "}
        <b style={{ color: "var(--preto)" }}>Importar telemetria</b>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="h-page">Importar telemetria</h1>
        <div className="cap" style={{ marginTop: 4, maxWidth: "82ch" }}>
          Carrega o arquivo de eventos da Minutrade (layout-alvo da ficha §6). Cada linha é
          validada; erros vão para quarentena com motivo. A carga é idempotente e os fatos
          são imutáveis (RN07). O CPF é armazenado apenas como hash (LGPD).
        </div>
      </div>

      {podeImportar ? (
        <div className="card" style={{ padding: "16px 18px", marginBottom: 22, maxWidth: 620 }}>
          <FormularioComEstado acao={acaoImportarTelemetria} rotuloEnviar="Importar arquivo">
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="arquivo-telemetria">Arquivo CSV de telemetria</label>
              <input
                id="arquivo-telemetria"
                className="input"
                type="file"
                name="arquivo"
                accept=".csv,text/csv"
                required
              />
              <span className="hint">
                Colunas: data_hora_evento; cpf_assinante; id_seller; id_oferta; id_voucher;
                tipo_evento; valor_transacao; canal. Cardápio de eventos{" "}
                <span className="selo">A CONFIRMAR</span>: valores fora dos três degraus vão à
                quarentena.
              </span>
            </div>
          </FormularioComEstado>
        </div>
      ) : (
        <p className="cap" style={{ marginBottom: 22 }}>
          Importação restrita a Gestor e Analista (ficha §2). Você pode consultar o histórico.
        </p>
      )}

      <h2 className="h-el" style={{ marginBottom: 10 }}>Últimas importações</h2>
      {importacoes.length === 0 ? (
        <p className="cap">Nenhuma telemetria importada ainda.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {importacoes.map((importacao) => {
            const quarentena = comoQuarentena(importacao.relatorioQuarentena);
            return (
              <div key={importacao.id} className="card" style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <b className="mono">{importacao.nomeArquivo}</b>
                  <span className="cap">{dataHora(importacao.criadoEm)} · {importacao.autor.nome}</span>
                  <span style={{ flex: 1 }} />
                  <span className="pill pill-ok"><i aria-hidden="true" />{importacao.linhasOk} importadas</span>
                  {importacao.linhasErro > 0 ? (
                    <span className="pill pill-erro"><i aria-hidden="true" />{importacao.linhasErro} em quarentena</span>
                  ) : null}
                </div>
                {quarentena.length > 0 ? (
                  <details style={{ marginTop: 10 }}>
                    <summary className="cap" style={{ cursor: "pointer" }}>
                      Ver quarentena ({quarentena.length})
                    </summary>
                    <ul className="cap" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      {quarentena.slice(0, 50).map((linha) => (
                        <li key={linha.linha}>
                          Linha {linha.linha}: {linha.motivos.join("; ")}
                        </li>
                      ))}
                    </ul>
                    {quarentena.length > 50 ? (
                      <p className="cap" style={{ margin: "6px 0 0" }}>
                        …e mais {quarentena.length - 50} linha(s).
                      </p>
                    ) : null}
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
