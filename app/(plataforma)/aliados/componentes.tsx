import type { EstagioEmpresa } from "@prisma/client";

/** Estágio → classe/rótulo institucional (Ondas 1 e 2 — pipeline completo). */
const APRESENTACAO_ESTAGIO: Readonly<
  Record<EstagioEmpresa, { classe: string; rotulo: string }>
> = {
  MAPEADA: { classe: "pill pill-info", rotulo: "Mapeada" },
  EM_AVALIACAO: { classe: "pill pill-info", rotulo: "Em avaliação" },
  PRIORIZADA: { classe: "pill pill-info", rotulo: "Priorizada" },
  EM_NEGOCIACAO: { classe: "pill pill-info", rotulo: "Em negociação" },
  EM_APROVACAO: { classe: "pill pill-info", rotulo: "Em aprovação" },
  ALIADA_ATIVA: { classe: "pill pill-ok", rotulo: "Aliado ativo" },
  SUSPENSA: { classe: "pill pill-erro", rotulo: "Suspenso" },
  ENCERRADA: { classe: "pill pill-neutra", rotulo: "Encerrado" },
  DESCARTADA: { classe: "pill pill-neutra", rotulo: "Descartada" },
};

/** Pill de estágio do aliado no vocabulário institucional. */
export function PillEstagio({ estagio }: { estagio: EstagioEmpresa }) {
  const { classe, rotulo } = APRESENTACAO_ESTAGIO[estagio];
  return (
    <span className={classe}>
      <i aria-hidden="true" />
      {rotulo}
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
