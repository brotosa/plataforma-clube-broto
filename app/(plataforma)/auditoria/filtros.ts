import { ROTULOS_TIPO_EVENTO, type TipoDeEvento } from "@/dominio/auditoria/extrato";
import type { FiltrosAuditoria } from "@/infra/consultas/auditoria";

/**
 * Tradução da querystring da T28 para os filtros da consulta. Vive num
 * módulo próprio porque a tela e a rota do extrato precisam interpretar os
 * MESMOS parâmetros do mesmo jeito — o arquivo exportado tem de bater com o
 * que a pessoa estava vendo.
 */

/** Períodos do filtro, em dias. 0 = tudo (sem corte). */
export const PERIODOS_AUDITORIA = [
  { valor: "7", rotulo: "Últimos 7 dias", dias: 7 },
  { valor: "30", rotulo: "Últimos 30 dias", dias: 30 },
  { valor: "90", rotulo: "Últimos 90 dias", dias: 90 },
  { valor: "tudo", rotulo: "Tudo", dias: 0 },
] as const;

export const TIPOS_DE_EVENTO = Object.entries(ROTULOS_TIPO_EVENTO) as ReadonlyArray<
  [TipoDeEvento, string]
>;

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

export function filtrosDaQuerystring(
  parametros: Record<string, string | string[] | undefined>,
): FiltrosAuditoria {
  const tipoBruto = texto(parametros.tipo);
  const tipo =
    tipoBruto && tipoBruto in ROTULOS_TIPO_EVENTO ? (tipoBruto as TipoDeEvento) : undefined;

  const periodo = texto(parametros.periodo) ?? "30";
  const dias = PERIODOS_AUDITORIA.find((opcao) => opcao.valor === periodo)?.dias ?? 30;

  const paginaBruta = Number(texto(parametros.pagina) ?? "1");
  const pagina = Number.isFinite(paginaBruta) && paginaBruta > 0 ? Math.floor(paginaBruta) : 1;

  return {
    ...(texto(parametros.entidade) ? { entidade: texto(parametros.entidade) } : {}),
    ...(texto(parametros.registro) ? { registro: texto(parametros.registro) } : {}),
    ...(texto(parametros.autor) ? { autorId: texto(parametros.autor) } : {}),
    ...(tipo ? { tipo } : {}),
    ...(dias > 0 ? { dias } : {}),
    pagina,
  };
}

/** Querystring atual sem a página — base para os links de paginação. */
export function querystringDosFiltros(
  parametros: Record<string, string | string[] | undefined>,
): string {
  const busca = new URLSearchParams();
  for (const chave of ["entidade", "registro", "autor", "tipo", "periodo"]) {
    const valor = texto(parametros[chave]);
    if (valor) {
      busca.set(chave, valor);
    }
  }
  return busca.toString();
}
