import { $Enums } from "@prisma/client";
import { DIMENSOES_MEDICAO } from "../avaliacao/dimensoes";
import { ESCALA_NOTA } from "../avaliacao/regras";

/**
 * RN26 — Parâmetros estruturais: somente leitura no hub, cada um com a
 * justificativa de uma linha.
 *
 * As contagens vêm dos METADADOS — os enums gerados pelo Prisma a partir
 * do schema e as constantes de domínio —, nunca de números digitados na
 * tela. Assim, acrescentar um estágio ao pipeline muda o hub sozinho, e
 * nenhum texto de UI passa a mentir por esquecimento.
 */

export type OrigemEstrutural =
  /** Valores de um enum do schema — a contagem é o tamanho do enum. */
  | { tipo: "ENUM"; valores: ReadonlyArray<string> }
  /** Tabela que existe, mas é estrutural (ficha §3.3): contagem via banco. */
  | { tipo: "TABELA"; tabela: "mecanicas" }
  /** Escala fixa descrita em domínio (a nota do ScoutCB). */
  | { tipo: "ESCALA"; descricao: string };

export interface ParametroEstrutural {
  chave: string;
  rotulo: string;
  /** A justificativa honesta de por que mudar isto é release. */
  justificativa: string;
  origem: OrigemEstrutural;
}

const valoresDe = (enumerado: Record<string, string>): ReadonlyArray<string> =>
  Object.keys(enumerado);

export const PARAMETROS_ESTRUTURAIS: ReadonlyArray<ParametroEstrutural> = [
  {
    chave: "naturezas-oferta",
    rotulo: "Naturezas da oferta",
    justificativa:
      "Cada natureza carrega validação própria e a regra de comissão — alterá-las é release versionado.",
    origem: { tipo: "ENUM", valores: valoresDe($Enums.NaturezaOferta) },
  },
  {
    chave: "estagios-pipeline",
    rotulo: "Estágios do pipeline",
    justificativa:
      "Governam transições, aprovações e o kanban do funil — alterá-los é release versionado.",
    origem: { tipo: "ENUM", valores: valoresDe($Enums.EstagioEmpresa) },
  },
  {
    chave: "status-oferta",
    rotulo: "Status de oferta",
    justificativa:
      "Definem o que a vitrine publica e o que a telemetria contabiliza — alterá-los é release versionado.",
    origem: { tipo: "ENUM", valores: valoresDe($Enums.StatusOferta) },
  },
  {
    chave: "status-solucao",
    rotulo: "Status de solução",
    justificativa:
      "Definem a elegibilidade da solução para publicar oferta (RN09) — alterá-los é release versionado.",
    origem: { tipo: "ENUM", valores: valoresDe($Enums.StatusSolucao) },
  },
  {
    chave: "mecanicas-resgate",
    rotulo: "Mecânicas de resgate",
    justificativa:
      "Amarradas ao contrato e ao pacote de exportação para a Minutrade — alterá-las é release versionado.",
    origem: { tipo: "TABELA", tabela: "mecanicas" },
  },
  {
    chave: "dimensoes-medicao",
    rotulo: "Dimensões de medição",
    justificativa: `A escala do ScoutCB (nota ${ESCALA_NOTA.minima}–${ESCALA_NOTA.maxima}) entra no cálculo do score — alterá-la é release versionado.`,
    origem: { tipo: "ENUM", valores: DIMENSOES_MEDICAO.map((d) => d.nome) },
  },
  {
    chave: "ambientes-pagamento",
    rotulo: "Ambientes de pagamento",
    justificativa:
      "Definem conciliação e comissionamento do que é pago dentro e fora da plataforma — alterá-los é release versionado.",
    origem: { tipo: "ENUM", valores: valoresDe($Enums.AmbientePagamento) },
  },
];

/**
 * Taxas transacionais do meio de pagamento: decisão de 24/07 (ficha §3.3)
 * as deixa em standby. Aparecem no hub como referência informativa, com
 * etiqueta explícita — e sem valor, porque ele vem do contrato do meio de
 * pagamento e não foi confirmado.
 */
export const TAXAS_EM_STANDBY = {
  rotulo: "Taxas por meio de pagamento",
  descricao: "Valores vigentes vêm do contrato do meio de pagamento",
  etiqueta: "em standby — edição não habilitada",
  pendencia: "a confirmar",
} as const;
