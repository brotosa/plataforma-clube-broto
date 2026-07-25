import type { EstagioEmpresa } from "@prisma/client";

/** Pill de estágio do aliado no vocabulário institucional. */
export function PillEstagio({ estagio }: { estagio: EstagioEmpresa }) {
  if (estagio === "ALIADA_ATIVA") {
    return (
      <span className="pill pill-ok">
        <i aria-hidden="true" />
        Aliado ativo
      </span>
    );
  }
  if (estagio === "EM_NEGOCIACAO") {
    return (
      <span className="pill pill-info">
        <i aria-hidden="true" />
        Em negociação
      </span>
    );
  }
  if (estagio === "SUSPENSA") {
    return (
      <span className="pill pill-erro">
        <i aria-hidden="true" />
        Suspenso
      </span>
    );
  }
  return (
    <span className="pill pill-neutra">
      <i aria-hidden="true" />
      Encerrado
    </span>
  );
}

/** Barra de completude (padrão .compl do DSeed). */
export function BarraCompletude({ percentual }: { percentual: number }) {
  return (
    <span className={percentual < 50 ? "compl baixa" : "compl"}>
      <span className="trk">
        <span className="fill" style={{ width: `${percentual}%`, display: "block" }} />
      </span>
      <span className="pct num">{percentual}%</span>
    </span>
  );
}

/** Iniciais para o avatar de logo ausente (.logo-ini). */
export function iniciaisDoNome(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .map((parte) => parte.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const primeira = partes[0]?.charAt(0) ?? "";
  const segunda = partes[1]?.charAt(0) ?? "";
  return (primeira + segunda).toUpperCase() || "?";
}

/** Rótulo de campo obrigatório pendente (padrão do protótipo). */
export function PendenteObrigatorio() {
  return (
    <span className="pill pill-warn">
      <i aria-hidden="true" />
      obrigatório · não preenchido
    </span>
  );
}
