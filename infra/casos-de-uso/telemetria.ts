import { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  ErroDeLayoutTelemetria,
  lerCsvTelemetria,
  validarLinhaTelemetria,
} from "@/dominio/integracao/telemetria";
import { hashCpf } from "@/infra/integracao/hash-cpf";
import { logger } from "@/infra/log/logger";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Importação de telemetria (Minutrade → Broto), ficha §6: parser do layout
 * alvo, validação linha a linha, quarentena com motivo, idempotência por
 * UNIQUE(idVoucher, tipo) e relatório pós-carga. Telemetria é fato imutável
 * (RN07): a reimportação nunca edita — só ignora duplicatas.
 */

/**
 * Entidade da trilha para esta importação.
 *
 * Nasceu numa varredura de auditoria: esta importação gravava procedência em
 * `Importacao` (autor, arquivo, linhas ok/erro) e **não aparecia na T28** — a
 * trilha da RN49 não a via. A da operadora (Onda 12) sempre apareceu, com
 * `ImportacaoTelemetria`. Duas importações de telemetria, e só uma visível
 * para quem audita: quem procurasse encontraria uma e concluiria que a outra
 * não aconteceu.
 *
 * O nome distingue as duas de propósito: esta é a do layout da Onda 1
 * (Minutrade → Broto, por voucher), aquela é a dos quatro relatórios da F20.
 */
const ENTIDADE_IMPORTACAO = "ImportacaoTelemetriaVoucher";

export interface RelatorioTelemetria {
  importacaoId: string;
  totalLinhas: number;
  importados: number;
  duplicados: number;
  emQuarentena: number;
  semVinculoOferta: number;
  quarentena: Array<{ linha: number; motivos: string[] }>;
}

export async function importarTelemetria(
  ator: Ator,
  arquivo: { nomeArquivo: string; conteudo: string },
): Promise<RelatorioTelemetria> {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");

  let linhas;
  try {
    linhas = lerCsvTelemetria(arquivo.conteudo);
  } catch (erro) {
    if (erro instanceof ErroDeLayoutTelemetria) {
      throw new ErroDeValidacao([erro.message]);
    }
    throw erro;
  }

  const quarentena: Array<{ linha: number; motivos: string[] }> = [];
  const validas = linhas.filter((linha) => {
    const motivos = validarLinhaTelemetria(linha);
    if (motivos.length > 0) {
      quarentena.push({ linha: linha.linha, motivos });
      return false;
    }
    return true;
  });

  // Resolução da oferta pelo id externo (evento fica rastreável mesmo sem vínculo).
  const idsOfertaExterno = [
    ...new Set(validas.map((l) => l.idOfertaExterno).filter((v): v is string => Boolean(v))),
  ];
  const ofertas = idsOfertaExterno.length
    ? await prisma.oferta.findMany({
        where: { idExternoMinutrade: { in: idsOfertaExterno } },
        select: { id: true, idExternoMinutrade: true },
      })
    : [];
  const ofertaPorIdExterno = new Map(
    ofertas.map((o) => [o.idExternoMinutrade ?? "", o.id] as const),
  );

  let semVinculoOferta = 0;
  const eventos = validas.flatMap((linha) => {
    const { idVoucher, tipo, dataEvento } = linha;
    if (!idVoucher || !tipo || !dataEvento) return []; // garantido pela validação
    const ofertaId = linha.idOfertaExterno
      ? ofertaPorIdExterno.get(linha.idOfertaExterno) ?? null
      : null;
    if (linha.idOfertaExterno && !ofertaId) {
      semVinculoOferta += 1;
    }
    return [
      {
        idVoucher,
        tipo,
        cpfHash: linha.cpf ? hashCpf(linha.cpf) : null,
        valor: linha.valor,
        dataEvento,
        canal: linha.canal,
        idSellerExterno: linha.idSellerExterno,
        idOfertaExterno: linha.idOfertaExterno,
        ofertaId,
        arquivoOrigem: arquivo.nomeArquivo,
      },
    ];
  });

  const relatorio = await prisma.$transaction(async (tx) => {
    const importacao = await tx.importacao.create({
      data: { tipo: "TELEMETRIA", nomeArquivo: arquivo.nomeArquivo, autorId: ator.id },
    });
    // createMany + skipDuplicates: idempotência (RN07 — nunca edita fatos).
    const resultado = await tx.telemetriaEvento.createMany({
      data: eventos.map((evento) => ({ ...evento, importacaoId: importacao.id })),
      skipDuplicates: true,
    });
    const importados = resultado.count;
    const duplicados = eventos.length - importados;
    await tx.importacao.update({
      where: { id: importacao.id },
      data: {
        linhasOk: importados,
        linhasErro: quarentena.length,
        relatorioQuarentena:
          quarentena.length > 0
            ? (quarentena as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    /*
     * A trilha, no mesmo desenho da importação da operadora (F20): evento de
     * ATO, escrito à mão, e não diff de campos. O diff genérico não serviria
     * aqui — não há estado anterior de uma importação que acabou de nascer, e
     * o que importa registrar é o que ENTROU, não o que mudou.
     *
     * Sem dado de dentro do arquivo: nome, contagens e o identificador. O CPF
     * que a carga hasheia nunca atravessa esta chamada — a disciplina é a
     * mesma da RN69.
     */
    await criarGravadorPrisma(tx).gravar([
      {
        entidade: ENTIDADE_IMPORTACAO,
        entidadeId: importacao.id,
        campo: "importacao",
        valorAnterior: null,
        valorNovo: JSON.stringify({
          nomeArquivo: arquivo.nomeArquivo,
          totalLinhas: linhas.length,
          importados,
          duplicados,
          emQuarentena: quarentena.length,
          semVinculoOferta,
        }),
        autorId: ator.id,
      },
    ]);

    return {
      importacaoId: importacao.id,
      totalLinhas: linhas.length,
      importados,
      duplicados,
      emQuarentena: quarentena.length,
      semVinculoOferta,
      quarentena,
    } satisfies RelatorioTelemetria;
  });

  logger.info(
    {
      arquivo: arquivo.nomeArquivo,
      importados: relatorio.importados,
      duplicados: relatorio.duplicados,
      quarentena: relatorio.emQuarentena,
      semVinculo: relatorio.semVinculoOferta,
    },
    "telemetria importada",
  );
  return relatorio;
}
