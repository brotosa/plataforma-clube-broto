import {
  type ArtefatoDerivado,
  LIMITE_MAIOR_KIT,
  LIMITE_TOTAL_ARMAZENADO,
} from "@/dominio/arquivos/artefato-derivado";
import { formatarTamanho } from "@/dominio/arquivos/arquivo-enviado";
import type { MedidaDeArmazenamento } from "@/infra/consultas/armazenamento";

/**
 * Painel de saúde do armazenamento de artefatos derivados (RN71) — só
 * leitura, no hub do Parametrizador. Mede o que está guardado (peça de
 * campanha, snapshot de exportação, kit de execução) e AVISA quando a
 * condição objetiva de mover para armazenamento de objetos é satisfeita:
 * maior kit acima de 50 MB **ou** total acima de 5 GB.
 *
 * Os limites são condição de ARQUITETURA, não parâmetro editável — o mesmo
 * motivo pelo qual os tetos ficam fora do Parametrizador. Aqui eles só se
 * medem.
 */

const ROTULO_ARTEFATO: Record<ArtefatoDerivado, string> = {
  IMAGEM_DE_PECA: "Imagens de peça",
  SNAPSHOT_DE_EXPORTACAO: "Snapshots de exportação",
  KIT_DE_EXECUCAO: "Kits de execução",
};

const ORDEM: ReadonlyArray<ArtefatoDerivado> = [
  "KIT_DE_EXECUCAO",
  "SNAPSHOT_DE_EXPORTACAO",
  "IMAGEM_DE_PECA",
];

function percentual(parte: number, todo: number): number {
  if (todo <= 0) return 0;
  return Math.min(100, Math.round((parte / todo) * 100));
}

function Medidor({
  rotulo,
  valor,
  limite,
  alerta,
}: {
  rotulo: string;
  valor: number;
  limite: number;
  alerta: boolean;
}) {
  const pct = percentual(valor, limite);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <span className="cap">{rotulo}</span>
        <b className="num">
          {formatarTamanho(valor)} <span className="cap" style={{ fontWeight: 400 }}>de {formatarTamanho(limite)}</span>
        </b>
      </div>
      <div className="compl" style={{ marginTop: 8, width: "100%" }}>
        <span className="trk" style={{ flex: 1 }} aria-hidden="true">
          <span
            className="fill"
            style={{
              width: `${pct}%`,
              background: alerta ? "var(--erro)" : undefined,
            }}
          />
        </span>
      </div>
      <div className="cap" style={{ marginTop: 4 }}>
        {pct}% do limite
      </div>
    </div>
  );
}

export function PainelArmazenamento({ medida }: { medida: MedidaDeArmazenamento }) {
  const { condicao } = medida;

  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="h-el" style={{ marginBottom: 4 }}>
        Armazenamento de artefatos
      </h2>
      <p className="cap" style={{ margin: "0 0 14px", maxWidth: "74ch" }}>
        Peças de campanha, snapshots de exportação e kits de execução ficam guardados no banco
        (RN71). Quando o <b>maior kit passar de {formatarTamanho(LIMITE_MAIOR_KIT)}</b> ou o{" "}
        <b>total passar de {formatarTamanho(LIMITE_TOTAL_ARMAZENADO)}</b>, é a hora de o adapter de
        armazenamento de objetos entrar em fase própria. Os limites são de arquitetura — aqui só se
        medem.
      </p>

      {condicao.satisfeita ? (
        <div
          className="aviso-inline"
          role="alert"
          style={{ borderColor: "var(--erro)", background: "var(--erro-claro)", marginBottom: 14 }}
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
            style={{ flex: "none", color: "var(--erro-texto-aaa)" }}
          >
            <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          </svg>
          <span>
            <b>Condição objetiva da RN71 satisfeita</b> —{" "}
            {[
              condicao.porKit
                ? `há kit acima de ${formatarTamanho(LIMITE_MAIOR_KIT)}`
                : null,
              condicao.porTotal
                ? `o total passou de ${formatarTamanho(LIMITE_TOTAL_ARMAZENADO)}`
                : null,
            ]
              .filter(Boolean)
              .join(" e ")}
            . O adapter de armazenamento de objetos precisa entrar em fase própria.
          </span>
        </div>
      ) : (
        <div className="aviso-inline" style={{ marginBottom: 14 }}>
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
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>
            Dentro dos limites — guardar no banco segue defensável. Nenhuma ação necessária.
          </span>
        </div>
      )}

      <div className="card" style={{ padding: "18px 20px" }}>
        <div
          className="g-resp"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
            gap: 22,
            marginBottom: 18,
          }}
        >
          <Medidor
            rotulo="Total armazenado"
            valor={medida.totalBytes}
            limite={LIMITE_TOTAL_ARMAZENADO}
            alerta={condicao.porTotal}
          />
          <Medidor
            rotulo="Maior kit"
            valor={medida.maiorKitBytes}
            limite={LIMITE_MAIOR_KIT}
            alerta={condicao.porKit}
          />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Artefato</th>
                <th style={{ textAlign: "right" }}>Quantidade</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Maior</th>
              </tr>
            </thead>
            <tbody>
              {ORDEM.map((artefato) => {
                const linha = medida.porArtefato[artefato];
                return (
                  <tr key={artefato}>
                    <td data-label="Artefato">{ROTULO_ARTEFATO[artefato]}</td>
                    <td data-label="Quantidade" className="num" style={{ textAlign: "right" }}>
                      {linha.quantidade.toLocaleString("pt-BR")}
                    </td>
                    <td data-label="Total" className="num" style={{ textAlign: "right" }}>
                      {linha.quantidade > 0 ? formatarTamanho(linha.totalBytes) : "—"}
                    </td>
                    <td data-label="Maior" className="num" style={{ textAlign: "right" }}>
                      {linha.quantidade > 0 ? formatarTamanho(linha.maiorBytes) : "—"}
                    </td>
                  </tr>
                );
              })}
              {medida.desconhecidos.quantidade > 0 ? (
                <tr>
                  <td data-label="Artefato">Chaves não classificadas</td>
                  <td data-label="Quantidade" className="num" style={{ textAlign: "right" }}>
                    {medida.desconhecidos.quantidade.toLocaleString("pt-BR")}
                  </td>
                  <td data-label="Total" className="num" style={{ textAlign: "right" }}>
                    {formatarTamanho(medida.desconhecidos.totalBytes)}
                  </td>
                  <td data-label="Maior" className="num" style={{ textAlign: "right" }}>
                    {formatarTamanho(medida.desconhecidos.maiorBytes)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
