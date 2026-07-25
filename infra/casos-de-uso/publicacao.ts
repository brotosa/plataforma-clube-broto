import type { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  GenericJsonCsvAdapter,
  type ArquivoExportado,
  type DiffPublicacao,
  type ExportAdapter,
  type ItemPublicavel,
  type PacoteExport,
  calcularDiffPublicacao,
} from "@/dominio/integracao/export";
import type { MecanicaSlug } from "@/dominio/ofertas/regras";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Publicação (export batch), ficha §6: o Gestor gera o pacote dos itens
 * publicáveis pelo ExportAdapter em uso, registra a publicação com diff
 * (RN10), limpa as flags *Pendente de republicação* e inclui as
 * despublicações em cascata (RN04 — ofertas que saíram do conjunto
 * publicável). Tudo dentro de uma transação e auditado.
 */

function numero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}

function dataIso(valor: Date): string {
  return valor.toISOString().slice(0, 10);
}

function comoPacote(valor: Prisma.JsonValue | null | undefined): PacoteExport | null {
  if (valor && typeof valor === "object" && !Array.isArray(valor) && "itens" in valor) {
    return valor as unknown as PacoteExport;
  }
  return null;
}

export interface ResultadoPublicacao {
  publicacaoId: string;
  adapter: string;
  itensPublicados: number;
  despublicacoes: number;
  flagsLimpas: number;
  diff: DiffPublicacao;
  arquivos: ArquivoExportado[];
}

export async function publicarCatalogo(
  ator: Ator,
  adapter: ExportAdapter = new GenericJsonCsvAdapter(),
): Promise<ResultadoPublicacao> {
  exigirPermissao(ator.papel, "GERAR_EXPORTACAO");

  const [publicadas, anteriorRegistro] = await Promise.all([
    prisma.oferta.findMany({
      where: { status: "PUBLICADA" },
      include: {
        mecanica: true,
        tipoBeneficio: true,
        solucao: { include: { categoria: true, empresa: true } },
      },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.publicacao.findFirst({ orderBy: { criadoEm: "desc" } }),
  ]);

  const itensPublicar: ItemPublicavel[] = publicadas.map((oferta) => ({
    acao: "PUBLICAR",
    idOferta: oferta.id,
    idExternoMinutrade: oferta.idExternoMinutrade,
    aliado: oferta.solucao.empresa.nomeFantasia ?? "",
    idSellerExterno: oferta.solucao.empresa.idExternoMinutrade,
    solucao: oferta.solucao.nome,
    categoria: oferta.solucao.categoria?.nome ?? null,
    titulo: oferta.titulo,
    natureza: oferta.natureza,
    tipoBeneficio: oferta.tipoBeneficio.slug,
    mecanica: oferta.mecanica.slug as MecanicaSlug,
    precoDe: numero(oferta.precoDe),
    precoPor: numero(oferta.precoPor),
    cupomCodigoRegras: oferta.cupomCodigoRegras,
    vigenciaInicio: dataIso(oferta.vigenciaInicio),
    vigenciaFim: oferta.vigenciaFim ? dataIso(oferta.vigenciaFim) : null,
    status: oferta.status,
  }));

  const anterior = comoPacote(anteriorRegistro?.pacote);
  const geradoEm = new Date().toISOString();
  const diff = calcularDiffPublicacao(anterior, { geradoEm, itens: itensPublicar });

  // Despublicações em cascata (RN04): o que estava publicado e saiu.
  const itensAnteriores = new Map(
    (anterior?.itens ?? []).map((item) => [item.idOferta, item] as const),
  );
  const despublicar: ItemPublicavel[] = diff.removidas
    .map((id) => itensAnteriores.get(id))
    .filter((item): item is ItemPublicavel => Boolean(item))
    .map((item) => ({ ...item, acao: "DESPUBLICAR" }));

  const pacote: PacoteExport = { geradoEm, itens: [...itensPublicar, ...despublicar] };
  if (pacote.itens.length === 0) {
    throw new ErroDeValidacao([
      "Nada a publicar: não há ofertas publicadas nem despublicações pendentes.",
    ]);
  }

  const arquivos = adapter.serializar(pacote);
  const idsParaLimpar = publicadas.filter((o) => o.pendenteRepublicacao).map((o) => o.id);

  const publicacaoId = await prisma.$transaction(async (tx) => {
    const gravador = criarGravadorPrisma(tx);
    const publicacao = await tx.publicacao.create({
      data: {
        autorId: ator.id,
        adapter: adapter.nome,
        pacote: pacote as unknown as Prisma.InputJsonValue,
        diff: diff as unknown as Prisma.InputJsonValue,
      },
    });
    await registrarMutacao(gravador, {
      entidade: "publicacao",
      entidadeId: publicacao.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        adapter: adapter.nome,
        itensPublicados: itensPublicar.length,
        despublicacoes: despublicar.length,
        adicionadas: diff.adicionadas.length,
        alteradas: diff.alteradas.length,
        removidas: diff.removidas.length,
      },
    });

    // RN10 — o export limpa as flags Pendente de republicação (auditado).
    for (const ofertaId of idsParaLimpar) {
      await tx.oferta.update({
        where: { id: ofertaId },
        data: { pendenteRepublicacao: false },
      });
      await registrarMutacao(gravador, {
        entidade: "oferta",
        entidadeId: ofertaId,
        autorId: ator.id,
        anterior: { pendenteRepublicacao: true },
        novo: { pendenteRepublicacao: false },
      });
    }
    return publicacao.id;
  });

  return {
    publicacaoId,
    adapter: adapter.nome,
    itensPublicados: itensPublicar.length,
    despublicacoes: despublicar.length,
    flagsLimpas: idsParaLimpar.length,
    diff,
    arquivos,
  };
}

/** Histórico de publicações para a tela de integração. */
export async function historicoPublicacoes(limite = 20) {
  const registros = await prisma.publicacao.findMany({
    orderBy: { criadoEm: "desc" },
    take: limite,
    include: { autor: { select: { nome: true } } },
  });
  return registros.map((registro) => {
    const pacote = comoPacote(registro.pacote);
    const diff = (registro.diff as unknown as DiffPublicacao | null) ?? null;
    const itens = pacote?.itens ?? [];
    return {
      id: registro.id,
      adapter: registro.adapter,
      autor: registro.autor.nome,
      criadoEm: registro.criadoEm,
      totalItens: itens.length,
      publicados: itens.filter((item) => item.acao === "PUBLICAR").length,
      despublicados: itens.filter((item) => item.acao === "DESPUBLICAR").length,
      diff,
    };
  });
}

/** Regenera os arquivos de uma publicação (download posterior) a partir do pacote. */
export async function arquivosDaPublicacao(
  publicacaoId: string,
  adapter: ExportAdapter = new GenericJsonCsvAdapter(),
): Promise<ArquivoExportado[]> {
  const registro = await prisma.publicacao.findUniqueOrThrow({ where: { id: publicacaoId } });
  const pacote = comoPacote(registro.pacote);
  if (!pacote) {
    throw new ErroDeValidacao(["Pacote da publicação indisponível."]);
  }
  return adapter.serializar(pacote);
}
