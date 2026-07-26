import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  nomeArquivoExtrato,
  serializarExtratoCsv,
} from "@/dominio/auditoria/extrato";
import { type FiltrosAuditoria, eventosParaExtrato } from "@/infra/consultas/auditoria";
import type { Ator } from "./contexto";

/**
 * Exportação do extrato de auditoria (Onda 6, RN48).
 *
 * Duas exigências da regra, ambas cumpridas aqui:
 *  1. exige papel Gestor ou Administrador;
 *  2. **é ela própria auditada** — a meta-trilha. Quem tirou a trilha do
 *     produto, quando, com que filtros e quantas linhas levou fica
 *     registrado, e o evento nasce classificado como sensível (a entidade
 *     `exportacao_auditoria` está na lista de exportações do domínio).
 *
 * O evento é gravado na MESMA transação em que o extrato é montado? Não:
 * o extrato é leitura pura e a gravação é o registro do ato. Elas são
 * sequenciais de propósito — se a gravação falhar, o arquivo não sai, e é
 * essa a ordem certa: exportação sem trilha é exatamente o que a RN48
 * proíbe.
 */
export interface ExtratoGerado {
  csv: string;
  nomeArquivo: string;
  linhas: number;
  total: number;
  truncado: boolean;
}

export async function exportarExtratoDeAuditoria(
  ator: Ator,
  filtros: FiltrosAuditoria = {},
  geradoEm: Date = new Date(),
): Promise<ExtratoGerado> {
  exigirPermissao(ator.papel, "EXPORTAR_EXTRATO_AUDITORIA");

  const { eventos, total, truncado } = await eventosParaExtrato(filtros);
  const csv = serializarExtratoCsv(eventos);
  const nomeArquivo = nomeArquivoExtrato(geradoEm);

  await prisma.$transaction(async (tx) => {
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "exportacao_auditoria",
      // Não há tabela de exportações de auditoria: o registro É o evento, e
      // o nome do arquivo é o identificador que o auditor externo tem em mãos.
      entidadeId: nomeArquivo,
      autorId: ator.id,
      anterior: null,
      novo: {
        filtros: JSON.stringify(filtros),
        linhasExportadas: eventos.length,
        totalNoFiltro: total,
        truncado,
        finalidade: "extrato para auditoria externa (RN48)",
      },
    });
  });

  return { csv, nomeArquivo, linhas: eventos.length, total, truncado };
}
