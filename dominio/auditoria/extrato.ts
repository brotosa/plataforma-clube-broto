/**
 * Consulta e extrato da trilha de auditoria (Onda 6, ficha §4).
 *
 * RN48 — a auditoria é somente leitura; exportar o extrato exige Gestor ou
 *        Administrador e a própria exportação gera evento (meta-trilha).
 * RN49 — nenhum evento é apagado na v1. Não há função de purga aqui, nem
 *        em lugar nenhum da plataforma; a política formal de retenção é
 *        [A CONFIRMAR — jurídico/compliance] e, até que venha, a premissa
 *        é retenção integral.
 *
 * Este módulo é puro: classifica, compara e serializa. Quem lê o banco é
 * infra/consultas/auditoria.ts.
 */

/** Evento como a T28 o exibe (espelho de AuditoriaEvento + nome do autor). */
export interface EventoDeTrilha {
  id: string;
  entidade: string;
  entidadeId: string;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  autorId: string;
  autorNome: string;
  criadoEm: Date;
}

// ---------------------------------------------------------------------
// Marcador de evento sensível (ficha §4)
// ---------------------------------------------------------------------

/**
 * As quatro naturezas sensíveis que a ficha nomeia. São categorias, não
 * um booleano, porque a T28 diz ao auditor POR QUE o evento está marcado —
 * "exportação de lista" e "acesso pleno a PF" pedem leituras diferentes.
 */
export type NaturezaSensivel =
  | "ACESSO_PF"
  | "EXPORTACAO"
  | "PARAMETRO"
  | "REGRA_APROVACAO";

export const ROTULOS_NATUREZA_SENSIVEL: Readonly<Record<NaturezaSensivel, string>> = {
  ACESSO_PF: "Acesso pleno a dados pessoais",
  EXPORTACAO: "Exportação de lista",
  PARAMETRO: "Alteração de parâmetro",
  REGRA_APROVACAO: "Alteração de regra de aprovação",
};

/**
 * Campos que marcam acesso pleno a PF. O acesso é gravado pelo caso de uso
 * dos assinantes (RN30) como um evento de leitura — é o único evento da
 * trilha que não representa mutação, e por isso é nomeado, não inferido.
 */
const CAMPOS_DE_ACESSO_PF: ReadonlySet<string> = new Set([
  "acesso_dados_plenos",
]);

/** Entidades cuja simples existência de evento é exportação de dado. */
const ENTIDADES_DE_EXPORTACAO: ReadonlySet<string> = new Set([
  "exportacao_lista",
  "kit_campanha",
  // Onda 6 — o extrato da própria auditoria (RN48, meta-trilha).
  "exportacao_auditoria",
]);

/**
 * Entidades de parâmetro: tudo que o Parametrizador escreve — valores de
 * regra, metas e os itens das listas de domínio (ENTIDADE_AUDITORIA em
 * infra/parametrizador/familias.ts). A lista é declarada aqui, no domínio,
 * e um teste a confronta com o mapa das famílias: família nova que entre no
 * Parametrizador sem passar por aqui quebra o build em vez de virar um
 * evento sensível sem marcador.
 */
const ENTIDADES_DE_PARAMETRO: ReadonlySet<string> = new Set([
  "valor_regra",
  "meta_periodo",
  "meta",
  "configuracao_versao",
  // itens das listas de domínio (T15/T16)
  "indicador",
  "categoria",
  "cultura",
  "uf",
  "motivo_suspensao",
  "motivo_descarte",
  "tipo_beneficio",
  "perfil_cliente",
  "formato_peca",
]);

const ENTIDADES_DE_REGRA_APROVACAO: ReadonlySet<string> = new Set([
  "aprovacao_regra",
]);

/** Natureza sensível do evento, ou null quando é um evento comum. */
export function classificarSensibilidade(
  evento: Pick<EventoDeTrilha, "entidade" | "campo">,
): NaturezaSensivel | null {
  if (CAMPOS_DE_ACESSO_PF.has(evento.campo)) {
    return "ACESSO_PF";
  }
  if (ENTIDADES_DE_EXPORTACAO.has(evento.entidade)) {
    return "EXPORTACAO";
  }
  if (ENTIDADES_DE_PARAMETRO.has(evento.entidade)) {
    return "PARAMETRO";
  }
  if (ENTIDADES_DE_REGRA_APROVACAO.has(evento.entidade)) {
    return "REGRA_APROVACAO";
  }
  return null;
}

export function eSensivel(evento: Pick<EventoDeTrilha, "entidade" | "campo">): boolean {
  return classificarSensibilidade(evento) !== null;
}

/** Só para o teste de cobertura das famílias do Parametrizador. */
export function entidadesDeParametro(): ReadonlySet<string> {
  return ENTIDADES_DE_PARAMETRO;
}

// ---------------------------------------------------------------------
// Visão antes → depois (ficha §4)
// ---------------------------------------------------------------------

/**
 * Uma linha da comparação em duas colunas. `mudou` é o que a T28 destaca:
 * num evento cujo valor é um JSON de vários campos, destacar tudo é o mesmo
 * que não destacar nada.
 */
export interface LinhaDeDiferenca {
  rotulo: string;
  antes: string | null;
  depois: string | null;
  mudou: boolean;
}

function tentarJson(valor: string | null): Record<string, unknown> | null {
  if (valor === null) {
    return null;
  }
  const texto = valor.trim();
  if (!texto.startsWith("{")) {
    return null;
  }
  try {
    const analisado: unknown = JSON.parse(texto);
    if (analisado !== null && typeof analisado === "object" && !Array.isArray(analisado)) {
      return analisado as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (typeof valor === "string") {
    return valor;
  }
  return JSON.stringify(valor);
}

/**
 * Decompõe o evento nas linhas da comparação.
 *
 * Evento de campo simples vira uma linha só. Evento cujo valor é um objeto
 * JSON — o padrão de criação em bloco usado por várias fases — vira uma
 * linha por chave, com as chaves de ambos os lados unidas e em ordem
 * estável, para que a coluna "antes" e a coluna "depois" fiquem alinhadas.
 */
export function montarDiferenca(
  evento: Pick<EventoDeTrilha, "campo" | "valorAnterior" | "valorNovo">,
): LinhaDeDiferenca[] {
  const antesJson = tentarJson(evento.valorAnterior);
  const depoisJson = tentarJson(evento.valorNovo);

  if (!antesJson && !depoisJson) {
    return [
      {
        rotulo: evento.campo,
        antes: evento.valorAnterior,
        depois: evento.valorNovo,
        mudou: evento.valorAnterior !== evento.valorNovo,
      },
    ];
  }

  const chaves = [
    ...new Set([...Object.keys(antesJson ?? {}), ...Object.keys(depoisJson ?? {})]),
  ].sort();

  return chaves.map((chave) => {
    const antes = texto(antesJson?.[chave]);
    const depois = texto(depoisJson?.[chave]);
    return { rotulo: chave, antes, depois, mudou: antes !== depois };
  });
}

/** Criação (sem valor anterior) — a T28 rotula em vez de mostrar coluna vazia. */
export function eCriacao(
  evento: Pick<EventoDeTrilha, "valorAnterior" | "valorNovo">,
): boolean {
  return evento.valorAnterior === null && evento.valorNovo !== null;
}

// ---------------------------------------------------------------------
// Extrato CSV (RN48)
// ---------------------------------------------------------------------

export const COLUNAS_EXTRATO: ReadonlyArray<string> = [
  "data_hora_utc",
  "entidade",
  "registro_id",
  "campo",
  "valor_anterior",
  "valor_novo",
  "autor",
  "autor_id",
  "sensivel",
];

/** Escapa um campo para CSV com separador `;` — mesma convenção da F4/F11. */
function campoCsv(valor: string | null): string {
  const conteudo = valor ?? "";
  return /[";\n\r]/.test(conteudo) ? `"${conteudo.replace(/"/g, '""')}"` : conteudo;
}

/**
 * Serializa o extrato para auditoria externa.
 *
 * A data sai em ISO/UTC e a coluna é nomeada `data_hora_utc`: extrato de
 * auditoria atravessa fuso e ferramenta, e uma data sem fuso declarado é
 * uma data que o auditor externo vai ler errado.
 *
 * A coluna `sensivel` carrega a natureza, não um "sim": o marcador da tela
 * e o do arquivo dizem a mesma coisa.
 */
export function serializarExtratoCsv(eventos: ReadonlyArray<EventoDeTrilha>): string {
  const linhas = [COLUNAS_EXTRATO.join(";")];
  for (const evento of eventos) {
    linhas.push(
      [
        evento.criadoEm.toISOString(),
        evento.entidade,
        evento.entidadeId,
        evento.campo,
        evento.valorAnterior,
        evento.valorNovo,
        evento.autorNome,
        evento.autorId,
        classificarSensibilidade(evento) ?? "",
      ]
        .map(campoCsv)
        .join(";"),
    );
  }
  return `${linhas.join("\n")}\n`;
}

/** Nome do arquivo do extrato, estável e ordenável. */
export function nomeArquivoExtrato(geradoEm: Date): string {
  const carimbo = geradoEm.toISOString().replace(/[:.]/g, "-");
  return `extrato-auditoria-${carimbo}.csv`;
}
