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

/**
 * RN54 — a marca do aliado, no lugar em que ela aparece: ficha, lista de
 * aliados, card do funil. Um componente só para os três, porque "onde não
 * houver logo, o lugar exibe a inicial em placa neutra, nunca um espaço
 * quebrado" é a mesma regra nos três — e regra repetida é regra que se
 * perde num deles.
 *
 * `hash` é a versão da marca: entra na URL como parâmetro de consulta para
 * que a troca apareça imediatamente, mesmo com a resposta anterior ainda
 * no cache do navegador. `null` significa aliado sem marca.
 */
export function MarcaDoAliado({
  empresaId,
  nomeFantasia,
  hash,
  tamanho = 32,
}: {
  empresaId: string;
  nomeFantasia: string;
  hash: string | null;
  /** Lado da placa em px; a imagem se ajusta dentro dela. */
  tamanho?: number;
}) {
  if (hash === null) {
    return (
      <span
        className="logo-ini"
        style={tamanho === 32 ? undefined : { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.34) }}
      >
        {iniciaisDoNome(nomeFantasia)}
      </span>
    );
  }
  return (
    /* Rota própria com ETag pelo hash: o otimizador do next/image não
       acrescenta nada a um arquivo de até 200 KB e atrapalharia a
       revalidação. `<img>` também é onde script em SVG não executa. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/aliados/${empresaId}/marca?v=${hash.slice(0, 12)}`}
      alt={`Marca de ${nomeFantasia}`}
      width={tamanho}
      height={tamanho}
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: "50%",
        border: "1px solid var(--borda)",
        background: "var(--branco)",
        objectFit: "contain",
        flex: "none",
      }}
    />
  );
}
