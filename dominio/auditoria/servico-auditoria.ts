/**
 * Serviço de auditoria da plataforma (transversal obrigatório).
 *
 * Toda mutação de entidade de negócio grava um evento por campo alterado,
 * com valor anterior, valor novo, autor e timestamp. É chamado pelas
 * camadas de escrita (nunca trigger de banco), dentro da mesma transação
 * da mutação. Nada é excluído fisicamente após a primeira publicação
 * (RN05): encerramentos/inativações também passam por aqui como mudança
 * de status.
 */

/** Um evento de auditoria pronto para persistência. */
export interface EventoAuditoria {
  entidade: string;
  entidadeId: string;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  autorId: string;
}

/** Porta de persistência (implementação Prisma em infra/auditoria). */
export interface GravadorAuditoria {
  gravar(eventos: ReadonlyArray<EventoAuditoria>): Promise<void>;
}

/** Estado de entidade como visto pelas camadas de escrita. */
export type EstadoEntidade = Record<string, unknown>;

/** Campos de infraestrutura que nunca geram evento de auditoria. */
const CAMPOS_IGNORADOS_PADRAO: ReadonlyArray<string> = [
  "criadoEm",
  "atualizadoEm",
];

/**
 * Serializa um valor de campo para armazenamento uniforme (texto).
 * null/undefined viram null (campo ausente/limpo); Date vira ISO;
 * Decimal/BigInt e objetos viram sua representação JSON estável.
 */
export function serializarValor(valor: unknown): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  if (typeof valor === "string") {
    return valor;
  }
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (typeof valor === "bigint") {
    return valor.toString();
  }
  if (Array.isArray(valor)) {
    return JSON.stringify(valor);
  }
  // Prisma.Decimal e semelhantes: preferir a representação própria
  const possuiToString =
    typeof valor === "object" &&
    valor !== null &&
    "toString" in valor &&
    valor.toString !== Object.prototype.toString;
  if (possuiToString) {
    return String(valor);
  }
  return JSON.stringify(valor);
}

/**
 * Calcula os eventos de auditoria entre dois estados de uma entidade.
 *
 * - Criação: `anterior = null` → um evento por campo preenchido do novo.
 * - Edição: um evento por campo cujo valor serializado mudou.
 * - Campos de infraestrutura (criadoEm/atualizadoEm) são ignorados.
 */
export function calcularEventos(parametros: {
  entidade: string;
  entidadeId: string;
  autorId: string;
  anterior: EstadoEntidade | null;
  novo: EstadoEntidade;
  camposIgnorados?: ReadonlyArray<string>;
}): EventoAuditoria[] {
  const { entidade, entidadeId, autorId, anterior, novo } = parametros;
  const ignorados = new Set([
    ...CAMPOS_IGNORADOS_PADRAO,
    ...(parametros.camposIgnorados ?? []),
  ]);

  const campos = new Set([
    ...Object.keys(anterior ?? {}),
    ...Object.keys(novo),
  ]);

  const eventos: EventoAuditoria[] = [];
  for (const campo of campos) {
    if (ignorados.has(campo)) {
      continue;
    }
    const valorAnterior = serializarValor(anterior?.[campo]);
    const valorNovo = serializarValor(novo[campo]);
    if (valorAnterior === valorNovo) {
      continue;
    }
    eventos.push({ entidade, entidadeId, campo, valorAnterior, valorNovo, autorId });
  }
  return eventos;
}

/**
 * Registra a mutação de uma entidade de negócio: calcula as diferenças e
 * as persiste pelo gravador informado (na transação da própria mutação).
 * Retorna os eventos gravados — vazio quando nada mudou.
 */
export async function registrarMutacao(
  gravador: GravadorAuditoria,
  parametros: {
    entidade: string;
    entidadeId: string;
    autorId: string;
    anterior: EstadoEntidade | null;
    novo: EstadoEntidade;
    camposIgnorados?: ReadonlyArray<string>;
  },
): Promise<EventoAuditoria[]> {
  if (!parametros.autorId) {
    throw new Error(
      "Auditoria exige autor: toda mutação de entidade de negócio deve informar autorId.",
    );
  }
  const eventos = calcularEventos(parametros);
  if (eventos.length > 0) {
    await gravador.gravar(eventos);
  }
  return eventos;
}
