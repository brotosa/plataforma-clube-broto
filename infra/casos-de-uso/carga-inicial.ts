import path from "node:path";
import { Prisma, type EstadoStaging } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import {
  chaveAgrupamento,
  inferirPrecos,
  mapearCheckout,
  mapearStatusOferta,
  validarLinhaOferta,
  validarLinhaSeller,
} from "@/dominio/carga-inicial/mapeamento";
import {
  lerPlanilhaOfertas,
  lerPlanilhaSellers,
} from "@/infra/carga-inicial/leitor-planilhas";
import { logger } from "@/infra/log/logger";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Carga inicial (F3): planilhas reais → staging → tela de conferência →
 * efetivação transacional (ficha §7). Nada entra no cadastro-mestre sem
 * passar pela conferência; campos ausentes ficam pendentes e alimentam a
 * régua de completude (RN09).
 */

const ARQUIVO_SELLERS = "Lista_de_Sellers_1.xlsx";
const ARQUIVO_OFERTAS = "Lista_de_Ofertas_3.xlsx";

function caminhoDados(arquivo: string): string {
  return path.join(process.cwd(), "dados", arquivo);
}

/**
 * Lê as planilhas e povoa o staging. Uma nova carga substitui o staging
 * anterior ainda não efetivado (a conferência recomeça do zero).
 */
export async function iniciarCarga(ator: Ator) {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");

  const [sellers, ofertas] = await Promise.all([
    lerPlanilhaSellers(caminhoDados(ARQUIVO_SELLERS)),
    lerPlanilhaOfertas(caminhoDados(ARQUIVO_OFERTAS)),
  ]);
  const idsSellers = new Set(sellers.map(({ campos }) => campos.idSellerExterno));

  return prisma.$transaction(async (tx) => {
    // Substitui staging não efetivado de cargas anteriores
    await tx.stagingOferta.deleteMany({ where: { estado: { not: "EFETIVADA" } } });
    await tx.stagingAgrupamento.deleteMany({ where: { estado: { not: "EFETIVADA" } } });
    await tx.stagingSeller.deleteMany({ where: { estado: { not: "EFETIVADA" } } });

    const quarentenaSellers: Array<{ linha: number; motivos: string[] }> = [];
    const importacaoSellers = await tx.importacao.create({
      data: {
        tipo: "CARGA_SELLERS",
        nomeArquivo: ARQUIVO_SELLERS,
        autorId: ator.id,
      },
    });
    for (const { campos, dadosOriginais } of sellers) {
      const motivos = validarLinhaSeller(campos);
      if (motivos.length > 0) {
        quarentenaSellers.push({ linha: campos.linha, motivos });
      }
      await tx.stagingSeller.create({
        data: {
          importacaoId: importacaoSellers.id,
          linhaOrigem: campos.linha,
          dadosOriginais: dadosOriginais as Prisma.InputJsonValue,
          nomeSeller: campos.nomeSeller || null,
          idSellerExterno: campos.idSellerExterno || null,
          dataEntrada: campos.dataEntrada,
          estado: motivos.length > 0 ? "REJEITADA" : "PENDENTE",
          mensagemErro: motivos.length > 0 ? motivos.join("; ") : null,
        },
      });
    }

    const quarentenaOfertas: Array<{ linha: number; motivos: string[] }> = [];
    const importacaoOfertas = await tx.importacao.create({
      data: {
        tipo: "CARGA_OFERTAS",
        nomeArquivo: ARQUIVO_OFERTAS,
        autorId: ator.id,
      },
    });
    const agrupamentosPorChave = new Map<string, string>();
    for (const { campos, dadosOriginais } of ofertas) {
      const motivos = validarLinhaOferta(campos, idsSellers);
      if (motivos.length > 0) {
        quarentenaOfertas.push({ linha: campos.linha, motivos });
      }

      let agrupamentoId: string | null = null;
      if (motivos.length === 0) {
        const chave = chaveAgrupamento(campos.idSellerExterno, campos.produto);
        agrupamentoId = agrupamentosPorChave.get(chave) ?? null;
        if (!agrupamentoId) {
          const agrupamento = await tx.stagingAgrupamento.create({
            data: {
              importacaoId: importacaoOfertas.id,
              chaveHeuristica: chave,
              nomeSolucaoProposto: campos.produto,
            },
          });
          agrupamentoId = agrupamento.id;
          agrupamentosPorChave.set(chave, agrupamentoId);
        }
      }

      await tx.stagingOferta.create({
        data: {
          importacaoId: importacaoOfertas.id,
          linhaOrigem: campos.linha,
          dadosOriginais: dadosOriginais as Prisma.InputJsonValue,
          produto: campos.produto || null,
          checkout: campos.checkout || null,
          preco: String(campos.preco),
          desconto: String(campos.desconto),
          precoFinal: String(campos.precoFinal),
          statusOferta: campos.statusOferta || null,
          resgates: campos.resgates,
          compras: campos.compras,
          idSellerExterno: campos.idSellerExterno || null,
          agrupamentoId,
          estado: motivos.length > 0 ? "REJEITADA" : "PENDENTE",
          mensagemErro: motivos.length > 0 ? motivos.join("; ") : null,
        },
      });
    }

    await tx.importacao.update({
      where: { id: importacaoSellers.id },
      data: {
        linhasOk: sellers.length - quarentenaSellers.length,
        linhasErro: quarentenaSellers.length,
        relatorioQuarentena:
          quarentenaSellers.length > 0
            ? (quarentenaSellers as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
    await tx.importacao.update({
      where: { id: importacaoOfertas.id },
      data: {
        linhasOk: ofertas.length - quarentenaOfertas.length,
        linhasErro: quarentenaOfertas.length,
        relatorioQuarentena:
          quarentenaOfertas.length > 0
            ? (quarentenaOfertas as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });

    logger.info(
      {
        sellers: sellers.length,
        ofertas: ofertas.length,
        quarentena: quarentenaSellers.length + quarentenaOfertas.length,
      },
      "carga inicial: staging povoado",
    );
    return {
      importacaoSellersId: importacaoSellers.id,
      importacaoOfertasId: importacaoOfertas.id,
      sellers: sellers.length,
      ofertas: ofertas.length,
      quarentena: quarentenaSellers.length + quarentenaOfertas.length,
    };
  }, { timeout: 60_000 });
}

/** Conferência: staging corrente (não efetivado) agrupado para a tela. */
export async function conferenciaAtual() {
  const [sellers, agrupamentos, ofertasSemAgrupamento, efetivadas] = await Promise.all([
    prisma.stagingSeller.findMany({
      where: { estado: { not: "EFETIVADA" } },
      orderBy: { linhaOrigem: "asc" },
    }),
    prisma.stagingAgrupamento.findMany({
      where: { estado: { not: "EFETIVADA" } },
      orderBy: { nomeSolucaoProposto: "asc" },
      include: { ofertas: { orderBy: { linhaOrigem: "asc" } } },
    }),
    prisma.stagingOferta.findMany({
      where: { estado: { not: "EFETIVADA" }, agrupamentoId: null },
      orderBy: { linhaOrigem: "asc" },
    }),
    prisma.stagingSeller.count({ where: { estado: "EFETIVADA" } }),
  ]);
  return { sellers, agrupamentos, ofertasSemAgrupamento, jaEfetivadas: efetivadas };
}

/** Aprova/rejeita sellers do staging (em lote ou item a item). */
export async function decidirSellers(
  ator: Ator,
  ids: string[],
  estado: Extract<EstadoStaging, "APROVADA" | "REJEITADA" | "PENDENTE">,
) {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");
  await prisma.stagingSeller.updateMany({
    where: { id: { in: ids }, estado: { not: "EFETIVADA" } },
    data: { estado },
  });
}

/** Aprova/rejeita agrupamentos (as ofertas seguem o agrupamento). */
export async function decidirAgrupamentos(
  ator: Ator,
  ids: string[],
  estado: Extract<EstadoStaging, "APROVADA" | "REJEITADA" | "PENDENTE">,
) {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");
  await prisma.$transaction([
    prisma.stagingAgrupamento.updateMany({
      where: { id: { in: ids }, estado: { not: "EFETIVADA" } },
      data: { estado },
    }),
    prisma.stagingOferta.updateMany({
      where: { agrupamentoId: { in: ids }, estado: { not: "EFETIVADA" } },
      data: { estado },
    }),
  ]);
}

/** Aprova tudo o que está pendente (sellers e agrupamentos válidos). */
export async function aprovarTudo(ator: Ator) {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");
  await prisma.$transaction([
    prisma.stagingSeller.updateMany({
      where: { estado: "PENDENTE" },
      data: { estado: "APROVADA" },
    }),
    prisma.stagingAgrupamento.updateMany({
      where: { estado: "PENDENTE" },
      data: { estado: "APROVADA" },
    }),
    prisma.stagingOferta.updateMany({
      where: { estado: "PENDENTE", agrupamentoId: { not: null } },
      data: { estado: "APROVADA" },
    }),
  ]);
}

/** Ajusta o nome de solução proposto pela heurística. */
export async function renomearAgrupamento(ator: Ator, agrupamentoId: string, nome: string) {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");
  if (!nome.trim()) {
    throw new ErroDeValidacao(["O nome da solução não pode ficar vazio."]);
  }
  await prisma.stagingAgrupamento.update({
    where: { id: agrupamentoId },
    data: { nomeSolucaoProposto: nome.trim() },
  });
}

/** Move uma oferta para outro agrupamento do MESMO seller. */
export async function moverOferta(ator: Ator, stagingOfertaId: string, agrupamentoDestinoId: string) {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");
  const [oferta, destino] = await Promise.all([
    prisma.stagingOferta.findUniqueOrThrow({ where: { id: stagingOfertaId } }),
    prisma.stagingAgrupamento.findUniqueOrThrow({
      where: { id: agrupamentoDestinoId },
      include: { ofertas: { select: { idSellerExterno: true }, take: 1 } },
    }),
  ]);
  const sellerDoDestino = destino.chaveHeuristica.split("::")[0];
  if (oferta.idSellerExterno !== sellerDoDestino) {
    throw new ErroDeValidacao([
      "A oferta só pode ser movida para um agrupamento do mesmo seller.",
    ]);
  }
  await prisma.stagingOferta.update({
    where: { id: stagingOfertaId },
    data: { agrupamentoId: agrupamentoDestinoId },
  });
}

export interface ResultadoEfetivacao {
  empresasCriadas: number;
  solucoesCriadas: number;
  ofertasCriadas: number;
  acumuladosGravados: number;
}

/**
 * Efetivação transacional: sellers APROVADOS viram Empresas (Aliada
 * ativa), agrupamentos APROVADOS viram Soluções, suas ofertas viram
 * Ofertas com status mapeado, e Resgates/Compras viram o acumulado
 * histórico ("até a data da carga"). Tudo auditado. Reexecutável: upsert
 * por id externo (idempotência da reimportação).
 */
export async function efetivarCarga(ator: Ator): Promise<ResultadoEfetivacao> {
  exigirPermissao(ator.papel, "IMPORTAR_TELEMETRIA");

  const [sellersAprovados, agrupamentosAprovados] = await Promise.all([
    prisma.stagingSeller.findMany({ where: { estado: "APROVADA" } }),
    prisma.stagingAgrupamento.findMany({
      where: { estado: "APROVADA" },
      include: { ofertas: { where: { estado: "APROVADA" } } },
    }),
  ]);
  if (sellersAprovados.length === 0) {
    throw new ErroDeValidacao([
      "Nada aprovado para efetivar — aprove sellers (e agrupamentos) na conferência.",
    ]);
  }

  const [tipos, mecanicas] = await Promise.all([
    prisma.tipoBeneficio.findMany(),
    prisma.mecanica.findMany(),
  ]);
  const tipoPorSlug = new Map(tipos.map((tipo) => [tipo.slug, tipo.id]));
  const mecanicaPorSlug = new Map(mecanicas.map((mecanica) => [mecanica.slug, mecanica.id]));
  // "Acumulado até a data da carga": corte no dia (o campo é @db.Date)
  const dataCorte = new Date();
  dataCorte.setUTCHours(0, 0, 0, 0);

  return prisma.$transaction(async (tx) => {
    const gravador = criarGravadorPrisma(tx);
    const resultado: ResultadoEfetivacao = {
      empresasCriadas: 0,
      solucoesCriadas: 0,
      ofertasCriadas: 0,
      acumuladosGravados: 0,
    };

    // 1. Sellers aprovados → Empresas (estágio Aliada ativa, ficha §7)
    const empresaPorIdExterno = new Map<string, string>();
    for (const seller of sellersAprovados) {
      if (!seller.idSellerExterno || !seller.nomeSeller) continue;
      const existente = await tx.empresa.findUnique({
        where: { idExternoMinutrade: seller.idSellerExterno },
      });
      if (existente) {
        empresaPorIdExterno.set(seller.idSellerExterno, existente.id);
      } else {
        const empresa = await tx.empresa.create({
          data: {
            nomeFantasia: seller.nomeSeller,
            estagio: "ALIADA_ATIVA",
            dataEntrada: seller.dataEntrada,
            idExternoMinutrade: seller.idSellerExterno,
          },
        });
        empresaPorIdExterno.set(seller.idSellerExterno, empresa.id);
        await registrarMutacao(gravador, {
          entidade: "empresa",
          entidadeId: empresa.id,
          autorId: ator.id,
          anterior: null,
          novo: {
            nomeFantasia: empresa.nomeFantasia,
            estagio: empresa.estagio,
            dataEntrada: empresa.dataEntrada,
            idExternoMinutrade: empresa.idExternoMinutrade,
            origem: "carga_inicial",
          },
        });
        resultado.empresasCriadas += 1;
      }
      await tx.stagingSeller.update({
        where: { id: seller.id },
        data: {
          estado: "EFETIVADA",
          empresaIdEfetivada: empresaPorIdExterno.get(seller.idSellerExterno),
        },
      });
    }

    // 2. Agrupamentos aprovados → Soluções; ofertas → Ofertas + acumulado
    for (const agrupamento of agrupamentosAprovados) {
      const idSellerExterno = agrupamento.chaveHeuristica.split("::")[0] ?? "";
      const empresaId = empresaPorIdExterno.get(idSellerExterno);
      if (!empresaId) {
        // Seller não aprovado/efetivado: o agrupamento fica para a próxima rodada
        continue;
      }

      let solucao = await tx.solucao.findFirst({
        where: { empresaId, nome: agrupamento.nomeSolucaoProposto },
      });
      if (!solucao) {
        solucao = await tx.solucao.create({
          data: { empresaId, nome: agrupamento.nomeSolucaoProposto },
        });
        await registrarMutacao(gravador, {
          entidade: "solucao",
          entidadeId: solucao.id,
          autorId: ator.id,
          anterior: null,
          novo: { empresaId, nome: solucao.nome, origem: "carga_inicial" },
        });
        resultado.solucoesCriadas += 1;
      }

      for (const stagingOferta of agrupamento.ofertas) {
        const mapeamento = mapearCheckout(stagingOferta.checkout ?? "");
        const status = mapearStatusOferta(stagingOferta.statusOferta ?? "");
        if (!mapeamento || !status || !stagingOferta.produto) {
          continue; // linha inválida não chega aprovada; proteção extra
        }
        const precos = inferirPrecos({
          natureza: mapeamento.natureza,
          preco: Number(stagingOferta.preco ?? 0),
          desconto: Number(stagingOferta.desconto ?? 0),
          precoFinal: Number(stagingOferta.precoFinal ?? 0),
        });
        const dadosOriginais = stagingOferta.dadosOriginais as Record<string, unknown>;
        const idOfertaExterno = String(dadosOriginais["id da oferta"] ?? "") || null;
        const dataOferta = dadosOriginais["data da oferta"]
          ? new Date(String(dadosOriginais["data da oferta"]))
          : null;

        const jaExiste = idOfertaExterno
          ? await tx.oferta.findFirst({ where: { idExternoMinutrade: idOfertaExterno } })
          : null;
        let ofertaId: string;
        if (jaExiste) {
          ofertaId = jaExiste.id;
        } else {
          const oferta = await tx.oferta.create({
            data: {
              solucaoId: solucao.id,
              titulo: stagingOferta.produto,
              natureza: mapeamento.natureza,
              tipoBeneficioId: tipoPorSlug.get(precos.tipoBeneficioSlug)!,
              mecanicaId: mecanicaPorSlug.get(mapeamento.mecanicaSlug)!,
              precoDe: precos.precoDe,
              precoPor: precos.precoPor,
              vigenciaInicio: dataOferta ?? dataCorte,
              status,
              idExternoMinutrade: idOfertaExterno,
            },
          });
          ofertaId = oferta.id;
          await registrarMutacao(gravador, {
            entidade: "oferta",
            entidadeId: oferta.id,
            autorId: ator.id,
            anterior: null,
            novo: {
              solucaoId: solucao.id,
              titulo: oferta.titulo,
              natureza: oferta.natureza,
              status: oferta.status,
              idExternoMinutrade: oferta.idExternoMinutrade,
              origem: "carga_inicial",
            },
          });
          resultado.ofertasCriadas += 1;
        }

        const temAcumulado =
          (stagingOferta.resgates ?? 0) > 0 || (stagingOferta.compras ?? 0) > 0;
        if (temAcumulado) {
          await tx.telemetriaAcumuladoInicial.upsert({
            where: { ofertaId_dataCorte: { ofertaId, dataCorte } },
            update: {},
            create: {
              ofertaId,
              // Rótulo de "Resgates" segue [A CONFIRMAR] (emissão × resgate
              // efetivo): os números são gravados sem interpretação.
              resgates: stagingOferta.resgates,
              compras: stagingOferta.compras,
              dataCorte,
              importacaoId: stagingOferta.importacaoId,
            },
          });
          resultado.acumuladosGravados += 1;
        }

        await tx.stagingOferta.update({
          where: { id: stagingOferta.id },
          data: {
            estado: "EFETIVADA",
            solucaoIdEfetivada: solucao.id,
            ofertaIdEfetivada: ofertaId,
          },
        });
      }

      await tx.stagingAgrupamento.update({
        where: { id: agrupamento.id },
        data: { estado: "EFETIVADA" },
      });
    }

    logger.info({ ...resultado }, "carga inicial efetivada");
    return resultado;
  }, { timeout: 120_000 });
}
